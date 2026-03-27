import * as cheerio from 'cheerio';
import { badGateway, badRequest, gatewayTimeout, isAppError, unprocessable } from './errors.ts';
import { normalizeWhitespace } from './utils.ts';

const FETCH_TIMEOUT_MS = 8_000;
const JOB_FETCH_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
};

async function fetchWithPlaywright(url: URL): Promise<string> {
  const { chromium } = await import('@playwright/test').catch(() => {
    throw new Error('Playwright is not available in this environment');
  });
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
  let staticFetchStatus: number | null = null;
  let staticFetchError: unknown = null;

  try {
    const response = await fetchImpl(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: JOB_FETCH_HEADERS,
    });

    if (!response.ok) {
      staticFetchStatus = response.status;
    } else {
      const html = await response.text();
      const $ = cheerio.load(html);
      $('script, style, nav, footer, header, noscript, svg').remove();
      staticText = normalizeWhitespace($('body').text());
    }
  } catch (error) {
    staticFetchError = error;
  } finally {
    clearTimeout(timeout);
  }

  // If static fetch gave us usable content, return it
  if (staticText) {
    return staticText;
  }

  if (staticFetchStatus && !playwrightFallback) {
    if (staticFetchStatus === 404 || staticFetchStatus === 410) {
      throw unprocessable(
        'That job listing is no longer available at the provided URL. Use the search summary or choose another listing.',
        'EMPTY_EXTRACTED_TEXT',
        {
          logMessage: `Job description fetch returned ${staticFetchStatus} for ${url.toString()}`,
        },
      );
    }

    if (staticFetchStatus === 401 || staticFetchStatus === 403 || staticFetchStatus === 429) {
      throw badGateway('The job site blocked direct extraction for that URL. Use the search summary or paste the JD text.', 'URL_FETCH_FAILED', {
        logMessage: `Job description fetch returned ${staticFetchStatus} for ${url.toString()}`,
      });
    }

    throw badGateway('Failed to fetch the job description URL.', 'URL_FETCH_FAILED', {
      logMessage: `Job description fetch returned ${staticFetchStatus} for ${url.toString()}`,
    });
  }

  if (staticFetchError && !playwrightFallback) {
    if (staticFetchError instanceof DOMException && staticFetchError.name === 'AbortError') {
      throw gatewayTimeout('Fetching the job description URL timed out.', 'URL_FETCH_TIMEOUT', {
        cause: staticFetchError,
        logMessage: `Static job description fetch timed out for ${url.toString()}`,
      });
    }

    if (isAppError(staticFetchError)) {
      throw staticFetchError;
    }

    throw badGateway('Failed to fetch the job description URL.', 'URL_FETCH_FAILED', {
      cause: staticFetchError,
      logMessage: `Job description fetch failed for ${url.toString()}`,
    });
  }

  // If no Playwright fallback available, surface the empty content error
  if (!playwrightFallback) {
    throw unprocessable('No readable job description content was found at that URL.', 'EMPTY_EXTRACTED_TEXT', {
      logMessage: `No readable text extracted from ${url.toString()}`,
    });
  }

  if (staticFetchStatus) {
    console.warn(`[jd-url] Static fetch returned ${staticFetchStatus} for ${url.toString()}, trying Playwright fallback`);
  } else if (staticFetchError && !(staticFetchError instanceof DOMException && staticFetchError.name === 'AbortError')) {
    console.warn(`[jd-url] Static fetch failed for ${url.toString()}, trying Playwright fallback`);
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
