/**
 * DB real-world scenarios — tests that fire-and-forget DB writes are called
 * correctly under various user flows. Uses vi.mock() to intercept DB modules
 * at import time (lazy Proxy singleton pattern requires this approach).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import { setMockUser, createMockSupabaseFactory } from '../helpers/mock-auth.ts';
import { MockAIClient } from '../helpers/mock-ai.ts';
import { createApp } from '../../server/app.ts';
import { sampleResumePath } from '../helpers/fixture-path.ts';

vi.mock('@supabase/supabase-js', () => createMockSupabaseFactory());

// vi.hoisted ensures mocks are available when vi.mock factories run
const { mockUsage, mockSessions, usageStore } = vi.hoisted(() => {
  const usageStore: unknown[] = [];
  const mockUsage = {
    writeUsageEvent: vi.fn(async (opts: unknown) => { usageStore.push(opts); }),
    isOverQuota: vi.fn(async (_userId?: string, _eventType?: string) => false),
    getMonthlyUsageCount: vi.fn(async () => 0),
    FREE_TIER_LIMITS: { tailor: 5, search: 3, extract_url: 100, extract_file: 100, docx_generate: 100, build_profile: 100 },
  };
  const mockSessions = {
    createTailorSession: vi.fn(async () => 'session-1'),
    completeTailorSession: vi.fn(async () => {}),
    createJobSearchSession: vi.fn(async () => 'jss-1'),
  };
  return { mockUsage, mockSessions, usageStore };
});

vi.mock('../../server/db/queries/usage.ts', () => mockUsage);
vi.mock('../../server/db/queries/sessions.ts', () => mockSessions);

process.env.VITE_SUPABASE_URL = 'https://dummy.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'dummy-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-service-key';

const USER_A = 'db-scenario-user-a';
const USER_B = 'db-scenario-user-b';

function createDbApp(userId: string, aiFixtures = ['mock-ai-jd.json', 'mock-ai-gap.json', 'mock-ai-success.json']) {
  setMockUser(userId);
  return createApp({
    getAI: () => new MockAIClient(aiFixtures),
    disablePlaywrightJdFallback: true,
    skipAuth: false,
  });
}

async function tailorRequest(app: ReturnType<typeof createApp>) {
  const resumeBuffer = await readFile(sampleResumePath());
  return request(app)
    .post('/api/tailor-resume')
    .set('Authorization', 'Bearer valid-token')
    .attach('resume', resumeBuffer, 'resume.docx')
    .field('jdText', 'Senior Engineer needed. Must have TypeScript and React. Preferred: GraphQL, Kubernetes.');
}

async function searchRequest(app: ReturnType<typeof createApp>) {
  const resumeBuffer = await readFile(sampleResumePath());
  return request(app)
    .post('/api/search-jobs')
    .set('Authorization', 'Bearer valid-token')
    .attach('resume', resumeBuffer, 'resume.docx');
}

describe('DB real-world scenarios', () => {
  beforeEach(() => {
    usageStore.length = 0;
    vi.clearAllMocks();
    mockUsage.writeUsageEvent.mockImplementation(async (opts: unknown) => { usageStore.push(opts); });
    mockUsage.isOverQuota.mockResolvedValue(false);
    mockUsage.getMonthlyUsageCount.mockResolvedValue(0);
    mockSessions.createTailorSession.mockResolvedValue('session-1');
    mockSessions.completeTailorSession.mockResolvedValue(undefined);
    mockSessions.createJobSearchSession.mockResolvedValue('jss-1');
  });

  it('Scenario 1: writes success usage event after successful tailor', async () => {
    const app = createDbApp(USER_A);
    const res = await tailorRequest(app);
    expect(res.status).toBe(200);
    expect(res.body.blocked).toBe(false);

    // Fire-and-forget: wait for microtask queue
    await new Promise(r => setImmediate(r));
    expect(mockUsage.writeUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_A, eventType: 'tailor', status: 'success' }),
    );
  });

  it('Scenario 2: quota exhaustion — returns 402 and does NOT write success usage event', async () => {
    mockUsage.isOverQuota.mockImplementation(async (userId, eventType) =>
      userId === USER_A && eventType === 'tailor'
    );

    const app = createDbApp(USER_A);
    const res = await tailorRequest(app);
    expect(res.status).toBe(402);

    await new Promise(r => setImmediate(r));
    const successEvents = (usageStore as Array<{ eventType: string; status: string }>)
      .filter(e => e.eventType === 'tailor' && e.status === 'success');
    expect(successEvents.length).toBe(0);
  });

  it('Scenario 3: blocked tailor — writes "blocked" usage event', async () => {
    const app = createDbApp(USER_A, ['mock-ai-jd.json', 'mock-ai-gap.json', 'mock-ai-blocked.json']);
    const resumeBuffer = await readFile(sampleResumePath());
    const res = await request(app)
      .post('/api/tailor-resume')
      .set('Authorization', 'Bearer valid-token')
      .attach('resume', resumeBuffer, 'resume.docx')
      .field('jdText', 'Senior Engineer needed. Must have TypeScript. [blocked]');
    expect(res.status).toBe(200);
    expect(res.body.blocked).toBe(true);

    await new Promise(r => setImmediate(r));
    expect(mockUsage.writeUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_A, eventType: 'tailor', status: 'blocked' }),
    );
  });

  it('Scenario 4: AI failure — writes error usage event', async () => {
    setMockUser(USER_A);
    let callCount = 0;
    const failApp = createApp({
      getAI: () => ({
        models: {
          generateContent: async () => {
            callCount++;
            if (callCount === 1) return { text: JSON.stringify({ mustHaveKeywords: [], niceToHaveKeywords: [], targetTitles: [], seniorityLevel: '' }) };
            if (callCount === 2) return { text: JSON.stringify({ repositioningAngle: '', topStrengths: [], keyGaps: [], bulletPriorities: [], summaryOpeningHint: '' }) };
            throw new Error('AI provider down');
          },
        },
      }),
      disablePlaywrightJdFallback: true,
      skipAuth: false,
    });
    const res = await tailorRequest(failApp);
    expect(res.status).toBe(502);

    await new Promise(r => setImmediate(r));
    expect(mockUsage.writeUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_A, eventType: 'tailor', status: 'error' }),
    );
  });

  it('Scenario 5: cross-user quota isolation — user A quota does not block user B', async () => {
    mockUsage.isOverQuota.mockImplementation(async (userId, eventType) =>
      userId === USER_A && eventType === 'tailor'
    );

    const appA = createDbApp(USER_A);
    const resA = await tailorRequest(appA);
    expect(resA.status).toBe(402);

    const appB = createDbApp(USER_B);
    const resB = await tailorRequest(appB);
    expect(resB.status).toBe(200);
  });

  it('Scenario 6: job search session recorded after successful search', async () => {
    setMockUser(USER_A);
    const app = createApp({
      getAI: () => new MockAIClient(['mock-ai-job-search.json']),
      disablePlaywrightJdFallback: true,
      skipAuth: false,
    });
    const res = await searchRequest(app);
    expect(res.status).toBe(200);

    await new Promise(r => setImmediate(r));
    expect(mockSessions.createJobSearchSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_A }),
    );
  });

  it('Scenario 7: usage event written for search with correct eventType=search', async () => {
    setMockUser(USER_A);
    const app = createApp({
      getAI: () => new MockAIClient(['mock-ai-job-search.json']),
      disablePlaywrightJdFallback: true,
      skipAuth: false,
    });
    const res = await searchRequest(app);
    expect(res.status).toBe(200);

    await new Promise(r => setImmediate(r));
    expect(mockUsage.writeUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_A, eventType: 'search', status: 'success' }),
    );
  });

  it('Scenario 8: parallel tailor requests for user A and B both succeed independently', async () => {
    const resumeBuffer = await readFile(sampleResumePath());

    const [resA, resB] = await Promise.all([
      request(createDbApp(USER_A))
        .post('/api/tailor-resume')
        .set('Authorization', 'Bearer valid-token')
        .attach('resume', Buffer.from(resumeBuffer), 'resume.docx')
        .field('jdText', 'Senior Engineer. Must have TypeScript and React.'),
      request(createDbApp(USER_B))
        .post('/api/tailor-resume')
        .set('Authorization', 'Bearer valid-token')
        .attach('resume', Buffer.from(resumeBuffer), 'resume.docx')
        .field('jdText', 'Senior Engineer. Must have TypeScript and React.'),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
  });
});
