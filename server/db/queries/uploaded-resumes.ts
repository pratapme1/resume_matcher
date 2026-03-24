import { createHash } from 'node:crypto';
import type {
  CandidateProfile,
  ExtractionWarning,
  ResumeTemplateProfile,
  SourceResumeDocument,
  StoredResumeSummary,
} from '../../../src/shared/types.ts';
import { supabase } from '../client.ts';

type StoredResumePayload = {
  resume: SourceResumeDocument;
  templateProfile: ResumeTemplateProfile;
  parseWarnings: ExtractionWarning[];
};

export interface StoredResumeRecord {
  id: string;
  filename: string;
  storagePath: string;
  fileSizeBytes: number;
  fileHash?: string;
  updatedAt: string;
  candidateProfile?: CandidateProfile;
  parsed: StoredResumePayload;
}

const DEFAULT_RESUME_BUCKET = process.env.SUPABASE_RESUME_BUCKET?.trim() || 'default-resumes';

const memoryDefaultResumes = new Map<string, StoredResumeRecord>();

function parseStoredPayload(value: unknown): StoredResumePayload | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as Partial<StoredResumePayload>;
  if (!parsed.resume || !parsed.templateProfile) return null;
  return {
    resume: parsed.resume as SourceResumeDocument,
    templateProfile: parsed.templateProfile as ResumeTemplateProfile,
    parseWarnings: Array.isArray(parsed.parseWarnings) ? (parsed.parseWarnings as ExtractionWarning[]) : [],
  };
}

function toSummary(record: StoredResumeRecord): StoredResumeSummary {
  return {
    id: record.id,
    filename: record.filename,
    updatedAt: record.updatedAt,
    fileHash: record.fileHash,
    hasTemplateProfile: Boolean(record.parsed.templateProfile),
    parseWarnings: record.parsed.parseWarnings,
    candidateProfile: record.candidateProfile,
  };
}

function rowToRecord(row: Record<string, unknown>): StoredResumeRecord | null {
  const parsed = parseStoredPayload(row.parsed_json);
  if (!parsed) return null;
  return {
    id: String(row.id ?? ''),
    filename: String(row.filename ?? ''),
    storagePath: String(row.storage_path ?? ''),
    fileSizeBytes: Number(row.file_size_bytes ?? 0),
    fileHash: typeof row.file_hash === 'string' ? row.file_hash : undefined,
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
    candidateProfile: (row.candidate_profile_json as CandidateProfile | null | undefined) ?? undefined,
    parsed,
  };
}

export function hashResumeBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function getMemoryDefaultResume(userId: string): StoredResumeRecord | null {
  return memoryDefaultResumes.get(userId) ?? null;
}

export function setMemoryDefaultResume(
  userId: string,
  params: {
    filename: string;
    fileSizeBytes: number;
    fileHash?: string;
    candidateProfile?: CandidateProfile;
    parsed: StoredResumePayload;
  },
): StoredResumeRecord {
  const existing = memoryDefaultResumes.get(userId);
  const record: StoredResumeRecord = {
    id: existing?.id ?? `mem-resume-${userId}`,
    filename: params.filename,
    storagePath: `memory://${userId}/${params.filename}`,
    fileSizeBytes: params.fileSizeBytes,
    fileHash: params.fileHash,
    updatedAt: new Date().toISOString(),
    candidateProfile: params.candidateProfile,
    parsed: params.parsed,
  };
  memoryDefaultResumes.set(userId, record);
  return record;
}

async function ensureResumeBucket(): Promise<void> {
  const { data, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (data?.some((bucket) => bucket.name === DEFAULT_RESUME_BUCKET)) {
    return;
  }
  const { error: createError } = await supabase.storage.createBucket(DEFAULT_RESUME_BUCKET, {
    public: false,
    fileSizeLimit: '10MB',
  });
  if (createError && !/already exists/i.test(createError.message)) {
    throw createError;
  }
}

export async function getStoredDefaultResume(userId: string): Promise<StoredResumeRecord | null> {
  const { data, error } = await supabase
    .from('uploaded_resumes')
    .select('id, filename, storage_path, file_size_bytes, file_hash, parsed_json, candidate_profile_json, created_at, updated_at')
    .eq('user_id', userId)
    .eq('is_default', true)
    .order('updated_at', { ascending: false })
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return rowToRecord(data as Record<string, unknown>);
}

export async function getStoredResumeById(userId: string, resumeId: string): Promise<StoredResumeRecord | null> {
  const { data, error } = await supabase
    .from('uploaded_resumes')
    .select('id, filename, storage_path, file_size_bytes, file_hash, parsed_json, candidate_profile_json, created_at, updated_at')
    .eq('user_id', userId)
    .eq('id', resumeId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return rowToRecord(data as Record<string, unknown>);
}

export async function upsertDefaultResume(params: {
  userId: string;
  filename: string;
  fileSizeBytes: number;
  buffer: Buffer;
  candidateProfile?: CandidateProfile;
  parsed: StoredResumePayload;
}): Promise<StoredResumeRecord> {
  const fileHash = hashResumeBuffer(params.buffer);
  await ensureResumeBucket();

  const { data: existingRows, error: existingError } = await supabase
    .from('uploaded_resumes')
    .select('id')
    .eq('user_id', params.userId)
    .eq('file_hash', fileHash)
    .limit(1);
  if (existingError) throw existingError;

  const existingId = existingRows?.[0]?.id as string | undefined;
  const storagePath = `${params.userId}/${fileHash}/${Date.now()}-${params.filename}`;

  const { error: uploadError } = await supabase.storage
    .from(DEFAULT_RESUME_BUCKET)
    .upload(storagePath, params.buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const payload = {
    filename: params.filename,
    storage_path: storagePath,
    file_size_bytes: params.fileSizeBytes,
    file_hash: fileHash,
    parsed_json: params.parsed,
    candidate_profile_json: params.candidateProfile ?? null,
    is_default: true,
    expires_at: null,
    updated_at: new Date().toISOString(),
  };

  const { error: clearError } = await supabase
    .from('uploaded_resumes')
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq('user_id', params.userId)
    .eq('is_default', true);
  if (clearError) throw clearError;

  const query = existingId
    ? supabase.from('uploaded_resumes').update(payload).eq('id', existingId)
    : supabase.from('uploaded_resumes').insert({ user_id: params.userId, ...payload });

  const { data, error } = await query
    .select('id, filename, storage_path, file_size_bytes, file_hash, parsed_json, candidate_profile_json, created_at, updated_at')
    .single();
  if (error) throw error;

  const record = rowToRecord(data as Record<string, unknown>);
  if (!record) {
    throw new Error('Failed to decode stored default resume.');
  }
  return record;
}

export function toStoredResumeSummary(record: StoredResumeRecord | null): StoredResumeSummary | null {
  return record ? toSummary(record) : null;
}
