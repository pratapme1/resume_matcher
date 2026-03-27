import { describe, expect, it, vi } from 'vitest';
import type { JobRecord } from '../../src/shared/types.ts';
import { createMockSupabaseFactory } from '../helpers/mock-auth.ts';

vi.mock('@supabase/supabase-js', () => createMockSupabaseFactory());

import { sortJobsForPresentation } from '../../server/db/queries/jobs.ts';

function job(id: string, lifecycleStatus: JobRecord['lifecycleStatus'], lastSearchRank: number | null, lastSeenAt: string): JobRecord {
  return {
    id,
    userId: 'user-1',
    title: id,
    company: 'Company',
    lifecycleStatus,
    lastSearchRank,
    lastSeenAt,
    createdAt: lastSeenAt,
    updatedAt: lastSeenAt,
  };
}

describe('job ledger ordering', () => {
  it('prioritizes active lifecycle states ahead of historical ones', () => {
    const ordered = sortJobsForPresentation([
      job('dismissed', 'dismissed', 0, '2026-03-25T00:00:00.000Z'),
      job('shown', 'shown', 4, '2026-03-26T00:00:00.000Z'),
      job('applying', 'applying', 9, '2026-03-24T00:00:00.000Z'),
      job('saved', 'saved', 2, '2026-03-26T00:00:00.000Z'),
      job('applied', 'applied', 1, '2026-03-27T00:00:00.000Z'),
    ]);

    expect(ordered.map((entry) => entry.id)).toEqual([
      'applying',
      'saved',
      'shown',
      'applied',
      'dismissed',
    ]);
  });

  it('uses search rank before recency inside the same lifecycle bucket', () => {
    const ordered = sortJobsForPresentation([
      job('rank-9', 'shown', 9, '2026-03-27T00:00:00.000Z'),
      job('rank-1', 'shown', 1, '2026-03-20T00:00:00.000Z'),
      job('rank-null', 'shown', null, '2026-03-28T00:00:00.000Z'),
    ]);

    expect(ordered.map((entry) => entry.id)).toEqual([
      'rank-1',
      'rank-9',
      'rank-null',
    ]);
  });
});
