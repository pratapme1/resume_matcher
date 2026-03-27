import type { AnswerBankEntry, ApplicantProfile } from '../../../src/shared/types.ts';
import { supabase } from '../client.ts';

type StoredApplicationMemoryPayload =
  | ApplicantProfile
  | {
      profile?: ApplicantProfile | null;
      answerBank?: AnswerBankEntry[] | null;
    };

function coerceStoredApplicationMemory(payload: StoredApplicationMemoryPayload | null | undefined) {
  if (!payload || Array.isArray(payload)) {
    return {
      profile: {},
      answerBank: [],
    };
  }

  if ('profile' in payload || 'answerBank' in payload) {
    return {
      profile: (payload.profile as ApplicantProfile | null | undefined) ?? {},
      answerBank: (payload.answerBank as AnswerBankEntry[] | null | undefined) ?? [],
    };
  }

  return {
    profile: payload as ApplicantProfile,
    answerBank: [],
  };
}

export async function getStoredApplicationMemory(userId: string): Promise<{ profile: ApplicantProfile; answerBank: AnswerBankEntry[] }> {
  const { data, error } = await supabase
    .from('application_profiles')
    .select('profile_json')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return coerceStoredApplicationMemory(data?.profile_json as StoredApplicationMemoryPayload | null | undefined);
}

export async function upsertStoredApplicationMemory(
  userId: string,
  input: { profile: ApplicantProfile; answerBank: AnswerBankEntry[] },
): Promise<{ profile: ApplicantProfile; answerBank: AnswerBankEntry[] }> {
  const { data, error } = await supabase
    .from('application_profiles')
    .upsert(
      {
        user_id: userId,
        profile_json: input,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('profile_json')
    .single();

  if (error) throw error;
  return coerceStoredApplicationMemory(data?.profile_json as StoredApplicationMemoryPayload | null | undefined);
}
