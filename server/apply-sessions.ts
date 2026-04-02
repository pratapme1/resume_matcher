import type {
  ApplyAutomationMetrics,
  AnswerBankEntry,
  ApplicantProfile,
  ApplyPlanResponse,
  ApplySessionContextResponse,
  ApplySessionEvent,
  ApplySessionSummary,
  ApplySessionTraceEntry,
  ApplySessionStatus,
  DetectedControl,
  DetectedField,
  ExecutorMode,
  FieldSemanticType,
  PauseReason,
  PageSnapshot,
  PlannedAction,
  PortalType,
  JobLifecycleStatus,
  ResumeTemplateProfile,
  ReviewItem,
  TailoredResumeDocument,
  ValidationReport,
} from '../src/shared/types.ts';
import { detectPortalTypeFromUrl, isWidgetSupported } from './apply-capabilities.ts';
import { deriveApplicantProfile, mergeApplicantProfiles } from './application-profile.ts';
import { generateTailoredDocx } from './docx-render.ts';
import { badRequest, internalServerError, notFound, unauthorized } from './errors.ts';
import { isSupabaseConfigured } from './db/client.ts';
import {
  createApplication,
  findLatestApplicationForReplay,
  linkApplicationReplay,
  updateApplicationRunDetails,
  updateApplicationStatus,
  upsertJob,
  type ApplicationStatus,
} from './db/queries/applications.ts';
import { updateJobLifecycle } from './db/queries/jobs.ts';
import { logger } from './logger.ts';

type ApplySessionRecord = {
  id: string;
  userId?: string;
  applicationId?: string;
  jobId?: string;
  applyUrl: string;
  executorMode: ExecutorMode;
  portalType: PortalType;
  status: ApplySessionStatus;
  executorToken: string;
  createdAt: string;
  updatedAt: string;
  applicantProfile: ApplicantProfile;
  answerBank: AnswerBankEntry[];
  latestMessage?: string;
  latestScreenshot?: string | null;
  latestPauseReason?: PauseReason;
  latestPageUrl?: string;
  latestStepKind?: PageSnapshot['stepKind'];
  latestStepSignature?: string;
  filledCount: number;
  reviewItems: ReviewItem[];
  submitConfirmed: boolean;
  trace: ApplySessionTraceEntry[];
  resumeAsset: {
    filename: string;
    mimeType: string;
    base64: string;
  };
  experienceEntries: ApplySessionContextResponse['experienceEntries'];
  educationEntries: ApplySessionContextResponse['educationEntries'];
  projectEntries: ApplySessionContextResponse['projectEntries'];
  certificationEntries: ApplySessionContextResponse['certificationEntries'];
};

export const applySessions = new Map<string, ApplySessionRecord>();

function nowIso() {
  return new Date().toISOString();
}

function sanitizeFilename(input: string) {
  return input.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'resume';
}

function sessionSummary(session: ApplySessionRecord): ApplySessionSummary {
  return {
    id: session.id,
    applyUrl: session.applyUrl,
    executorMode: session.executorMode,
    portalType: session.portalType,
    status: session.status,
    reviewItems: session.reviewItems,
    latestMessage: session.latestMessage,
    latestScreenshot: session.latestScreenshot ?? null,
    latestPauseReason: session.latestPauseReason,
    latestPageUrl: session.latestPageUrl,
    latestStepKind: session.latestStepKind,
    latestStepSignature: session.latestStepSignature,
    filledCount: session.filledCount,
    reviewCount: session.reviewItems.length,
    submitConfirmed: session.submitConfirmed,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function buildApplySessionContext(tailoredResume: TailoredResumeDocument): ApplySessionContextResponse {
  return {
    experienceEntries: tailoredResume.experience.map((entry) => ({
      company: entry.company,
      title: entry.title,
      location: entry.location,
      dates: entry.dates,
    })),
    educationEntries: tailoredResume.education.map((entry) => ({
      institution: entry.institution,
      degree: entry.degree,
      location: entry.location,
      dates: entry.dates,
    })),
    projectEntries: tailoredResume.projects.map((entry) => ({
      name: entry.name,
      description: entry.description,
    })),
    certificationEntries: tailoredResume.certifications.map((entry) => ({
      name: entry,
    })),
  };
}

function updateSession(session: ApplySessionRecord, patch: Partial<ApplySessionRecord>) {
  Object.assign(session, patch, { updatedAt: nowIso() });
}

function pushTrace(
  session: ApplySessionRecord,
  entry: Omit<ApplySessionTraceEntry, 'id' | 'at'>,
) {
  if (!Array.isArray(session.trace)) {
    session.trace = [];
  }
  session.trace.push({
    id: crypto.randomUUID(),
    at: nowIso(),
    ...entry,
  });
  if (session.trace.length > 200) {
    session.trace = session.trace.slice(-200);
  }
}

function inferSemanticType(field: DetectedField): FieldSemanticType {
  if (field.semanticHint && field.semanticHint !== 'unknown') {
    return field.semanticHint;
  }
  const text = [field.label, field.name, field.placeholder].join(' ').toLowerCase();
  if (field.inputType === 'file') {
    if (/cover\s*letter/.test(text)) return 'cover_letter_upload';
    return 'resume_upload';
  }
  if (field.inputType === 'email') return 'email';
  if (field.inputType === 'tel') return 'phone';
  if (/first\s*name|given\s*name|fname/.test(text)) return 'first_name';
  if (/last\s*name|surname|family\s*name|lname/.test(text)) return 'last_name';
  if (/full\s*name|your\s*name|applicant\s*name/.test(text) || /^name$/.test(text.trim())) return 'full_name';
  if (/email/.test(text)) return 'email';
  if (/phone|mobile|tel|contact/.test(text)) return 'phone';
  if (/linkedin|linked[\s_-]*in/.test(text)) return 'linkedin';
  if (/github|git[\s_-]*hub/.test(text)) return 'github';
  if (/portfolio|project[\s_-]*(url|link)|portfolio[\s_/-]*github/.test(text)) return 'portfolio';
  if (/website|personal[\s_-]*(site|website)|homepage|blog/.test(text)) return 'website';
  if (/current[\s_-]*(company|employer)|present[\s_-]*(company|employer)|company[\s_-]*name|currentemployer|employername/.test(text)) return 'current_company';
  if (/current[\s_-]*(title|role|designation)|present[\s_-]*(title|role|designation)|job[\s_-]*title|designation/.test(text)) return 'current_title';
  if (/total[\s_-]*experience|years?[\s_-]*of[\s_-]*experience|experience[\s_-]*\(years\)|experience[\s_-]*in[\s_-]*years|yearsexperience|totalexperience|experienceyears/.test(text)) return 'years_of_experience';
  if (/current[\s_-]*(ctc|salary|compensation|package)|salary[\s_-]*current|currentcompensation/.test(text)) return 'current_ctc';
  if (/expected[\s_-]*(ctc|salary|compensation|package)|salary[\s_-]*expectation|compensation[\s_-]*expectation|expectedcompensation/.test(text)) return 'expected_ctc';
  if (/notice[\s_-]*period|serving[\s_-]*notice|notice[\s_-]*days|availability[\s_-]*(days|period)/.test(text)) return 'notice_period';
  if (/work[\s_-]*authorization|authorized[\s_-]*to[\s_-]*work|legally[\s_-]*authorized|work[\s_-]*permit|citizenship[\s_-]*status/.test(text)) return 'work_authorization';
  if (/sponsorship|require[\s_-]*visa|visa[\s_-]*sponsorship|need[\s_-]*sponsorship/.test(text)) return 'requires_sponsorship';
  if (/visa[\s_-]*status|current[\s_-]*visa|work[\s_-]*visa/.test(text)) return 'visa_status';
  if (/gender|sex/.test(text)) return 'gender';
  if (/\b(current\s*location|preferred\s*location|location|city|address|town|state)\b/.test(text) || /currentlocation|preferredlocation/.test(text)) return 'location';
  return 'unknown';
}

function normalizePhone(phone?: string) {
  if (!phone) return undefined;
  const digits = phone.replace(/\D+/g, '');
  if (digits.length > 10) return digits.slice(-10);
  return digits || undefined;
}

function normStr(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9\s\-+]/g, '');
}

