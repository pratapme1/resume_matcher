import type { AIClient } from './app.ts';
import type { AIProviderName } from './ai.ts';
import { badGateway } from './errors.ts';
import { readSanitizedEnv } from './env.ts';
import { isJSearchConfigured, searchWithJSearch } from './jsearch.ts';
import type {
  CandidateProfile,
  JobMatchBreakdown,
  JobSearchPreferences,
  JobSearchResponse,
  JobSearchResult,
  SourceResumeDocument,
} from '../src/shared/types.ts';

// ─────────────────────────────────────────
// Seniority helpers
// ─────────────────────────────────────────

type SeniorityLevel = CandidateProfile['seniorityLevel'];

const SENIORITY_ORDER: SeniorityLevel[] = ['junior', 'mid', 'senior', 'staff', 'principal'];

function inferSeniorityFromTitle(title: string): SeniorityLevel {
  const t = title.toLowerCase();
  if (/principal|distinguished|fellow/.test(t)) return 'principal';
  if (/staff|architect|lead/.test(t)) return 'staff';
  if (/senior|sr\.?|senior-/.test(t)) return 'senior';
  if (/junior|jr\.?|associate|entry/.test(t)) return 'junior';
  return 'mid';
}

// ─────────────────────────────────────────
// Build candidate profile from parsed resume (no AI)
// ─────────────────────────────────────────

function parseYearsFromDates(dateStr: string): number {
  // Parse strings like "Jan 2018 – Mar 2022", "2019 - Present", "2020 – current"
  const current = new Date().getFullYear();
  const years = (dateStr.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number);
  if (years.length === 0) return 0;
  const isPresent = /present|current|now/i.test(dateStr);
  const start = Math.min(...years);
  const end = isPresent ? current : Math.max(...years);
  return Math.max(0, end - start);
}

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  enterprise:   ['dell', 'enterprise', 'b2b software', 'it management', 'itam', 'itsm', 'asset management', 'software asset', 'license management', 'flexera', 'servicenow', 'salesforce', 'sap', 'oracle', 'workday'],
  data:         ['data platform', 'data pipeline', 'analytics platform', 'business intelligence', 'bi platform', 'data lake', 'data warehouse', 'data governance', 'data catalog', 'etl', 'snowflake', 'databricks', 'dbt', 'bigquery'],
  iot:          ['iot', 'internet of things', 'connected device', 'embedded', 'sensor', 'edge computing', 'firmware', 'hardware', 'smart device', 'telemetry', 'scada', 'industrial'],
  cloud:        ['cloud', 'aws', 'azure', 'gcp', 'infrastructure', 'devops', 'platform engineering', 'microservices', 'kubernetes', 'serverless'],
  ai:           ['machine learning', 'ml', 'deep learning', 'llm', 'nlp', 'computer vision', 'artificial intelligence', 'generative ai', 'ai platform', 'model'],
  saas:         ['saas', 'subscription', 'multi-tenant', 'crm', 'erp', 'b2b saas', 'product-led growth', 'plg'],
  fintech:      ['bank', 'payment', 'finance', 'financial', 'fintech', 'lending', 'insurance', 'crypto', 'trading', 'capital markets'],
  healthtech:   ['health', 'medical', 'clinical', 'patient', 'ehr', 'emr', 'pharma', 'biotech', 'hospital', 'healthcare', 'digital health'],
  security:     ['security', 'cybersecurity', 'infosec', 'compliance', 'soc', 'siem', 'vulnerability', 'zero trust', 'identity'],
  devtools:     ['developer tools', 'devtools', 'cli', 'sdk', 'api platform', 'open source', 'developer experience', 'dx'],
  ecommerce:    ['ecommerce', 'e-commerce', 'marketplace', 'retail', 'checkout', 'cart'],
  edtech:       ['education', 'edtech', 'learning', 'lms', 'course', 'student'],
};

const TECH_SIGNALS = [
  'js', 'ts', '.net', 'sql', 'nosql', 'aws', 'gcp', 'azure',
  'react', 'vue', 'angular', 'next', 'node', 'django', 'flask', 'rails',
  'python', 'java', 'golang', 'rust', 'swift', 'kotlin', 'scala',
  'docker', 'kubernetes', 'terraform', 'postgres', 'mysql', 'mongodb', 'redis',
  'graphql', 'rest', 'grpc', 'kafka', 'rabbitmq', 'elasticsearch',
  'spark', 'hadoop', 'airflow', 'dbt', 'snowflake', 'bigquery',
  'ml', 'llm', 'pytorch', 'tensorflow', 'langchain',
];

// Extract candidate titles from headline/summary text when experience entries are empty
function extractTitlesFromText(headline: string, summary: string): string[] {
  const titles: string[] = [];
  const seenTitles = new Set<string>();

  // Headline often contains "Title | Company" or "Title at Company" or just "Title"
  if (headline) {
    const parts = headline.split(/[|,·@\-–]/);
    for (const part of parts) {
      const t = part.trim();
      // Heuristic: title-like if it contains a role keyword and doesn't start with a digit
      if (t && !/^\d/.test(t) && /manager|engineer|developer|designer|analyst|director|lead|architect|scientist|consultant|specialist|coordinator|officer|executive|president|vp|head|founder|owner|intern|associate|advisor/i.test(t)) {
        const key = t.toLowerCase();
        if (!seenTitles.has(key)) { seenTitles.add(key); titles.push(t); }
      }
    }
    // If nothing matched from parts, use the whole headline ONLY if it contains a role keyword
    // (prevents person names like "Alex Chen" from becoming titles)
    if (titles.length === 0 && headline.length < 80) {
      const h = headline.trim();
      if (/manager|engineer|developer|designer|analyst|director|lead|architect|scientist|consultant|specialist|coordinator|officer|executive|president|vp\b|head|founder|owner|intern|associate|advisor|sre|devops/i.test(h)) {
        const key = h.toLowerCase();
        if (!seenTitles.has(key)) { seenTitles.add(key); titles.push(h); }
      }
    }
  }

  // Summary: extract "X as a Title" or "X Title with" or leading "Title with"
  if (titles.length === 0 && summary) {
    const patterns = [
      /^([A-Z][A-Za-z\s]+?)\s+with\s+\d+\s+years?/,           // "Product Manager with 6 years"
      /experienced?\s+([A-Z][A-Za-z\s]+?)\s+with/i,            // "experienced Product Manager with"
      /as\s+(?:a\s+|an\s+)?([A-Z][A-Za-z\s]+?)\s+(?:at|for|with)/i, // "as a PM at"
      /^\s*([A-Z][A-Za-z\s]+?)\s+specializing/i,
    ];
    for (const pat of patterns) {
      const m = summary.match(pat);
      if (m) {
        const t = m[1].trim();
        const key = t.toLowerCase();
        if (t.length > 2 && t.length < 60 && !seenTitles.has(key)) {
          seenTitles.add(key);
          titles.push(t);
          break;
        }
      }
    }
  }

  return titles;
}

