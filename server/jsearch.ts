import { readSanitizedEnv } from './env.ts';
import type { CandidateProfile, JobSearchPreferences } from '../src/shared/types.ts';
import type { RawJob } from './job-search.ts';

// ─────────────────────────────────────────
// JSearch API types (RapidAPI)
// ─────────────────────────────────────────

const JSEARCH_HOST = 'jsearch.p.rapidapi.com';
const JSEARCH_BASE  = `https://${JSEARCH_HOST}`;

interface JSearchHighlights {
  Qualifications?: string[];
  Responsibilities?: string[];
  Benefits?: string[];
}

interface JSearchJob {
  job_id: string;
  employer_name: string;
  employer_website?: string | null;
  job_publisher: string;
  job_title: string;
  job_apply_link: string;
  job_apply_is_direct: boolean;
  job_description: string;
  job_is_remote: boolean;
  job_posted_at_datetime_utc?: string | null;
  job_city?: string | null;
  job_state?: string | null;
  job_country?: string | null;
  job_min_salary?: number | null;
  job_max_salary?: number | null;
  job_salary_currency?: string | null;
  job_salary_period?: string | null;
  job_required_skills?: string[] | null;
  job_highlights?: JSearchHighlights | null;
}

interface JSearchResponse {
  status: string;
  data?: JSearchJob[];
}

// ─────────────────────────────────────────
// Query builder
// ─────────────────────────────────────────

export function buildJSearchQueries(
  profile: CandidateProfile,
  prefs?: JobSearchPreferences,
): string[] {
  const locationParts = [prefs?.location, prefs?.country].filter(Boolean).join(', ');
  const city = locationParts || profile.location || 'Bangalore India';
  const primaryTitle = profile.primaryTitles[0] ?? 'Product Manager';
  const seniority = profile.seniorityLevel !== 'mid' ? profile.seniorityLevel : '';

  const queries: string[] = [];

  // 1. Primary title + location (always)
  queries.push(`${primaryTitle} ${city}`);

  // 2. Seniority-prefixed variant
  if (seniority) {
    queries.push(`${seniority} ${primaryTitle} ${city}`);
  }

  // 3. Remote variant — if not strictly onsite
  if (prefs?.remotePreference !== 'onsite') {
    queries.push(`${primaryTitle} remote India`);
  }

  // 4. Domain-specific variant
  const domain =
    profile.industries.includes('ai')         ? 'AI ML'
    : profile.industries.includes('iot')      ? 'IoT hardware'
    : profile.industries.includes('fintech')  ? 'fintech'
    : profile.industries.includes('enterprise') ? 'enterprise SaaS'
    : '';
  if (domain) {
    queries.push(`${primaryTitle} ${domain} ${city}`);
  }

  // 5. Explicit role focus from preferences (if different from primaryTitle)
  if (
    prefs?.roleType &&
    !primaryTitle.toLowerCase().includes(prefs.roleType.toLowerCase())
  ) {
    queries.push(`${prefs.roleType} ${city}`);
  }

  // Cap at 4 to stay within free-tier budget (200 req/month → ~50 searches)
  return [...new Set(queries)].slice(0, 4);
}

// ─────────────────────────────────────────
// Mapping helpers
// ─────────────────────────────────────────

function mapRemoteType(job: JSearchJob): string {
  if (job.job_is_remote) return 'remote';
  const desc = (job.job_description ?? '').toLowerCase();
  if (/\bhybrid\b/.test(desc)) return 'hybrid';
  return 'onsite';
}

const SKILL_RE = /\b(python|java|javascript|typescript|sql|nosql|react|angular|vue|node\.?js|aws|gcp|azure|kubernetes|docker|terraform|product management|roadmap(?:ping)?|agile|scrum|okr|kpi|b2b|saas|api|machine learning|ml|ai|llm|data analytics|user research|jira|confluence|figma|salesforce|servicenow|tableau|snowflake|bigquery|dbt)\b/gi;

function extractSkills(job: JSearchJob): string[] {
  // Prefer the structured field if populated
  if (job.job_required_skills?.length) {
    return job.job_required_skills.slice(0, 6);
  }
  // Fall back to keyword extraction from qualifications
  const text = (job.job_highlights?.Qualifications ?? []).join(' ');
  const matches = new Set<string>();
  for (const m of text.matchAll(SKILL_RE)) matches.add(m[0].toLowerCase());
  return [...matches].slice(0, 6);
}

