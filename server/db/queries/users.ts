import { supabase } from '../client.ts';

export async function upsertUser(supabaseUid: string, email: string): Promise<string> {
  const { data, error } = await supabase
    .from('users')
    .upsert(
      { supabase_uid: supabaseUid, email, updated_at: new Date().toISOString() },
      { onConflict: 'supabase_uid' },
    )
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}
