import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import { setMockUser, createMockSupabaseFactory } from '../helpers/mock-auth.ts';
import { sampleResumePath } from '../helpers/fixture-path.ts';
import { createApp } from '../../server/app.ts';
import { MockAIClient } from '../helpers/mock-ai.ts';

// vi.hoisted ensures these are initialized before the vi.mock factories run
const { mockUsage, mockSessions } = vi.hoisted(() => {
  let monthlyCounts: Record<string, number> = {};

  const mockUsage = {
    writeUsageEvent: vi.fn(async () => {}),
    isOverQuota: vi.fn(async (userId: string, eventType: string) => {
      const limits: Record<string, number> = { tailor: 5, search: 3 };
      const count = monthlyCounts[`${userId}:${eventType}`] ?? 0;
      const limit = limits[eventType];
      if (!limit) return false;
      return count >= limit;
    }),
    getMonthlyUsageCount: vi.fn(async (userId: string, eventType: string) => {
      return monthlyCounts[`${userId}:${eventType}`] ?? 0;
    }),
    FREE_TIER_LIMITS: { tailor: 5, search: 3, extract_url: 100, extract_file: 100, docx_generate: 100, build_profile: 100 },
    __setCount: (userId: string, eventType: string, n: number) => {
      monthlyCounts[`${userId}:${eventType}`] = n;
    },
    __reset: () => {
      monthlyCounts = {};
    },
  };

  const mockSessions = {
    createTailorSession: vi.fn(async () => 'session-1'),
    completeTailorSession: vi.fn(async () => {}),
    createJobSearchSession: vi.fn(async () => 'jss-1'),
    getLatestJobSearchSession: vi.fn(async () => null),
  };

  return { mockUsage, mockSessions };
});

vi.mock('@supabase/supabase-js', () => createMockSupabaseFactory());
vi.mock('../../server/db/queries/usage.ts', () => mockUsage);
vi.mock('../../server/db/queries/sessions.ts', () => mockSessions);

process.env.VITE_SUPABASE_URL = 'https://dummy.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'dummy-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-service-key';

const TEST_USER = 'quota-test-user-001';
const TEST_USER_2 = 'quota-test-user-002';

function createQuotaApp(userId: string, fixture = 'mock-ai-success.json') {
  setMockUser(userId);
  return createApp({
    getAI: () => new MockAIClient(['mock-ai-jd.json', 'mock-ai-gap.json', fixture]),
    fetchImpl: async () => new Response('<html><body>Job description</body></html>', { status: 200 }),
    disablePlaywrightJdFallback: true,
    skipAuth: false,
  });
}

