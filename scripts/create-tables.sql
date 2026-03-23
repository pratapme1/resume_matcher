-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/unlquhrklamzguuvigvn/sql/new

-- ── users ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_uid       UUID UNIQUE NOT NULL,
  email              TEXT UNIQUE NOT NULL,
  display_name       TEXT,
  plan               TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ
);

-- ── uploaded_resumes ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uploaded_resumes (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename               TEXT NOT NULL,
  storage_path           TEXT NOT NULL,
  file_size_bytes        INT NOT NULL,
  parsed_json            JSONB,
  candidate_profile_json JSONB,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at             TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days')
);
CREATE INDEX IF NOT EXISTS uploaded_resumes_user_id_idx ON uploaded_resumes(user_id);

-- ── job_descriptions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_descriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type     TEXT NOT NULL,
  source_url      TEXT,
  raw_text        TEXT,
  normalized_json JSONB,
  company_name    TEXT,
  job_title       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_descriptions_user_id_idx ON job_descriptions(user_id);

-- ── tailor_sessions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tailor_sessions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resume_id              UUID REFERENCES uploaded_resumes(id) ON DELETE SET NULL,
  jd_id                  UUID REFERENCES job_descriptions(id) ON DELETE SET NULL,
  status                 TEXT NOT NULL DEFAULT 'pending',
  preferences_json       JSONB,
  tailored_doc_json      JSONB,
  validation_report_json JSONB,
  output_storage_path    TEXT,
  ai_model               TEXT,
  tokens_used            INT,
  error_message          TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS tailor_sessions_user_id_idx ON tailor_sessions(user_id, created_at DESC);

-- ── job_search_sessions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_search_sessions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resume_id              UUID REFERENCES uploaded_resumes(id) ON DELETE SET NULL,
  preferences_json       JSONB,
  candidate_profile_json JSONB,
  results_json           JSONB,
  total_results          INT DEFAULT 0,
  selected_result_id     TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_search_sessions_user_id_idx ON job_search_sessions(user_id, created_at DESC);

-- ── usage_events ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  tokens_used INT,
  model       TEXT,
  duration_ms INT,
  status      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_events_user_id_type_idx ON usage_events(user_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_user_id_date_idx ON usage_events(user_id, created_at DESC);

-- ── Row Level Security ────────────────────────────────────────────────────
ALTER TABLE uploaded_resumes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_descriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tailor_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_search_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events        ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically.
-- These policies are for future direct client access (if needed).
DO $$ BEGIN
  CREATE POLICY "own rows only" ON uploaded_resumes    FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "own rows only" ON job_descriptions    FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "own rows only" ON tailor_sessions     FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "own rows only" ON job_search_sessions FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "own rows only" ON usage_events        FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
