/**
 * Rate limiting tests.
 *
 * Architecture note: rate limiters in server/app.ts are module-level constants
 * (created once when the module loads). All createApp() calls in the same
 * test file share the same rate limit counters. Tests must account for this
 * cumulative state within the file.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import { createTestApp } from '../helpers/test-app.ts';
import { sampleResumePath } from '../helpers/fixture-path.ts';
import { MockAIClient } from '../helpers/mock-ai.ts';

// Rate limit for /api/search-jobs is 5/hour (module-level singleton)
const SEARCH_LIMIT = 5;

describe('rate limiting', () => {
  it('returns 429 after the 6th /api/search-jobs request (limit=5/hr)', async () => {
    const resumeBuffer = await readFile(sampleResumePath());
    const app = createTestApp({
      getAI: () => new MockAIClient(['mock-ai-job-search.json']),
      enforceRateLimit: true,
    });

    // Fire SEARCH_LIMIT requests — these should NOT be 429
    for (let i = 0; i < SEARCH_LIMIT; i++) {
      const res = await request(app)
        .post('/api/search-jobs')
        .attach('resume', resumeBuffer, 'resume.docx');
      expect(res.status).not.toBe(429);
    }

    // 6th request should be rate-limited
    const blockedRes = await request(app)
      .post('/api/search-jobs')
      .attach('resume', resumeBuffer, 'resume.docx');
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.code).toBe('RATE_LIMITED');
  });

  it('429 response includes RateLimit-Limit header', async () => {
    const resumeBuffer = await readFile(sampleResumePath());
    const app = createTestApp({
      getAI: () => new MockAIClient(['mock-ai-job-search.json']),
      enforceRateLimit: true,
    });

    // Exhaust the limit (cumulative from previous test in this file — already at 6)
    // Fire 6 more requests to ensure we're over the limit
    for (let i = 0; i < SEARCH_LIMIT + 1; i++) {
      await request(app)
        .post('/api/search-jobs')
        .attach('resume', resumeBuffer, 'resume.docx');
    }

    // This request should be rate-limited with headers
    const res = await request(app)
      .post('/api/search-jobs')
      .attach('resume', resumeBuffer, 'resume.docx');
    expect(res.status).toBe(429);
    // express-rate-limit v7 uses standardHeaders: 'draft-7' format
    const hasRateLimitHeader =
      res.headers['ratelimit-limit'] !== undefined ||
      res.headers['x-ratelimit-limit'] !== undefined;
    expect(hasRateLimitHeader).toBe(true);
  });

  it('returns 429 on /api/tailor-resume after 10 requests (separate rate limiter)', async () => {
    // tailor has its own rate limiter (10/hr) — independent of search limiter
    const resumeBuffer = await readFile(sampleResumePath());
    const app = createTestApp({ enforceRateLimit: true });
    const TAILOR_LIMIT = 10;

    for (let i = 0; i < TAILOR_LIMIT; i++) {
      await request(app)
        .post('/api/tailor-resume')
        .attach('resume', resumeBuffer, 'resume.docx')
        .field('jdText', 'Senior Engineer needed. Must have TypeScript and React.');
    }

    const res = await request(app)
      .post('/api/tailor-resume')
      .attach('resume', resumeBuffer, 'resume.docx')
      .field('jdText', 'Senior Engineer needed. Must have TypeScript and React.');
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
  });
});
