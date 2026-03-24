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
  PauseReason,
  PageSnapshot,
  PlannedAction,
  PortalType,
  ResumeTemplateProfile,
  ReviewItem,
  TailoredResumeDocument,
  ValidationReport,
} from '../src/shared/types.ts';
import { detectPortalTypeFromUrl, isWidgetSupported } from './apply-capabilities.ts';
import { deriveApplicantProfile, mergeApplicantProfiles } from './application-profile.ts';
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
  latestPauseReason?: PauseReason;
  latestPageUrl?: string;
  latestStepKind?: PageSnapshot['stepKind'];
  latestStepSignature?: string;
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

function sessionSummary(session: ApplySessionRecord): ApplySessionSummary {
  return {
    id: session.id,
    applyUrl: session.applyUrl,
    executorMode: session.executorMode,
    portalType: session.portalType,
    status: session.status,
    latestMessage: session.latestMessage,
    latestScreenshot: session.latestScreenshot ?? null,
    latestPauseReason: session.latestPauseReason,
    latestStepKind: session.latestStepKind,
    latestStepSignature: session.latestStepSignature,
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
    case 'github':
      return { semanticType, value: profile.github };
    case 'portfolio':
      return { semanticType, value: profile.portfolio ?? profile.github ?? profile.website };
    case 'website':
      return { semanticType, value: profile.website ?? profile.portfolio ?? profile.github };
    case 'location':
    case 'city':
      return { semanticType, value: profile.location };
    case 'current_company':
      return { semanticType, value: profile.currentCompany };
    case 'current_title':
      return { semanticType, value: profile.currentTitle };
    case 'years_of_experience':
      return { semanticType, value: profile.yearsOfExperience };
    case 'current_ctc':
      return { semanticType, value: profile.currentCtcLpa };
    case 'expected_ctc':
      return { semanticType, value: profile.expectedCtcLpa };
    case 'notice_period':
      return { semanticType, value: profile.noticePeriodDays };
    case 'work_authorization':
      return { semanticType, value: profile.workAuthorization };
    case 'requires_sponsorship':
      return { semanticType, value: profile.requiresSponsorship };
    case 'visa_status':
      return { semanticType, value: profile.visaStatus };
    case 'gender':
      return { semanticType, value: profile.gender };
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
  applicationProfile?: Partial<ApplicantProfile> | null;
}): Promise<{ session: ApplySessionSummary; executorToken: string }> {
  const createdAt = nowIso();
  const portalType = detectPortalTypeFromUrl(params.applyUrl);
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
    applicantProfile: mergeApplicantProfiles(
      deriveApplicantProfile({ tailoredResume: params.tailoredResume }),
      params.applicationProfile,
    ),
    latestMessage: 'Apply session created.',
    latestScreenshot: null,
    latestPauseReason: 'none',
    latestPageUrl: params.applyUrl,
    latestStepKind: 'unknown',
    latestStepSignature: undefined,
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

function reviewReasonToPauseReason(reason: string): PauseReason {
  if (/unsupported widget/i.test(reason)) return 'unsupported_widget';
  if (/missing from the applicant profile/i.test(reason)) return 'missing_profile_value';
  if (/ambiguous/i.test(reason)) return 'ambiguous_required_field';
  return 'manual_required';
}

export function planApplySnapshot(sessionId: string, executorToken: string, snapshot: PageSnapshot): ApplyPlanResponse {
  const session = getApplySessionByToken(sessionId, executorToken);
  const actions: PlannedAction[] = [];
  const reviewItems: ReviewItem[] = [];
  const effectivePortalType = snapshot.portalType === 'unknown' ? session.portalType : snapshot.portalType;

  for (const field of snapshot.fields) {
    const { semanticType, value } = getFieldValue(field, session.applicantProfile);
    const fieldAlreadySatisfied = Boolean(field.hasValue || field.checked || (field.value ?? '').trim());
    const widgetSupported = isWidgetSupported(effectivePortalType, field.widgetKind);

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
    latestPauseReason: outcome === 'protected'
      ? 'protected_portal'
      : outcome === 'manual_required'
      ? (session.latestPauseReason && session.latestPauseReason !== 'none' ? session.latestPauseReason : 'manual_required')
      : 'none',
  });
  return sessionSummary(session);
}
