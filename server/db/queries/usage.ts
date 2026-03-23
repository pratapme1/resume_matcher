import { supabase } from '../client.ts';

export type UsageEventType = 'tailor' | 'search' | 'extract_url' | 'extract_file' | 'docx_generate' | 'build_profile';

export async function writeUsageEvent(opts: {
  userId: string;
  eventType: UsageEventType;
  status: 'success' | 'error' | 'blocked' | 'quota_exceeded';
  tokensUsed?: number;
  model?: string;
  durationMs?: number;
}): Promise<void> {
  await supabase.from('usage_events').insert({
    user_id: opts.userId,
    event_type: opts.eventType,
    status: opts.status,
    tokens_used: opts.tokensUsed ?? null,
    model: opts.model ?? null,
    duration_ms: opts.durationMs ?? null,
  });
}

// Returns count of a given event type in the current calendar month for a user
export async function getMonthlyUsageCount(userId: string, eventType: UsageEventType): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('usage_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('event_type', eventType)
    .in('status', ['success', 'blocked'])
    .gte('created_at', startOfMonth.toISOString());

  if (error) return 0;
  return count ?? 0;
}

// Free tier limits
export const FREE_TIER_LIMITS: Record<UsageEventType, number> = {
  tailor: 5,
  search: 3,
  extract_url: 100,
  extract_file: 100,
  docx_generate: 100,
  build_profile: 100,
};

export async function isOverQuota(userId: string, eventType: UsageEventType): Promise<boolean> {
  const limit = FREE_TIER_LIMITS[eventType];
  if (!limit || limit >= 100) return false; // unlimited for simple ops
  const count = await getMonthlyUsageCount(userId, eventType);
  return count >= limit;
}
