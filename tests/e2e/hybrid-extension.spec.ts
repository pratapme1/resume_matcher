import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './extension-fixtures.ts';
import { sampleResumePath } from '../helpers/fixture-path.ts';

const resumePath = sampleResumePath();
const portalBaseUrl = 'http://127.0.0.1:3100';

async function skipToJDStep(page: Page) {
  await page.getByRole('button', { name: /Skip.*specific job/i }).click();
}

async function reachStepFive(page: Page, portalPath: string) {
  const portalUrl = `${portalBaseUrl}${portalPath}`;
  await page.goto('/');
  await skipToJDStep(page);
  await page.getByRole('button', { name: 'URL' }).click();
  await page.locator('input[type="url"]').fill(portalUrl);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.setInputFiles('input[accept=".docx"]', resumePath);
  await page.getByRole('button', { name: 'Tailor Resume' }).click();
  await expect(page.getByText('Resume Tailored Successfully')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Download Tailored Resume \(DOCX\)|Download with Warnings/i }).click();
  await expect(page.getByRole('heading', { name: /Apply to/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Extension connected')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('input[type="url"]')).toHaveValue(portalUrl);
  return portalUrl;
}

async function startHybridApply(page: Page) {
  const createSessionResponse = page.waitForResponse((response) =>
    response.url().includes('/api/apply/sessions') &&
    response.request().method() === 'POST' &&
    !response.url().includes('/snapshot') &&
    !response.url().includes('/events') &&
    !response.url().includes('/complete'),
  );

  const context = page.context();
  const portalPagePromise = context.waitForEvent('page');
  await page.getByRole('button', { name: /Start Hybrid Apply/i }).click();

  const [response, portalPage] = await Promise.all([createSessionResponse, portalPagePromise]);
  const body = await response.json();
  await portalPage.waitForLoadState('domcontentloaded');

  return {
    sessionId: body.session.id as string,
    portalPage,
  };
}

async function waitForSessionStatus(
  request: APIRequestContext,
  sessionId: string,
  expectedStatuses: string[],
  timeoutMs = 20_000,
  options: {
    requireScreenshot?: boolean;
    messageIncludes?: string;
  } = {},
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await request.get(`/api/apply/sessions/${sessionId}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json() as {
      status: string;
      latestScreenshot?: string | null;
      latestMessage?: string | null;
      portalType?: string;
      latestPauseReason?: string | null;
    };
    const matchesStatus = expectedStatuses.includes(body.status);
    const matchesScreenshot = !options.requireScreenshot || Boolean(body.latestScreenshot);
    const matchesMessage = !options.messageIncludes || body.latestMessage?.includes(options.messageIncludes);
    if (matchesStatus && matchesScreenshot && matchesMessage) {
      return body;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for apply session ${sessionId} to reach one of: ${expectedStatuses.join(', ')}`);
}

async function uploadedFileName(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    const input = el as HTMLInputElement;
    return input.files?.[0]?.name ?? '';
  });
}

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test('single-step supported portal proves fill, upload, screenshot, and submit flow', async ({ page, request, extensionId }) => {
  expect(extensionId).toMatch(/[a-p]{32}/);
  await reachStepFive(page, '/__fixtures__/apply/basic');

  const { sessionId, portalPage } = await startHybridApply(page);

  await expect(portalPage.locator('#full_name')).not.toHaveValue('', { timeout: 15_000 });
  await expect(portalPage.locator('#email')).toHaveValue(/@/, { timeout: 15_000 });
  await expect(portalPage.locator('#phone')).not.toHaveValue('', { timeout: 15_000 });
  await expect.poll(() => uploadedFileName(portalPage, '#resume'), { timeout: 15_000 }).not.toBe('');

  const ready = await waitForSessionStatus(request, sessionId, ['ready_to_submit'], 20_000, { requireScreenshot: true });
  expect(ready.latestScreenshot).toBeTruthy();
  await expect(page.getByRole('button', { name: /Confirm Submit/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByAltText('Application form screenshot')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: /Confirm Submit/i }).click();
  await portalPage.waitForURL(/__fixtures__\/apply\/success/, { timeout: 15_000 });
  await expect(portalPage.getByRole('heading', { name: 'Application Received' })).toBeVisible();

  const submitted = await waitForSessionStatus(request, sessionId, ['submitted'], 20_000, { requireScreenshot: true });
  expect(submitted.latestScreenshot).toBeTruthy();
});

test('multi-step portal proves auto-advance between steps before submit readiness', async ({ page, request }) => {
  await reachStepFive(page, '/__fixtures__/apply/multi-step');

  const { sessionId, portalPage } = await startHybridApply(page);

  await expect(portalPage.locator('#step-2.active')).toBeVisible({ timeout: 15_000 });
  await expect(portalPage.locator('#location')).not.toHaveValue('');
  await expect(portalPage.locator('#phone')).not.toHaveValue('');
  await expect.poll(() => uploadedFileName(portalPage, '#resume'), { timeout: 15_000 }).not.toBe('');

  await waitForSessionStatus(request, sessionId, ['ready_to_submit']);
  await expect(page.getByRole('button', { name: /Confirm Submit/i })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /Confirm Submit/i }).click();
  await portalPage.waitForURL(/__fixtures__\/apply\/success/, { timeout: 15_000 });
  await waitForSessionStatus(request, sessionId, ['submitted']);
});

