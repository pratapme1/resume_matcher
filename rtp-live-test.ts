/**
 * Live end-to-end test against a real job listing.
 * Runs headed so the browser is fully visible.
 *
 * Prerequisites (run these first):
 *   Terminal 1: VITE_SKIP_AUTH=true npx tsx tests/e2e/server.ts
 *   Terminal 2: npx tsx local-agent/server.ts
 */
import { chromium } from 'playwright';
import path from 'node:path';

const APP_URL = 'http://127.0.0.1:3100';
const EXTENSION_PATH = path.join(process.cwd(), 'extension', 'dist');
const RESUME_PATH = path.join(process.cwd(), 'Vishnu_Resume_HPE_IoT.docx');
const JOB_URL = 'https://jobs.smartrecruiters.com/oneclick-ui/company/ServiceNow/publication/ac4b151d-ed76-41f3-b525-a932ee41969e?dcr_ci=ServiceNow';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  // ── Preflight: make sure server is up and auth is bypassed ──
  let health: Response;
  try {
    health = await fetch(`${APP_URL}/api/health`);
  } catch {
    throw new Error(`App server not reachable at ${APP_URL}.\nRun: VITE_SKIP_AUTH=true npx tsx tests/e2e/server.ts`);
  }
  if (!health.ok) throw new Error(`App server unhealthy (${health.status})`);

  console.log('Launching headed Chromium with extension…');
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    slowMo: 150,
    acceptDownloads: true,
    baseURL: APP_URL,
    viewport: { width: 1440, height: 900 },
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });

  // Wait for extension service worker
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15_000 });
  console.log(`Extension loaded: ${sw.url().split('/')[2]}`);

  const page = await ctx.newPage();
  await page.goto('/', { waitUntil: 'load' });

  // ── Step 1: Land on JD input (step 2 in app) ──
  // The home screen (step 0) has a "Paste a job →" card button
  const pasteBtn = page.getByRole('button', { name: /Paste a job/i });
  if (await pasteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await pasteBtn.click();
  } else {
    // Already on step 1 (discover) — click skip link
    await page.getByRole('button', { name: /Skip.*specific job/i }).click();
  }

  // ── Step 2: URL tab → fill → extract ──
  await page.locator('button', { hasText: 'URL' }).click();
  await page.locator('input[type="url"]').fill(JOB_URL);
  console.log('Extracting JD from URL…');
  await page.locator('button', { hasText: /Continue/ }).click();

  // ── Step 3: Upload resume ──
  await page.waitForSelector('input[accept=".docx"]', { timeout: 60_000, state: 'attached' });
  await page.setInputFiles('input[accept=".docx"]', RESUME_PATH);
  console.log('Resume uploaded.');

  // ── Step 4: Tailor ──
  await page.locator('button', { hasText: /Tailor Resume/ }).click();
  console.log('Tailoring (AI call — may take ~30 s)…');
  await page.getByText('Resume Tailored Successfully').waitFor({ timeout: 120_000 });
  console.log('Tailoring done!');

  // ── Step 5: Download → triggers extension prefill ──
  await page.locator('button', { hasText: /Download.*DOCX|Download with Warnings/ }).click();
  await page.getByRole('heading', { name: /Apply to/i }).waitFor({ timeout: 20_000 });
  await page.getByText('Extension connected').waitFor({ timeout: 20_000 });
  console.log('Extension connected. Starting hybrid apply…');

  // Wire listeners BEFORE click to avoid race
  const newPagePromise = ctx.waitForEvent('page', { timeout: 30_000 }).catch(() => null);
  const sessionRespPromise = page.waitForResponse(
    r => r.url().includes('/api/apply/sessions') && r.request().method() === 'POST'
      && !r.url().includes('/snapshot') && !r.url().includes('/events') && !r.url().includes('/complete'),
    { timeout: 30_000 },
  );

  // ── Step 6: Kick off hybrid apply ──
  await page.locator('button', { hasText: /Start Hybrid Apply/ }).click();

  const [portalPage, sessionResp] = await Promise.all([newPagePromise, sessionRespPromise]);
  if (portalPage) console.log('Portal tab opened:', portalPage.url());
  else console.log('Local agent opened its own browser window.');

  const { session } = await sessionResp.json() as { session: { id: string } };
  console.log(`Session: ${session.id}`);

  // ── Poll until terminal state ──
  const deadline = Date.now() + 5 * 60_000;
  let last = '';
  while (Date.now() < deadline) {
    const r = await page.request.get(`/api/apply/sessions/${session.id}`);
    const body = await r.json() as { status: string; executorMode?: string; latestMessage?: string; filledCount?: number; latestPauseReason?: string };
    if (body.status !== last) {
      console.log(`[${body.status}] executor=${body.executorMode} msg="${body.latestMessage ?? ''}" filled=${body.filledCount ?? 0}`);
      last = body.status;
    }
    const terminal = ['submitted', 'failed', 'manual_required', 'ready_to_submit', 'review_required'];
    if (terminal.includes(body.status)) {
      if (body.status === 'ready_to_submit') console.log('\n✅ Form filled — confirm submit in the UI.');
      else if (body.latestPauseReason) console.log(`⏸  ${body.latestPauseReason}`);
      break;
    }
    // 'protected' = local agent handed off to extension — keep polling
    await sleep(1500);
  }

  console.log('\nBrowser staying open — Ctrl+C when done.');
  await new Promise(() => {});
}

main().catch(async err => {
  console.error('\n❌', err?.message ?? err);
  console.error('Browser staying open 60 s so you can see the state…');
  await sleep(60_000);
  process.exit(1);
});
