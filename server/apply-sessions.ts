import type {
  ApplicantProfile,
  ApplyPlanResponse,
  ApplySessionEvent,
  ApplySessionSummary,
  ApplySessionStatus,
  DetectedControl,
  DetectedField,
  ExecutorMode,
  FieldSemanticType,
  PageSnapshot,
  PlannedAction,
  PortalType,
  ResumeTemplateProfile,
  ReviewItem,
  TailoredResumeDocument,
  ValidationReport,
} from '../src/shared/types.ts';
import { generateTailoredDocx } from './docx-render.ts';
import { badRequest, internalServerError, notFound, unauthorized } from './errors.ts';

type ApplySessionRecord = {
  id: string;
  userId?: string;
  applyUrl: string;
  executorMode: ExecutorMode;
  portalType: PortalType;
  status: ApplySessionStatus;
  executorToken: string;
  createdAt: string;
  updatedAt: string;
  applicantProfile: ApplicantProfile;
  latestMessage?: string;
  latestScreenshot?: string | null;
  latestPageUrl?: string;
  filledCount: number;
  reviewItems: ReviewItem[];
  submitConfirmed: boolean;
  resumeAsset: {
    filename: string;
    mimeType: string;
    base64: string;
  };
};

const applySessions = new Map<string, ApplySessionRecord>();

function nowIso() {
  return new Date().toISOString();
}

function sanitizeFilename(input: string) {
  return input.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'resume';
}

function firstAndLastName(fullName?: string) {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: undefined, lastName: undefined };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ') || undefined,
  };
}

function detectPortalType(applyUrl: string): PortalType {
  try {
    const url = new URL(applyUrl);
    const host = url.hostname.toLowerCase();
    if (host.includes('greenhouse')) return 'greenhouse';
    if (host.includes('lever.co')) return 'lever';
    if (host.includes('ashbyhq.com')) return 'ashby';
    return 'generic';
  } catch {
    return 'unknown';
  }
}

function buildApplicantProfile(tailoredResume: TailoredResumeDocument): ApplicantProfile {
  const fullName = tailoredResume.contactInfo?.name?.trim() || undefined;
  const { firstName, lastName } = firstAndLastName(fullName);
  const linkedin = tailoredResume.contactInfo?.linkedin?.trim() || undefined;

  return {
    fullName,
    firstName,
    lastName,
    email: tailoredResume.contactInfo?.email?.trim() || undefined,
    phone: tailoredResume.contactInfo?.phone?.trim() || undefined,
    linkedin,
    location: tailoredResume.contactInfo?.location?.trim() || undefined,
    website: undefined,
  };
}

