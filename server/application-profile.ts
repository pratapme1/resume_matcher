import type {
  AnswerBankConfidence,
  AnswerBankEntry,
  AnswerBankPortalScope,
  AnswerBankSource,
  ApplicantProfile,
  CandidateProfile,
  FieldSemanticType,
  TailoredResumeDocument,
} from '../src/shared/types.ts';

type ApplicationMemory = {
  profile: ApplicantProfile;
  answerBank: AnswerBankEntry[];
};

const inMemoryProfiles = new Map<string, ApplicationMemory>();

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function splitFullName(fullName?: string) {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || undefined,
    lastName: parts.slice(1).join(' ') || undefined,
  };
}

function assignIfPresent(target: ApplicantProfile, key: keyof ApplicantProfile, value: unknown) {
  const normalized = asTrimmedString(value);
  if (normalized !== undefined) {
    target[key] = normalized;
  }
}

export function normalizeAnswerBankQuestion(value?: string | null) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAnswerBankPortal(value?: string | null): AnswerBankPortalScope {
  const normalized = asTrimmedString(value);
  return (normalized ?? 'any') as AnswerBankPortalScope;
}

function normalizeAnswerBankSemanticType(value?: string | null): FieldSemanticType | undefined {
  const normalized = asTrimmedString(value);
  return normalized as FieldSemanticType | undefined;
}

function normalizeAnswerBankSource(value?: string | null): AnswerBankSource {
  const normalized = asTrimmedString(value);
  if (normalized === 'managed_browser' || normalized === 'resume_derived' || normalized === 'imported') {
    return normalized;
  }
  return 'user_saved';
}

function normalizeAnswerBankConfidence(value?: string | null): AnswerBankConfidence {
  const normalized = asTrimmedString(value);
  return normalized === 'learned' ? 'learned' : 'confirmed';
}

function inferYearsOfExperience(tailoredResume: TailoredResumeDocument): string | undefined {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // 1-12

  type Range = { startY: number; startM: number; endY: number; endM: number };
  const ranges: Range[] = [];

  for (const exp of tailoredResume.experience ?? []) {
    const dates = exp.dates ?? '';
    // Extract year-month pairs: "Jan 2020", "2020", "Present", "Current"
    const isPresentEnd = /present|current|now|till date/i.test(dates);
    const years = (dates.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number);
    if (years.length === 0) continue;

    const startY = Math.min(...years);
    const endY = isPresentEnd ? currentYear : Math.max(...years);

    // Try to parse month for start
    const monthNames: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };
    const monthMatches = dates.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/g) ?? [];
    const startM = monthMatches.length > 0 ? (monthNames[monthMatches[0]] ?? 1) : 1;
    const endM = isPresentEnd ? currentMonth : (monthMatches.length > 1 ? (monthNames[monthMatches[1]] ?? 12) : 12);

    ranges.push({ startY, startM, endY, endM });
  }

  if (ranges.length === 0) {
    // Fallback: parse from summary text
    const match = (tailoredResume.summary ?? '').match(/(\d+)\+?\s+years?/i);
    return match?.[1];
  }

  // Sort by start date and merge overlapping ranges to get total months
  ranges.sort((a, b) => a.startY * 12 + a.startM - (b.startY * 12 + b.startM));

  let totalMonths = 0;
  let mergedEndY = ranges[0].startY, mergedEndM = ranges[0].startM;

  for (const r of ranges) {
    const rStartAbs = r.startY * 12 + r.startM;
    const rEndAbs = r.endY * 12 + r.endM;
    const mergedEndAbs = mergedEndY * 12 + mergedEndM;

    if (rStartAbs > mergedEndAbs) {
      // Gap — add previous stretch
      totalMonths += mergedEndAbs - (mergedEndY * 12 + mergedEndM - totalMonths > 0 ? ranges[0].startY * 12 + ranges[0].startM : rStartAbs);
    }
    if (rEndAbs > mergedEndAbs) {
      mergedEndY = r.endY;
      mergedEndM = r.endM;
    }
  }

  // Simpler approach: just sum months of each range, then subtract overlaps
  let totalMs = 0;
  let coverEnd = 0;
  for (const r of ranges) {
    const s = r.startY * 12 + r.startM;
    const e = r.endY * 12 + r.endM;
    const effectiveStart = Math.max(s, coverEnd);
    if (e > effectiveStart) {
      totalMs += e - effectiveStart;
      coverEnd = Math.max(coverEnd, e);
    }
  }

  const years = Math.round(totalMs / 12);
  return String(Math.max(0, Math.min(40, years)));
}

export function sanitizeApplicantProfile(input?: Partial<ApplicantProfile> | null): ApplicantProfile {
  const sanitized: ApplicantProfile = {};
  if (!input) return sanitized;

  assignIfPresent(sanitized, 'fullName', input.fullName);
  assignIfPresent(sanitized, 'firstName', input.firstName);
  assignIfPresent(sanitized, 'lastName', input.lastName);
  assignIfPresent(sanitized, 'email', input.email);
  assignIfPresent(sanitized, 'phone', input.phone);
  assignIfPresent(sanitized, 'linkedin', input.linkedin);
  assignIfPresent(sanitized, 'github', input.github);
  assignIfPresent(sanitized, 'portfolio', input.portfolio);
  assignIfPresent(sanitized, 'website', input.website);
  assignIfPresent(sanitized, 'location', input.location);
  assignIfPresent(sanitized, 'currentCompany', input.currentCompany);
  assignIfPresent(sanitized, 'currentTitle', input.currentTitle);
  assignIfPresent(sanitized, 'yearsOfExperience', input.yearsOfExperience);
  assignIfPresent(sanitized, 'currentCtcLpa', input.currentCtcLpa);
  assignIfPresent(sanitized, 'expectedCtcLpa', input.expectedCtcLpa);
  assignIfPresent(sanitized, 'noticePeriodDays', input.noticePeriodDays);
  assignIfPresent(sanitized, 'workAuthorization', input.workAuthorization);
  assignIfPresent(sanitized, 'requiresSponsorship', input.requiresSponsorship);
  assignIfPresent(sanitized, 'visaStatus', input.visaStatus);
  assignIfPresent(sanitized, 'gender', input.gender);

  if (!sanitized.firstName && sanitized.fullName) {
    const split = splitFullName(sanitized.fullName);
    sanitized.firstName = split.firstName;
    sanitized.lastName = sanitized.lastName ?? split.lastName;
  }

  if (!sanitized.fullName && (sanitized.firstName || sanitized.lastName)) {
    sanitized.fullName = [sanitized.firstName, sanitized.lastName].filter(Boolean).join(' ') || undefined;
  }

  return sanitized;
}

