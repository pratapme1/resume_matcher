import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import { createMockSupabaseFactory, setMockUser, TEST_USER_ID } from '../helpers/mock-auth.ts';
import { sampleResumePath } from '../helpers/fixture-path.ts';
import { MockAIClient } from '../helpers/mock-ai.ts';

vi.mock('@supabase/supabase-js', () => createMockSupabaseFactory());

const { mockJobs, mockApplications, mockUsage, mockSessions } = vi.hoisted(() => ({
  mockJobs: {
    upsertJobFromSearch: vi.fn(async () => 'job-1'),
    getJobsForUser: vi.fn(async () => []),
    updateJobLifecycle: vi.fn(async () => true),
  },
  mockApplications: {
    getApplicationMetricsForUser: vi.fn(async () => ({
      totalSessions: 0,
      byStatus: {},
      byPortalType: {},
      byPauseReason: {},
      byExecutorMode: {},
    })),
    getApplicationReliabilitySnapshotForUser: vi.fn(async () => ({
      metrics: {
        totalSessions: 0,
        byStatus: {},
        byPortalType: {},
        byPauseReason: {},
        byExecutorMode: {},
      },
      recentIssues: [],
    })),
    getApplicationTraceForUser: vi.fn(async () => []),
    getApplicationsForUser: vi.fn(async () => []),
    getRelatedApplicationsForUser: vi.fn(async () => []),
    updateApplicationStatus: vi.fn(async () => true),
  },
  mockUsage: {
    writeUsageEvent: vi.fn(async () => {}),
    isOverQuota: vi.fn(async () => false),
    getMonthlyUsageCount: vi.fn(async () => 0),
    FREE_TIER_LIMITS: { tailor: 5, search: 3, extract_url: 100, extract_file: 100, docx_generate: 100, build_profile: 100 },
  },
  mockSessions: {
    createTailorSession: vi.fn(async () => 'session-1'),
    completeTailorSession: vi.fn(async () => {}),
    createJobSearchSession: vi.fn(async () => 'jss-1'),
    getLatestJobSearchSession: vi.fn(async () => null),
  },
}));

vi.mock('../../server/db/queries/jobs.ts', () => mockJobs);
vi.mock('../../server/db/queries/applications.ts', () => mockApplications);
vi.mock('../../server/db/queries/usage.ts', () => mockUsage);
vi.mock('../../server/db/queries/sessions.ts', () => mockSessions);

import { createApp } from '../../server/app.ts';

process.env.VITE_SUPABASE_URL = 'https://dummy.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'dummy-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-service-key';