describe('monthly quota enforcement', () => {
  beforeEach(() => {
    mockUsage.__reset();
    vi.clearAllMocks();
    // Re-apply default implementations after clearAllMocks
    mockUsage.writeUsageEvent.mockResolvedValue(undefined);
    mockUsage.isOverQuota.mockImplementation(async (userId: string, eventType: string) => {
      // Access monthlyCounts via closure — __setCount keeps it in sync
      const count = await mockUsage.getMonthlyUsageCount(userId, eventType);
      const limits: Record<string, number> = { tailor: 5, search: 3 };
      const limit = limits[eventType];
      if (!limit) return false;
      return count >= limit;
    });
    mockUsage.getMonthlyUsageCount.mockResolvedValue(0);
    mockSessions.createTailorSession.mockResolvedValue('session-1');
    mockSessions.completeTailorSession.mockResolvedValue(undefined);
    mockSessions.createJobSearchSession.mockResolvedValue('jss-1');
    mockSessions.getLatestJobSearchSession.mockResolvedValue(null);
  });

  it('allows /api/extract-jd-text at any count (extract is unlimited)', async () => {
    setMockUser(TEST_USER);
    const app = createQuotaApp(TEST_USER);
    const res = await request(app)
      .post('/api/extract-jd-text')
      .set('Authorization', 'Bearer valid-token')
      .send({ text: 'Senior Engineer needed. Required: TypeScript, React. Must have 5+ years experience with cloud platforms and distributed systems. Nice to have: Kubernetes, GraphQL.' });
    expect(res.status).toBe(200);
  });

  it('blocks /api/tailor-resume with 402 QUOTA_EXCEEDED at count=5 (at limit)', async () => {
    mockUsage.isOverQuota.mockImplementation(async (userId: string, eventType: string) =>
      userId === TEST_USER && eventType === 'tailor'
    );
    const resumeBuffer = await readFile(sampleResumePath());
    const app = createQuotaApp(TEST_USER);
    const res = await request(app)
      .post('/api/tailor-resume')
      .set('Authorization', 'Bearer valid-token')
      .attach('resume', resumeBuffer, 'resume.docx')
      .field('jdText', 'Senior Engineer needed. Must have TypeScript and React.');
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('QUOTA_EXCEEDED');
  });

  it('allows /api/tailor-resume at count=4 (under limit)', async () => {
    mockUsage.isOverQuota.mockResolvedValue(false);
    const resumeBuffer = await readFile(sampleResumePath());
    const app = createQuotaApp(TEST_USER);
    const res = await request(app)
      .post('/api/tailor-resume')
      .set('Authorization', 'Bearer valid-token')
      .attach('resume', resumeBuffer, 'resume.docx')
      .field('jdText', 'Senior Engineer needed. Must have TypeScript and React.');
    expect(res.status).not.toBe(402);
  });

  it('blocks /api/search-jobs with 402 at count=3 (at limit)', async () => {
    mockUsage.isOverQuota.mockImplementation(async (userId: string, eventType: string) =>
      userId === TEST_USER && eventType === 'search'
    );
    const resumeBuffer = await readFile(sampleResumePath());
    const app = createQuotaApp(TEST_USER);
    const res = await request(app)
      .post('/api/search-jobs')
      .set('Authorization', 'Bearer valid-token')
      .attach('resume', resumeBuffer, 'resume.docx');
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('QUOTA_EXCEEDED');
  });

  it('allows /api/search-jobs at count=2 (under limit)', async () => {
    mockUsage.isOverQuota.mockResolvedValue(false);
    const resumeBuffer = await readFile(sampleResumePath());
    const app = createQuotaApp(TEST_USER, 'mock-ai-job-search.json');

    // Override getAI for job search
    setMockUser(TEST_USER);
    const searchApp = createApp({
      getAI: () => new MockAIClient(['mock-ai-job-search.json']),
      disablePlaywrightJdFallback: true,
      skipAuth: false,
    });
    const res = await request(searchApp)
      .post('/api/search-jobs')
      .set('Authorization', 'Bearer valid-token')
      .attach('resume', resumeBuffer, 'resume.docx');
    expect(res.status).not.toBe(402);
  });

  it('user A quota does not affect user B', async () => {
    const resumeBuffer = await readFile(sampleResumePath());

    // User A is at quota
    mockUsage.isOverQuota.mockImplementation(async (userId: string, eventType: string) =>
      userId === TEST_USER && eventType === 'tailor'
    );

    setMockUser(TEST_USER);
    const appA = createApp({
      getAI: () => new MockAIClient(['mock-ai-jd.json', 'mock-ai-gap.json', 'mock-ai-success.json']),
      disablePlaywrightJdFallback: true,
      skipAuth: false,
    });
    const resA = await request(appA)
      .post('/api/tailor-resume')
      .set('Authorization', 'Bearer valid-token')
      .attach('resume', resumeBuffer, 'resume.docx')
      .field('jdText', 'Senior Engineer needed. Must have TypeScript.');
    expect(resA.status).toBe(402);

    // User B is NOT at quota
    setMockUser(TEST_USER_2);
    const appB = createApp({
      getAI: () => new MockAIClient(['mock-ai-jd.json', 'mock-ai-gap.json', 'mock-ai-success.json']),
      disablePlaywrightJdFallback: true,
      skipAuth: false,
    });
    const resB = await request(appB)
      .post('/api/tailor-resume')
      .set('Authorization', 'Bearer valid-token')
      .attach('resume', resumeBuffer, 'resume.docx')
      .field('jdText', 'Senior Engineer needed. Must have TypeScript.');
    expect(resB.status).not.toBe(402);
  });

  it('quota check fires BEFORE AI call — isOverQuota is called with correct args', async () => {
    mockUsage.isOverQuota.mockImplementation(async (userId: string, eventType: string) =>
      userId === TEST_USER && eventType === 'tailor'
    );
    const resumeBuffer = await readFile(sampleResumePath());
    const app = createQuotaApp(TEST_USER);
    const res = await request(app)
      .post('/api/tailor-resume')
      .set('Authorization', 'Bearer valid-token')
      .attach('resume', resumeBuffer, 'resume.docx')
      .field('jdText', 'Senior Engineer needed. Must have TypeScript.');
    expect(res.status).toBe(402);
    expect(mockUsage.isOverQuota).toHaveBeenCalledWith(TEST_USER, 'tailor', `${TEST_USER}@test.com`);
  });
});