function sessionSummary(session: ApplySessionRecord): ApplySessionSummary {
  return {
    id: session.id,
    applyUrl: session.applyUrl,
    executorMode: session.executorMode,
    portalType: session.portalType,
    status: session.status,
    latestMessage: session.latestMessage,
    latestScreenshot: session.latestScreenshot ?? null,
    filledCount: session.filledCount,
    reviewCount: session.reviewItems.length,
    submitConfirmed: session.submitConfirmed,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function updateSession(session: ApplySessionRecord, patch: Partial<ApplySessionRecord>) {
  Object.assign(session, patch, { updatedAt: nowIso() });
}

function inferSemanticType(field: DetectedField): FieldSemanticType {
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
  if (/linkedin/.test(text)) return 'linkedin';
  if (/portfolio/.test(text)) return 'portfolio';
  if (/website|personal\s*site|url/.test(text)) return 'website';
  if (/location|city|address|town|state/.test(text)) return 'location';
  return 'unknown';
}

function normalizePhone(phone?: string) {
  if (!phone) return undefined;
  const digits = phone.replace(/\D+/g, '');
  if (digits.length > 10) return digits.slice(-10);
  return digits || undefined;
}

function optionMatchesValue(field: DetectedField, candidate: string): string | undefined {
  const options = field.options ?? [];
  const normalizedCandidate = candidate.trim().toLowerCase();
  const exact = options.find((option) =>
    option.value.trim().toLowerCase() === normalizedCandidate ||
    option.label.trim().toLowerCase() === normalizedCandidate,
  );
  if (exact) return exact.value;

  const fuzzy = options.find((option) =>
    normalizedCandidate.includes(option.label.trim().toLowerCase()) ||
    option.label.trim().toLowerCase().includes(normalizedCandidate),
  );
  return fuzzy?.value;
}

function getFieldValue(field: DetectedField, profile: ApplicantProfile): { value?: string; semanticType: FieldSemanticType } {
  const semanticType = inferSemanticType(field);
  switch (semanticType) {
    case 'full_name':
      return { semanticType, value: profile.fullName };
    case 'first_name':
      return { semanticType, value: profile.firstName };
    case 'last_name':
      return { semanticType, value: profile.lastName };
    case 'email':
      return { semanticType, value: profile.email };
    case 'phone':
      return { semanticType, value: normalizePhone(profile.phone) };
    case 'linkedin':
      return { semanticType, value: profile.linkedin };
    case 'portfolio':
    case 'website':
      return { semanticType, value: profile.website };
    case 'location':
    case 'city':
      return { semanticType, value: profile.location };
    default:
      return { semanticType };
  }
}

function getAdvanceControl(controls: DetectedControl[]) {
  return controls.find((control) => control.kind === 'next' || control.kind === 'review');
}

function getSubmitControl(controls: DetectedControl[]) {
  return controls.find((control) => control.kind === 'submit');
}

export async function createApplySession(params: {
  applyUrl: string;
  userId?: string;
  tailoredResume: TailoredResumeDocument;
  templateProfile: ResumeTemplateProfile;
  validation: ValidationReport;
}): Promise<{ session: ApplySessionSummary; executorToken: string }> {
  const createdAt = nowIso();
  const portalType = detectPortalType(params.applyUrl);
  const executorMode: ExecutorMode = 'extension';
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
    applicantProfile: buildApplicantProfile(params.tailoredResume),
    latestMessage: 'Apply session created.',
    latestScreenshot: null,
    latestPageUrl: params.applyUrl,
    filledCount: 0,
    reviewItems: [],
    submitConfirmed: false,
    resumeAsset: {
      filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      base64: buffer.toString('base64'),
    },
  };

  applySessions.set(id, session);
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

export function planApplySnapshot(sessionId: string, executorToken: string, snapshot: PageSnapshot): ApplyPlanResponse {
  const session = getApplySessionByToken(sessionId, executorToken);
  const actions: PlannedAction[] = [];
  const reviewItems: ReviewItem[] = [];

  for (const field of snapshot.fields) {
    const { semanticType, value } = getFieldValue(field, session.applicantProfile);
    const fieldAlreadySatisfied = Boolean(field.hasValue || field.checked || (field.value ?? '').trim());

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

    if (field.tagName === 'select' || field.inputType === 'select-one') {
      const optionValue = optionMatchesValue(field, value);
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
      const optionValue = optionMatchesValue(field, value);
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
    latestPageUrl: snapshot.url,
    portalType: snapshot.portalType === 'unknown' ? session.portalType : snapshot.portalType,
    reviewItems,
  });

  return {
    portalType: session.portalType,
    status,
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
    latestPageUrl: event.pageUrl ?? session.latestPageUrl,
    filledCount: event.filledCount ?? session.filledCount,
    reviewItems: event.reviewItems ?? session.reviewItems,
  });
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
  });
  return sessionSummary(session);
}

export function completeApplySession(sessionId: string, executorToken: string, outcome: ApplySessionStatus, message?: string): ApplySessionSummary {
  const session = getApplySessionByToken(sessionId, executorToken);
  if (!['submitted', 'protected', 'unsupported', 'manual_required', 'failed'].includes(outcome)) {
    throw badRequest('Invalid apply-session outcome.', 'INVALID_REQUEST');
  }
  updateSession(session, {
    status: outcome,
    latestMessage: message ?? session.latestMessage,
  });
  return sessionSummary(session);
}
