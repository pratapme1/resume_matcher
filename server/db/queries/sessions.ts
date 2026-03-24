import { supabase } from '../client.ts';

export async function createTailorSession(opts: {
  userId: string;
  status?: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('tailor_sessions')
    .insert({ user_id: opts.userId, status: opts.status ?? 'processing' })
    .select('id')
    .single();
  if (error) throw error;
  if (!data?.id) throw new Error('tailor_sessions insert returned no id');
  return data.id as string;
}

export async function completeTailorSession(
  id: string,
  opts: {
    status: 'done' | 'failed' | 'blocked';
    tailoredDocJson?: unknown;
    validationReportJson?: unknown;
    aiModel?: string;
    tokensUsed?: number;
    errorMessage?: string;
  },
): Promise<void> {
  const { error } = await supabase.from('tailor_sessions').update({
    status: opts.status,
    tailored_doc_json: opts.tailoredDocJson ?? null,
    validation_report_json: opts.validationReportJson ?? null,
    ai_model: opts.aiModel ?? null,
    tokens_used: opts.tokensUsed ?? null,
    error_message: opts.errorMessage ?? null,
    completed_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

export async function createJobSearchSession(opts: {
  userId: string;
  preferencesJson?: unknown;
  candidateProfileJson?: unknown;
  resultsJson?: unknown;
  totalResults?: number;
}): Promise<string> {
  const { data, error } = await supabase
    .from('job_search_sessions')
    .insert({
      user_id: opts.userId,
      preferences_json: opts.preferencesJson ?? null,
      candidate_profile_json: opts.candidateProfileJson ?? null,
      results_json: opts.resultsJson ?? null,
      total_results: opts.totalResults ?? 0,
    })
    .select('id')
    .single();
  if (error) throw error;
  if (!data?.id) throw new Error('job_search_sessions insert returned no id');
  return data.id as string;
}
