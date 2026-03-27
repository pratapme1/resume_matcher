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
  file_hash              TEXT,
  is_default             BOOLEAN NOT NULL DEFAULT false,
  parsed_json            JSONB,
  candidate_profile_json JSONB,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at             TIMESTAMPTZ DEFAULT (now() + interval '90 days')
);
ALTER TABLE uploaded_resumes ADD COLUMN IF NOT EXISTS file_hash TEXT;
ALTER TABLE uploaded_resumes ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE uploaded_resumes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE uploaded_resumes ALTER COLUMN expires_at DROP NOT NULL;
CREATE INDEX IF NOT EXISTS uploaded_resumes_user_id_idx ON uploaded_resumes(user_id);
CREATE INDEX IF NOT EXISTS uploaded_resumes_user_id_hash_idx ON uploaded_resumes(user_id, file_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uploaded_resumes_one_default_per_user_idx
  ON uploaded_resumes(user_id)
  WHERE is_default = true;

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

-- ── application_profiles ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS application_profiles (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── jobs ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title            TEXT,
  company          TEXT,
  location         TEXT,
  url              TEXT,
  apply_url        TEXT,
  description      TEXT,
  source_host      TEXT,
  source_type      TEXT,
  verified_source  BOOLEAN,
  last_verified_at TIMESTAMPTZ,
  lifecycle_status TEXT NOT NULL DEFAULT 'discovered',
  seen_count       INT NOT NULL DEFAULT 0,
  last_search_rank INT,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at     TIMESTAMPTZ,
  saved_at         TIMESTAMPTZ,
  dismissed_at     TIMESTAMPTZ,
  last_applied_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS apply_url TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_host TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS verified_source BOOLEAN;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'discovered';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS seen_count INT NOT NULL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_search_rank INT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS saved_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_applied_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS jobs_user_id_idx ON jobs(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_user_id_url_idx ON jobs(user_id, url);

-- ── applications ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS applications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id            UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  session_id        TEXT,
  apply_url         TEXT,
  status            TEXT NOT NULL DEFAULT 'queued',
  notes             TEXT,
  error_message     TEXT,
  last_pause_reason TEXT,
  last_message      TEXT,
  last_step_kind    TEXT,
  portal_type       TEXT,
  executor_mode     TEXT,
  trace_json        JSONB,
  trace_count       INT NOT NULL DEFAULT 0,
  last_trace_at     TIMESTAMPTZ,
  retry_count       INT NOT NULL DEFAULT 0,
  replay_of_application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  superseded_by_application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE applications ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS apply_url TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'queued';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS last_pause_reason TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS last_message TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS last_step_kind TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS portal_type TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS executor_mode TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS trace_json JSONB;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS trace_count INT NOT NULL DEFAULT 0;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS last_trace_at TIMESTAMPTZ;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS replay_of_application_id UUID REFERENCES applications(id) ON DELETE SET NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS superseded_by_application_id UUID REFERENCES applications(id) ON DELETE SET NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS applications_user_id_idx ON applications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS applications_session_id_idx ON applications(session_id);

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
ALTER TABLE application_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications        ENABLE ROW LEVEL SECURITY;
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
  CREATE POLICY "own rows only" ON application_profiles FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "own rows only" ON jobs                FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "own rows only" ON applications        FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "own rows only" ON usage_events        FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
