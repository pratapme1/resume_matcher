import { supabase } from '../client.ts';

export type ApplicationStatus =
  | 'pending'
  | 'applied'
  | 'rejected'
  | 'review'
  | 'interview'
  | 'offered'
  | 'in_progress'
  | 'failed';

export interface JobRecord {
  id: string;
  userId: string;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  url?: string | null;
  description?: string | null;
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
    description?: string;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from('jobs')
    .upsert(
      {
        user_id: userId,
        title: jobData.title ?? null,
        company: jobData.company ?? null,
        location: jobData.location ?? null,
        url: jobData.url ?? null,
        description: jobData.description ?? null,
        updated_at: new Date().toISOString(),
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
): Promise<string> {
  const { data, error } = await supabase
    .from('applications')
    .insert({
      user_id: userId,
      job_id: jobId,
      session_id: sessionId ?? null,
      apply_url: applyUrl ?? null,
      status: 'pending' as ApplicationStatus,
    })
    .select('id')
    .single();
  if (error) throw error;
  if (!data?.id) throw new Error('applications insert returned no id');
  return data.id as string;
}

export async function updateApplicationStatus(
  applicationId: string,
  status: ApplicationStatus,
  notes?: string,
  errorMessage?: string,
): Promise<void> {
  const { error } = await supabase
    .from('applications')
    .update({
      status,
      notes: notes ?? null,
      error_message: errorMessage ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicationId);
  if (error) throw error;
}

export async function getApplicationsForUser(userId: string): Promise<ApplicationRecord[]> {
  const { data, error } = await supabase
    .from('applications')
    .select('id, user_id, job_id, session_id, apply_url, status, notes, error_message, created_at, updated_at, jobs(id, user_id, title, company, location, url, description, created_at, updated_at)')
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
            description: (jobRow.description as string | null | undefined) ?? null,
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
    .select('id, user_id, job_id, session_id, apply_url, status, notes, error_message, created_at, updated_at, jobs(id, user_id, title, company, location, url, description, created_at, updated_at)')
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
          description: (jobRow.description as string | null | undefined) ?? null,
          createdAt: jobRow.created_at as string,
          updatedAt: jobRow.updated_at as string,
        }
      : null,
  };
}