describe('job ledger api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockUser(TEST_USER_ID);
    mockUsage.isOverQuota.mockResolvedValue(false);
    mockJobs.upsertJobFromSearch.mockResolvedValue('job-1');
    mockJobs.getJobsForUser.mockResolvedValue([]);
    mockJobs.updateJobLifecycle.mockResolvedValue(true);
    mockApplications.getRelatedApplicationsForUser.mockResolvedValue([]);
    mockApplications.getApplicationMetricsForUser.mockResolvedValue({
      totalSessions: 0,
      byStatus: {},
      byPortalType: {},
      byPauseReason: {},
      byExecutorMode: {},
    });
    mockApplications.getApplicationReliabilitySnapshotForUser.mockResolvedValue({
      metrics: {
        totalSessions: 0,
        byStatus: {},
        byPortalType: {},
        byPauseReason: {},
        byExecutorMode: {},
      },
      recentIssues: [],
    });
  });

  it('persists ranked search results into the job ledger after search', async () => {
    const app = createApp({
      getAI: () => new MockAIClient(['mock-ai-job-search.json']),
      disablePlaywrightJdFallback: true,
      skipAuth: false,
    });

    const response = await request(app)
      .post('/api/search-jobs')
      .set('Authorization', 'Bearer valid-token')
      .attach('resume', await readFile(sampleResumePath()), 'resume.docx');

    expect(response.status).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockJobs.upsertJobFromSearch).toHaveBeenCalled();
    const firstCall = mockJobs.upsertJobFromSearch.mock.calls[0] as unknown as [string, unknown, { searchRank: number }];
    expect(firstCall[0]).toBe(TEST_USER_ID);
    expect(firstCall[2]).toEqual(expect.objectContaining({ searchRank: 0 }));
  });

  it('returns related replay records for an application', async () => {
    mockApplications.getRelatedApplicationsForUser.mockResolvedValue([
      { id: 'app-1', userId: TEST_USER_ID, jobId: 'job-1', status: 'failed', createdAt: '2026-03-26T00:00:00.000Z', updatedAt: '2026-03-26T00:00:00.000Z' },
      { id: 'app-2', userId: TEST_USER_ID, jobId: 'job-1', status: 'manual_required', replayOfApplicationId: 'app-1', retryCount: 1, createdAt: '2026-03-27T00:00:00.000Z', updatedAt: '2026-03-27T00:00:00.000Z' },
    ]);

    const app = createApp({
      getAI: () => new MockAIClient(['mock-ai-jd.json', 'mock-ai-gap.json', 'mock-ai-success.json']),
      disablePlaywrightJdFallback: true,
      skipAuth: false,
    });

    const response = await request(app)
      .get('/api/applications/app-1/replays')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.applications).toHaveLength(2);
    expect(mockApplications.getRelatedApplicationsForUser).toHaveBeenCalledWith('app-1', TEST_USER_ID);
  });

  it('updates job lifecycle status through the jobs api', async () => {
    const app = createApp({
      getAI: () => new MockAIClient(['mock-ai-jd.json', 'mock-ai-gap.json', 'mock-ai-success.json']),
      disablePlaywrightJdFallback: true,
      skipAuth: false,
    });

    const response = await request(app)
      .patch('/api/jobs/job-123')
      .set('Authorization', 'Bearer valid-token')
      .send({ lifecycleStatus: 'saved' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(mockJobs.updateJobLifecycle).toHaveBeenCalledWith(TEST_USER_ID, 'job-123', 'saved');
  });

  it('returns persisted application metrics when supabase-backed auth is active', async () => {
    mockApplications.getApplicationMetricsForUser.mockResolvedValue({
      totalSessions: 3,
      byStatus: { applied: 1, manual_required: 2 },
      byPortalType: { greenhouse: 2, workday: 1 },
      byPauseReason: { none: 1, login_required: 2 },
      byExecutorMode: { local_agent: 3 },
    });

    const app = createApp({
      getAI: () => new MockAIClient(['mock-ai-jd.json', 'mock-ai-gap.json', 'mock-ai-success.json']),
      disablePlaywrightJdFallback: true,
      skipAuth: false,
    });

    const response = await request(app)
      .get('/api/apply/metrics')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.totalSessions).toBe(3);
    expect(response.body.byExecutorMode.local_agent).toBe(3);
    expect(mockApplications.getApplicationMetricsForUser).toHaveBeenCalledWith(TEST_USER_ID);
  });

  it('returns a persisted reliability snapshot when supabase-backed auth is active', async () => {
    mockApplications.getApplicationReliabilitySnapshotForUser.mockResolvedValue({
      metrics: {
        totalSessions: 4,
        byStatus: { applied: 2, manual_required: 1, failed: 1 },
        byPortalType: { greenhouse: 2, workday: 2 },
        byPauseReason: { none: 2, login_required: 1, assessment_required: 1 },
        byExecutorMode: { local_agent: 4 },
      },
      recentIssues: [
        {
          applicationId: 'app-3',
          status: 'manual_required',
          portalType: 'workday',
          pauseReason: 'assessment_required',
          executorMode: 'local_agent',
          lastMessage: 'Assessment handoff required.',
          updatedAt: '2026-03-27T09:00:00.000Z',
        },
      ],
    });

    const app = createApp({
      getAI: () => new MockAIClient(['mock-ai-jd.json', 'mock-ai-gap.json', 'mock-ai-success.json']),
      disablePlaywrightJdFallback: true,
      skipAuth: false,
    });

    const response = await request(app)
      .get('/api/apply/reliability')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.metrics.totalSessions).toBe(4);
    expect(response.body.recentIssues).toHaveLength(1);
    expect(response.body.recentIssues[0].pauseReason).toBe('assessment_required');
    expect(mockApplications.getApplicationReliabilitySnapshotForUser).toHaveBeenCalledWith(TEST_USER_ID);
  });
});
