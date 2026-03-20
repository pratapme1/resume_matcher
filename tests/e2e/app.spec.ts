import { expect, test, type Page } from '@playwright/test';
import { sampleResumePath } from '../helpers/fixture-path.ts';

const resumePath = sampleResumePath();

async function completeHappyPath(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.locator('textarea').fill(`Senior Frontend Engineer
Required qualifications:
- React
- TypeScript
- Testing
- Leadership`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.setInputFiles('input[accept=".docx"]', resumePath);
  await page.getByRole('button', { name: 'Tailor Resume' }).click();
  await expect(page.getByText('Resume Tailored Successfully')).toBeVisible({ timeout: 30000 });
}

async function completeBlockedPath(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.locator('textarea').fill(`Senior Frontend Engineer
[blocked]
Required qualifications:
- React
- TypeScript`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.setInputFiles('input[accept=".docx"]', resumePath);
  await page.getByRole('button', { name: 'Tailor Resume' }).click();
  await expect(page.getByText('Validation Blocked Output')).toBeVisible({ timeout: 30000 });
}

test('happy path allows validated download flow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.locator('textarea').fill(`Senior Frontend Engineer
Required qualifications:
- React
- TypeScript
- Testing
- Leadership`);
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.setInputFiles('input[accept=".docx"]', resumePath);
  await page.getByRole('button', { name: 'Tailor Resume' }).click();

  await expect(page.getByText('Resume Tailored Successfully')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Validation Gate')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download Tailored Resume (DOCX)' })).toBeEnabled();
  await expect(page.getByText('Formatting status:')).toBeVisible();
});

test('blocked path disables download and shows validation issues', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.locator('textarea').fill(`Senior Frontend Engineer
[blocked]
Required qualifications:
- React
- TypeScript`);
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.setInputFiles('input[accept=".docx"]', resumePath);
  await page.getByRole('button', { name: 'Tailor Resume' }).click();

  await expect(page.getByText('Validation Blocked Output')).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: 'Download Blocked by Validation' })).toBeDisabled();
  await expect(page.getByText('Unsupported or ambiguous claims were detected. Download is blocked.')).toBeVisible();
});

test('warning path shows extraction warnings and reset clears state', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.locator('textarea').fill('React TypeScript');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.setInputFiles('input[accept=".docx"]', resumePath);
  await page.getByRole('button', { name: 'Tailor Resume' }).click();

  await expect(page.getByText('Extraction and parsing warnings')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Start Over' }).click();
  await expect(page.getByText('Target Job Description')).toBeVisible();
});

test('back-navigation from step 3 preserves JD and goes to step 2', async ({ page }) => {
  await completeHappyPath(page);
  await page.getByTestId('back-to-step2').click();
  await expect(page.getByRole('heading', { name: 'Reference Resume & Preferences' })).toBeVisible();
  await expect(page.locator('input[accept=".docx"]')).toBeVisible();
  await expect(page.getByTestId('jd-preview-card')).toBeVisible();
});

test('retry-resume from blocked state goes to step 2 with JD preserved', async ({ page }) => {
  await completeBlockedPath(page);
  await page.getByTestId('retry-resume').click();
  await expect(page.getByRole('heading', { name: 'Reference Resume & Preferences' })).toBeVisible();
  await expect(page.getByTestId('jd-preview-card')).toBeVisible();
  await expect(page.locator('input[accept=".docx"]')).toBeVisible();
});

test('step indicator shows aria-current on active step and advances', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('step-indicator-1')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('step-indicator-2')).not.toHaveAttribute('aria-current', 'step');

  await page.getByRole('button', { name: 'Paste' }).click();
  await page.locator('textarea').fill(`Senior Frontend Engineer
Required qualifications:
- React
- TypeScript
- Testing
- Leadership`);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByTestId('step-indicator-2')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('step-indicator-1')).not.toHaveAttribute('aria-current', 'step');
});

test('alignment score shows a descriptive label', async ({ page }) => {
  await completeHappyPath(page);
  const label = page.getByTestId('alignment-score-label');
  await expect(label).toBeVisible();
  const text = await label.textContent();
  expect(['Strong match', 'Moderate match', 'Fair match', 'Weak match']).toContain(text?.trim());
});

test('JD preview card visible on step 2 with quality score', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.locator('textarea').fill(`Senior Frontend Engineer
Required qualifications:
- React
- TypeScript
- Testing
- Leadership`);
  await page.getByRole('button', { name: 'Continue' }).click();

  const card = page.getByTestId('jd-preview-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('100/100');
});

test('resume drop zone highlights on dragenter and clears on dragleave', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.locator('textarea').fill(`Senior Frontend Engineer
Required qualifications:
- React
- TypeScript`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('jd-preview-card')).toBeVisible();

  const zone = page.getByTestId('drag-zone-resume');
  await zone.dispatchEvent('dragenter');
  await expect(zone).toHaveClass(/border-violet-500/);
  await expect(zone).toHaveClass(/bg-violet-500/);

  await zone.dispatchEvent('dragleave');
  await expect(zone).not.toHaveClass(/border-violet-500/);
});

test('recommendations show-more button behaviour is consistent with item count', async ({ page }) => {
  await completeHappyPath(page);
  const showMoreBtn = page.getByTestId('show-more-recs');
  const isVisible = await showMoreBtn.isVisible().catch(() => false);

  if (isVisible) {
    const countBefore = await page.getByTestId('rec-item').count();
    expect(countBefore).toBe(3);
    await showMoreBtn.click();
    const countAfter = await page.getByTestId('rec-item').count();
    expect(countAfter).toBeGreaterThan(3);
    await expect(showMoreBtn).toContainText('Show less');
    await showMoreBtn.click();
    await expect(page.getByTestId('rec-item')).toHaveCount(3);
  } else {
    await expect(showMoreBtn).not.toBeAttached();
  }
});

test('URL tab shows URL input and enables Continue when URL is filled', async ({ page }) => {
  await page.goto('/');
  // URL is the default tab
  const urlInput = page.locator('input[type="url"]');
  await expect(urlInput).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();

  await urlInput.fill('https://example.com/job/123');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
});