// Extract years of experience from summary text
// Handles: "6 years of experience", "8+ years", "6 years of product leadership", "a decade of"
function extractYearsFromSummary(summary: string): number {
  let max = 0;
  // Match "N years" or "N+ years" regardless of what follows
  for (const m of summary.matchAll(/(\d+)\+?\s+years?/gi)) {
    const n = parseInt(m[1], 10);
    if (n > max && n < 50) max = n;
  }
  // Match "a decade" → 10, "two decades" → 20
  if (/\ba\s+decade\b/i.test(summary) && max < 10) max = 10;
  if (/\btwo\s+decades?\b/i.test(summary) && max < 20) max = 20;
  return max;
}

export function buildCandidateProfile(resume: SourceResumeDocument): CandidateProfile {
  // Primary titles (deduplicated, most recent first)
  const seenTitles = new Set<string>();
  const primaryTitles: string[] = [];
  for (const exp of resume.experience) {
    if (exp.title && !seenTitles.has(exp.title.toLowerCase())) {
      seenTitles.add(exp.title.toLowerCase());
      primaryTitles.push(exp.title);
    }
  }

  // Guard: if titles look like person names (no role keyword), they're parse errors — discard
  const ROLE_KEYWORDS = /manager|engineer|developer|designer|analyst|director|lead|architect|scientist|consultant|specialist|coordinator|officer|executive|president|vp|head|founder|owner|intern|associate|advisor|pm\b|cto|ceo|coo|sre|devops/i;
  const badTitles = primaryTitles.filter(t => !ROLE_KEYWORDS.test(t));
  if (badTitles.length === primaryTitles.length) primaryTitles.length = 0; // all titles are bad, clear them

  // Fallback: extract titles from headline / summary when experience is empty or titles were bad
  if (primaryTitles.length === 0) {
    const fallback = extractTitlesFromText(resume.headline ?? '', resume.summary ?? '');
    primaryTitles.push(...fallback);
  }

  // Skills from skillCategories + flat skills (deduplicated, max 30)
  // Normalize: split "Category: item1, item2" and "item1, item2, item3" into individual items
  const normalizeSkillLine = (s: string): string[] => {
    const colonIdx = s.indexOf(':');
    const itemStr = colonIdx > 0 && colonIdx < 30 ? s.slice(colonIdx + 1) : s;
    const trimmed = itemStr.trim();
    // If comma-separated list, split it
    if (trimmed.includes(',')) return trimmed.split(',').map(x => x.trim()).filter(Boolean);
    // If pipe-separated, split it
    if (trimmed.includes('|')) return trimmed.split('|').map(x => x.trim()).filter(Boolean);
    return [trimmed];
  };
  const allSkillsRaw = [
    ...resume.skillCategories.flatMap(c => c.items.flatMap(normalizeSkillLine)),
    ...resume.skills.flatMap(normalizeSkillLine),
  ];
  const seenSkills = new Set<string>();
  const topSkills: string[] = [];
  for (const s of allSkillsRaw) {
    const key = s.toLowerCase().trim();
    if (key && key.length > 1 && !seenSkills.has(key)) {
      seenSkills.add(key);
      topSkills.push(s.trim());
    }
    if (topSkills.length >= 30) break;
  }

  // Technologies (filter by tech signals)
  const technologiesAndTools = topSkills.filter(s =>
    TECH_SIGNALS.some(sig => s.toLowerCase().includes(sig))
  );

  // Years of experience (sum of all experience date spans)
  let totalYears = 0;
  let earliestStart = Infinity;
  const current = new Date().getFullYear();
  for (const exp of resume.experience) {
    if (!exp.dates) continue;
    const years = (exp.dates.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number);
    if (years.length === 0) continue;
    const isPresent = /present|current|now/i.test(exp.dates);
    const start = Math.min(...years);
    const end = isPresent ? current : Math.max(...years);
    if (start < earliestStart) earliestStart = start;
    totalYears += Math.max(0, end - start);
  }
  // Use career span if individual periods overlap (cap at 35)
  const careerSpan = earliestStart < Infinity ? Math.min(35, current - earliestStart) : 0;
  let yearsOfExperience = Math.max(totalYears, careerSpan);

  // Fallback: parse years from summary when experience entries have no dates
  if (yearsOfExperience === 0 && resume.summary) {
    yearsOfExperience = extractYearsFromSummary(resume.summary);
  }

  // Seniority (from most recent title, or inferred from years)
  const mostRecentTitle = resume.experience[0]?.title ?? primaryTitles[0] ?? '';
  let seniorityLevel: SeniorityLevel = inferSeniorityFromTitle(mostRecentTitle);
  if (seniorityLevel === 'mid' && yearsOfExperience <= 2) seniorityLevel = 'junior';
  if (seniorityLevel === 'mid' && yearsOfExperience >= 8) seniorityLevel = 'senior';
  if (seniorityLevel === 'mid' && yearsOfExperience >= 12) seniorityLevel = 'staff';

  // Industries (from bullets + summary + raw sections when experience is empty)
  const corpusText = [
    resume.summary,
    resume.headline ?? '',
    ...resume.experience.flatMap(e => [e.company, ...e.bullets]),
    ...(resume.experience.length === 0 ? resume.rawSections.flatMap(s => s.paragraphs) : []),
  ].join(' ').toLowerCase();

  const industries: string[] = [];
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some(kw => corpusText.includes(kw))) {
      industries.push(domain);
    }
    if (industries.length >= 5) break;
  }

  // Domain expertise (capitalized noun phrases from summary, first 600 chars)
  const SKIP_STARTS = new Set([
    'The','This','With','Our','Your','At','In','On','By','For','To','A','An',
    'Led','Built','Designed','Developed','Managed','Delivered','Worked','Drove',
    'Strong','Proven','Skilled','Experienced','Responsible','Focused','Passionate',
    'Is','Are','Was','Has','Have','I','We','My','Its','He','She','They',
    'Deep','High','Low','Good','Great','Large','Small','New','Old',
    'Key','Core','Full','Top','Best','Fast','Seeking','Looking','Helping',
  ]);
  const summaryText = resume.summary?.slice(0, 600) ?? '';
  const TRAILING_PREPS = /\s+(with|in|on|at|for|to|and|or|of|by|the|a|an|its|their|our|this|that)\s*$/i;
  const capPhraseMatches = summaryText.match(/[A-Z][a-z]+(?:\s+[A-Z]?[a-z]+){0,3}/g) ?? [];
  const domainExpertise = [...new Set(
    capPhraseMatches
      .map(p => p.trim().replace(TRAILING_PREPS, '').trim())
      .filter(p =>
        p.length > 5 && p.length < 45 &&
        !SKIP_STARTS.has(p.split(' ')[0]) &&
        (/[A-Z]/.test(p.slice(1)) || /management|platform|system|service|engineer|product|data|cloud|security|devops|analytics|infrastructure/i.test(p))
      )
  )].slice(0, 8);

  // Education level
  const highestDegree = resume.education[0]?.degree?.toLowerCase() ?? '';
  let educationLevel = 'other';
  if (/ph\.?d|doctorate/i.test(highestDegree)) educationLevel = 'phd';
  else if (/m\.?s\.?|m\.?sc|master|mba|m\.?eng/i.test(highestDegree)) educationLevel = 'master';
  else if (/b\.?s\.?|b\.?sc|bachelor|b\.?eng|b\.?a\./i.test(highestDegree)) educationLevel = 'bachelor';

  // Former employers (deduplicated, most recent first, max 10)
  const seenCompanies = new Set<string>();
  const formerEmployers: string[] = [];
  for (const exp of resume.experience) {
    if (exp.company) {
      const key = exp.company.toLowerCase().trim();
      if (key && !seenCompanies.has(key)) {
        seenCompanies.add(key);
        formerEmployers.push(exp.company.trim());
      }
    }
    if (formerEmployers.length >= 10) break;
  }

  return {
    primaryTitles,
    topSkills,
    technologiesAndTools,
    industries,
    seniorityLevel,
    yearsOfExperience,
    location: (resume.contactInfo.location ?? '')
      .replace(/\S+@\S+\.\S+/g, '')          // strip emails
      .replace(/[+\d][\d\s\-().]{6,}/g, '')  // strip phone numbers
      .replace(/\s*[|·,]\s*/g, ' ')           // strip separators
      .trim(),
    educationLevel,
    domainExpertise,
    formerEmployers,
  };
}

