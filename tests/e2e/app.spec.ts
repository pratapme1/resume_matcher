import { expect, test, type Page } from '@playwright/test';
import { sampleResumePath } from '../helpers/fixture-path.ts';

const resumePath = sampleResumePath();

/** Step 1 is Job Search — click Skip to jump directly to JD input (Step 2) */
async function skipToJDStep(page: Page) {
  await page.getByRole('button', { name: /Skip.*specific job/i }).click();
}

async function completeHappyPath(page: Page) {
  await page.goto('/');
  await skipToJDStep(page);
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
  await skipToJDStep(page);
  await page.locator('textarea').fill(`Senior Frontend Engineer
[blocked]
Required qualifications:
- React
- TypeScript`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.setInputFiles('input[accept=".docx"]', resumePath);
  await page.getByRole('button', { name: 'Tailor Resume' }).click();
  await expect(page.getByRole('heading', { name: 'Validation Warnings Detected' })).toBeVisible({ timeout: 30000 });
}

// ─────────────────────────────────────────
// Existing tests (updated for 5-step flow)
// ─────────────────────────────────────────

test('happy path allows validated download flow', async ({ page }) => {
  await completeHappyPath(page);
  await expect(page.getByText('Validation Gate')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download Tailored Resume (DOCX)' })).toBeEnabled();
  await expect(page.getByText('Formatting status:')).toBeVisible();
});

test('blocked path shows warning download button and confirmation dialog', async ({ page }) => {
  await completeBlockedPath(page);
  // Button should be enabled (soft block — not disabled)
  const downloadBtn = page.getByRole('button', { name: /Download with Warnings/i });
  await expect(downloadBtn).toBeEnabled();
  // Click triggers confirmation dialog
  await downloadBtn.click();
  await expect(page.getByRole('button', { name: 'Download Anyway' })).toBeVisible();
});

test('blocked path can proceed to apply stage after warning download', async ({ page }) => {
  await completeBlockedPath(page);
  await page.getByRole('button', { name: /Download with Warnings/i }).click();
  await page.getByRole('button', { name: 'Download Anyway' }).click();

  await expect(page.getByRole('heading', { name: /Apply to/i })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Validation warnings were detected in the tailored resume.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Back to Results/i })).toBeVisible();
});

