import * as cheerio from 'cheerio';
import { chromium } from '@playwright/test';
import { badGateway, badRequest, gatewayTimeout, isAppError, unprocessable } from './errors.ts';
import { normalizeWhitespace } from './utils.ts';

const FETCH_TIMEOUT_MS = 8_000;

async function fetchWithPlaywright(url: URL): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000); // let SPA render
    const bodyText = await page.evaluate(() => {
      // Remove non-content elements
      document.querySelectorAll('script, style, nav, footer, header, noscript, svg').forEach(el => el.remove());
      return document.body?.innerText ?? '';
    });
    return normalizeWhitespace(bodyText);
  } finally {
    await browser.close().catch(() => {});
  }
}
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

function parseJobDescriptionUrl(value: string): URL {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch (error) {
    throw badRequest('URL must be a valid HTTP or HTTPS address.', 'INVALID_REQUEST', {
      cause: error,
      logMessage: 'Received malformed job description URL.',
    });
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw badRequest('URL must use HTTP or HTTPS.', 'INVALID_REQUEST', {
      logMessage: `Rejected unsupported URL protocol: ${parsed.protocol}`,
    });
  }

  return parsed;
}

export async function fetchJobDescriptionText(
  value: string,
  fetchImpl: typeof fetch,
  timeoutMs = FETCH_TIMEOUT_MS,
  playwrightFallback: ((url: URL) => Promise<string>) | null = fetchWithPlaywright,
): Promise<string> {
  const url = parseJobDescriptionUrl(value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let staticText: string | null = null;

  try {
    const response = await fetchImpl(url, {
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw badGateway('Failed to fetch the job description URL.', 'URL_FETCH_FAILED', {
        logMessage: `Job description fetch returned ${response.status} for ${url.toString()}`,
      });
    }
    const html = await response.text();
    const $ = cheerio.load(html);
    $('script, style, nav, footer, header, noscript, svg').remove();
    staticText = normalizeWhitespace($('body').text());
  } catch (error) {
    if (isAppError(error)) {
      throw error;
    }
    // Timeout or network error — fall through to Playwright
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      console.warn(`[jd-url] Static fetch failed for ${url.toString()}, falling back to Playwright`);
    }
  } finally {
    clearTimeout(timeout);
  }

  // If static fetch gave us usable content, return it
  if (staticText) {
    return staticText;
  }

  // If no Playwright fallback available, surface the empty content error
  if (!playwrightFallback) {
    throw unprocessable('No readable job description content was found at that URL.', 'EMPTY_EXTRACTED_TEXT', {
      logMessage: `No readable text extracted from ${url.toString()}`,
    });
  }

  // Fallback: use Playwright for JS-rendered / SPA pages
  console.log(`[jd-url] Falling back to Playwright for ${url.toString()}`);
  try {
    const playwrightText = await playwrightFallback(url);
    if (!playwrightText) {
      throw unprocessable('No readable job description content was found at that URL.', 'EMPTY_EXTRACTED_TEXT', {
        logMessage: `No readable text extracted from ${url.toString()} (Playwright fallback)`,
      });
    }
    return playwrightText;
  } catch (error) {
    if (isAppError(error)) throw error;
    throw gatewayTimeout('Fetching the job description URL timed out.', 'URL_FETCH_TIMEOUT', {
      cause: error,
      logMessage: `Playwright fallback also failed for ${url.toString()}`,
    });
  }
}