export function sanitizeAnswerBank(entries?: AnswerBankEntry[] | null): AnswerBankEntry[] {
  const next: AnswerBankEntry[] = [];
  for (const entry of entries ?? []) {
    const question = asTrimmedString(entry?.question);
    const answer = asTrimmedString(entry?.answer);
    if (!question || !answer) continue;
    const normalizedQuestion = normalizeAnswerBankQuestion(question);
    if (!normalizedQuestion) continue;
    next.push({
      id: asTrimmedString(entry.id) ?? crypto.randomUUID(),
      question,
      normalizedQuestion,
      answer,
      portalType: normalizeAnswerBankPortal(entry.portalType),
      semanticType: normalizeAnswerBankSemanticType(entry.semanticType),
      source: normalizeAnswerBankSource(entry.source),
      confidence: normalizeAnswerBankConfidence(entry.confidence),
      usageCount: typeof entry.usageCount === 'number' && Number.isFinite(entry.usageCount)
        ? Math.max(0, Math.trunc(entry.usageCount))
        : 0,
      lastUsedAt: asTrimmedString(entry.lastUsedAt) ?? undefined,
      updatedAt: asTrimmedString(entry.updatedAt) ?? new Date().toISOString(),
    });
  }
  return next;
}

export function mergeAnswerBankEntries(...entrySets: Array<AnswerBankEntry[] | null | undefined>): AnswerBankEntry[] {
  const merged = new Map<string, AnswerBankEntry>();
  for (const entries of entrySets) {
    for (const entry of sanitizeAnswerBank(entries)) {
      const key = [
        entry.portalType ?? 'any',
        entry.semanticType ?? 'unknown',
        entry.normalizedQuestion,
      ].join('::');
      merged.set(key, entry);
    }
  }
  return Array.from(merged.values()).sort((left, right) => left.question.localeCompare(right.question));
}

export function mergeApplicantProfiles(...profiles: Array<Partial<ApplicantProfile> | null | undefined>): ApplicantProfile {
  return profiles.reduce<ApplicantProfile>((acc, profile) => {
    const next = sanitizeApplicantProfile(profile);
    return { ...acc, ...next };
  }, {});
}

export function deriveApplicantProfile(params: {
  tailoredResume?: TailoredResumeDocument | null;
  candidateProfile?: CandidateProfile | null;
}): ApplicantProfile {
  const tailoredResume = params.tailoredResume;
  if (!tailoredResume) {
    return sanitizeApplicantProfile({
      yearsOfExperience: params.candidateProfile?.yearsOfExperience ? String(params.candidateProfile.yearsOfExperience) : undefined,
    });
  }

  const fullName = asTrimmedString(tailoredResume.contactInfo?.name);
  const split = splitFullName(fullName);
  const latestExperience = tailoredResume.experience?.[0];

  return sanitizeApplicantProfile({
    fullName,
    firstName: split.firstName,
    lastName: split.lastName,
    email: tailoredResume.contactInfo?.email,
    phone: tailoredResume.contactInfo?.phone,
    linkedin: tailoredResume.contactInfo?.linkedin,
    location: tailoredResume.contactInfo?.location,
    currentCompany: latestExperience?.company,
    currentTitle: latestExperience?.title,
    yearsOfExperience: params.candidateProfile?.yearsOfExperience
      ? String(params.candidateProfile.yearsOfExperience)
      : inferYearsOfExperience(tailoredResume),
  });
}

export function getMemoryApplicationProfile(userId: string): ApplicantProfile | null {
  return inMemoryProfiles.get(userId)?.profile ?? null;
}

export function setMemoryApplicationProfile(userId: string, profile: Partial<ApplicantProfile>): ApplicantProfile {
  const sanitized = sanitizeApplicantProfile(profile);
  const existing = inMemoryProfiles.get(userId);
  inMemoryProfiles.set(userId, {
    profile: sanitized,
    answerBank: existing?.answerBank ?? [],
  });
  return sanitized;
}

export function getMemoryApplicationMemory(userId: string): ApplicationMemory {
  return inMemoryProfiles.get(userId) ?? { profile: {}, answerBank: [] };
}

export function setMemoryApplicationMemory(
  userId: string,
  input: {
    profile?: Partial<ApplicantProfile> | null;
    answerBank?: AnswerBankEntry[] | null;
  },
): ApplicationMemory {
  const existing = getMemoryApplicationMemory(userId);
  const next: ApplicationMemory = {
    profile: sanitizeApplicantProfile(input.profile ?? existing.profile),
    answerBank: input.answerBank ? sanitizeAnswerBank(input.answerBank) : existing.answerBank,
  };
  inMemoryProfiles.set(userId, next);
  return next;
}
