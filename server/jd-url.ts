import * as cheerio from 'cheerio';
import { badGateway, badRequest, gatewayTimeout, isAppError, unprocessable } from './errors.ts';
import { normalizeWhitespace } from './utils.ts';

const FETCH_TIMEOUT_MS = 8_000;
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
): Promise<string> {
  const url = parseJobDescriptionUrl(value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
    const cleanText = normalizeWhitespace($('body').text());

    if (!cleanText) {
      throw unprocessable('No readable job description content was found at that URL.', 'EMPTY_EXTRACTED_TEXT', {
        logMessage: `No readable text extracted from ${url.toString()}`,
      });
    }

    return cleanText;
  } catch (error) {
    if (isAppError(error)) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw gatewayTimeout('Fetching the job description URL timed out.', 'URL_FETCH_TIMEOUT', {
        cause: error,
        logMessage: `Timed out fetching ${url.toString()}`,
      });
    }

    throw badGateway('Failed to fetch the job description URL.', 'URL_FETCH_FAILED', {
      cause: error,
      logMessage: `Network error while fetching ${url.toString()}`,
    });
  } finally {
    clearTimeout(timeout);
  }
}
