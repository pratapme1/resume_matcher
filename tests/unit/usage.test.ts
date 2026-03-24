import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { from, queryBuilder, state } = vi.hoisted(() => {
  const state = { mockCount: 0 };
  const queryBuilder = {
    select: vi.fn(() => queryBuilder),
    eq: vi.fn(() => queryBuilder),
    in: vi.fn(() => queryBuilder),
    gte: vi.fn(async () => ({ count: state.mockCount, error: null })),
  };
  const from = vi.fn(() => queryBuilder);
  return { from, queryBuilder, state };
});

vi.mock('../../server/db/client.ts', () => ({
  supabase: {
    from,
  },
}));

import { FREE_TIER_LIMITS, getQuotaLimit, isOverQuota, isQuotaBypassed } from '../../server/db/queries/usage.ts';

const QUOTA_ENV_KEYS = [
  'DISABLE_USAGE_QUOTAS',
  'QUOTA_BYPASS_USER_IDS',
  'QUOTA_BYPASS_EMAILS',
  'FREE_TAILOR_LIMIT',
  'FREE_SEARCH_LIMIT',
  'FREE_EXTRACT_URL_LIMIT',
  'FREE_EXTRACT_FILE_LIMIT',
  'FREE_DOCX_GENERATE_LIMIT',
  'FREE_BUILD_PROFILE_LIMIT',
] as const;

function resetQuotaEnv() {
  for (const key of QUOTA_ENV_KEYS) {
    delete process.env[key];
  }
}

describe('usage quota config', () => {
  beforeEach(() => {
    state.mockCount = 0;
    from.mockClear();
    queryBuilder.select.mockClear();
    queryBuilder.eq.mockClear();
    queryBuilder.in.mockClear();
    queryBuilder.gte.mockClear();
    resetQuotaEnv();
  });

  afterEach(() => {
    resetQuotaEnv();
  });

  it('uses the default tailor limit when no env override is present', () => {
    expect(getQuotaLimit('tailor')).toBe(FREE_TIER_LIMITS.tailor);
  });

  it('supports disabling quota enforcement globally', async () => {
    process.env.DISABLE_USAGE_QUOTAS = 'true';

    expect(isQuotaBypassed('user-1', 'user-1@example.com')).toBe(true);
    expect(await isOverQuota('user-1', 'tailor', 'user-1@example.com')).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('supports bypassing quotas for specific emails', async () => {
    process.env.QUOTA_BYPASS_EMAILS = 'founder@example.com,ops@example.com';
    state.mockCount = 999;

    expect(isQuotaBypassed('user-1', 'Founder@Example.com')).toBe(true);
    expect(await isOverQuota('user-1', 'tailor', 'Founder@Example.com')).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('supports env-based limit overrides', async () => {
    process.env.FREE_TAILOR_LIMIT = '10';

    state.mockCount = 9;
    expect(await isOverQuota('user-1', 'tailor')).toBe(false);

    state.mockCount = 10;
    expect(await isOverQuota('user-1', 'tailor')).toBe(true);
  });

  it('supports disabling a specific limit with an env override', async () => {
    process.env.FREE_TAILOR_LIMIT = 'off';
    state.mockCount = 999;

    expect(getQuotaLimit('tailor')).toBeNull();
    expect(await isOverQuota('user-1', 'tailor')).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});
