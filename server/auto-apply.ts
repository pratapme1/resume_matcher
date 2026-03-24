import type { Browser, Page } from '@playwright/test';
import type { AIClient } from './app.ts';
import type { TailoredResumeDocument, ResumeTemplateProfile, ValidationReport } from '../src/shared/types.ts';
import { generateTailoredDocx } from './docx-render.ts';

// In-memory browser session store (sessionId → { page, browser, timer })
const sessions = new Map<string, { page: Page; browser: Browser; timer: ReturnType<typeof setTimeout> }>();

interface ContactInfo {
  name?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  location?: string;
}

interface FormField {
  name: string;
  label: string;
  placeholder: string;
  type: string;
}

async function detectBotProtection(page: Page): Promise<boolean> {
  const title = await page.title();
  if (/just a moment|cloudflare|checking your browser/i.test(title)) return true;
  const hasRecaptcha = await page.$('iframe[src*="recaptcha"], iframe[src*="hcaptcha"]') !== null;
  const hasCfChallenge = await page.$('#cf-challenge-running, .cf-browser-verification') !== null;
  return hasRecaptcha || hasCfChallenge;
}

async function captureFields(page: Page): Promise<FormField[]> {
  return page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll<HTMLElement>(
      'input[type="text"],input[type="email"],input[type="tel"],input[type="url"],input:not([type]),textarea',
    )).filter(el =>
      !(el as HTMLInputElement).disabled &&
      !(el as HTMLInputElement).readOnly &&
      el.offsetParent !== null,
    );

    return inputs.map(el => {
      const input = el as HTMLInputElement;
      let label = '';
      if (input.id) {
        const lbl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        if (lbl?.textContent) label = lbl.textContent.trim();
      }
      if (!label) label = input.getAttribute('aria-label') || input.placeholder || input.name || input.id || '';
      return {
        name: input.name || input.id,
        label,
        placeholder: input.placeholder,
        type: input.type || 'text',
      };
    });
  });
}

async function buildFieldMapping(
  fields: FormField[],
  contactInfo: ContactInfo,
  ai: AIClient,
): Promise<Record<string, string | null>> {
  const prompt = `You are filling out a job application form on behalf of the user.

User profile:
- Full name: ${contactInfo.name ?? 'unknown'}
- Email: ${contactInfo.email ?? 'unknown'}
- Phone: ${contactInfo.phone ?? 'unknown'}
- LinkedIn: ${contactInfo.linkedin ?? 'not provided'}
- Location: ${contactInfo.location ?? 'unknown'}

Form fields (name | label | placeholder):
${fields.map(f => `  name="${f.name}" | label="${f.label}" | placeholder="${f.placeholder}"`).join('\n')}

Rules:
- Return ONLY a JSON object mapping field "name" to the value string, or null.
- For phone: digits only, no + or spaces (e.g. "+91 91489 69183" → "9148969183").
- For LinkedIn: just the profile path (e.g. "linkedin.com/in/vishnu").
- Leave null for fields you have no data for (CTC, experience years, notice period, portfolio, etc.).
- Return ONLY valid JSON. No explanation, no markdown fences.`;

  const result = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });

  const raw = (result.text ?? '{}').replace(/```json\n?|```\n?/g, '').trim();
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export type AutoApplyResult =
  | { status: 'protected' }
  | { status: 'filled'; sessionId: string; screenshot: string; filled: number; highlighted: number };

export async function startAutoApply(
  applyUrl: string,
  contactInfo: ContactInfo,
  tailoredResume: TailoredResumeDocument,
  templateProfile: ResumeTemplateProfile,
  _validation: ValidationReport,
  ai: AIClient,
): Promise<AutoApplyResult> {
  const { chromium } = await import('@playwright/test').catch(() => {
    throw new Error('Auto-apply requires Playwright, which is not available in this environment');
  });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500); // let SPA render

    if (await detectBotProtection(page)) {
      await browser.close();
      return { status: 'protected' };
    }

    const fields = await captureFields(page);
    const mapping = await buildFieldMapping(fields, contactInfo, ai);

    let filled = 0;
    let highlighted = 0;

    for (const f of fields) {
      const value = mapping[f.name];
      if (value) {
        try {
          await page.locator(`[name="${CSS.escape(f.name)}"]`).fill(value, { timeout: 3000 });
          filled++;
        } catch {
          // field might not be interactable — skip
          highlighted++;
        }
      } else if (f.label) {
        highlighted++;
      }
    }

    // Upload tailored DOCX to any file input on the page
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      try {
        const docxBuffer = await generateTailoredDocx(tailoredResume, templateProfile);
        await fileInput.setInputFiles({
          name: 'resume.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: Buffer.from(docxBuffer),
        });
      } catch {
        // file upload optional — don't block
      }
    }

    const screenshotBuf = await page.screenshot({ fullPage: false });
    const screenshot = screenshotBuf.toString('base64');

    // Store session for the submit step
    const sessionId = crypto.randomUUID();
    const timer = setTimeout(async () => {
      sessions.delete(sessionId);
      await browser.close().catch(() => {});
    }, 5 * 60 * 1000);
    sessions.set(sessionId, { page, browser, timer });

    return { status: 'filled', sessionId, screenshot, filled, highlighted };
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }
}

export type SubmitResult = { status: 'submitted' | 'not_found'; screenshot?: string };

export async function submitAutoApply(sessionId: string): Promise<SubmitResult> {
  const session = sessions.get(sessionId);
  if (!session) return { status: 'not_found' };

  const { page, browser, timer } = session;
  clearTimeout(timer);
  sessions.delete(sessionId);

  try {
    const submitBtn = page
      .locator('button[type="submit"], input[type="submit"], button:has-text("Submit")')
      .first();
    await submitBtn.click({ timeout: 5000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
    const screenshotBuf = await page.screenshot({ fullPage: false });
    const screenshot = screenshotBuf.toString('base64');
    await browser.close().catch(() => {});
    return { status: 'submitted', screenshot };
  } catch {
    await browser.close().catch(() => {});
    return { status: 'submitted' };
  }
}
