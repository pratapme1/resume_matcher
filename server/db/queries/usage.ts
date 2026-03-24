import { supabase } from '../client.ts';

export type UsageEventType = 'tailor' | 'search' | 'extract_url' | 'extract_file' | 'docx_generate' | 'build_profile';

function parseBooleanEnv(name: string): boolean {
  return /^(1|true|yes|on)$/i.test(process.env[name] ?? '');
}

function parseCsvEnv(name: string): Set<string> {
  return new Set(
    (process.env[name] ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function parseQuotaLimitEnv(name: string, fallback: number): number | null {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw.trim() === '') return fallback;

  const normalized = raw.trim().toLowerCase();
  if (['off', 'false', 'disabled', 'unlimited', 'none'].includes(normalized)) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return null;
  return parsed;
}

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

export function isQuotaBypassed(userId?: string, userEmail?: string): boolean {
  if (parseBooleanEnv('DISABLE_USAGE_QUOTAS')) return true;

  const bypassUserIds = parseCsvEnv('QUOTA_BYPASS_USER_IDS');
  const bypassEmails = parseCsvEnv('QUOTA_BYPASS_EMAILS');
  const normalizedUserId = userId?.trim().toLowerCase();
  const normalizedEmail = userEmail?.trim().toLowerCase();

  if (normalizedUserId && bypassUserIds.has(normalizedUserId)) return true;
  if (normalizedEmail && bypassEmails.has(normalizedEmail)) return true;
  return false;
}

export function getQuotaLimit(eventType: UsageEventType): number | null {
  switch (eventType) {
    case 'tailor':
      return parseQuotaLimitEnv('FREE_TAILOR_LIMIT', FREE_TIER_LIMITS.tailor);
    case 'search':
      return parseQuotaLimitEnv('FREE_SEARCH_LIMIT', FREE_TIER_LIMITS.search);
    case 'extract_url':
      return parseQuotaLimitEnv('FREE_EXTRACT_URL_LIMIT', FREE_TIER_LIMITS.extract_url);
    case 'extract_file':
      return parseQuotaLimitEnv('FREE_EXTRACT_FILE_LIMIT', FREE_TIER_LIMITS.extract_file);
    case 'docx_generate':
      return parseQuotaLimitEnv('FREE_DOCX_GENERATE_LIMIT', FREE_TIER_LIMITS.docx_generate);
    case 'build_profile':
      return parseQuotaLimitEnv('FREE_BUILD_PROFILE_LIMIT', FREE_TIER_LIMITS.build_profile);
    default:
      return null;
  }
}

export async function isOverQuota(userId: string, eventType: UsageEventType, userEmail?: string): Promise<boolean> {
  if (isQuotaBypassed(userId, userEmail)) return false;

  const limit = getQuotaLimit(eventType);
  if (limit === null) return false;
  if (limit <= 0) return true;
  const count = await getMonthlyUsageCount(userId, eventType);
  return count >= limit;
}