// ─────────────────────────────────────────
// Build search prompt
// ─────────────────────────────────────────

const ROLE_VARIANTS: Record<string, string[]> = {
  // Product
  'product manager':     ['Product Manager', 'Senior Product Manager', 'Product Owner', 'Group Product Manager', 'Principal PM', 'Staff PM', 'Lead PM', 'Platform PM', 'Technical PM'],
  'product owner':       ['Product Owner', 'Product Manager', 'Senior Product Manager', 'Scrum Product Owner'],
  'program manager':     ['Program Manager', 'Technical Program Manager', 'Senior Program Manager', 'PMO Manager'],
  'project manager':     ['Project Manager', 'Senior Project Manager', 'Program Manager', 'Delivery Manager'],
  // Engineering – general
  'software engineer':   ['Software Engineer', 'Senior Software Engineer', 'Backend Engineer', 'Senior Backend Engineer', 'Full Stack Engineer', 'Staff Software Engineer'],
  'software developer':  ['Software Developer', 'Software Engineer', 'Senior Software Engineer', 'Application Developer'],
  'backend engineer':    ['Backend Engineer', 'Senior Backend Engineer', 'Software Engineer', 'Senior Software Engineer', 'Backend Developer'],
  'backend developer':   ['Backend Developer', 'Backend Engineer', 'Senior Software Engineer', 'API Engineer'],
  'frontend engineer':   ['Frontend Engineer', 'Senior Frontend Engineer', 'UI Engineer', 'Frontend Developer', 'React Developer'],
  'frontend developer':  ['Frontend Developer', 'Frontend Engineer', 'Senior Frontend Engineer', 'UI Developer'],
  'full stack':          ['Full Stack Engineer', 'Full Stack Developer', 'Software Engineer', 'Senior Software Engineer'],
  'fullstack':           ['Full Stack Engineer', 'Full Stack Developer', 'Software Engineer'],
  // Engineering – senior/staff/principal
  'staff engineer':      ['Staff Engineer', 'Principal Engineer', 'Senior Staff Engineer', 'Distinguished Engineer'],
  'principal engineer':  ['Principal Engineer', 'Staff Engineer', 'Distinguished Engineer', 'Senior Principal Engineer'],
  'tech lead':           ['Tech Lead', 'Engineering Lead', 'Staff Engineer', 'Senior Software Engineer'],
  // Engineering – management
  'engineering manager': ['Engineering Manager', 'Software Development Manager', 'Director of Engineering', 'VP Engineering'],
  'engineering lead':    ['Tech Lead', 'Staff Engineer', 'Principal Engineer', 'Engineering Manager'],
  // Infrastructure / DevOps / Platform
  'devops':              ['DevOps Engineer', 'Platform Engineer', 'SRE', 'Infrastructure Engineer', 'Cloud Engineer'],
  'sre':                 ['Site Reliability Engineer', 'SRE', 'Platform Engineer', 'DevOps Engineer'],
  'platform engineer':   ['Platform Engineer', 'Infrastructure Engineer', 'DevOps Engineer', 'Cloud Infrastructure Engineer'],
  'cloud engineer':      ['Cloud Engineer', 'AWS Engineer', 'Platform Engineer', 'Infrastructure Engineer'],
  // Mobile
  'mobile engineer':     ['Mobile Engineer', 'iOS Engineer', 'Android Engineer', 'React Native Developer'],
  'ios':                 ['iOS Engineer', 'iOS Developer', 'Mobile Engineer', 'Swift Developer'],
  'android':             ['Android Engineer', 'Android Developer', 'Mobile Engineer', 'Kotlin Developer'],
  // Data / ML
  'data scientist':      ['Data Scientist', 'Senior Data Scientist', 'ML Engineer', 'Applied Scientist'],
  'data engineer':       ['Data Engineer', 'Senior Data Engineer', 'Analytics Engineer', 'Data Platform Engineer'],
  'ml engineer':         ['ML Engineer', 'Machine Learning Engineer', 'AI Engineer', 'Applied ML Engineer'],
  'machine learning':    ['ML Engineer', 'Machine Learning Engineer', 'AI Engineer', 'Data Scientist'],
  // Design
  'ux designer':         ['UX Designer', 'Product Designer', 'UI/UX Designer', 'Senior UX Designer'],
  'designer':            ['Product Designer', 'UX Designer', 'UI/UX Designer', 'Interaction Designer'],
  // Security
  'security engineer':   ['Security Engineer', 'Application Security Engineer', 'Cloud Security Engineer', 'InfoSec Engineer'],
};