function formatSalary(job: JSearchJob): string | null {
  const { job_min_salary: min, job_max_salary: max, job_salary_currency: cur, job_salary_period: period } = job;
  if (!min && !max) return null;
  const c = cur ?? 'USD';
  const p = period === 'YEAR' ? '/yr' : period === 'MONTH' ? '/mo' : period === 'HOUR' ? '/hr' : '';
  if (min && max) return `${c} ${min.toLocaleString()}–${max.toLocaleString()}${p}`;
  if (min)        return `${c} ${min.toLocaleString()}+${p}`;
  return null;
}

function ghostRiskFromDate(dateUtc?: string | null): 'real' | 'verify' | 'ghost' {
  if (!dateUtc) return 'verify';
  const days = (Date.now() - new Date(dateUtc).getTime()) / 86_400_000;
  if (days <= 7)  return 'real';
  if (days <= 30) return 'verify';
  return 'ghost';
}

function tagsFromJob(job: JSearchJob): string[] {
  const tags: string[] = [];
  if (job.job_is_remote) tags.push('Remote');
  const pub = job.job_publisher?.toLowerCase() ?? '';
  if (pub.includes('linkedin')) tags.push('LinkedIn');
  if (pub.includes('naukri'))   tags.push('Naukri');
  if (pub.includes('glassdoor')) tags.push('Glassdoor');
  const desc = (job.job_description ?? '').toLowerCase();
  if (/\bai\b|\bllm\b|machine learning/.test(desc))  tags.push('AI');
  if (/\biot\b|internet of things|embedded/.test(desc)) tags.push('IoT');
  if (/enterprise|b2b|saas platform/.test(desc))     tags.push('Enterprise');
  if (job.job_apply_is_direct)                        tags.push('Direct apply');
  return tags;
}

function mapToRawJob(job: JSearchJob): RawJob & { _jsearchId: string } {
  const location = [job.job_city, job.job_state, job.job_country]
    .filter(Boolean).join(', ');

  return {
    title:           job.job_title?.trim(),
    company:         job.employer_name?.trim(),
    location:        location || undefined,
    remoteType:      mapRemoteType(job),
    url:             job.job_apply_link?.trim(),
    description:     (job.job_description ?? '').replace(/\s+/g, ' ').trim().slice(0, 220),
    requiredSkills:  extractSkills(job),
    niceToHaveSkills: [],
    estimatedSalary: formatSalary(job),
    postedDate:      job.job_posted_at_datetime_utc
                       ? new Date(job.job_posted_at_datetime_utc).toISOString().split('T')[0]
                       : null,
    companyStage:    'unknown',
    ghostRisk:       ghostRiskFromDate(job.job_posted_at_datetime_utc),
    tags:            tagsFromJob(job),
    _jsearchId:      job.job_id,
  };
}

// ─────────────────────────────────────────
// API fetch
// ─────────────────────────────────────────

type FetchImpl = typeof fetch;

async function fetchOneQuery(
  query: string,
  apiKey: string,
  fetchImpl: FetchImpl,
): Promise<JSearchJob[]> {
  const params = new URLSearchParams({
    query,
    page:             '1',
    num_pages:        '1',
    date_posted:      'month',       // last 30 days — avoids ghost jobs
    employment_types: 'FULLTIME',
  });

  const res = await fetchImpl(`${JSEARCH_BASE}/search?${params}`, {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key':  apiKey,
      'X-RapidAPI-Host': JSEARCH_HOST,
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`JSearch ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json() as JSearchResponse;
  return json.status === 'OK' ? (json.data ?? []) : [];
}

// ─────────────────────────────────────────
// Public interface
// ─────────────────────────────────────────

export function isJSearchConfigured(): boolean {
  return Boolean(readSanitizedEnv('JSEARCH_API_KEY'));
}

export async function searchWithJSearch(
  profile: CandidateProfile,
  prefs: JobSearchPreferences | undefined,
  fetchImpl: FetchImpl,
): Promise<RawJob[]> {
  const apiKey = readSanitizedEnv('JSEARCH_API_KEY');
  if (!apiKey) throw new Error('JSEARCH_API_KEY not set');

  const queries = buildJSearchQueries(profile, prefs);
  console.log(`[jsearch] ${queries.length} queries:`, queries);

  const batches = await Promise.all(
    queries.map(q =>
      fetchOneQuery(q, apiKey, fetchImpl).catch(err => {
        console.warn(`[jsearch] Query failed "${q}":`, err.message);
        return [] as JSearchJob[];
      }),
    ),
  );

  // Flatten + deduplicate by job_id
  const seen = new Set<string>();
  const unique: JSearchJob[] = [];
  for (const batch of batches) {
    for (const job of batch) {
      if (!seen.has(job.job_id)) {
        seen.add(job.job_id);
        unique.push(job);
      }
    }
  }

  console.log(`[jsearch] ${unique.length} unique jobs across ${queries.length} queries`);
  return unique.map(mapToRawJob);
}
