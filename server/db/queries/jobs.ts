import { supabase } from '../client.ts';
import type { JobSearchResult } from '../../../src/shared/types.ts';
import type { JobRecord } from './applications.ts';

export async function upsertJobFromSearch(userId: string, searchResult: JobSearchResult): Promise<string> {
  const { data, error } = await supabase
    .from('jobs')
    .upsert(
      {
        user_id: userId,
        title: searchResult.title ?? null,
        company: searchResult.company ?? null,
        location: searchResult.location ?? null,
        url: searchResult.url ?? null,
        description: searchResult.description ?? null,
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

export async function getJobsForUser(userId: string): Promise<JobRecord[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, user_id, title, company, location, url, description, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!data) return [];
  return data.map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    title: (row.title as string | null | undefined) ?? null,
    company: (row.company as string | null | undefined) ?? null,
    location: (row.location as string | null | undefined) ?? null,
    url: (row.url as string | null | undefined) ?? null,
    description: (row.description as string | null | undefined) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}