function expandTitles(profile: CandidateProfile): string[] {
  const expanded = profile.primaryTitles.flatMap(t => {
    const key = t.toLowerCase().replace(/\s+/g, ' ').trim();
    for (const [pattern, variants] of Object.entries(ROLE_VARIANTS)) {
      if (key.includes(pattern) || pattern.includes(key)) return variants;
    }
    return [t];
  });
  return [...new Set(expanded)].slice(0, 8);
}

function buildSearchPrompt(profile: CandidateProfile, prefs?: JobSearchPreferences): string {
  const today = new Date().toISOString().split('T')[0];
  const locationParts = [prefs?.location, prefs?.country].filter(Boolean).join(', ');
  const targetLocation = locationParts || profile.location || 'Bangalore, India';
  const cityName = targetLocation.split(',')[0].trim();

  // If user explicitly specified a role type preference, inject it at the front of the title list
  const prefRoleType = prefs?.roleType?.trim();
  const baseTitles = expandTitles(profile);
  const uniqueTitles = prefRoleType && !baseTitles.some(t => t.toLowerCase().includes(prefRoleType.toLowerCase()))
    ? [prefRoleType, ...baseTitles].slice(0, 8)
    : baseTitles;
  const titleList = uniqueTitles.join(', ');
  const titleQueries = uniqueTitles.slice(0, 4).map(t =>
    `"${t}" ("${cityName}" OR "Bengaluru" OR "India" OR "remote India")`
  ).join('\n  ');

  const domainTerms = [...profile.industries, ...profile.domainExpertise].slice(0, 5);
  const domainList = domainTerms.join(', ') || 'technology';

  const skillList = profile.topSkills.slice(0, 8).join(', ');

  const formerEmployerLines = (profile.formerEmployers ?? []).slice(0, 6).map(c =>
    `  - "${c} careers" ${uniqueTitles[0] ?? ''} (warm connection — former employer)`
  ).join('\n');

  const remoteNote = prefs?.remotePreference === 'remote'
    ? 'Candidate strongly prefers remote. Prioritize remote-first listings.'
    : prefs?.remotePreference === 'hybrid'
    ? 'Candidate prefers hybrid. Include hybrid and remote listings.'
    : 'Include onsite Bangalore, hybrid, and remote India listings.';

  return `You are a deep job research agent. Today's date: ${today}.
Target market: India (${targetLocation} preferred, remote acceptable).
${remoteNote}

CANDIDATE PROFILE:
- Target titles: ${titleList}
- Years of experience: ${profile.yearsOfExperience}
- Seniority: ${profile.seniorityLevel}
- Key skills: ${skillList}
- Domains: ${domainList}

TASK: Run at least 15 distinct searches across ALL of the following sources. Do not skip any category.

PRIMARY JOB BOARDS — search each with specific queries:
  ${titleQueries}
  - site:naukri.com ${uniqueTitles[0] ?? ''} ${cityName}
  - site:in.indeed.com OR site:indeed.com/jobs ${uniqueTitles[0] ?? ''} india
  - site:glassdoor.co.in/Job ${uniqueTitles[0] ?? ''}
  - site:wellfound.com/jobs ${uniqueTitles[0] ?? ''} india
  - site:instahyre.com ${uniqueTitles[0] ?? ''}
  - site:cutshort.io/jobs ${uniqueTitles[0] ?? ''}
  - site:iimjobs.com ${uniqueTitles[0] ?? ''}
  - site:shine.com ${uniqueTitles[0] ?? ''} ${cityName}

COMPANY CAREER PAGES (search directly, not via aggregators):
  - Freshworks, Zoho, BrowserStack, Postman, Razorpay, Zepto, Meesho, PhonePe, Swiggy, Flipkart, Groww, CRED, Lenskart — search "[company] careers ${uniqueTitles[0] ?? ''}"
  - Salesforce, ServiceNow, SAP, Adobe, Oracle, Atlassian, MoEngage, CleverTap, Sprinklr, Darwinbox, Leadsquared, Chargebee — search "[company] careers ${uniqueTitles[0] ?? ''}"
  - Y Combinator: site:ycombinator.com/jobs ${uniqueTitles[0] ?? ''}
${formerEmployerLines ? `FORMER EMPLOYER CAREER PAGES (warm connections):\n${formerEmployerLines}` : ''}

HIDDEN/NICHE SOURCES:
  - ATS direct pages: site:boards.greenhouse.io ${uniqueTitles[0] ?? ''} india
  - ATS direct pages: site:jobs.lever.co ${uniqueTitles[0] ?? ''} india
  - ATS direct pages: site:ashbyhq.com ${uniqueTitles[0] ?? ''} india
  - Workday: "${uniqueTitles[0] ?? ''}" site:myworkdayjobs.com india
  - Remote boards: site:remotive.com ${uniqueTitles[0] ?? ''} (if remote-friendly)
  - LinkedIn posts (not just listings): "hiring ${uniqueTitles[0] ?? ''}" bangalore 2026

QUERY CONSTRUCTION — use ALL of these variants across your searches:
  Title variants: ${uniqueTitles.map(t => `"${t}"`).join(', ')}
  Domain combinations: ${domainTerms.slice(0, 3).map(d => `"${uniqueTitles[0] ?? ''}" "${d}"`).join(', ')}
  Location variants: "${cityName}" OR "Bengaluru" OR "India" OR "remote India" OR "hybrid Bangalore"
  Recency signals: "2026" OR "hiring now"
  Seniority variants: "Senior" OR "Principal" OR "Staff" OR "Lead" OR "Group"

GHOST JOB DETECTION — classify each result:
  - "real": Posted within 7 days, direct company career page, apply button live
  - "verify": Posted 8–30 days ago, aggregator link only, no visible date
  - "ghost": Posted 30+ days ago, company had recent layoffs, redirects to generic careers page

SCORING RUBRIC (0–100) — score each job:
  - Role title match (${uniqueTitles.slice(0, 2).join(' / ')}): 25 pts
  - Seniority/experience match (${profile.yearsOfExperience} yrs, ${profile.seniorityLevel}): 20 pts
  - AI / automation domain overlap: 20 pts
  - IoT / hardware / connected devices domain overlap: 15 pts
  - Enterprise B2B / platform product type: 15 pts
  - Location fit (${cityName} / remote / hybrid): 5 pts

MINIMUM BAR: Only include jobs scoring 65+. Drop everything below. Return MINIMUM 15 jobs — search harder with alternate queries before giving up.

Return raw JSON only. No markdown. No explanation. Schema:
{"jobs":[{
  "title":"",
  "company":"",
  "location":"",
  "remoteType":"remote|hybrid|onsite|unknown",
  "url":"",
  "description":"one sentence, max 220 chars",
  "requiredSkills":["max 6 items"],
  "niceToHaveSkills":["max 3 items"],
  "estimatedSalary":null,
  "postedDate":null,
  "companyStage":"startup|growth|enterprise|unknown",
  "score":75,
  "ghostRisk":"real|verify|ghost",
  "matchReason":"one sentence explaining specifically why this matches the candidate",
  "tags":["AI","IoT","Enterprise","Former client","Startup","Remote","Hidden job"]
}]}

Rules: description max 220 chars, requiredSkills max 6, niceToHaveSkills max 3, URL must be direct posting URL (prefer company career page or ATS over aggregator), company name is required, score must be 65–100.`;
}

