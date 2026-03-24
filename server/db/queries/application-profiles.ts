import type { ApplicantProfile } from '../../../src/shared/types.ts';
import { supabase } from '../client.ts';

export async function getStoredApplicationProfile(userId: string): Promise<ApplicantProfile | null> {
  const { data, error } = await supabase
    .from('application_profiles')
    .select('profile_json')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data?.profile_json as ApplicantProfile | null | undefined) ?? null;
}

export async function upsertStoredApplicationProfile(userId: string, profile: ApplicantProfile): Promise<ApplicantProfile> {
  const { data, error } = await supabase
    .from('application_profiles')
    .upsert(
      {
        user_id: userId,
        profile_json: profile,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('profile_json')
    .single();

  if (error) throw error;
  return (data?.profile_json as ApplicantProfile | null | undefined) ?? profile;
}