test('phenom-like multi-step portal proves portal classification and progression beyond four steps', async ({ page, request }) => {
  await reachStepFive(page, '/__fixtures__/apply/phenom-multi-step');

  const { sessionId, portalPage } = await startHybridApply(page);

  await expect(portalPage.locator('#step-5.active')).toBeVisible({ timeout: 20_000 });
  await expect(portalPage.locator('#experience')).not.toHaveValue('');
  await expect(portalPage.locator('#current_title')).not.toHaveValue('');
  await expect.poll(() => uploadedFileName(portalPage, '#resume'), { timeout: 15_000 }).not.toBe('');

  const ready = await waitForSessionStatus(request, sessionId, ['ready_to_submit']);
  expect(ready.portalType).toBe('phenom');
  await expect(page.getByRole('button', { name: /Confirm Submit/i })).toBeVisible({ timeout: 15_000 });
});

test('greenhouse adapter classifies the portal and fills hosted fields', async ({ page, request }) => {
  await reachStepFive(page, '/__fixtures__/apply/greenhouse');

  const { sessionId, portalPage } = await startHybridApply(page);

  await expect(portalPage.locator('#first_name')).not.toHaveValue('', { timeout: 15_000 });
  await expect(portalPage.locator('#last_name')).not.toHaveValue('', { timeout: 15_000 });
  await expect(portalPage.locator('#current_company')).not.toHaveValue('', { timeout: 15_000 });
  await expect.poll(() => uploadedFileName(portalPage, '#resume'), { timeout: 15_000 }).not.toBe('');

  const ready = await waitForSessionStatus(request, sessionId, ['ready_to_submit']);
  expect(ready.portalType).toBe('greenhouse');
});

test('lever adapter classifies the portal and fills hosted fields', async ({ page, request }) => {
  await reachStepFive(page, '/__fixtures__/apply/lever');

  const { sessionId, portalPage } = await startHybridApply(page);

  await expect(portalPage.locator('#name')).not.toHaveValue('', { timeout: 15_000 });
  await expect(portalPage.locator('#company')).not.toHaveValue('', { timeout: 15_000 });
  await expect(portalPage.locator('#experience')).not.toHaveValue('', { timeout: 15_000 });
  await expect.poll(() => uploadedFileName(portalPage, '#resume'), { timeout: 15_000 }).not.toBe('');

  const ready = await waitForSessionStatus(request, sessionId, ['ready_to_submit']);
  expect(ready.portalType).toBe('lever');
});

test('workday adapter classifies an open-step flow and advances through multiple steps', async ({ page, request }) => {
  await reachStepFive(page, '/__fixtures__/apply/workday');

  const { sessionId, portalPage } = await startHybridApply(page);

  await expect(portalPage.locator('#workday-step-3.active')).toBeVisible({ timeout: 20_000 });
  await expect(portalPage.locator('#current_title')).not.toHaveValue('');
  await expect(portalPage.locator('#current_company')).not.toHaveValue('');
  await expect.poll(() => uploadedFileName(portalPage, '#resume'), { timeout: 15_000 }).not.toBe('');

  const ready = await waitForSessionStatus(request, sessionId, ['ready_to_submit']);
  expect(ready.portalType).toBe('workday');
});