// ─────────────────────────────────────────
// Gemini search with Google grounding
// ─────────────────────────────────────────

export interface RawJob {
  title?: string;
  company?: string;
  location?: string;
  remoteType?: string;
  url?: string;
  description?: string;
  requiredSkills?: string[];
  niceToHaveSkills?: string[];
  estimatedSalary?: string | null;
  postedDate?: string | null;
  companyStage?: string;
  score?: number;
  ghostRisk?: string;
  matchReason?: string;
  tags?: string[];
}

type SearchFetchImpl = typeof fetch;

const ATS_HOST_PATTERNS = [
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'myworkdayjobs.com',
  'workdayjobs.com',
  'icims.com',
  'smartrecruiters.com',
  'taleo.net',
  'successfactors.com',
];

const JOB_BOARD_HOST_PATTERNS = [
  'linkedin.com',
  'wellfound.com',
  // Indian job boards — primary sources, not generic aggregators
  'naukri.com',
  'instahyre.com',
  'cutshort.io',
  'iimjobs.com',
  'shine.com',
  'monsterindia.com',
  'glassdoor.co.in',
  'in.indeed.com',
];

const AGGREGATOR_HOST_PATTERNS = [
  'indeed.com',
  'glassdoor.com',
  'ziprecruiter.com',
  'foundit.in',
  'foundit.com',
  'jooble.org',
  'jooble.com',
  'talent.com',
  'careerbuilder.com',
  'simplyhired.com',
];

function normalizeUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;
  const trimmed = rawUrl.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed).toString();
  } catch {
    try {
      return new URL(`https://${trimmed}`).toString();
    } catch {
      return undefined;
    }
  }
}

function getHostname(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function hostMatches(hostname: string | undefined, patterns: string[]): boolean {
  if (!hostname) return false;
  return patterns.some((pattern) => hostname === pattern || hostname.endsWith(`.${pattern}`));
}

function titleCaseWords(value: string): string {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function cleanCompanyName(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^(unknown|n\/a|na|confidential|company)$/i.test(trimmed)) return undefined;
  return trimmed.replace(/\s{2,}/g, ' ');
}

function inferCompanyFromUrl(url?: string): string | undefined {
  const hostname = getHostname(url);
  if (!hostname) return undefined;

  try {
    const parsed = new URL(url!);
    const parts = parsed.pathname.split('/').filter(Boolean);

    if (hostMatches(hostname, ['greenhouse.io']) && parts[0]) return titleCaseWords(parts[0]);
    if (hostMatches(hostname, ['lever.co']) && parts[0]) return titleCaseWords(parts[0]);
    if (hostMatches(hostname, ['ashbyhq.com']) && parts[0]) return titleCaseWords(parts[0]);
    if (hostMatches(hostname, ['smartrecruiters.com']) && parts[0]) return titleCaseWords(parts[0]);
    if (hostMatches(hostname, ['myworkdayjobs.com', 'workdayjobs.com']) && parts[0]) return titleCaseWords(parts[0]);
    if (hostMatches(hostname, ['icims.com'])) {
      const subdomain = hostname.split('.')[0];
      if (subdomain && subdomain !== 'jobs') return titleCaseWords(subdomain);
    }
    if (hostMatches(hostname, ['successfactors.com', 'taleo.net'])) {
      const subdomain = hostname.split('.')[0];
      if (subdomain && !['career5', 'career2', 'sjobs', 'jobs'].includes(subdomain)) return titleCaseWords(subdomain);
    }

    if (!hostMatches(hostname, [...JOB_BOARD_HOST_PATTERNS, ...AGGREGATOR_HOST_PATTERNS])) {
      const root = hostname.replace(/^www\./, '').split('.');
      if (root.length >= 2) return titleCaseWords(root[root.length - 2]);
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function classifySourceType(url?: string): JobSearchResult['sourceType'] {
  const hostname = getHostname(url);
  if (!hostname) return 'unknown';
  if (hostMatches(hostname, ATS_HOST_PATTERNS)) return 'ats';
  if (hostMatches(hostname, JOB_BOARD_HOST_PATTERNS)) return 'board';
  if (hostMatches(hostname, AGGREGATOR_HOST_PATTERNS)) return 'aggregator';
  return 'direct';
}

function normalizeTextList(values?: string[], max = 6): string[] {
  return [...new Set((values ?? []).map((value) => value?.trim()).filter(Boolean) as string[])].slice(0, max);
}

function normalizeDescription(value?: string): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
}

function buildSearchVerificationHeaders(): HeadersInit {
  return {
    'user-agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
  };
}

function normalizeRawJob(job: RawJob): RawJob & {
  company?: string;
  url?: string;
  sourceHost?: string;
  sourceType: JobSearchResult['sourceType'];
  verifiedSource: boolean;
  ghostRisk?: JobSearchResult['ghostRisk'];
  matchReason?: string;
  tags?: string[];
} {
  const url = normalizeUrl(job.url);
  const sourceHost = getHostname(url);
  const sourceType = classifySourceType(url);
  const company = cleanCompanyName(job.company) ?? inferCompanyFromUrl(url);

  const rawGhostRisk = (job.ghostRisk ?? '').toLowerCase();
  const ghostRisk: JobSearchResult['ghostRisk'] =
    rawGhostRisk === 'real' ? 'real'
    : rawGhostRisk === 'ghost' ? 'ghost'
    : rawGhostRisk === 'verify' ? 'verify'
    : undefined;

  const rawTags = Array.isArray(job.tags) ? job.tags.filter((t): t is string => typeof t === 'string') : undefined;

  return {
    ...job,
    title: job.title?.trim(),
    company,
    location: job.location?.trim(),
    url,
    sourceHost,
    sourceType,
    verifiedSource: sourceType === 'direct' || sourceType === 'ats' || sourceType === 'board',
    description: normalizeDescription(job.description),
    requiredSkills: normalizeTextList(job.requiredSkills, 6),
    niceToHaveSkills: normalizeTextList(job.niceToHaveSkills, 3),
    estimatedSalary: job.estimatedSalary?.trim() || null,
    postedDate: job.postedDate?.trim() || null,
    companyStage: job.companyStage?.trim(),
    score: typeof job.score === 'number' ? job.score : undefined,
    ghostRisk,
    matchReason: job.matchReason?.trim() || undefined,
    tags: rawTags,
  };
}

function shouldKeepJob(job: ReturnType<typeof normalizeRawJob>): boolean {
  if (!job.title || !job.company || !job.url) return false;
  if (job.sourceType === 'aggregator') return false;
  if ((job.description ?? '').length < 40 && (job.requiredSkills?.length ?? 0) === 0) return false;
  return true;
}

async function verifyJobUrlLiveness(
  url: string,
  fetchImpl: SearchFetchImpl,
  timeoutMs = 4_000,
): Promise<{ ok: boolean; dead: boolean }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: buildSearchVerificationHeaders(),
    });

    if (response.status === 404 || response.status === 410) {
      return { ok: false, dead: true };
    }

    if (response.ok) {
      return { ok: true, dead: false };
    }

    // Keep blocked or rate-limited pages; they may still be valid listings.
    if (response.status === 401 || response.status === 403 || response.status === 405 || response.status === 429) {
      return { ok: true, dead: false };
    }

    return { ok: false, dead: false };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, dead: false };
    }
    return { ok: false, dead: false };
  } finally {
    clearTimeout(timeout);
  }
}