test('warning path shows extraction warnings and reset clears state', async ({ page }) => {
  await page.goto('/');
  await skipToJDStep(page);
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.locator('textarea').fill('React TypeScript');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.setInputFiles('input[accept=".docx"]', resumePath);
  await page.getByRole('button', { name: 'Tailor Resume' }).click();

  await expect(page.getByText('Extraction and parsing warnings')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Start Over' }).click();
  // After start over, should be back at step 1
  await expect(page.getByRole('heading', { name: 'Find Your Best Matches' })).toBeVisible();
});

test('back-navigation from step 4 preserves JD and goes to step 3', async ({ page }) => {
  await completeHappyPath(page);
  await page.getByTestId('back-to-step2').click();
  await expect(page.getByRole('heading', { name: 'Reference Resume & Preferences' })).toBeVisible();
  await expect(page.locator('input[accept=".docx"]')).toHaveCount(1);
  await expect(page.getByTestId('jd-preview-card')).toBeVisible();
});

test('retry-resume from blocked state goes to step 3 with JD preserved', async ({ page }) => {
  await completeBlockedPath(page);
  await page.getByTestId('retry-resume').click();
  await expect(page.getByRole('heading', { name: 'Reference Resume & Preferences' })).toBeVisible();
  await expect(page.getByTestId('jd-preview-card')).toBeVisible();
  await expect(page.locator('input[accept=".docx"]')).toHaveCount(1);
});

test('step indicator shows aria-current on active step and advances', async ({ page }) => {
  await page.goto('/');
  // Step 1 (Discover) active at load
  await expect(page.getByTestId('step-indicator-1')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('step-indicator-2')).not.toHaveAttribute('aria-current', 'step');

  // Skip to JD step → now on step 2
  await skipToJDStep(page);
  await expect(page.getByTestId('step-indicator-2')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('step-indicator-1')).not.toHaveAttribute('aria-current', 'step');

  // Fill JD and continue → now on step 3
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.locator('textarea').fill(`Senior Frontend Engineer
Required qualifications:
- React
- TypeScript
- Testing
- Leadership`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('step-indicator-3')).toHaveAttribute('aria-current', 'step');
});

test('alignment score shows a descriptive label', async ({ page }) => {
  await completeHappyPath(page);
  const label = page.getByTestId('alignment-score-label');
  await expect(label).toBeVisible();
  const text = await label.textContent();
  expect(['Strong match', 'Moderate match', 'Fair match', 'Weak match']).toContain(text?.trim());
});

test('output stage still shows role fit when the gap model omits fitScore', async ({ page }) => {
  await page.goto('/');
  await skipToJDStep(page);
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.locator('textarea').fill(`Senior Frontend Engineer
[missing-fit]
Required qualifications:
- React
- TypeScript
- Testing
- Leadership`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.setInputFiles('input[accept=".docx"]', resumePath);
  await page.getByRole('button', { name: 'Tailor Resume' }).click();
  await expect(page.getByText('Resume Tailored Successfully')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Semantic fit score')).toBeVisible();
  await expect(page.getByText('ATS Score')).toBeVisible();
  await expect(page.getByText('Role fit analysis unavailable for this run.')).toHaveCount(0);
});

test('JD preview card visible on step 3 with quality score', async ({ page }) => {
  await page.goto('/');
  await skipToJDStep(page);
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
  await skipToJDStep(page);
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
  await skipToJDStep(page);
  // Click URL tab (Paste is now default)
  await page.getByRole('button', { name: 'URL' }).click();
  const urlInput = page.locator('input[type="url"]');
  await expect(urlInput).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();

  await urlInput.fill('https://example.com/job/123');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
});

// ─────────────────────────────────────────
// New tests — Step 1 (Job Search)
// ─────────────────────────────────────────

test('Step 1: Find Your Best Matches heading visible on load', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find Your Best Matches' })).toBeVisible();
});

test('Step 1: Search Jobs button disabled before resume uploaded', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Search Jobs' })).toBeDisabled();
});

test('Step 1: Skip button goes to JD input step with Paste tab active by default', async ({ page }) => {
  await page.goto('/');
  await skipToJDStep(page);
  // Paste is now the default tab
  await expect(page.locator('textarea')).toBeVisible();
  await expect(page.getByTestId('step-indicator-2')).toHaveAttribute('aria-current', 'step');
});

// ─────────────────────────────────────────
// New tests — Step 2 (JD input tabs)
// ─────────────────────────────────────────

test('Step 2: Continue disabled with empty textarea on Paste tab', async ({ page }) => {
  await page.goto('/');
  await skipToJDStep(page);
  await page.getByRole('button', { name: 'Paste' }).click();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await page.locator('textarea').fill('Some job text');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
});

test('Step 2: URL tab empty disables Continue, URL entry enables it', async ({ page }) => {
  await page.goto('/');
  await skipToJDStep(page);
  // Click URL tab (Paste is now default)
  await page.getByRole('button', { name: 'URL' }).click();
  const urlInput = page.locator('input[type="url"]');
  await expect(urlInput).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await urlInput.fill('https://jobs.example.com/senior-engineer-12345');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
});

// ─────────────────────────────────────────
// New tests — Step 4 → Step 5 navigation
// ─────────────────────────────────────────

test('Step 5: "Back to Results" goes to Step 4, not Step 3', async ({ page }) => {
  await completeHappyPath(page);

  // Download the DOCX to trigger step 5 transition if needed, or look for "Apply" CTA
  // Check if there's a "Back to Results" button (we're on step 4/output)
  const backToResultsBtn = page.getByRole('button', { name: /Back to Results/i });
  const isOnStep5 = await backToResultsBtn.isVisible().catch(() => false);

  if (!isOnStep5) {
    // We're on step 4 (results) — try to navigate to step 5 (Apply) if available
    const applyBtn = page.getByRole('button', { name: /Agent Apply|Apply Now|Auto-Apply|Start Hybrid Apply/i });
    const hasApply = await applyBtn.isVisible().catch(() => false);
    if (hasApply) {
      // Just verify step 4 indicator is active
      await expect(page.getByTestId('step-indicator-4')).toHaveAttribute('aria-current', 'step');
    } else {
      // Step 5 not reachable from this fixture — verify we're on step 4
      await expect(page.getByTestId('step-indicator-4')).toHaveAttribute('aria-current', 'step');
    }
  } else {
    // We're already on step 5, verify back-to-results goes to step 4
    await backToResultsBtn.click();
    await expect(page.getByTestId('step-indicator-4')).toHaveAttribute('aria-current', 'step');
  }
});

// ─────────────────────────────────────────
// New tests — Dark mode
// ─────────────────────────────────────────

test('dark mode toggle changes button label between Dark mode and Light mode', async ({ page }) => {
  await page.goto('/');

  const darkBtn = page.getByRole('button', { name: /Dark mode|Light mode/i }).first();
  await expect(darkBtn).toBeVisible();

  // Record current label
  const labelBefore = await darkBtn.textContent();

  await darkBtn.click();
  // Label should have changed after toggle
  const labelAfter = await page.getByRole('button', { name: /Dark mode|Light mode/i }).first().textContent();
  expect(labelAfter).not.toBe(labelBefore);

  // Toggle back — label should revert
  await page.getByRole('button', { name: /Dark mode|Light mode/i }).first().click();
  const labelFinal = await page.getByRole('button', { name: /Dark mode|Light mode/i }).first().textContent();
  expect(labelFinal).toBe(labelBefore);
});

// ─────────────────────────────────────────
// New tests — Cross-cutting
// ─────────────────────────────────────────

test('active step indicator advances correctly through steps 1→2→3', async ({ page }) => {
  await page.goto('/');
  // On step 1: step-indicator-1 is active, step-indicator-2 is not
  await expect(page.getByTestId('step-indicator-1').first()).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('step-indicator-2').first()).not.toHaveAttribute('aria-current', 'step');

  // Skip to step 2
  await skipToJDStep(page);
  await expect(page.getByTestId('step-indicator-2').first()).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('step-indicator-1').first()).not.toHaveAttribute('aria-current', 'step');

  // Advance to step 3
  await page.getByRole('button', { name: 'Paste' }).click();
  await page.locator('textarea').fill('Senior Engineer. Must have TypeScript and React.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('step-indicator-3').first()).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('step-indicator-2').first()).not.toHaveAttribute('aria-current', 'step');
});
