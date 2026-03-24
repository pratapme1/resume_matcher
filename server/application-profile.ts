import type { ApplicantProfile, CandidateProfile, TailoredResumeDocument } from '../src/shared/types.ts';

const inMemoryProfiles = new Map<string, ApplicantProfile>();

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

function inferYearsOfExperience(tailoredResume: TailoredResumeDocument): string | undefined {
  let earliestStart = Infinity;
  const currentYear = new Date().getFullYear();

  for (const exp of tailoredResume.experience ?? []) {
    const years = (exp.dates.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number);
    if (years.length === 0) continue;
    const start = Math.min(...years);
    if (start < earliestStart) earliestStart = start;
  }

  if (earliestStart < Infinity) {
    return String(Math.max(0, Math.min(40, currentYear - earliestStart)));
  }

  const summary = tailoredResume.summary ?? '';
  const match = summary.match(/(\d+)\+?\s+years?/i);
  return match?.[1];
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
  return inMemoryProfiles.get(userId) ?? null;
}

export function setMemoryApplicationProfile(userId: string, profile: Partial<ApplicantProfile>): ApplicantProfile {
  const sanitized = sanitizeApplicantProfile(profile);
  inMemoryProfiles.set(userId, sanitized);
  return sanitized;
}