async function filterDeadJobUrls(
  jobs: Array<ReturnType<typeof normalizeRawJob>>,
  fetchImpl?: SearchFetchImpl,
): Promise<Array<ReturnType<typeof normalizeRawJob>>> {
  if (!fetchImpl || jobs.length === 0) return jobs;

  const checks = await Promise.all(
    jobs.map(async (job) => {
      if (!job.url) return { job, keep: false };
      const result = await verifyJobUrlLiveness(job.url, fetchImpl);
      if (result.dead) {
        console.warn(`[job-search] Dropping dead listing: ${job.url}`);
        return { job, keep: false };
      }
      return { job, keep: true };
    }),
  );

  return checks.filter((entry) => entry.keep).map((entry) => entry.job);
}

export class SearchProviderError extends Error {
  providerName: AIProviderName;
  modelName: string;
  status?: number;
  unavailable: boolean;

  constructor(params: {
    providerName: AIProviderName;
    modelName: string;
    status?: number;
    message: string;
    unavailable: boolean;
  }) {
    super(params.message);
    this.name = 'SearchProviderError';
    this.providerName = params.providerName;
    this.modelName = params.modelName;
    this.status = params.status;
    this.unavailable = params.unavailable;
  }
}

function buildSearchProviderError(error: SearchProviderError): never {
  throw badGateway('The AI job search service is currently unavailable.', 'AI_PROVIDER_ERROR', {
    cause: error,
    logMessage: `AI provider request failed during job search using ${error.providerName}:${error.modelName}.`,
  });
}

function getProviderName(ai: AIClient): AIProviderName {
  return ((ai as { providerName?: AIProviderName }).providerName ?? 'gemini');
}

function getSearchModelForProvider(providerName: AIProviderName): string {
  if (providerName === 'perplexity') {
    return readSanitizedEnv('OPENROUTER_PERPLEXITY_SEARCH_MODEL') || 'perplexity/sonar';
  }
  return readSanitizedEnv('GEMINI_SEARCH_MODEL') || 'gemini-2.0-flash';
}

function isProviderUnavailableError(error: { status?: number; message?: string }): boolean {
  if (typeof error.status === 'number') {
    if (error.status === 408 || error.status === 409 || error.status === 425 || error.status === 429) return true;
    if (error.status >= 500 && error.status < 600) return true;
    if (error.status === 404) return true;
    if (error.status === 400 && /model|provider|available|unavailable|not found/i.test(error.message ?? '')) return true;
  }

  const message = (error.message ?? '').toLowerCase();
  return [
    'quota',
    'rate limit',
    'rate-limit',
    'timeout',
    'timed out',
    'fetch failed',
    'network',
    'connection',
    'econnreset',
    'enotfound',
    'unavailable',
    'overloaded',
    'model not found',
    'no such model',
    'resource_exhausted',
  ].some((token) => message.includes(token));
}

function extractJobsFromResponse(responseText: string): RawJob[] {
  const trimmed = responseText.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed.jobs) ? parsed.jobs : [];
    } catch {
      // Fall through to fenced/raw extraction paths.
    }
  }

  const match = responseText.match(/```json\s*([\s\S]*?)```/);
  if (!match) {
    // Try raw JSON fallback
    const rawMatch = responseText.match(/\{\s*"jobs"\s*:\s*\[[\s\S]*?\]\s*\}/);
    if (!rawMatch) {
      console.warn('[job-search] No JSON block found in response');
      return [];
    }
    try {
      const parsed = JSON.parse(rawMatch[0]);
      return Array.isArray(parsed.jobs) ? parsed.jobs : [];
    } catch {
      return [];
    }
  }

  try {
    const parsed = JSON.parse(match[1].trim());
    return Array.isArray(parsed.jobs) ? parsed.jobs : [];
  } catch (err) {
    console.warn('[job-search] JSON parse failed:', err);
    return [];
  }
}

async function searchJobsWithProvider(prompt: string, ai: AIClient): Promise<RawJob[]> {
  const providerName = getProviderName(ai);
  const model = getSearchModelForProvider(providerName);

  try {
    const result = providerName === 'perplexity'
      ? await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            temperature: 0,
            maxOutputTokens: 4000,
          },
        })
      : await (ai.models as any).generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            tools: [{ googleSearch: {} }],
            temperature: 0,
            maxOutputTokens: 4000,
          },
        });

    return extractJobsFromResponse(result.text ?? '');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = typeof err === 'object' && err !== null && 'status' in err ? (err as { status?: number }).status : undefined;
    const wrapped = new SearchProviderError({
      providerName,
      modelName: model,
      status,
      message,
      unavailable: isProviderUnavailableError({ status, message }),
    });
    console.error(`[job-search] ${providerName} search failed:`, message);
    throw wrapped;
  }
}

// ─────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'in', 'at', 'for', 'to', 'and', 'or', 'with', 'on', 'is', 'as']);

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/\W+/).filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

