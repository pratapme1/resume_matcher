import { supabase } from '../client.ts';
import type { JobLifecycleStatus, JobSearchResult } from '../../../src/shared/types.ts';
import type { JobRecord } from './applications.ts';

const lifecyclePriority: Record<JobLifecycleStatus, number> = {
  applying: 0,
  queued: 1,
  saved: 2,
  shown: 3,
  discovered: 4,
  manual_required: 5,
  failed: 6,
  applied: 7,
  dismissed: 8,
};

export function sortJobsForPresentation(records: JobRecord[]) {
  return [...records].sort((left, right) => {
    const leftPriority = lifecyclePriority[left.lifecycleStatus ?? 'discovered'] ?? 99;
    const rightPriority = lifecyclePriority[right.lifecycleStatus ?? 'discovered'] ?? 99;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;

    const leftRank = left.lastSearchRank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.lastSearchRank ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;

    const leftTime = new Date(left.lastSeenAt ?? left.updatedAt).getTime();
    const rightTime = new Date(right.lastSeenAt ?? right.updatedAt).getTime();
    return rightTime - leftTime;
  });
}

export async function upsertJobFromSearch(
  userId: string,
  searchResult: JobSearchResult,
  opts?: {
    lifecycleStatus?: JobLifecycleStatus;
    searchRank?: number;
  },
): Promise<string> {
  const sourceHost = (() => {
    try {
      return searchResult.url ? new URL(searchResult.url).hostname : null;
    } catch {
      return null;
    }
  })();
  const existing = searchResult.url
    ? await supabase
        .from('jobs')
        .select('id, lifecycle_status, seen_count, last_search_rank, first_seen_at, last_seen_at, saved_at, dismissed_at, last_applied_at')
        .eq('user_id', userId)
        .eq('url', searchResult.url)
        .maybeSingle()
    : { data: null, error: null };
  if (existing.error) throw existing.error;

  const now = new Date().toISOString();
  const existingLifecycle = (existing.data?.lifecycle_status as JobLifecycleStatus | null | undefined) ?? null;
  const lifecycleStatus = opts?.lifecycleStatus
    ?? (existingLifecycle && existingLifecycle !== 'discovered' ? existingLifecycle : 'shown');

  const { data, error } = await supabase
    .from('jobs')
    .upsert(
      {
        user_id: userId,
        title: searchResult.title ?? null,
        company: searchResult.company ?? null,
        location: searchResult.location ?? null,
        url: searchResult.url ?? null,
        apply_url: searchResult.url ?? null,
        description: searchResult.description ?? null,
        source_host: sourceHost,
        source_type: searchResult.sourceType ?? null,
        verified_source: searchResult.verifiedSource ?? null,
        last_verified_at: now,
        lifecycle_status: lifecycleStatus,
        seen_count: ((existing.data?.seen_count as number | null | undefined) ?? 0) + 1,
        last_search_rank: opts?.searchRank ?? ((existing.data?.last_search_rank as number | null | undefined) ?? null),
        first_seen_at: existing.data?.first_seen_at ?? now,
        last_seen_at: now,
        saved_at: existing.data?.saved_at ?? null,
        dismissed_at: lifecycleStatus === 'dismissed' ? now : existing.data?.dismissed_at ?? null,
        last_applied_at: existing.data?.last_applied_at ?? null,
        updated_at: now,
      },
      { onConflict: 'user_id,url' },
    )
    .select('id')
    .single();
  if (error) throw error;
  if (!data?.id) throw new Error('jobs upsert returned no id');
  return data.id as string;
}

export async function updateJobLifecycle(
  userId: string,
  jobId: string,
  status: JobLifecycleStatus,
  opts?: {
    applyUrl?: string;
    description?: string;
    sourceHost?: string;
    sourceType?: string;
    verifiedSource?: boolean;
  },
): Promise<boolean> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    lifecycle_status: status,
    updated_at: now,
  };
  if (typeof opts?.applyUrl !== 'undefined') patch.apply_url = opts.applyUrl;
  if (typeof opts?.description !== 'undefined') patch.description = opts.description;
  if (typeof opts?.sourceHost !== 'undefined') patch.source_host = opts.sourceHost;
  if (typeof opts?.sourceType !== 'undefined') patch.source_type = opts.sourceType;
  if (typeof opts?.verifiedSource !== 'undefined') patch.verified_source = opts.verifiedSource;
  if (status === 'saved') patch.saved_at = now;
  if (status === 'dismissed') patch.dismissed_at = now;
  if (status === 'applied' || status === 'applying' || status === 'manual_required' || status === 'failed' || status === 'queued') {
    patch.last_applied_at = now;
  }

  const { data, error } = await supabase
    .from('jobs')
    .update(patch)
    .eq('id', jobId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

export async function getSeenJobUrlsForUser(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('jobs')
    .select('url')
    .eq('user_id', userId)
    .not('url', 'is', null);
  if (error) throw error;
  return new Set((data ?? []).map(r => r.url as string).filter(Boolean));
}

export async function getJobsForUser(userId: string): Promise<JobRecord[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, user_id, title, company, location, url, apply_url, description, source_host, source_type, verified_source, last_verified_at, lifecycle_status, seen_count, last_search_rank, first_seen_at, last_seen_at, saved_at, dismissed_at, last_applied_at, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  if (!data) return [];
  return sortJobsForPresentation(data.map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    title: (row.title as string | null | undefined) ?? null,
    company: (row.company as string | null | undefined) ?? null,
    location: (row.location as string | null | undefined) ?? null,
    url: (row.url as string | null | undefined) ?? null,
    applyUrl: (row.apply_url as string | null | undefined) ?? null,
    description: (row.description as string | null | undefined) ?? null,
    sourceHost: (row.source_host as string | null | undefined) ?? null,
    sourceType: (row.source_type as string | null | undefined) ?? null,
    verifiedSource: (row.verified_source as boolean | null | undefined) ?? null,
    lastVerifiedAt: (row.last_verified_at as string | null | undefined) ?? null,
    lifecycleStatus: (row.lifecycle_status as JobLifecycleStatus | null | undefined) ?? null,
    seenCount: (row.seen_count as number | null | undefined) ?? null,
    lastSearchRank: (row.last_search_rank as number | null | undefined) ?? null,
    firstSeenAt: (row.first_seen_at as string | null | undefined) ?? null,
    lastSeenAt: (row.last_seen_at as string | null | undefined) ?? null,
    savedAt: (row.saved_at as string | null | undefined) ?? null,
    dismissedAt: (row.dismissed_at as string | null | undefined) ?? null,
    lastAppliedAt: (row.last_applied_at as string | null | undefined) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  })));
}
