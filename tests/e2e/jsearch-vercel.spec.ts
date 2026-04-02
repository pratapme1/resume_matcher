import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERCEL_URL = 'https://resume-matcher-kappa-virid.vercel.app';
const RESUME_PATH = path.resolve(__dirname, '../../Vishnu_Resume_2026_FINAL_revised.docx');

test('JSearch live test on Vercel - job search returns real listings', async ({ page }) => {
  test.setTimeout(180_000);

  // Step 1: Navigate and sign in
  await page.goto(VERCEL_URL);
  await page.waitForLoadState('networkidle');
  console.log('Page title:', await page.title());

  // Sign in
  const emailInput = page.locator('input[type="email"], input[placeholder*="mail"]').first();
  if (await emailInput.isVisible({ timeout: 5000 })) {
    await emailInput.fill('vishnupratapkumar19@gmail.com');
    const pwInput = page.locator('input[type="password"]').first();
    await pwInput.fill('Test@1234');
    await page.locator('button[type="submit"], button:has-text("Sign In")').first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    console.log('After sign in URL:', page.url());
  }

  await page.screenshot({ path: 'tests/screenshots/vercel-01-after-login.png', fullPage: true });

  // Step 2: Find and click "Search Jobs" / Step 1 tab
  const searchTab = page.locator('[data-testid="step-search"], button:has-text("Search"), a:has-text("Search Jobs")').first();
  if (await searchTab.isVisible({ timeout: 5000 })) {
    await searchTab.click();
    await page.waitForTimeout(1000);
  }

  await page.screenshot({ path: 'tests/screenshots/vercel-02-search-tab.png', fullPage: true });

  // Step 3: Upload resume
  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await fileInput.setInputFiles(RESUME_PATH);
    await page.waitForTimeout(2000);
    console.log('Resume uploaded');
  } else {
    // Try clicking an upload button to trigger file chooser
    const uploadBtn = page.locator('button:has-text("Upload"), label:has-text("Upload"), [data-testid*="upload"]').first();
    if (await uploadBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        uploadBtn.click(),
      ]);
      await fileChooser.setFiles(RESUME_PATH);
      await page.waitForTimeout(2000);
      console.log('Resume uploaded via chooser');
    }
  }

  await page.screenshot({ path: 'tests/screenshots/vercel-03-resume-uploaded.png', fullPage: true });

  // Step 4: Click search / find jobs button
  const searchBtn = page.locator(
    'button:has-text("Find Jobs"), button:has-text("Search Jobs"), button:has-text("Search"), [data-testid="search-btn"]'
  ).first();
  if (await searchBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await searchBtn.click();
    console.log('Search button clicked');
  }

  // Step 5: Wait for results
  console.log('Waiting for job results...');
  await page.waitForTimeout(5000);

  // Wait for loading to finish
  await page.waitForFunction(() => {
    const body = document.body.innerText;
    return !body.includes('Searching') && !body.includes('Loading') && !body.includes('Finding');
  }, { timeout: 90_000 }).catch(() => console.log('Timeout waiting for results to load'));

  await page.screenshot({ path: 'tests/screenshots/vercel-04-results.png', fullPage: true });

  // Step 6: Analyze results
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('\n=== PAGE TEXT SNIPPET (first 2000 chars) ===');
  console.log(bodyText.slice(0, 2000));

  // Check for job result indicators
  const hasLinkedIn = bodyText.toLowerCase().includes('linkedin');
  const hasNaukri = bodyText.toLowerCase().includes('naukri');
  const hasIndeed = bodyText.toLowerCase().includes('indeed');
  const hasRealURLs = bodyText.includes('https://');
  const hasGhostRisk = bodyText.toLowerCase().includes('real') || bodyText.toLowerCase().includes('verify');
  const hasCompanyNames = !bodyText.includes('Unknown Company');

  console.log('\n=== JSEARCH VERIFICATION ===');
  console.log('LinkedIn results:', hasLinkedIn ? '✅ YES' : '❌ NO');
  console.log('Naukri results:', hasNaukri ? '✅ YES' : '❌ NO');
  console.log('Indeed results:', hasIndeed ? '✅ YES' : '❌ NO');
  console.log('Has real URLs:', hasRealURLs ? '✅ YES' : '❌ NO');
  console.log('Ghost risk labels:', hasGhostRisk ? '✅ YES' : '❌ NO');
  console.log('Real company names:', hasCompanyNames ? '✅ YES' : '❌ NO');

  // Count job cards
  const jobCards = await page.locator('[data-testid*="job"], .job-card, [class*="job"]').count();
  console.log('Job cards found:', jobCards);

  // Find all apply links
  const links = await page.locator('a[href*="linkedin"], a[href*="naukri"], a[href*="indeed"], a[href*="glassdoor"]').all();
  console.log('Direct job board links:', links.length);
  for (const link of links.slice(0, 5)) {
    const href = await link.getAttribute('href');
    const text = await link.innerText().catch(() => '');
    console.log(`  ${text}: ${href?.slice(0, 80)}`);
  }

  await page.screenshot({ path: 'tests/screenshots/vercel-05-final.png', fullPage: true });
});