function normalizeSkill(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function skillsIntersection(jobSkills: string[], profileSkills: string[]): string[] {
  const profileNorm = new Set(profileSkills.map(normalizeSkill));
  return jobSkills.filter(js => {
    const n = normalizeSkill(js);
    if (profileNorm.has(n)) return true;
    // Partial match: profile skill contains job skill or vice versa
    for (const ps of profileNorm) {
      if (ps.includes(n) || n.includes(ps)) return true;
    }
    return false;
  });
}

function calcSkillsOverlap(job: RawJob, profile: CandidateProfile): number {
  const required = job.requiredSkills ?? [];
  if (required.length === 0) return 50; // unknown — neutral
  const allProfileSkills = [...profile.topSkills, ...profile.technologiesAndTools];
  const matched = skillsIntersection(required, allProfileSkills);
  return Math.round((matched.length / required.length) * 100);
}

function calcTitleSimilarity(jobTitle: string, profile: CandidateProfile): number {
  const jobTokens = new Set(tokenize(jobTitle));
  let best = 0;
  for (const pt of profile.primaryTitles) {
    const ptTokens = tokenize(pt);
    const overlap = ptTokens.filter(t => jobTokens.has(t)).length;
    const score = Math.round((overlap / Math.min(jobTokens.size, 3)) * 100);
    if (score > best) best = score;
  }
  return Math.min(100, best);
}

function calcSeniorityFit(jobTitle: string, profile: CandidateProfile): JobMatchBreakdown['seniorityFit'] {
  const jobLevel = inferSeniorityFromTitle(jobTitle);
  const candidateIdx = SENIORITY_ORDER.indexOf(profile.seniorityLevel);
  const jobIdx = SENIORITY_ORDER.indexOf(jobLevel);
  const diff = jobIdx - candidateIdx;
  if (diff > 1) return 'over';      // job wants more senior
  if (diff < -1) return 'under';    // job wants more junior
  return 'match';
}

function seniorityScore(fit: JobMatchBreakdown['seniorityFit']): number {
  return fit === 'match' ? 100 : 60;
}

function calcDomainMatch(job: RawJob, profile: CandidateProfile): number {
  const corpus = `${job.title ?? ''} ${job.description ?? ''} ${(job.requiredSkills ?? []).join(' ')}`.toLowerCase();
  const profileDomains = [...profile.industries, ...profile.domainExpertise];
  if (profileDomains.length === 0) return 50;
  const matched = profileDomains.filter(d => corpus.includes(d.toLowerCase())).length;
  return Math.round(Math.min(1, matched / Math.max(1, profileDomains.length)) * 100);
}

const AI_DOMAIN_TERMS = ['ai', 'machine learning', 'ml', 'llm', 'nlp', 'natural language', 'artificial intelligence', 'automation', 'generative', 'deep learning', 'data science', 'intelligent', 'predictive', 'recommendation'];
const IOT_DOMAIN_TERMS = ['iot', 'internet of things', 'connected device', 'embedded', 'sensor', 'hardware', 'firmware', 'telemetry', 'edge computing', 'industrial', 'scada', 'smart device', 'm2m'];
const ENTERPRISE_DOMAIN_TERMS = ['enterprise', 'b2b', 'saas', 'platform', 'it management', 'itam', 'itsm', 'asset management', 'service management', 'salesforce', 'servicenow', 'sap', 'oracle', 'atlassian', 'erp', 'crm'];

function calcSpecificDomainScore(job: RawJob, terms: string[]): number {
  const corpus = `${job.title ?? ''} ${job.description ?? ''} ${(job.requiredSkills ?? []).join(' ')}`.toLowerCase();
  const matched = terms.filter(t => corpus.includes(t)).length;
  if (matched >= 2) return 100;
  if (matched === 1) return 55;
  return 0;
}

function calcLocationFitScore(job: RawJob): number {
  const loc = (job.location ?? '').toLowerCase();
  const remoteType = (job.remoteType ?? '').toLowerCase();
  if (remoteType === 'remote') return 100;
  if (/bangalore|bengaluru/.test(loc)) return 100;
  if (remoteType === 'hybrid') return 80;
  if (/india/.test(loc)) return 70;
  if (!loc) return 50; // unknown — neutral
  return 30;
}

function scoreJobAgainstProfile(raw: RawJob, profile: CandidateProfile, idx: number): JobSearchResult {
  const title = raw.title ?? 'Unknown Role';
  const allProfileSkills = [...profile.topSkills, ...profile.technologiesAndTools];
  const required = raw.requiredSkills ?? [];
  const niceToHave = raw.niceToHaveSkills ?? [];

  const skillsOverlap = calcSkillsOverlap(raw, profile);
  const titleSimilarity = calcTitleSimilarity(title, profile);
  const seniorityFit = calcSeniorityFit(title, profile);
  const domainMatch = calcDomainMatch(raw, profile);

  // Generic rubric — works for any profile, not biased toward specific domains:
  //   role title match:        35 pts
  //   seniority/experience:    25 pts
  //   skills overlap:          25 pts
  //   location fit:            15 pts
  // Domain scores (AI/IoT/enterprise) are ONLY used as a tiebreaker bonus
  // when the job and candidate share those domains — not as primary weights.
  const locationScore = calcLocationFitScore(raw);
  const skillsScore = Math.min(100, skillsOverlap * 100);

  const matchScore = Math.round(
    titleSimilarity             * 0.35 +
    seniorityScore(seniorityFit) * 0.25 +
    skillsScore                 * 0.25 +
    locationScore               * 0.15
  );

  // Domain bonus: up to +8 pts when job and candidate share AI/IoT/enterprise domains
  const aiScore         = calcSpecificDomainScore(raw, AI_DOMAIN_TERMS);
  const iotScore        = calcSpecificDomainScore(raw, IOT_DOMAIN_TERMS);
  const enterpriseScore = calcSpecificDomainScore(raw, ENTERPRISE_DOMAIN_TERMS);
  const profileDomains  = profile.industries ?? [];
  const domainBonus = Math.round(
    (profileDomains.includes('ai')         ? aiScore         * 0.04 : 0) +
    (profileDomains.includes('iot')        ? iotScore        * 0.04 : 0) +
    (profileDomains.includes('enterprise') ? enterpriseScore * 0.04 : 0)
  );

  // Use AI-provided score when available (Gemini evaluated against the full job details),
  // otherwise fall back to our local rubric score + domain bonus.
  const aiProvidedScore = typeof raw.score === 'number' && raw.score >= 0 && raw.score <= 100
    ? raw.score
    : undefined;
  const baseScore = aiProvidedScore ?? Math.min(100, matchScore + domainBonus);

  const sourceType = classifySourceType(raw.url);
  const sourceBonus =
    sourceType === 'direct' ? 4
    : sourceType === 'ats' ? 3
    : sourceType === 'board' ? 1
    : 0;
  const boostedMatchScore = Math.min(100, baseScore + sourceBonus);

  const topMatchingSkills = skillsIntersection(required, allProfileSkills).slice(0, 5);
  const keyGaps = required
    .filter(rs => !skillsIntersection([rs], allProfileSkills).length)
    .slice(0, 3);

  let overallFit: JobMatchBreakdown['overallFit'];
  if (boostedMatchScore >= 80) overallFit = 'strong';
  else if (boostedMatchScore >= 65) overallFit = 'good';
  else if (boostedMatchScore >= 50) overallFit = 'moderate';
  else overallFit = 'stretch';

  const remoteTypeRaw = raw.remoteType?.toLowerCase() ?? 'unknown';
  const remoteType: JobSearchResult['remoteType'] =
    remoteTypeRaw === 'remote' ? 'remote'
    : remoteTypeRaw === 'hybrid' ? 'hybrid'
    : remoteTypeRaw === 'onsite' ? 'onsite'
    : 'unknown';

  return {
    id: `job-${idx}`,
    title,
    company: raw.company ?? 'Unknown Company',
    location: raw.location ?? '',
    remoteType,
    url: raw.url ?? undefined,
    sourceHost: getHostname(raw.url),
    sourceType,
    verifiedSource: sourceType !== 'aggregator' && sourceType !== 'unknown',
    description: raw.description ?? '',
    requiredSkills: required,
    niceToHaveSkills: niceToHave,
    estimatedSalary: raw.estimatedSalary ?? undefined,
    matchScore: boostedMatchScore,
    matchBreakdown: {
      skillsOverlap,
      titleSimilarity,
      seniorityFit,
      domainMatch,
      topMatchingSkills,
      keyGaps,
      overallFit,
    },
    postedDate: raw.postedDate ?? undefined,
    companyStage: raw.companyStage ?? undefined,
    ghostRisk: (raw as ReturnType<typeof normalizeRawJob>).ghostRisk,
    matchReason: (raw as ReturnType<typeof normalizeRawJob>).matchReason,
    tags: (raw as ReturnType<typeof normalizeRawJob>).tags,
  };
}

// ─────────────────────────────────────────
// Main export
// ─────────────────────────────────────────

// Minimum JSearch results before we supplement with AI search
const JSEARCH_SUPPLEMENT_THRESHOLD = 8;

export async function searchJobs(
  resume: SourceResumeDocument,
  prefs: JobSearchPreferences | undefined,
  ai: AIClient,
  fallbackAI?: AIClient,
  fetchImpl?: SearchFetchImpl,
  seenUrls?: Set<string>,
): Promise<JobSearchResponse> {
  const candidateProfile = buildCandidateProfile(resume);
  let rawJobs: RawJob[] = [];

  // ── Path A: JSearch (real job board API) ──────────────────────────────
  if (isJSearchConfigured() && fetchImpl) {
    try {
      rawJobs = await searchWithJSearch(candidateProfile, prefs, fetchImpl);
      console.log(`[job-search] JSearch returned ${rawJobs.length} jobs`);
    } catch (err) {
      console.warn('[job-search] JSearch failed, falling back to AI search:', (err as Error).message);
      rawJobs = [];
    }
  }

  // ── Path B: AI search (Gemini / Perplexity) ───────────────────────────
  // Used when: JSearch not configured, JSearch failed, or JSearch returned
  // too few results (supplement mode).
  const needAiSearch = rawJobs.length < JSEARCH_SUPPLEMENT_THRESHOLD;
  if (needAiSearch) {
    const mode = rawJobs.length > 0 ? 'supplement' : 'primary';
    console.log(`[job-search] AI search in ${mode} mode (JSearch returned ${rawJobs.length})`);

    const prompt = buildSearchPrompt(candidateProfile, prefs);
    const hasDistinctFallback =
      Boolean(fallbackAI) && getProviderName(fallbackAI as AIClient) !== getProviderName(ai);
    let aiJobs: RawJob[] = [];

    try {
      aiJobs = await searchJobsWithProvider(prompt, ai);
    } catch (error) {
      if (!(error instanceof SearchProviderError)) throw error;
      if (!fallbackAI || !hasDistinctFallback) {
        // Only hard-fail if JSearch also gave nothing
        if (rawJobs.length === 0) buildSearchProviderError(error);
      } else {
        console.warn(`[job-search] Primary AI provider failed, trying fallback:`, error.message);
        try {
          aiJobs = await searchJobsWithProvider(prompt, fallbackAI);
        } catch (fallbackError) {
          if (rawJobs.length === 0) {
            if (fallbackError instanceof SearchProviderError) buildSearchProviderError(fallbackError);
            throw fallbackError;
          }
        }
      }
    }

    if (aiJobs.length === 0 && rawJobs.length === 0 && fallbackAI && hasDistinctFallback) {
      try {
        aiJobs = await searchJobsWithProvider(buildSearchPrompt(candidateProfile, prefs), fallbackAI);
      } catch { /* best-effort */ }
    }

    // Merge: deduplicate AI jobs against JSearch by normalised URL
    const existingUrls = new Set(
      rawJobs.map(j => j.url?.trim().toLowerCase()).filter(Boolean),
    );
    for (const job of aiJobs) {
      const url = job.url?.trim().toLowerCase();
      if (!url || !existingUrls.has(url)) {
        existingUrls.add(url ?? '');
        rawJobs.push(job);
      }
    }
    console.log(`[job-search] After merge: ${rawJobs.length} total jobs`);
  }

  // ── Normalize → filter dead URLs → score ─────────────────────────────
  const normalizedJobs = await filterDeadJobUrls(
    rawJobs.map(job => normalizeRawJob(job)).filter(shouldKeepJob),
    fetchImpl,
  );

  const MIN_SCORE = 50;
  const scored = normalizedJobs
    .filter(j => j.title && j.company)
    .map((j, i) => scoreJobAgainstProfile(j, candidateProfile, i))
    .filter(j => j.matchScore >= MIN_SCORE);
  scored.sort((a, b) => b.matchScore - a.matchScore);

  if (seenUrls) {
    for (const j of scored) {
      j.isNew = !seenUrls.has(j.url ?? '');
    }
  }

  return {
    results: scored.slice(0, 20),
    candidateProfile,
    totalFound: scored.length,
  };
}
