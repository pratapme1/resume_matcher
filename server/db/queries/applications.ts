import type {
  ApplyAutomationMetrics,
  ApplyReliabilitySnapshot,
  ApplySessionTraceEntry,
  ExecutorMode,
  JobLifecycleStatus,
  PauseReason,
  PortalType,
  StepKind,
} from '../../../src/shared/types.ts';
import { supabase } from '../client.ts';

export type ApplicationStatus =
  | 'queued'
  | 'pending'
  | 'applied'
  | 'rejected'
  | 'review'
  | 'interview'
  | 'offered'
  | 'in_progress'
  | 'manual_required'
  | 'failed';

export interface JobRecord {
  id: string;
  userId: string;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  url?: string | null;
  applyUrl?: string | null;
  description?: string | null;
  sourceHost?: string | null;
  sourceType?: string | null;
  verifiedSource?: boolean | null;
  lastVerifiedAt?: string | null;
  lifecycleStatus?: JobLifecycleStatus | null;
  seenCount?: number | null;
  lastSearchRank?: number | null;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  savedAt?: string | null;
  dismissedAt?: string | null;
  lastAppliedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationRecord {
  id: string;
  userId: string;
  jobId: string;
  sessionId?: string | null;
  applyUrl?: string | null;
  status: ApplicationStatus;
  notes?: string | null;
  errorMessage?: string | null;
  lastPauseReason?: PauseReason | null;
  lastMessage?: string | null;
  lastStepKind?: StepKind | null;
  portalType?: PortalType | null;
  executorMode?: ExecutorMode | null;
  traceCount?: number | null;
  lastTraceAt?: string | null;
  retryCount?: number | null;
  replayOfApplicationId?: string | null;
  supersededByApplicationId?: string | null;
  createdAt: string;
  updatedAt: string;
  job?: JobRecord | null;
}

export async function upsertJob(
  userId: string,
  jobData: {
    title?: string;
    company?: string;
    location?: string;
    url?: string;
    applyUrl?: string;
    description?: string;
    sourceHost?: string;
    sourceType?: string;
    verifiedSource?: boolean;
    lastVerifiedAt?: string;
    lifecycleStatus?: JobLifecycleStatus;
    lastSeenAt?: string;
    lastAppliedAt?: string;
  },
): Promise<string> {
  const existing = jobData.url
    ? await supabase
        .from('jobs')
        .select('id, title, company, location, url, apply_url, description, source_host, source_type, verified_source, last_verified_at, lifecycle_status, seen_count, last_search_rank, first_seen_at, last_seen_at, saved_at, dismissed_at, last_applied_at')
        .eq('user_id', userId)
        .eq('url', jobData.url)
        .maybeSingle()
    : { data: null, error: null };
  if (existing.error) throw existing.error;

  const now = new Date().toISOString();
  const lifecycleStatus = jobData.lifecycleStatus
    ?? (existing.data?.lifecycle_status as JobLifecycleStatus | null | undefined)
    ?? 'discovered';

  const { data, error } = await supabase
    .from('jobs')
    .upsert(
      {
        user_id: userId,
        title: jobData.title ?? existing.data?.title ?? null,
        company: jobData.company ?? existing.data?.company ?? null,
        location: jobData.location ?? existing.data?.location ?? null,
        url: jobData.url ?? null,
        apply_url: jobData.applyUrl ?? existing.data?.apply_url ?? null,
        description: jobData.description ?? existing.data?.description ?? null,
        source_host: jobData.sourceHost ?? existing.data?.source_host ?? null,
        source_type: jobData.sourceType ?? existing.data?.source_type ?? null,
        verified_source: jobData.verifiedSource ?? existing.data?.verified_source ?? null,
        last_verified_at: jobData.lastVerifiedAt ?? existing.data?.last_verified_at ?? null,
        lifecycle_status: lifecycleStatus,
        seen_count: (existing.data?.seen_count as number | null | undefined) ?? 0,
        last_search_rank: (existing.data?.last_search_rank as number | null | undefined) ?? null,
        first_seen_at: existing.data?.first_seen_at ?? now,
        last_seen_at: jobData.lastSeenAt ?? existing.data?.last_seen_at ?? null,
        saved_at: existing.data?.saved_at ?? null,
        dismissed_at: lifecycleStatus === 'dismissed' ? now : existing.data?.dismissed_at ?? null,
        last_applied_at: jobData.lastAppliedAt ?? existing.data?.last_applied_at ?? null,
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

export async function createApplication(
  userId: string,
  jobId: string,
  sessionId?: string,
  applyUrl?: string,
  status: ApplicationStatus = 'queued',
  opts?: {
    retryCount?: number;
    replayOfApplicationId?: string | null;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from('applications')
    .insert({
      user_id: userId,
      job_id: jobId,
      session_id: sessionId ?? null,
      apply_url: applyUrl ?? null,
      status,
      retry_count: opts?.retryCount ?? 0,
      replay_of_application_id: opts?.replayOfApplicationId ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  if (!data?.id) throw new Error('applications insert returned no id');
  return data.id as string;
}

export async function updateApplicationRunDetails(
  applicationId: string,
  details: {
    trace: ApplySessionTraceEntry[];
    lastStepKind?: StepKind;
    portalType?: PortalType;
    executorMode?: ExecutorMode;
  },
  userId?: string,
): Promise<boolean> {
  let query = supabase
    .from('applications')
    .update({
      trace_json: details.trace,
      trace_count: details.trace.length,
      last_trace_at: details.trace.at(-1)?.at ?? null,
      last_step_kind: details.lastStepKind ?? null,
      portal_type: details.portalType ?? null,
      executor_mode: details.executorMode ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicationId);
  if (userId) {
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

export async function updateApplicationStatus(
  applicationId: string,
  status: ApplicationStatus,
  notes?: string,
  errorMessage?: string,
  userId?: string,
  lastPauseReason?: string,
  lastMessage?: string,
): Promise<boolean> {
  let query = supabase
    .from('applications')
    .update({
      status,
      notes: notes ?? null,
      error_message: errorMessage ?? null,
      last_pause_reason: lastPauseReason ?? null,
      last_message: lastMessage ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicationId);
  if (userId) {
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

export async function linkApplicationReplay(
  previousApplicationId: string,
  nextApplicationId: string,
  userId?: string,
): Promise<boolean> {
  let query = supabase
    .from('applications')
    .update({
      superseded_by_application_id: nextApplicationId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', previousApplicationId);
  if (userId) {
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

export async function findLatestApplicationForReplay(
  userId: string,
  opts: {
    applyUrl?: string;
    jobId?: string;
  },
): Promise<ApplicationRecord | null> {
  let query = supabase
    .from('applications')
    .select('id, user_id, job_id, session_id, apply_url, status, notes, error_message, last_pause_reason, last_message, last_step_kind, portal_type, executor_mode, trace_count, last_trace_at, retry_count, replay_of_application_id, superseded_by_application_id, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (opts.applyUrl) {
    query = query.eq('apply_url', opts.applyUrl);
  } else if (opts.jobId) {
    query = query.eq('job_id', opts.jobId);
  } else {
    return null;
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data?.id) return null;
  return {
    id: data.id as string,
    userId: data.user_id as string,
    jobId: data.job_id as string,
    sessionId: (data.session_id as string | null | undefined) ?? null,
    applyUrl: (data.apply_url as string | null | undefined) ?? null,
    status: data.status as ApplicationStatus,
    notes: (data.notes as string | null | undefined) ?? null,
    errorMessage: (data.error_message as string | null | undefined) ?? null,
    lastPauseReason: (data.last_pause_reason as PauseReason | null | undefined) ?? null,
    lastMessage: (data.last_message as string | null | undefined) ?? null,
    lastStepKind: (data.last_step_kind as StepKind | null | undefined) ?? null,
    portalType: (data.portal_type as PortalType | null | undefined) ?? null,
    executorMode: (data.executor_mode as ExecutorMode | null | undefined) ?? null,
    traceCount: (data.trace_count as number | null | undefined) ?? null,
    lastTraceAt: (data.last_trace_at as string | null | undefined) ?? null,
    retryCount: (data.retry_count as number | null | undefined) ?? null,
    replayOfApplicationId: (data.replay_of_application_id as string | null | undefined) ?? null,
    supersededByApplicationId: (data.superseded_by_application_id as string | null | undefined) ?? null,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
    job: null,
  };
}

export async function getRelatedApplicationsForUser(
  applicationId: string,
  userId: string,
): Promise<ApplicationRecord[]> {
  const seed = await supabase
    .from('applications')
    .select('id, replay_of_application_id, superseded_by_application_id')
    .eq('id', applicationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (seed.error) throw seed.error;
  if (!seed.data?.id) return [];

  const rootIds = new Set<string>([
    seed.data.id as string,
    (seed.data.replay_of_application_id as string | null | undefined) ?? '',
    (seed.data.superseded_by_application_id as string | null | undefined) ?? '',
  ].filter(Boolean));

  const { data, error } = await supabase
    .from('applications')
    .select('id, user_id, job_id, session_id, apply_url, status, notes, error_message, last_pause_reason, last_message, last_step_kind, portal_type, executor_mode, trace_count, last_trace_at, retry_count, replay_of_application_id, superseded_by_application_id, created_at, updated_at')
    .eq('user_id', userId)
    .or(Array.from(rootIds).map((id) => `id.eq.${id},replay_of_application_id.eq.${id},superseded_by_application_id.eq.${id}`).join(','))
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    jobId: row.job_id as string,
    sessionId: (row.session_id as string | null | undefined) ?? null,
    applyUrl: (row.apply_url as string | null | undefined) ?? null,
    status: row.status as ApplicationStatus,
    notes: (row.notes as string | null | undefined) ?? null,
    errorMessage: (row.error_message as string | null | undefined) ?? null,
    lastPauseReason: (row.last_pause_reason as PauseReason | null | undefined) ?? null,
    lastMessage: (row.last_message as string | null | undefined) ?? null,
    lastStepKind: (row.last_step_kind as StepKind | null | undefined) ?? null,
    portalType: (row.portal_type as PortalType | null | undefined) ?? null,
    executorMode: (row.executor_mode as ExecutorMode | null | undefined) ?? null,
    traceCount: (row.trace_count as number | null | undefined) ?? null,
    lastTraceAt: (row.last_trace_at as string | null | undefined) ?? null,
    retryCount: (row.retry_count as number | null | undefined) ?? null,
    replayOfApplicationId: (row.replay_of_application_id as string | null | undefined) ?? null,
    supersededByApplicationId: (row.superseded_by_application_id as string | null | undefined) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    job: null,
  }));
}

export async function getApplicationsForUser(userId: string): Promise<ApplicationRecord[]> {
  const { data, error } = await supabase
    .from('applications')
    .select('id, user_id, job_id, session_id, apply_url, status, notes, error_message, last_pause_reason, last_message, last_step_kind, portal_type, executor_mode, trace_count, last_trace_at, retry_count, replay_of_application_id, superseded_by_application_id, created_at, updated_at, jobs(id, user_id, title, company, location, url, apply_url, description, source_host, source_type, verified_source, last_verified_at, lifecycle_status, seen_count, last_search_rank, first_seen_at, last_seen_at, saved_at, dismissed_at, last_applied_at, created_at, updated_at)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!data) return [];
  return data.map((row) => {
    const jobRow = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs;
    return {
      id: row.id as string,
      userId: row.user_id as string,
      jobId: row.job_id as string,
      sessionId: (row.session_id as string | null | undefined) ?? null,
      applyUrl: (row.apply_url as string | null | undefined) ?? null,
      status: row.status as ApplicationStatus,
      notes: (row.notes as string | null | undefined) ?? null,
      errorMessage: (row.error_message as string | null | undefined) ?? null,
      lastPauseReason: (row.last_pause_reason as PauseReason | null | undefined) ?? null,
      lastMessage: (row.last_message as string | null | undefined) ?? null,
      lastStepKind: (row.last_step_kind as StepKind | null | undefined) ?? null,
      portalType: (row.portal_type as PortalType | null | undefined) ?? null,
      executorMode: (row.executor_mode as ExecutorMode | null | undefined) ?? null,
      traceCount: (row.trace_count as number | null | undefined) ?? null,
      lastTraceAt: (row.last_trace_at as string | null | undefined) ?? null,
      retryCount: (row.retry_count as number | null | undefined) ?? null,
      replayOfApplicationId: (row.replay_of_application_id as string | null | undefined) ?? null,
      supersededByApplicationId: (row.superseded_by_application_id as string | null | undefined) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      job: jobRow
        ? {
            id: jobRow.id as string,
            userId: jobRow.user_id as string,
            title: (jobRow.title as string | null | undefined) ?? null,
            company: (jobRow.company as string | null | undefined) ?? null,
            location: (jobRow.location as string | null | undefined) ?? null,
            url: (jobRow.url as string | null | undefined) ?? null,
            applyUrl: (jobRow.apply_url as string | null | undefined) ?? null,
            description: (jobRow.description as string | null | undefined) ?? null,
            sourceHost: (jobRow.source_host as string | null | undefined) ?? null,
            sourceType: (jobRow.source_type as string | null | undefined) ?? null,
            verifiedSource: (jobRow.verified_source as boolean | null | undefined) ?? null,
            lastVerifiedAt: (jobRow.last_verified_at as string | null | undefined) ?? null,
            lifecycleStatus: (jobRow.lifecycle_status as JobLifecycleStatus | null | undefined) ?? null,
            seenCount: (jobRow.seen_count as number | null | undefined) ?? null,
            lastSearchRank: (jobRow.last_search_rank as number | null | undefined) ?? null,
            firstSeenAt: (jobRow.first_seen_at as string | null | undefined) ?? null,
            lastSeenAt: (jobRow.last_seen_at as string | null | undefined) ?? null,
            savedAt: (jobRow.saved_at as string | null | undefined) ?? null,
            dismissedAt: (jobRow.dismissed_at as string | null | undefined) ?? null,
            lastAppliedAt: (jobRow.last_applied_at as string | null | undefined) ?? null,
            createdAt: jobRow.created_at as string,
            updatedAt: jobRow.updated_at as string,
          }
        : null,
    };
  });
}

export async function getApplicationBySessionId(sessionId: string): Promise<ApplicationRecord | null> {
  const { data, error } = await supabase
    .from('applications')
    .select('id, user_id, job_id, session_id, apply_url, status, notes, error_message, last_pause_reason, last_message, last_step_kind, portal_type, executor_mode, trace_count, last_trace_at, trace_json, retry_count, replay_of_application_id, superseded_by_application_id, created_at, updated_at, jobs(id, user_id, title, company, location, url, apply_url, description, source_host, source_type, verified_source, last_verified_at, lifecycle_status, seen_count, last_search_rank, first_seen_at, last_seen_at, saved_at, dismissed_at, last_applied_at, created_at, updated_at)')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) return null;
  const jobRow = Array.isArray(data.jobs) ? data.jobs[0] : data.jobs;
  return {
    id: data.id as string,
    userId: data.user_id as string,
    jobId: data.job_id as string,
    sessionId: (data.session_id as string | null | undefined) ?? null,
    applyUrl: (data.apply_url as string | null | undefined) ?? null,
    status: data.status as ApplicationStatus,
    notes: (data.notes as string | null | undefined) ?? null,
    errorMessage: (data.error_message as string | null | undefined) ?? null,
    lastPauseReason: (data.last_pause_reason as PauseReason | null | undefined) ?? null,
    lastMessage: (data.last_message as string | null | undefined) ?? null,
    lastStepKind: (data.last_step_kind as StepKind | null | undefined) ?? null,
    portalType: (data.portal_type as PortalType | null | undefined) ?? null,
    executorMode: (data.executor_mode as ExecutorMode | null | undefined) ?? null,
    traceCount: (data.trace_count as number | null | undefined) ?? null,
    lastTraceAt: (data.last_trace_at as string | null | undefined) ?? null,
    retryCount: (data.retry_count as number | null | undefined) ?? null,
    replayOfApplicationId: (data.replay_of_application_id as string | null | undefined) ?? null,
    supersededByApplicationId: (data.superseded_by_application_id as string | null | undefined) ?? null,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
    job: jobRow
      ? {
          id: jobRow.id as string,
          userId: jobRow.user_id as string,
          title: (jobRow.title as string | null | undefined) ?? null,
        company: (jobRow.company as string | null | undefined) ?? null,
        location: (jobRow.location as string | null | undefined) ?? null,
        url: (jobRow.url as string | null | undefined) ?? null,
        applyUrl: (jobRow.apply_url as string | null | undefined) ?? null,
        description: (jobRow.description as string | null | undefined) ?? null,
        sourceHost: (jobRow.source_host as string | null | undefined) ?? null,
        sourceType: (jobRow.source_type as string | null | undefined) ?? null,
        verifiedSource: (jobRow.verified_source as boolean | null | undefined) ?? null,
        lastVerifiedAt: (jobRow.last_verified_at as string | null | undefined) ?? null,
        lifecycleStatus: (jobRow.lifecycle_status as JobLifecycleStatus | null | undefined) ?? null,
        seenCount: (jobRow.seen_count as number | null | undefined) ?? null,
        lastSearchRank: (jobRow.last_search_rank as number | null | undefined) ?? null,
        firstSeenAt: (jobRow.first_seen_at as string | null | undefined) ?? null,
        lastSeenAt: (jobRow.last_seen_at as string | null | undefined) ?? null,
        savedAt: (jobRow.saved_at as string | null | undefined) ?? null,
        dismissedAt: (jobRow.dismissed_at as string | null | undefined) ?? null,
        lastAppliedAt: (jobRow.last_applied_at as string | null | undefined) ?? null,
        createdAt: jobRow.created_at as string,
        updatedAt: jobRow.updated_at as string,
      }
      : null,
  };
}

export async function getApplicationTraceForUser(
  applicationId: string,
  userId: string,
): Promise<ApplySessionTraceEntry[]> {
  const { data, error } = await supabase
    .from('applications')
    .select('trace_json')
    .eq('id', applicationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.trace_json) ? (data.trace_json as ApplySessionTraceEntry[]) : [];
}

export async function getApplicationMetricsForUser(
  userId: string,
): Promise<ApplyAutomationMetrics> {
  const { data, error } = await supabase
    .from('applications')
    .select('status, portal_type, last_pause_reason, executor_mode')
    .eq('user_id', userId);
  if (error) throw error;

  const metrics: ApplyAutomationMetrics = {
    totalSessions: (data ?? []).length,
    byStatus: {},
    byPortalType: {},
    byPauseReason: {},
    byExecutorMode: {},
  };

  for (const row of data ?? []) {
    const status = String(row.status ?? 'unknown');
    const portalType = String(row.portal_type ?? 'unknown');
    const pauseReason = String(row.last_pause_reason ?? 'none');
    const executorMode = String(row.executor_mode ?? 'unknown');
    metrics.byStatus[status] = (metrics.byStatus[status] ?? 0) + 1;
    metrics.byPortalType[portalType] = (metrics.byPortalType[portalType] ?? 0) + 1;
    metrics.byPauseReason[pauseReason] = (metrics.byPauseReason[pauseReason] ?? 0) + 1;
    metrics.byExecutorMode[executorMode] = (metrics.byExecutorMode[executorMode] ?? 0) + 1;
  }

  return metrics;
}

export async function getApplicationReliabilitySnapshotForUser(
  userId: string,
): Promise<ApplyReliabilitySnapshot> {
  const { data, error } = await supabase
    .from('applications')
    .select('id, status, portal_type, last_pause_reason, executor_mode, last_message, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) throw error;

  const metrics: ApplyAutomationMetrics = {
    totalSessions: (data ?? []).length,
    byStatus: {},
    byPortalType: {},
    byPauseReason: {},
    byExecutorMode: {},
  };

  for (const row of data ?? []) {
    const status = String(row.status ?? 'unknown');
    const portalType = String(row.portal_type ?? 'unknown');
    const pauseReason = String(row.last_pause_reason ?? 'none');
    const executorMode = String(row.executor_mode ?? 'unknown');
    metrics.byStatus[status] = (metrics.byStatus[status] ?? 0) + 1;
    metrics.byPortalType[portalType] = (metrics.byPortalType[portalType] ?? 0) + 1;
    metrics.byPauseReason[pauseReason] = (metrics.byPauseReason[pauseReason] ?? 0) + 1;
    metrics.byExecutorMode[executorMode] = (metrics.byExecutorMode[executorMode] ?? 0) + 1;
  }

  const recentIssues = (data ?? [])
    .filter((row) => ['manual_required', 'failed', 'review'].includes(String(row.status ?? '')))
    .slice(0, 20)
    .map((row) => ({
      applicationId: row.id as string,
      status: row.status as string,
      portalType: (row.portal_type as PortalType | null | undefined) ?? null,
      pauseReason: (row.last_pause_reason as PauseReason | null | undefined) ?? null,
      executorMode: (row.executor_mode as ExecutorMode | null | undefined) ?? null,
      lastMessage: (row.last_message as string | null | undefined) ?? null,
      updatedAt: row.updated_at as string,
    }));

  return {
    metrics,
    recentIssues,
  };
}
