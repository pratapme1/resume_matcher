import type { AIClient } from './app.ts';
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
  };
}

// ─────────────────────────────────────────
// Build search prompt
// ─────────────────────────────────────────

function buildSearchPrompt(profile: CandidateProfile, prefs?: JobSearchPreferences): string {
  const locationHint = prefs?.location
    ? `Preferred location: ${prefs.location}`
    : profile.location
    ? `Candidate is based in: ${profile.location}`
    : 'No location preference specified (consider remote-friendly roles)';

  const remoteHint = prefs?.remotePreference && prefs.remotePreference !== 'any'
    ? `Remote preference: ${prefs.remotePreference}`
    : 'Open to remote, hybrid, or onsite';

  // Expand primary titles with close role variants so Gemini searches broadly
  const ROLE_VARIANTS: Record<string, string[]> = {
    // Product
    'product manager':     ['Product Manager', 'Senior Product Manager', 'Product Owner', 'Group Product Manager', 'Principal PM'],
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

  const expandedTitles = profile.primaryTitles.flatMap(t => {
    const key = t.toLowerCase().replace(/\s+/g, ' ').trim();
    for (const [pattern, variants] of Object.entries(ROLE_VARIANTS)) {
      if (key.includes(pattern) || pattern.includes(key)) return variants;
    }
    return [t]; // no expansion found, use as-is
  });
  const uniqueTitles = [...new Set(expandedTitles)].slice(0, 6);

  const roleHint = prefs?.roleType
    ? `Preferred role type: ${prefs.roleType}`
    : `Target roles (search for ALL of these): ${uniqueTitles.join(', ')}`;

  return `You are an expert technical recruiter searching for the best current job openings for a candidate.

Use Google Search to find 12–15 CURRENT open positions that match this candidate's profile. Search LinkedIn Jobs, Greenhouse, Lever, Indeed, Glassdoor, and company career pages. Prioritize roles posted in the last 30 days.

CANDIDATE PROFILE:
${JSON.stringify(profile, null, 2)}

SEARCH CONTEXT:
- ${locationHint}
- ${remoteHint}
- ${roleHint}
- Seniority: ${profile.seniorityLevel} (${profile.yearsOfExperience} years experience)
- Key skills: ${profile.topSkills.slice(0, 10).join(', ')}
- Industries: ${profile.industries.join(', ') || 'general tech'}

INSTRUCTIONS:
Search for open job postings that match this profile. Look for strong technical matches. For each job you find, extract the actual posting data.

Return ONLY a JSON code block in this exact format (no other text):

\`\`\`json
{
  "jobs": [
    {
      "title": "string",
      "company": "string",
      "location": "string (city, state or 'Remote')",
      "remoteType": "remote | hybrid | onsite | unknown",
      "url": "string (direct link to job posting if found)",
      "description": "string (2-3 sentence summary of the role)",
      "requiredSkills": ["string"],
      "niceToHaveSkills": ["string"],
      "estimatedSalary": "string or null",
      "postedDate": "string or null",
      "companyStage": "startup | growth | enterprise | unknown"
    }
  ]
}
\`\`\`

Find real, currently open positions. Do not fabricate job listings.`;
}

// ─────────────────────────────────────────
// Gemini search with Google grounding
// ─────────────────────────────────────────

interface RawJob {
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
}

async function searchJobsWithGemini(prompt: string, ai: AIClient): Promise<RawJob[]> {
  let responseText = '';
  try {
    const model = process.env.GEMINI_TAILOR_MODEL ?? 'gemini-3-flash-preview';
    const result = await (ai.models as any).generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
      },
    });
    responseText = result.text ?? '';
  } catch (err) {
    console.warn('[job-search] Gemini call failed:', err);
    return [];
  }

  // Extract JSON block
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

function scoreJobAgainstProfile(raw: RawJob, profile: CandidateProfile, idx: number): JobSearchResult {
  const title = raw.title ?? 'Unknown Role';
  const allProfileSkills = [...profile.topSkills, ...profile.technologiesAndTools];
  const required = raw.requiredSkills ?? [];
  const niceToHave = raw.niceToHaveSkills ?? [];

  const skillsOverlap = calcSkillsOverlap(raw, profile);
  const titleSimilarity = calcTitleSimilarity(title, profile);
  const seniorityFit = calcSeniorityFit(title, profile);
  const domainMatch = calcDomainMatch(raw, profile);

  const matchScore = Math.round(
    skillsOverlap * 0.40 +
    titleSimilarity * 0.25 +
    seniorityScore(seniorityFit) * 0.20 +
    domainMatch * 0.15
  );

  const topMatchingSkills = skillsIntersection(required, allProfileSkills).slice(0, 5);
  const keyGaps = required
    .filter(rs => !skillsIntersection([rs], allProfileSkills).length)
    .slice(0, 3);

  let overallFit: JobMatchBreakdown['overallFit'];
  if (matchScore >= 80) overallFit = 'strong';
  else if (matchScore >= 60) overallFit = 'good';
  else if (matchScore >= 40) overallFit = 'moderate';
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
    description: raw.description ?? '',
    requiredSkills: required,
    niceToHaveSkills: niceToHave,
    estimatedSalary: raw.estimatedSalary ?? undefined,
    matchScore,
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
  };
}

// ─────────────────────────────────────────
// Main export
// ─────────────────────────────────────────

export async function searchJobs(
  resume: SourceResumeDocument,
  prefs: JobSearchPreferences | undefined,
  ai: AIClient,
): Promise<JobSearchResponse> {
  const candidateProfile = buildCandidateProfile(resume);
  const prompt = buildSearchPrompt(candidateProfile, prefs);
  const rawJobs = await searchJobsWithGemini(prompt, ai);
  const scored = rawJobs
    .filter(j => j.title && j.company)
    .map((j, i) => scoreJobAgainstProfile(j, candidateProfile, i));
  scored.sort((a, b) => b.matchScore - a.matchScore);
  return {
    results: scored.slice(0, 15),
    candidateProfile,
    totalFound: scored.length,
  };
}
