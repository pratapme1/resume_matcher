import type { Request } from 'express';
import { createApp } from '../../server/app.ts';
import type { AIClient } from '../../server/app.ts';
import { MockAIClient } from './mock-ai.ts';

type TestAppOverrides = {
  fetchImpl?: typeof fetch;
  getAI?: (req?: Request) => AIClient;
};

function defaultGetAI(req?: Request) {
  const body = req?.body as { jdText?: string } | undefined;
  const tailorFixture = body?.jdText?.includes('[blocked]')
    ? 'mock-ai-blocked.json'
    : 'mock-ai-success.json';
  return new MockAIClient([
    'mock-ai-jd.json',
    'mock-ai-gap.json',
    tailorFixture,
  ]);
}

export function createTestApp(overrides: TestAppOverrides = {}) {
  return createApp({
    getAI: overrides.getAI ?? defaultGetAI,
    fetchImpl: overrides.fetchImpl ?? (async (_input: RequestInfo | URL) =>
      new Response(`<html><body><main>Senior Frontend Engineer React TypeScript Testing Leadership</main></body></html>`, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })),
    disablePlaywrightJdFallback: true,
  });
}