function extractNums(s: string): number[] {
  return (s.match(/\d+(\.\d+)?/g) ?? []).map(Number);
}

/**
 * Extract a numeric range from a string, handling open-ended "+" ranges.
 * "10+" → [10, Infinity]
 * "5-8 yrs" → [5, 8]
 * "5 years" → [5, 5]
 */
function extractRange(s: string): [number, number] | null {
  const plusMatch = s.match(/(\d+(?:\.\d+)?)\s*\+/);
  if (plusMatch) return [Number(plusMatch[1]), Infinity];
  const rangeMatch = s.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (rangeMatch) return [Number(rangeMatch[1]), Number(rangeMatch[2])];
  const numMatch = s.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) return [Number(numMatch[1]), Number(numMatch[1])];
  return null;
}

function rangesOverlap(a: number[], b: number[]): boolean {
  const minA = Math.min(...a), maxA = Math.max(...a);
  const minB = Math.min(...b), maxB = Math.max(...b);
  return minA <= maxB && minB <= maxA;
}

function jaccardWords(a: string, b: string): number {
  const wa = new Set(a.split(/\s+/).filter(Boolean));
  const wb = new Set(b.split(/\s+/).filter(Boolean));
  const inter = [...wa].filter((w) => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union === 0 ? 0 : inter / union;
}

function scoreOptionMatch(field: DetectedField, candidate: string): string | undefined {
  const options = field.options ?? [];
  if (!options.length) return undefined;
  const a = normStr(candidate);
  // Pure-number candidates (e.g., "0", "30") must not substring-match text options like "30 days"
  const isPureNumber = /^\d+(\.\d+)?$/.test(a);

  let bestValue: string | undefined;
  let bestScore = 0;

  for (const opt of options) {
    const b = normStr(opt.label);
    const bv = normStr(opt.value);
    let score = 0;

    if (a === b || a === bv) {
      score = 1.0;
    } else {
      const rangeA = extractRange(a);
      const rangeB = extractRange(b);
      if (rangeA && rangeB) {
        const [loA, hiA] = rangeA;
        const [loB, hiB] = rangeB;
        // Check if range A falls within range B (scalar or range candidate vs option range)
        if (loA >= loB && loA <= hiB) {
          // loA is at upper boundary of B (and not lower boundary) → slight penalty
          score = (loA === hiB && loA !== loB) ? 0.80 : 0.85;
        } else if (hiA >= loB && hiA <= hiB) {
          score = 0.80;
        } else if (loA <= hiB && hiA >= loB) {
          // partial overlap
          score = 0.80;
        }
      }
      if (score === 0 && !isPureNumber) {
        if (a.includes(b) || b.includes(a) || a.includes(bv) || bv.includes(a)) {
          score = 0.75;
        } else if (jaccardWords(a, b) > 0.5) {
          score = 0.6;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestValue = opt.value;
    }
  }

  return bestScore >= 0.6 ? bestValue : undefined;
}

/** Generate normalized candidate values for semantic types where profile strings don't match portal option text */
function normalizeCandidates(semanticType: FieldSemanticType, rawValue: string): string[] {
  const candidates: string[] = [rawValue];

  if (semanticType === 'years_of_experience') {
    const nums = extractNums(rawValue);
    if (nums.length) {
      const n = Math.round(nums[0]);
      candidates.push(`${n}`, `${n} years`, `${n} year`, `${n}+`);
      // Add common bracket labels the LLM-or-profile might match
      if (n <= 1) candidates.push('0-1', '0-1 years', 'less than 1', 'fresher');
      else if (n <= 3) candidates.push('1-3', '1-3 years', '2-3 years');
      else if (n <= 5) candidates.push('3-5', '3-5 years', '4-5 years');
      else if (n <= 8) candidates.push('5-8', '5-8 years', '5-7 years', '6-8 years');
      else if (n <= 10) candidates.push('8-10', '8-10 years', '8+ years');
      else candidates.push('10+', '10+ years', 'more than 10 years');
    }
  } else if (semanticType === 'notice_period') {
    const nums = extractNums(rawValue);
    if (nums.length) {
      const days = Math.round(nums[0]);
      if (days === 0) candidates.push('immediate', 'immediately', '0 days', 'ready to join', 'no notice');
      else if (days <= 15) candidates.push('15 days', '15 days or less', 'within 15 days', '2 weeks', '15');
      else if (days <= 30) candidates.push('30 days', '1 month', 'one month', '4 weeks', '30', 'one month or less');
      else if (days <= 60) candidates.push('60 days', '2 months', 'two months', '60');
      else if (days <= 90) candidates.push('90 days', '3 months', 'three months', '90');
    }
  } else if (semanticType === 'requires_sponsorship') {
    const v = rawValue.toLowerCase().trim();
    if (v === 'no' || v === 'false' || v === '0') {
      candidates.push('no', 'n', 'false', 'no sponsorship required', 'i do not require sponsorship');
    } else {
      candidates.push('yes', 'y', 'true', 'yes sponsorship required');
    }
  } else if (semanticType === 'work_authorization') {
    const v = rawValue.toLowerCase();
    if (v.includes('citizen') || v.includes('authorized') || v.includes('permanent') || v.includes('greencard') || v.includes('green card')) {
      candidates.push('yes', 'authorized', 'i am authorized', 'authorized to work');
    } else if (v.includes('visa') || v.includes('h1') || v.includes('opt') || v.includes('student')) {
      candidates.push('no', 'not authorized', 'require sponsorship');
    }
  } else if (semanticType === 'current_ctc' || semanticType === 'expected_ctc') {
    // Strip common suffixes: "12 LPA" → "12", "12.5 LPA" → "12.5"
    const nums = extractNums(rawValue);
    if (nums.length) candidates.push(String(nums[0]), String(Math.round(nums[0])));
  }

  return [...new Set(candidates)]; // deduplicate
}

/** Try answer bank first for select/radio fields, then fall back to option scoring with all candidate values */
function findBestOptionValue(
  field: DetectedField,
  rawValue: string,
  semanticType: FieldSemanticType,
  answerBank: AnswerBankEntry[],
  portalType: PortalType,
): string | undefined {
  // 1. Answer bank may store the exact option string from a previous application
  const banked = findAnswerBankValue(field, answerBank, portalType, semanticType);
  if (banked) {
    const exactBanked = scoreOptionMatch(field, banked);
    if (exactBanked) return exactBanked;
  }

  // 2. Try raw value + semantic-aware candidates
  const candidates = normalizeCandidates(semanticType, rawValue);
  for (const c of candidates) {
    const match = scoreOptionMatch(field, c);
    if (match) return match;
  }

  return undefined;
}

function normalizeAnswerPrompt(value?: string) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findAnswerBankValue(
  field: DetectedField,
  answerBank: AnswerBankEntry[],
  portalType: PortalType,
  semanticType: FieldSemanticType,
) {
  const promptCandidates = [
    field.label,
    field.placeholder,
    field.name,
    `${field.label} ${field.placeholder}`,
  ].map(normalizeAnswerPrompt).filter(Boolean);

  const matchingEntries = answerBank.filter((entry) => {
    const samePortal = !entry.portalType || entry.portalType === 'any' || entry.portalType === portalType;
    const sameSemantic = entry.semanticType ? entry.semanticType === semanticType : true;
    return samePortal && sameSemantic;
  });

  const byPrompt = matchingEntries.find((entry) =>
    promptCandidates.some((candidate) => candidate === entry.normalizedQuestion),
  );
  if (byPrompt) return byPrompt.answer;

  if (semanticType !== 'unknown') {
    const bySemantic = matchingEntries.find((entry) => entry.semanticType === semanticType);
    if (bySemantic) return bySemantic.answer;
  }

  const fuzzy = matchingEntries.find((entry) =>
    promptCandidates.some((candidate) =>
      candidate.includes(entry.normalizedQuestion) || entry.normalizedQuestion.includes(candidate),
    ),
  );
  return fuzzy?.answer;
}

type RepeaterSection = 'experience' | 'education' | 'project' | 'certification';
type RepeaterAttribute =
  | 'company'
  | 'title'
  | 'location'
  | 'dates'
  | 'institution'
  | 'degree'
  | 'name'
  | 'description';

function normalizeRepeaterIndex(rawIndex: number, source: string) {
  if (source.includes('[')) return rawIndex;
  return rawIndex > 0 ? rawIndex - 1 : rawIndex;
}

function parseRepeaterIndex(source: string, section: RepeaterSection) {
  const normalized = source.toLowerCase();
  const patterns = section === 'experience'
    ? [
        /experience\[(\d+)\]/,
        /work[_-]?experience\[(\d+)\]/,
        /employment(?:history)?\[(\d+)\]/,
        /experience[_-](\d+)[_-]/,
        /work[_-]?experience[_-](\d+)[_-]/,
        /employment(?:history)?[_-](\d+)[_-]/,
      ]
    : section === 'education'
    ? [
        /education\[(\d+)\]/,
        /school\[(\d+)\]/,
        /education[_-](\d+)[_-]/,
        /school[_-](\d+)[_-]/,
      ]
    : section === 'project'
    ? [
        /projects?\[(\d+)\]/,
        /portfolio[_-]?projects?\[(\d+)\]/,
        /projects?[_-](\d+)[_-]/,
        /portfolio[_-]?projects?[_-](\d+)[_-]/,
      ]
    : [
        /certifications?\[(\d+)\]/,
        /licenses?\[(\d+)\]/,
        /certifications?[_-](\d+)[_-]/,
        /licenses?[_-](\d+)[_-]/,
      ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return normalizeRepeaterIndex(Number(match[1]), source);
    }
  }

  return undefined;
}

function inferRepeaterAttribute(field: DetectedField, section: RepeaterSection): RepeaterAttribute | undefined {
  const combined = `${field.name} ${field.label} ${field.placeholder}`.toLowerCase();
  if (/location|city/.test(combined)) return 'location';
  if (/date|period|duration|from|to/.test(combined)) return 'dates';

  if (section === 'experience') {
    if (/company|employer|organization/.test(combined)) return 'company';
    if (/title|role|designation|position/.test(combined)) return 'title';
    return undefined;
  }

  if (section === 'education') {
    if (/institution|school|college|university/.test(combined)) return 'institution';
    if (/degree|qualification|program|course|major/.test(combined)) return 'degree';
    return undefined;
  }

  if (section === 'project') {
    if (/description|summary|overview|details/.test(combined)) return 'description';
    if (/name|project/.test(combined)) return 'name';
    return undefined;
  }

  if (/certification|certificate|license|licence|name/.test(combined)) return 'name';
  return undefined;
}

function findRepeaterFieldValue(
  field: DetectedField,
  session: ApplySessionRecord,
): { semanticType: FieldSemanticType; value?: string } | undefined {
  const sources = [field.name, field.label, field.placeholder].filter(Boolean);

  for (const source of sources) {
    const experienceIndex = parseRepeaterIndex(source, 'experience');
    if (typeof experienceIndex === 'number') {
      const attribute = inferRepeaterAttribute(field, 'experience');
      const entry = session.experienceEntries[experienceIndex];
      if (!entry || !attribute) continue;
      return {
        semanticType: 'unknown',
        value: entry[attribute],
      };
    }

    const educationIndex = parseRepeaterIndex(source, 'education');
    if (typeof educationIndex === 'number') {
      const attribute = inferRepeaterAttribute(field, 'education');
      const entry = session.educationEntries[educationIndex];
      if (!entry || !attribute) continue;
      return {
        semanticType: 'unknown',
        value: entry[attribute],
      };
    }

    const projectIndex = parseRepeaterIndex(source, 'project');
    if (typeof projectIndex === 'number') {
      const attribute = inferRepeaterAttribute(field, 'project');
      const entry = session.projectEntries[projectIndex];
      if (!entry || !attribute) continue;
      return {
        semanticType: 'unknown',
        value: entry[attribute],
      };
    }

    const certificationIndex = parseRepeaterIndex(source, 'certification');
    if (typeof certificationIndex === 'number') {
      const attribute = inferRepeaterAttribute(field, 'certification');
      const entry = session.certificationEntries[certificationIndex];
      if (!entry || !attribute) continue;
      return {
        semanticType: 'unknown',
        value: entry[attribute],
      };
    }
  }

  return undefined;
}

function getFieldValue(
  field: DetectedField,
  profile: ApplicantProfile,
  answerBank: AnswerBankEntry[],
  portalType: PortalType,
  session: ApplySessionRecord,
): { value?: string; semanticType: FieldSemanticType } {
  const repeaterValue = findRepeaterFieldValue(field, session);
  if (repeaterValue?.value) {
    return repeaterValue;
  }

  const semanticType = inferSemanticType(field);
  let value: string | undefined;
  switch (semanticType) {
    case 'full_name':
      value = profile.fullName;
      break;
    case 'first_name':
      value = profile.firstName;
      break;
    case 'last_name':
      value = profile.lastName;
      break;
    case 'email':
      value = profile.email;
      break;
    case 'phone':
      value = normalizePhone(profile.phone);
      break;
    case 'linkedin':
      value = profile.linkedin;
      break;
    case 'github':
      value = profile.github;
      break;
    case 'portfolio':
      value = profile.portfolio ?? profile.github ?? profile.website;
      break;
    case 'website':
      value = profile.website ?? profile.portfolio ?? profile.github;
      break;
    case 'location':
    case 'city':
      value = profile.location;
      break;
    case 'current_company':
      value = profile.currentCompany;
      break;
    case 'current_title':
      value = profile.currentTitle;
      break;
    case 'years_of_experience':
      value = profile.yearsOfExperience;
      break;
    case 'current_ctc':
      value = profile.currentCtcLpa;
      break;
    case 'expected_ctc':
      value = profile.expectedCtcLpa;
      break;
    case 'notice_period':
      value = profile.noticePeriodDays;
      break;
    case 'work_authorization':
      value = profile.workAuthorization;
      break;
    case 'requires_sponsorship':
      value = profile.requiresSponsorship;
      break;
    case 'visa_status':
      value = profile.visaStatus;
      break;
    case 'gender':
      value = profile.gender;
      break;
    default:
      value = undefined;
  }

  return {
    semanticType,
    value: value ?? findAnswerBankValue(field, answerBank, portalType, semanticType),
  };
}

function getAdvanceControl(controls: DetectedControl[]) {
  return controls.find((control) => control.kind === 'next' || control.kind === 'review');
}

function getSubmitControl(controls: DetectedControl[]) {
  return controls.find((control) => control.kind === 'submit');
}

function parseApplyUrlMetadata(applyUrl: string, portalType: PortalType) {
  try {
    const parsed = new URL(applyUrl);
    return {
      sourceHost: parsed.hostname,
      sourceType: portalType === 'generic' || portalType === 'unknown' ? 'direct' : portalType,
      verifiedSource: portalType !== 'unknown' && portalType !== 'protected',
      lastVerifiedAt: nowIso(),
    };
  } catch {
    return {
      sourceHost: undefined,
      sourceType: portalType === 'generic' || portalType === 'unknown' ? 'direct' : portalType,
      verifiedSource: false,
      lastVerifiedAt: undefined,
    };
  }
}

function normalizeFieldPrompt(...parts: Array<string | undefined>) {
  return parts
    .map((part) => normalizeAnswerPrompt(part))
    .find(Boolean) ?? '';
}

function extractFieldAnswer(field: DetectedField): string | undefined {
  if (field.inputType === 'checkbox') {
    return typeof field.checked === 'boolean' ? (field.checked ? 'Yes' : 'No') : undefined;
  }
  const directValue = (field.value ?? '').trim();
  if (directValue) return directValue;
  if (field.hasValue && typeof field.checked === 'boolean') {
    return field.checked ? 'Yes' : 'No';
  }
  return undefined;
}

function applyProfileUpdate(
  profileUpdates: Partial<ApplicantProfile>,
  semanticType: FieldSemanticType,
  value: string,
) {
  switch (semanticType) {
    case 'full_name':
      profileUpdates.fullName = value;
      break;
    case 'first_name':
      profileUpdates.firstName = value;
      break;
    case 'last_name':
      profileUpdates.lastName = value;
      break;
    case 'email':
      profileUpdates.email = value;
      break;
    case 'phone':
      profileUpdates.phone = value;
      break;
    case 'linkedin':
      profileUpdates.linkedin = value;
      break;
    case 'github':
      profileUpdates.github = value;
      break;
    case 'portfolio':
      profileUpdates.portfolio = value;
      break;
    case 'website':
      profileUpdates.website = value;
      break;
    case 'location':
    case 'city':
      profileUpdates.location = value;
      break;
    case 'current_company':
      profileUpdates.currentCompany = value;
      break;
    case 'current_title':
      profileUpdates.currentTitle = value;
      break;
    case 'years_of_experience':
      profileUpdates.yearsOfExperience = value;
      break;
    case 'current_ctc':
      profileUpdates.currentCtcLpa = value;
      break;
    case 'expected_ctc':
      profileUpdates.expectedCtcLpa = value;
      break;
    case 'notice_period':
      profileUpdates.noticePeriodDays = value;
      break;
    case 'work_authorization':
      profileUpdates.workAuthorization = value;
      break;
    case 'requires_sponsorship':
      profileUpdates.requiresSponsorship = value;
      break;
    case 'visa_status':
      profileUpdates.visaStatus = value;
      break;
    case 'gender':
      profileUpdates.gender = value;
      break;
    default:
      break;
  }
}

export async function createApplySession(params: {
  applyUrl: string;
  userId?: string;
  tailoredResume: TailoredResumeDocument;
  templateProfile: ResumeTemplateProfile;
  validation: ValidationReport;
  applicationProfile?: Partial<ApplicantProfile> | null;
  answerBank?: AnswerBankEntry[] | null;
  executorMode?: Extract<ExecutorMode, 'extension' | 'local_agent'>;
  job?: {
    title?: string;
    company?: string;
    location?: string;
    description?: string;
  };
}): Promise<{ session: ApplySessionSummary; executorToken: string }> {
  const createdAt = nowIso();
  const portalType = detectPortalTypeFromUrl(params.applyUrl);
  const executorMode: ExecutorMode = params.executorMode ?? 'extension';
  const id = crypto.randomUUID();
  const executorToken = crypto.randomUUID();

  let buffer: Buffer;
  try {
    buffer = await generateTailoredDocx(params.tailoredResume, params.templateProfile);
  } catch (error) {
    throw internalServerError('Failed to prepare resume for apply session.', 'DOCX_RENDER_FAILED', {
      cause: error,
      logMessage: 'Unable to render tailored resume while creating apply session.',
    });
  }

  const personName = sanitizeFilename(params.tailoredResume.contactInfo?.name ?? 'Resume');
  const filename = `${personName}_${Date.now()}.docx`;
  const session: ApplySessionRecord = {
    id,
    userId: params.userId,
    applyUrl: params.applyUrl,
    executorMode,
    portalType,
    status: 'created',
    executorToken,
    createdAt,
    updatedAt: createdAt,
    applicantProfile: mergeApplicantProfiles(
      deriveApplicantProfile({ tailoredResume: params.tailoredResume }),
      params.applicationProfile,
    ),
    answerBank: params.answerBank ?? [],
    latestMessage: 'Apply session created.',
    latestScreenshot: null,
    latestPauseReason: 'none',
    latestPageUrl: params.applyUrl,
    latestStepKind: 'unknown',
    latestStepSignature: undefined,
    filledCount: 0,
    reviewItems: [],
    submitConfirmed: false,
    trace: [],
    resumeAsset: {
      filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      base64: buffer.toString('base64'),
    },
    ...buildApplySessionContext(params.tailoredResume),
  };

  pushTrace(session, {
    source: 'system',
    event: 'created',
    status: 'created',
    message: 'Apply session created.',
    portalType,
    pageUrl: params.applyUrl,
  });

  applySessions.set(id, session);

  if (params.userId && isSupabaseConfigured()) {
    const userId = params.userId;
    const applyUrl = params.applyUrl;
    const sourceMetadata = parseApplyUrlMetadata(applyUrl, portalType);
    Promise.resolve()
      .then(async () => {
        const jobId = await upsertJob(userId, {
          url: applyUrl,
          applyUrl,
          title: params.job?.title,
          company: params.job?.company,
          location: params.job?.location,
          description: params.job?.description,
          sourceHost: sourceMetadata.sourceHost,
          sourceType: sourceMetadata.sourceType,
          verifiedSource: sourceMetadata.verifiedSource,
          lastVerifiedAt: sourceMetadata.lastVerifiedAt,
          lifecycleStatus: 'queued',
          lastSeenAt: createdAt,
          lastAppliedAt: createdAt,
        });
        session.jobId = jobId;
        const previousApplication = await findLatestApplicationForReplay(userId, { applyUrl, jobId });
        const retryCount = (previousApplication?.retryCount ?? -1) + 1;
        const applicationId = await createApplication(userId, jobId, id, applyUrl, 'queued', {
          retryCount,
          replayOfApplicationId: previousApplication?.id ?? null,
        });
        if (previousApplication?.id) {
          await linkApplicationReplay(previousApplication.id, applicationId, userId);
        }
        session.applicationId = applicationId;
        await updateApplicationRunDetails(applicationId, {
          trace: session.trace,
          lastStepKind: session.latestStepKind,
          portalType: session.portalType,
          executorMode: session.executorMode,
        }, userId);
        await updateJobLifecycle(userId, jobId, 'queued', { applyUrl });
      })
      .catch((err) => logger.error({ err }, 'Failed to persist apply session to DB'));
  }

  return { session: sessionSummary(session), executorToken };
}

export function getApplySessionForUser(sessionId: string, userId?: string): ApplySessionSummary {
  const session = applySessions.get(sessionId);
  if (!session || (session.userId && userId && session.userId !== userId)) {
    throw notFound('Apply session not found.', 'NOT_FOUND');
  }
  if (!session) {
    throw notFound('Apply session not found.', 'NOT_FOUND');
  }
  return sessionSummary(session);
}

export function getApplySessionForExecutor(sessionId: string, executorToken: string): ApplySessionSummary {
  return sessionSummary(getApplySessionByToken(sessionId, executorToken));
}

function getApplySessionByToken(sessionId: string, executorToken: string): ApplySessionRecord {
  const session = applySessions.get(sessionId);
  if (!session) {
    throw notFound('Apply session not found.', 'NOT_FOUND');
  }
  if (session.executorToken !== executorToken) {
    throw unauthorized('Invalid executor token.', 'UNAUTHENTICATED');
  }
  return session;
}

function reviewReasonToPauseReason(reason: string): PauseReason {
  if (/unsupported widget/i.test(reason)) return 'unsupported_widget';
  if (/missing from the applicant profile/i.test(reason)) return 'missing_profile_value';
  if (/ambiguous/i.test(reason)) return 'ambiguous_required_field';
  return 'manual_required';
}

function statusToJobLifecycle(status: ApplySessionStatus, pauseReason?: PauseReason): JobLifecycleStatus | null {
  if (status === 'created' || status === 'queued') return 'queued';
  if (status === 'starting' || status === 'filling' || status === 'ready_to_submit' || status === 'submitting') return 'applying';
  if (status === 'submitted') return 'applied';
  if (status === 'protected' || status === 'unsupported') return 'manual_required';
  if (status === 'review_required' || status === 'manual_required') {
    if (pauseReason === 'protected_portal') return 'manual_required';
    return 'manual_required';
  }
  if (status === 'failed') return 'failed';
  return null;
}

function syncJobLifecycle(session: ApplySessionRecord, status: ApplySessionStatus) {
  if (!session.userId || !session.jobId || !isSupabaseConfigured()) return;
  const lifecycleStatus = statusToJobLifecycle(status, session.latestPauseReason);
  if (!lifecycleStatus) return;

  Promise.resolve()
    .then(async () => {
      await updateJobLifecycle(session.userId!, session.jobId!, lifecycleStatus, {
        applyUrl: session.applyUrl,
      });
    })
    .catch((err) => logger.error({ err }, 'Failed to sync job lifecycle from apply-session state.'));
}

function persistApplicationRunState(session: ApplySessionRecord) {
  if (!session.userId || !isSupabaseConfigured()) return;

  Promise.resolve()
    .then(async () => {
      const { getApplicationBySessionId } = await import('./db/queries/applications.ts');
      const application = session.applicationId
        ? { id: session.applicationId, userId: session.userId }
        : await getApplicationBySessionId(session.id);
      if (!application) return;
      if (!session.applicationId && application.id) {
        session.applicationId = application.id;
      }
      if (!session.jobId && 'jobId' in application && typeof application.jobId === 'string') {
        session.jobId = application.jobId;
      }
      await updateApplicationRunDetails(application.id, {
        trace: session.trace,
        lastStepKind: session.latestStepKind,
        portalType: session.portalType,
        executorMode: session.executorMode,
      }, application.userId);
    })
    .catch((err) => logger.error({ err }, 'Failed to persist apply-session run details.'));
}

export function planApplySnapshot(sessionId: string, executorToken: string, snapshot: PageSnapshot): ApplyPlanResponse {
  const session = getApplySessionByToken(sessionId, executorToken);
  const actions: PlannedAction[] = [];
  const reviewItems: ReviewItem[] = [];
  const effectivePortalType = snapshot.portalType === 'unknown' ? session.portalType : snapshot.portalType;

  for (const field of snapshot.fields) {
    if (field.reviewOnlyReason) {
      const fieldAlreadySatisfied = Boolean(field.hasValue || field.checked || (field.value ?? '').trim());
      if (!fieldAlreadySatisfied && field.required) {
        reviewItems.push({
          fieldId: field.id,
          label: field.label || field.name || field.placeholder || 'Required field',
          reason: field.reviewOnlyReason,
          required: true,
        });
      }
      continue;
    }

    const { semanticType, value } = getFieldValue(field, session.applicantProfile, session.answerBank, session.portalType, session);
    const fieldAlreadySatisfied = Boolean(field.hasValue || field.checked || (field.value ?? '').trim());
    const widgetSupported = isWidgetSupported(effectivePortalType, field.widgetKind, session.executorMode);

    if (!widgetSupported) {
      if (!fieldAlreadySatisfied && field.required) {
        reviewItems.push({
          fieldId: field.id,
          label: field.label || field.name || field.placeholder || 'Required field',
          reason: `Unsupported widget for ${effectivePortalType} flows.`,
          required: true,
        });
      }
      continue;
    }

    if (semanticType === 'resume_upload') {
      if (!field.hasValue) {
        actions.push({
          type: 'upload',
          fieldId: field.id,
          filename: session.resumeAsset.filename,
          mimeType: session.resumeAsset.mimeType,
          base64: session.resumeAsset.base64,
          semanticType,
        });
      }
      continue;
    }

    if (!value) {
      if (fieldAlreadySatisfied) {
        continue;
      }
      if (field.required) {
        reviewItems.push({
          fieldId: field.id,
          label: field.label || field.name || field.placeholder || 'Required field',
          reason: semanticType === 'unknown' ? 'Unsupported or ambiguous required field.' : 'Required value is missing from the applicant profile.',
          required: true,
        });
      }
      continue;
    }

    if (field.inputType === 'checkbox') {
      actions.push({ type: 'toggle', fieldId: field.id, checked: Boolean(value), semanticType });
      continue;
    }

    if (
      field.tagName === 'select'
      || field.inputType === 'select-one'
      || field.widgetKind === 'custom_combobox'
      || field.widgetKind === 'custom_multiselect'
      || field.widgetKind === 'custom_card_group'
    ) {
      if (
        field.widgetKind === 'custom_multiselect'
        || field.widgetKind === 'custom_combobox'
        || field.widgetKind === 'custom_card_group'
      ) {
        // Both local_agent and extension can handle these (capabilities already gated above)
        actions.push({ type: 'select', fieldId: field.id, value, semanticType });
        continue;
      }
      const optionValue = findBestOptionValue(field, value, semanticType, session.answerBank, effectivePortalType);
      if (optionValue) {
        actions.push({ type: 'select', fieldId: field.id, value: optionValue, semanticType });
      } else if (field.required) {
        reviewItems.push({
          fieldId: field.id,
          label: field.label || field.name || 'Required select field',
          reason: 'A supported value exists, but no matching option was found.',
          required: true,
        });
      }
      continue;
    }

    if (field.inputType === 'radio') {
      const optionValue = findBestOptionValue(field, value, semanticType, session.answerBank, effectivePortalType);
      if (optionValue) {
        actions.push({ type: 'select', fieldId: field.id, value: optionValue, semanticType });
      } else if (field.required) {
        reviewItems.push({
          fieldId: field.id,
          label: field.label || field.name || 'Required radio field',
          reason: 'A supported value exists, but no matching radio option was found.',
          required: true,
        });
      }
      continue;
    }

    actions.push({
      type: 'fill',
      fieldId: field.id,
      value,
      semanticType,
    });
  }

  const submitControl = getSubmitControl(snapshot.controls);
  const advanceControl = getAdvanceControl(snapshot.controls);
  const pauseReason: PauseReason = reviewItems.length > 0
    ? reviewReasonToPauseReason(reviewItems[0]?.reason ?? '')
    : 'none';
  const status: ApplySessionStatus = reviewItems.length > 0
    ? 'review_required'
    : submitControl
    ? 'ready_to_submit'
    : 'filling';

  updateSession(session, {
    status,
    latestMessage: reviewItems.length > 0
      ? 'Review required before continuing.'
      : submitControl
      ? 'Ready to submit.'
      : actions.length > 0 && advanceControl
      ? 'Continuing to the next step.'
      : 'Filling application form.',
    latestPauseReason: pauseReason,
    latestPageUrl: snapshot.url,
    latestStepKind: snapshot.stepKind,
    latestStepSignature: snapshot.stepSignature,
    portalType: effectivePortalType,
    reviewItems,
  });

  pushTrace(session, {
    source: 'planner',
    event: 'plan_generated',
    status,
    message: reviewItems.length > 0 ? 'Planner produced review items.' : 'Planner produced actions.',
    portalType: effectivePortalType,
    pauseReason,
    pageUrl: snapshot.url,
    stepKind: snapshot.stepKind,
    stepSignature: snapshot.stepSignature,
    filledCount: actions.length,
    reviewCount: reviewItems.length,
    actionCount: actions.length,
  });

  persistApplicationRunState(session);

  return {
    portalType: effectivePortalType,
    status,
    pauseReason,
    actions,
    reviewItems,
    nextControlId: reviewItems.length === 0 ? advanceControl?.id : undefined,
    submitControlId: submitControl?.id,
  };
}

export function recordApplySessionEvent(sessionId: string, executorToken: string, event: ApplySessionEvent): ApplySessionSummary {
  const session = getApplySessionByToken(sessionId, executorToken);
  updateSession(session, {
    status: event.status ?? session.status,
    latestMessage: event.message ?? session.latestMessage,
    latestScreenshot: event.screenshot ?? session.latestScreenshot,
    latestPauseReason: event.pauseReason ?? session.latestPauseReason,
    latestPageUrl: event.pageUrl ?? session.latestPageUrl,
    latestStepKind: event.stepKind ?? session.latestStepKind,
    latestStepSignature: event.stepSignature ?? session.latestStepSignature,
    filledCount: event.filledCount ?? session.filledCount,
    reviewItems: event.reviewItems ?? session.reviewItems,
    portalType: event.portalType ?? session.portalType,
  });

  pushTrace(session, {
    source: 'executor',
    event: 'executor_event',
    status: event.status ?? session.status,
    message: event.message,
    portalType: event.portalType ?? session.portalType,
    pauseReason: event.pauseReason,
    pageUrl: event.pageUrl,
    stepKind: event.stepKind,
    stepSignature: event.stepSignature,
    filledCount: event.filledCount,
    reviewCount: event.reviewItems?.length,
  });

  const eventStatus = event.status ?? session.status;
  persistApplicationRunState(session);
  syncJobLifecycle(session, eventStatus);

  const applicationStatus: ApplicationStatus | null =
    eventStatus === 'created' || eventStatus === 'queued'
      ? 'queued'
      : eventStatus === 'starting' || eventStatus === 'filling' || eventStatus === 'submitting'
      ? 'in_progress'
      : eventStatus === 'ready_to_submit' || eventStatus === 'review_required'
      ? 'review'
      : eventStatus === 'submitted'
      ? 'applied'
      : eventStatus === 'protected' || eventStatus === 'unsupported' || eventStatus === 'manual_required'
      ? 'manual_required'
      : eventStatus === 'failed'
      ? 'failed'
      : null;

  if (applicationStatus && isSupabaseConfigured()) {
    Promise.resolve()
      .then(async () => {
        const { getApplicationBySessionId } = await import('./db/queries/applications.ts');
        const application = await getApplicationBySessionId(sessionId);
        if (application) {
          await updateApplicationStatus(
            application.id,
            applicationStatus,
            undefined,
            eventStatus === 'failed' ? (event.message ?? undefined) : undefined,
            application.userId,
            event.pauseReason ?? undefined,
            event.message ?? undefined,
          );
        }
      })
      .catch((err) => logger.error({ err }, 'Failed to sync application status from apply-session event'));
  }
  return sessionSummary(session);
}

export function setApplySessionExecutorMode(
  sessionId: string,
  executorToken: string,
  executorMode: Extract<ExecutorMode, 'extension' | 'local_agent'>,
  message?: string,
): ApplySessionSummary {
  const session = getApplySessionByToken(sessionId, executorToken);
  updateSession(session, {
    executorMode,
    latestMessage: message ?? session.latestMessage,
  });
  pushTrace(session, {
    source: 'system',
    event: 'executor_mode_changed',
    status: session.status,
    message: message ?? `Executor switched to ${executorMode}.`,
    portalType: session.portalType,
    pageUrl: session.latestPageUrl ?? session.applyUrl,
  });
  persistApplicationRunState(session);
  return sessionSummary(session);
}

export function confirmApplySessionSubmit(sessionId: string, userId?: string): ApplySessionSummary {
  const session = applySessions.get(sessionId);
  if (!session || (session.userId && userId && session.userId !== userId)) {
    throw notFound('Apply session not found.', 'NOT_FOUND');
  }
  updateSession(session, {
    submitConfirmed: true,
    status: 'submitting',
    latestMessage: 'Submit confirmed. Waiting for executor.',
    latestPauseReason: 'none',
  });
  pushTrace(session, {
    source: 'user',
    event: 'confirm_submit',
    status: 'submitting',
    message: 'User confirmed submit.',
    portalType: session.portalType,
    pageUrl: session.latestPageUrl,
    stepKind: session.latestStepKind,
    stepSignature: session.latestStepSignature,
  });
  persistApplicationRunState(session);
  syncJobLifecycle(session, 'submitting');
  return sessionSummary(session);
}

export function learnApplySessionCorrections(
  sessionId: string,
  userId: string | undefined,
  snapshot: PageSnapshot,
) {
  const session = applySessions.get(sessionId);
  if (!session || (session.userId && userId && session.userId !== userId)) {
    throw notFound('Apply session not found.', 'NOT_FOUND');
  }
  if (!session) {
    throw notFound('Apply session not found.', 'NOT_FOUND');
  }

  const profileUpdates: Partial<ApplicantProfile> = {};
  const learnedAnswerEntries: AnswerBankEntry[] = [];
  let learnedCount = 0;

  const reviewLookup = new Map<string, ReviewItem>();
  const reviewPrompts = new Set<string>();
  for (const item of session.reviewItems) {
    reviewLookup.set(item.fieldId, item);
    const normalized = normalizeFieldPrompt(item.label);
    if (normalized) reviewPrompts.add(normalized);
  }

  for (const field of snapshot.fields) {
    const normalizedPrompt = normalizeFieldPrompt(field.label, field.placeholder, field.name);
    const isReviewedField = reviewLookup.has(field.id) || (normalizedPrompt && reviewPrompts.has(normalizedPrompt));
    if (!isReviewedField) continue;

    const answer = extractFieldAnswer(field);
    if (!answer) continue;

    const semanticType = inferSemanticType(field);
    if (semanticType !== 'unknown' && semanticType !== 'resume_upload' && semanticType !== 'cover_letter_upload') {
      applyProfileUpdate(profileUpdates, semanticType, answer);
      learnedCount += 1;
      continue;
    }

    learnedAnswerEntries.push({
      id: crypto.randomUUID(),
      question: field.label || field.placeholder || field.name || 'Application question',
      normalizedQuestion: normalizedPrompt,
      answer,
      portalType: session.portalType === 'unknown' ? 'any' : session.portalType,
      semanticType,
      source: 'managed_browser',
      confidence: 'learned',
      usageCount: 0,
      lastUsedAt: nowIso(),
      updatedAt: nowIso(),
    });
    learnedCount += 1;
  }

  if (learnedCount === 0) {
    return {
      session: sessionSummary(session),
      profileUpdates: {},
      answerBank: session.answerBank,
      learnedCount: 0,
    };
  }

  const mergedProfile = mergeApplicantProfiles(session.applicantProfile, profileUpdates);
  const mergedAnswerBank = [
    ...session.answerBank.filter((existing) =>
      !learnedAnswerEntries.some((learned) =>
        learned.portalType === existing.portalType
        && learned.semanticType === existing.semanticType
        && learned.normalizedQuestion === existing.normalizedQuestion,
      ),
    ),
    ...learnedAnswerEntries,
  ].sort((left, right) => left.question.localeCompare(right.question));

  updateSession(session, {
    applicantProfile: mergedProfile,
    answerBank: mergedAnswerBank,
  });

  pushTrace(session, {
    source: 'user',
    event: 'learn',
    status: session.status,
    message: `Learned ${learnedCount} corrected answer${learnedCount === 1 ? '' : 's'}.`,
    portalType: session.portalType,
    pageUrl: snapshot.url,
    stepKind: snapshot.stepKind,
    stepSignature: snapshot.stepSignature,
    reviewCount: session.reviewItems.length,
  });

  persistApplicationRunState(session);

  return {
    session: sessionSummary(session),
    profileUpdates,
    answerBank: mergedAnswerBank,
    learnedCount,
  };
}

function outcomeToApplicationStatus(outcome: ApplySessionStatus): ApplicationStatus {
  if (outcome === 'submitted') return 'applied';
  if (outcome === 'protected' || outcome === 'unsupported' || outcome === 'manual_required') return 'manual_required';
  return 'failed';
}

export function completeApplySession(sessionId: string, executorToken: string, outcome: ApplySessionStatus, message?: string): ApplySessionSummary {
  const session = getApplySessionByToken(sessionId, executorToken);
  if (!['submitted', 'protected', 'unsupported', 'manual_required', 'failed'].includes(outcome)) {
    throw badRequest('Invalid apply-session outcome.', 'INVALID_REQUEST');
  }
  updateSession(session, {
    status: outcome,
    latestMessage: message ?? session.latestMessage,
    latestPauseReason: outcome === 'protected'
      ? 'protected_portal'
      : outcome === 'manual_required'
      ? (session.latestPauseReason && session.latestPauseReason !== 'none' ? session.latestPauseReason : 'manual_required')
      : 'none',
  });

  pushTrace(session, {
    source: 'system',
    event: 'completed',
    status: outcome,
    message: message ?? session.latestMessage,
    portalType: session.portalType,
    pauseReason: session.latestPauseReason,
    pageUrl: session.latestPageUrl,
    stepKind: session.latestStepKind,
    stepSignature: session.latestStepSignature,
  });

  persistApplicationRunState(session);
  syncJobLifecycle(session, outcome);

  const applicationStatus = outcomeToApplicationStatus(outcome);
  if (isSupabaseConfigured()) {
    Promise.resolve()
      .then(async () => {
        const { getApplicationBySessionId } = await import('./db/queries/applications.ts');
        const application = await getApplicationBySessionId(sessionId);
        if (application) {
          await updateApplicationStatus(
            application.id,
            applicationStatus,
            undefined,
            outcome === 'failed' ? (message ?? undefined) : undefined,
            application.userId,
            session.latestPauseReason ?? undefined,
            message ?? session.latestMessage,
          );
        }
      })
      .catch((err) => logger.error({ err }, 'Failed to update application status in DB'));
  }

  return sessionSummary(session);
}

export function getApplySessionTraceForUser(sessionId: string, userId?: string) {
  const session = applySessions.get(sessionId);
  if (!session || (session.userId && userId && session.userId !== userId)) {
    throw notFound('Apply session not found.', 'NOT_FOUND');
  }
  if (!session) {
    throw notFound('Apply session not found.', 'NOT_FOUND');
  }
  return {
    session: sessionSummary(session),
    trace: [...session.trace],
  };
}

export function getApplySessionContext(sessionId: string, executorToken: string): ApplySessionContextResponse {
  const session = getApplySessionByToken(sessionId, executorToken);
  return {
    experienceEntries: [...session.experienceEntries],
    educationEntries: [...session.educationEntries],
    projectEntries: [...session.projectEntries],
    certificationEntries: [...session.certificationEntries],
  };
}

export function getApplyAutomationMetricsForUser(userId?: string): ApplyAutomationMetrics {
  const sessionsForUser = [...applySessions.values()].filter((session) => !userId || !session.userId || session.userId === userId);
  const metrics: ApplyAutomationMetrics = {
    totalSessions: sessionsForUser.length,
    byStatus: {},
    byPortalType: {},
    byPauseReason: {},
    byExecutorMode: {},
  };

  for (const session of sessionsForUser) {
    metrics.byStatus[session.status] = (metrics.byStatus[session.status] ?? 0) + 1;
    metrics.byPortalType[session.portalType] = (metrics.byPortalType[session.portalType] ?? 0) + 1;
    const pauseReason = session.latestPauseReason ?? 'none';
    metrics.byPauseReason[pauseReason] = (metrics.byPauseReason[pauseReason] ?? 0) + 1;
    metrics.byExecutorMode[session.executorMode] = (metrics.byExecutorMode[session.executorMode] ?? 0) + 1;
  }

  return metrics;
}
