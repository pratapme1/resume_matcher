import { vi } from 'vitest';

// In-memory store — reset between tests
let usageEvents: unknown[] = [];
let tailorSessions: unknown[] = [];
let jobSearchSessions: unknown[] = [];
let monthlyCounts: Record<string, number> = {};
let sessionCounter = 0;

export function resetMockDb() {
  usageEvents = [];
  tailorSessions = [];
  jobSearchSessions = [];
  monthlyCounts = {};
  sessionCounter = 0;
}

export function setMonthlyCounts(userId: string, eventType: string, n: number) {
  monthlyCounts[`${userId}:${eventType}`] = n;
}

export function getUsageEvents() { return usageEvents; }
export function getTailorSessions() { return tailorSessions; }
export function getJobSearchSessions() { return jobSearchSessions; }

export function createMockUsageQueries() {
  return {
    writeUsageEvent: vi.fn(async (opts: unknown) => {
      usageEvents.push(opts);
    }),
    getMonthlyUsageCount: vi.fn(async (userId: string, eventType: string) => {
      return monthlyCounts[`${userId}:${eventType}`] ?? 0;
    }),
    isOverQuota: vi.fn(async (userId: string, eventType: string) => {
      const limits: Record<string, number> = {
        tailor: 5,
        search: 3,
        extract_url: 100,
        extract_file: 100,
        docx_generate: 100,
        build_profile: 100,
      };
      const count = monthlyCounts[`${userId}:${eventType}`] ?? 0;
      const limit = limits[eventType] ?? 100;
      if (limit >= 100) return false; // unlimited ops
      return count >= limit;
    }),
    FREE_TIER_LIMITS: {
      tailor: 5,
      search: 3,
      extract_url: 100,
      extract_file: 100,
      docx_generate: 100,
      build_profile: 100,
    },
  };
}

export function createMockSessionQueries() {
  return {
    createTailorSession: vi.fn(async (opts: unknown) => {
      const id = `session-${++sessionCounter}`;
      tailorSessions.push({ id, ...(opts as object) });
      return id;
    }),
    completeTailorSession: vi.fn(async (id: string, opts: unknown) => {
      const s = tailorSessions.find((s: unknown) => (s as { id: string }).id === id);
      if (s) Object.assign(s as object, opts as object);
    }),
    createJobSearchSession: vi.fn(async (opts: unknown) => {
      const id = `jss-${++sessionCounter}`;
      jobSearchSessions.push({ id, ...(opts as object) });
      return id;
    }),
    getLatestJobSearchSession: vi.fn(async () => {
      const latest = jobSearchSessions[jobSearchSessions.length - 1] as Record<string, unknown> | undefined;
      if (!latest) return null;
      return {
        id: latest.id as string,
        resumeId: latest.resumeId as string | undefined,
        preferencesJson: latest.preferencesJson,
        candidateProfileJson: latest.candidateProfileJson,
        resultsJson: latest.resultsJson,
        totalResults: latest.totalResults as number | undefined,
        createdAt: new Date().toISOString(),
      };
    }),
  };
}