test('workday adapter stops cleanly when login is required before the application form', async ({ page, request }) => {
  await reachStepFive(page, '/__fixtures__/apply/workday-login');

  const { sessionId, portalPage } = await startHybridApply(page);
  await expect(portalPage.getByRole('heading', { name: 'Sign In' })).toBeVisible();

  const manual = await waitForSessionStatus(request, sessionId, ['manual_required']);
  expect(manual.portalType).toBe('workday');
  expect(manual.latestPauseReason).toBe('login_required');
  expect(manual.latestMessage).toMatch(/Login|account setup/i);
});

test('review-required portal proves pause, manual fix, re-check, and submit', async ({ page, request }) => {
  await reachStepFive(page, '/__fixtures__/apply/review-required');

  const { sessionId, portalPage } = await startHybridApply(page);

  const review = await waitForSessionStatus(request, sessionId, ['review_required'], 20_000, { requireScreenshot: true });
  expect(review.latestScreenshot).toBeTruthy();
  await expect(page.getByRole('button', { name: /Re-check Form/i })).toBeVisible();
  await expect(portalPage.locator('#work_auth')).toHaveValue('');
  await expect.poll(async () => portalPage.locator('#work_auth').evaluate((el) => (el as HTMLInputElement).style.outline), { timeout: 10_000 }).not.toBe('');

  await portalPage.locator('#work_auth').fill('Authorized to work in the United States');
  await page.getByRole('button', { name: /Re-check Form/i }).click();

  await waitForSessionStatus(request, sessionId, ['ready_to_submit']);
  const confirmSubmit = await request.post(`/api/apply/sessions/${sessionId}/confirm-submit`);
  expect(confirmSubmit.ok()).toBeTruthy();
  await page.evaluate((nextSessionId) => {
    window.postMessage({
      type: 'RTP_SUBMIT_APPLY_SESSION',
      data: {
        sessionId: nextSessionId,
      },
    }, window.location.origin);
  }, sessionId);
  await portalPage.waitForURL(/__fixtures__\/apply\/success/, { timeout: 15_000 });
  await waitForSessionStatus(request, sessionId, ['submitted']);
});

test('protected portal proves clean bot-protection stop without submit attempt', async ({ page, request }) => {
  await reachStepFive(page, '/__fixtures__/apply/protected');

  const { sessionId, portalPage } = await startHybridApply(page);
  await expect(portalPage).toHaveTitle(/Just a moment/i);

  const protectedState = await waitForSessionStatus(request, sessionId, ['protected'], 20_000, { requireScreenshot: true });
  expect(protectedState.latestScreenshot).toBeTruthy();
  await expect(page.getByText(/Bot protection detected/i)).toBeVisible({ timeout: 15_000 });
});

test('manual-required portal proves clean stop when no supported fields are found', async ({ page, request }) => {
  await reachStepFive(page, '/__fixtures__/apply/manual-required');

  const { sessionId, portalPage } = await startHybridApply(page);
  await expect(portalPage.getByRole('heading', { name: 'Custom Application Portal' })).toBeVisible();

  const manual = await waitForSessionStatus(request, sessionId, ['manual_required']);
  expect(manual.latestMessage).toMatch(/No supported fields|Manual completion/i);
});

test('custom-widget portal proves unsupported required custom widget pauses in review', async ({ page, request }) => {
  await reachStepFive(page, '/__fixtures__/apply/custom-widget');

  const { sessionId, portalPage } = await startHybridApply(page);
  await expect(portalPage.getByRole('heading', { name: 'Custom Widget Application Portal' })).toBeVisible();

  const review = await waitForSessionStatus(request, sessionId, ['review_required']);
  expect(review.latestPauseReason).toBe('unsupported_widget');
  await expect(page.getByRole('button', { name: /Re-check Form/i })).toBeVisible({ timeout: 15_000 });
});
