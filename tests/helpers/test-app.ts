import type { Request } from 'express';
import { createApp } from '../../server/app.ts';
import type { AIClient } from '../../server/app.ts';
import { MockAIClient } from './mock-ai.ts';

type TestAppOverrides = {
  fetchImpl?: typeof fetch;
  getAI?: (req?: Request) => AIClient;
  getTailorFallbackAI?: (req?: Request) => AIClient;
  getSearchAI?: (req?: Request) => AIClient;
  getSearchFallbackAI?: (req?: Request) => AIClient;
  enforceRateLimit?: boolean;
};

function defaultGetAI(req?: Request) {
  const body = req?.body as { jdText?: string } | undefined;
  const tailorFixture = body?.jdText?.includes('[blocked]')
    ? 'mock-ai-blocked.json'
    : 'mock-ai-success.json';
  const gapFixture = body?.jdText?.includes('[missing-fit]')
    ? 'mock-ai-gap-missing-fit.json'
    : 'mock-ai-gap.json';
  return new MockAIClient([
    'mock-ai-jd.json',
    gapFixture,
    tailorFixture,
  ]);
}

export function createTestApp(overrides: TestAppOverrides = {}) {
  return createApp({
    getAI: overrides.getAI ?? defaultGetAI,
    getTailorFallbackAI: overrides.getTailorFallbackAI,
    getSearchAI: overrides.getSearchAI ?? overrides.getAI,
    getSearchFallbackAI: overrides.getSearchFallbackAI,
    fetchImpl: overrides.fetchImpl ?? (async (_input: RequestInfo | URL) =>
      new Response(`<html><body><main>Senior Frontend Engineer React TypeScript Testing Leadership</main></body></html>`, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })),
    disablePlaywrightJdFallback: true,
    skipAuth: true,
    enforceRateLimit: overrides.enforceRateLimit,
  });
}
