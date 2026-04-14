import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import multer from 'multer';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { z } from 'zod';
import { buildAnalysis, buildTailoringPlan, ensureGapAnalysisNarrative } from './analysis.ts';
import { buildGapAnalysis } from './gap-analysis.ts';
import { generateTailoredDocx } from './docx-render.ts';
import {
  getMemoryApplicationMemory,
  getMemoryApplicationProfile,
  mergeAnswerBankEntries,
  mergeApplicantProfiles,
  sanitizeApplicantProfile,
  setMemoryApplicationMemory,
  setMemoryApplicationProfile,
} from './application-profile.ts';
import {
  createApplySession,
  confirmApplySessionSubmit,
  completeApplySession,
  getApplyAutomationMetricsForUser,
  getApplySessionContext,
  getApplySessionForExecutor,
  getApplySessionForUser,
  getApplySessionTraceForUser,
  learnApplySessionCorrections,
  planApplySnapshot,
  recordApplySessionEvent,
  setApplySessionExecutorMode,
} from './apply-sessions.ts';
import {
  badRequest,
  internalServerError,
  isAppError,
  payloadTooLarge,
  toApiError,
  unprocessable,
} from './errors.ts';
import { extractTextFromUpload, isDocxUpload } from './file-types.ts';
import { buildJDRequirementModel, normalizeJobDescription } from './jd.ts';
import { fetchJobDescriptionText } from './jd-url.ts';
import { parseResumeDocx } from './resume.ts';
import {
  extractJdUrlRequestSchema,
  generateDocxRequestSchema,
  preferencesSchema,
  tailorResumeFormSchema,
  type ResumePreferences,
} from './schemas.ts';
import { TAILOR_PIPELINE_VERSION, TAILOR_PROMPT_VERSION, tailorResumeWithAI } from './tailor.ts';
import { validateTailoredResume } from './validate.ts';
import { startAutoApply, submitAutoApply } from './auto-apply.ts';
import { searchJobs, buildCandidateProfile, enrichCandidateProfileWithAI } from './job-search.ts';
import { requireAuth } from './middleware/auth.ts';
import { writeUsageEvent, isOverQuota } from './db/queries/usage.ts';
import { getStoredApplicationMemory, upsertStoredApplicationMemory } from './db/queries/application-profiles.ts';
import {
  getMemoryDefaultResume,
  getStoredDefaultResume,
  getStoredResumeById,
  setMemoryDefaultResume,
  toStoredResumeSummary,
  upsertDefaultResume,
  type StoredResumeRecord,
} from './db/queries/uploaded-resumes.ts';
import { createJobSearchSession, getLatestJobSearchSession } from './db/queries/sessions.ts';
import {
  getApplicationMetricsForUser,
  getApplicationReliabilitySnapshotForUser,
  getApplicationTraceForUser,
  getApplicationsForUser,
  getRelatedApplicationsForUser,
  updateApplicationStatus,
  type ApplicationStatus,
} from './db/queries/applications.ts';
import { getJobsForUser, upsertJobFromSearch, updateJobLifecycle, getSeenJobUrlsForUser } from './db/queries/jobs.ts';
import { isSupabaseConfigured, supabase } from './db/client.ts';
import { readSanitizedEnv } from './env.ts';
import { logger } from './logger.ts';
import type {
  AnswerBankEntry,
  ApplicantProfile,
  ApplicationProfileResponse,
  ApplicationRecord,
  ApplySessionEvent,
  CandidateProfile,
  CreateApplySessionRequest,
  DefaultResumeResponse,
  ExtractionWarning,
  JobRecord,
  JobLifecycleStatus,
  JobSearchResult,
  LatestJobSearchSessionResponse,
  PageSnapshot,
  JobSearchPreferences,
  ResumeSource,
  ResumeTemplateProfile,
  SourceResumeDocument,
  StoredResumeSummary,
  TailorResumeResponse,
  TailoredResumeDocument,
  ValidationReport,
} from '../src/shared/types.ts';

function buildTailoredCorpus(tailored: TailoredResumeDocument): string {
  return [
    tailored.headline,
    tailored.summary,
    ...(tailored.skills ?? []),
    ...(tailored.certifications ?? []),
    ...tailored.experience.flatMap((e) => [e.title, e.company, e.dates, ...e.bullets.map((b) => b.text)]),
    ...tailored.projects.flatMap((p) => [p.name, p.description, ...p.bullets.map((b) => b.text)]),
    ...tailored.education.flatMap((e) => [e.institution, e.degree]),
  ]
    .filter(Boolean)
    .join(' ');
}
import { normalizeWhitespace } from './utils.ts';

type ResolvedResumeInput = {
  resume: SourceResumeDocument;
  templateProfile: ResumeTemplateProfile;
  candidateProfile: CandidateProfile;
  parseWarnings: ExtractionWarning[];
  resumeSource: ResumeSource;
  resumeId?: string;
  filename?: string;
  fileSizeBytes?: number;
  buffer?: Buffer;
};

export interface AIClient {
  models: {
    generateContent: (args: unknown) => Promise<{ text?: string | null }>;
  };
}

export interface AppDependencies {
  getAI: (req?: Request) => AIClient;
  getTailorFallbackAI?: (req?: Request) => AIClient;
  getSearchAI?: (req?: Request) => AIClient;
  getSearchFallbackAI?: (req?: Request) => AIClient;
  fetchImpl?: typeof fetch;
  disablePlaywrightJdFallback?: boolean;
  /** Skip auth + DB writes — for unit/integration tests */
  skipAuth?: boolean;
  /** Apply rate limiting even when skipAuth is true — for rate-limit tests */
  enforceRateLimit?: boolean;
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function buildNormalizedJobDescription(rawText: string, sourceType: 'file' | 'paste' | 'url') {
  const normalized = normalizeJobDescription(rawText, sourceType);
  if (!normalizeWhitespace(normalized.cleanText)) {
    throw unprocessable('No readable job description content was extracted.', 'EMPTY_EXTRACTED_TEXT', {
      logMessage: `Normalized ${sourceType} job description was empty after cleanup.`,
    });
  }
  return normalized;
}

function normalizeRouteError(error: unknown) {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof z.ZodError) {
    const message = error.issues[0]?.message ?? 'Request body is invalid.';
    return badRequest(message, 'INVALID_REQUEST', {
      cause: error,
      logMessage: 'Request validation failed.',
    });
  }

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return payloadTooLarge(`Uploaded file exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit.`, 'UPLOAD_TOO_LARGE', {
        cause: error,
        logMessage: 'Upload rejected because it exceeded the configured file size limit.',
      });
    }
    return badRequest('The uploaded file could not be processed.', 'INVALID_UPLOAD', {
      cause: error,
      logMessage: `Multer failed with code ${error.code}.`,
    });
  }

  if (
    error instanceof SyntaxError &&
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error as { type?: string }).type === 'entity.parse.failed'
  ) {
    return badRequest('Request body must be valid JSON.', 'INVALID_REQUEST', {
      cause: error,
      logMessage: 'Received malformed JSON request body.',
    });
  }

  return internalServerError(undefined, 'INTERNAL_ERROR', {
    cause: error,
    logMessage: 'Unhandled backend error.',
  });
}

function parsePreferencesField(value: unknown): ResumePreferences {
  if (value === undefined || value === null || value === '') {
    return {};
  }

  if (typeof value !== 'string') {
    throw badRequest('Preferences payload must be valid JSON.', 'INVALID_REQUEST', {
      logMessage: 'Preferences field was not sent as a JSON string.',
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw badRequest('Preferences payload must be valid JSON.', 'INVALID_REQUEST', {
      cause: error,
      logMessage: 'Failed to parse preferences JSON.',
    });
  }

  return preferencesSchema.parse(parsed);
}

async function runSingleUpload(
  upload: multer.Multer,
  req: Request,
  res: Response,
  fieldName: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    upload.single(fieldName)(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function sendErrorResponse(res: Response, error: unknown, context: string) {
  const normalized = normalizeRouteError(error);
  const { error: appError, body } = toApiError(normalized);
  const log = appError.status >= 500 ? console.error : console.warn;
  log(`[${context}] ${appError.logMessage ?? appError.message}`, appError.cause ?? error);
  res.status(appError.status).json(body);
}

function getExecutorToken(req: Request): string {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7);
  }
  const tokenHeader = req.headers['x-executor-token'];
  if (typeof tokenHeader === 'string' && tokenHeader.trim()) {
    return tokenHeader.trim();
  }
  throw badRequest('Executor token is required.', 'INVALID_REQUEST', {
    logMessage: 'Missing executor token for apply-session executor route.',
  });
}

// Rate limit factories — keyed by user ID after auth, IP fallback before
function makeRateLimit(opts: { windowMs: number; max: number; message: string }) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req as Request).userId ?? ipKeyGenerator(req.ip ?? '127.0.0.1'),
    message: { error: opts.message, code: 'RATE_LIMITED' },
  });
}

const rateLimitSearch    = makeRateLimit({ windowMs: 60 * 60 * 1000, max: 5,  message: 'Job search limit: 5 per hour.' });
const rateLimitTailor    = makeRateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: 'Tailor limit: 10 per hour.' });
const rateLimitExtract   = makeRateLimit({ windowMs: 60 * 60 * 1000, max: 30, message: 'Extract limit: 30 per hour.' });
const rateLimitProfile   = makeRateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: 'Profile build limit: 20 per hour.' });
const rateLimitDocx      = makeRateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: 'DOCX generation limit: 20 per hour.' });
const rateLimitSmartFill = makeRateLimit({ windowMs: 60 * 60 * 1000, max: 30, message: 'Smart fill limit: 30 per hour.' });
const rateLimitAutoApply = makeRateLimit({ windowMs: 60 * 60 * 1000, max: 5,  message: 'Auto-apply limit: 5 per hour.' });
const rateLimitApplySession = makeRateLimit({ windowMs: 60 * 60 * 1000, max: 3600, message: 'Apply session limit: 3600 per hour.' });

const applicantProfileSchema = z.object({
  fullName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  linkedin: z.string().optional(),
  github: z.string().optional(),
  portfolio: z.string().optional(),
  website: z.string().optional(),
  location: z.string().optional(),
  currentCompany: z.string().optional(),
  currentTitle: z.string().optional(),
  yearsOfExperience: z.string().optional(),
  currentCtcLpa: z.string().optional(),
  expectedCtcLpa: z.string().optional(),
  noticePeriodDays: z.string().optional(),
  workAuthorization: z.string().optional(),
  requiresSponsorship: z.string().optional(),
  visaStatus: z.string().optional(),
  gender: z.string().optional(),
});

export function createApp(deps: AppDependencies): Express {
  const app = express();
  const bypassRateLimit = ((_req, _res, next) => next()) as express.RequestHandler;
  const applyLimits = !deps.skipAuth || deps.enforceRateLimit;
  const limitExtract = applyLimits ? rateLimitExtract : bypassRateLimit;
  const limitTailor = applyLimits ? rateLimitTailor : bypassRateLimit;
  const limitDocx = applyLimits ? rateLimitDocx : bypassRateLimit;
  const limitProfile = applyLimits ? rateLimitProfile : bypassRateLimit;
  const limitSearch = applyLimits ? rateLimitSearch : bypassRateLimit;
  const limitSmartFill = applyLimits ? rateLimitSmartFill : bypassRateLimit;
  const limitAutoApply = applyLimits ? rateLimitAutoApply : bypassRateLimit;
  const limitApplySession = applyLimits ? rateLimitApplySession : bypassRateLimit;
  const upload = multer({
    limits: { fileSize: MAX_UPLOAD_BYTES },
    storage: multer.memoryStorage(),
  });

  const appUrl = readSanitizedEnv('APP_URL');
  const corsOrigin = appUrl ?? (process.env.NODE_ENV !== 'production' ? '*' : false);
  app.use(helmet({ contentSecurityPolicy: false })); // CSP managed by Vite in dev
  app.use(cors(corsOrigin ? { origin: corsOrigin } : { origin: false }));
  app.use(pinoHttp({ logger, quietReqLogger: true }));
  app.use(express.json({ limit: '2mb' }));

  const auth = deps.skipAuth
    ? (req: Request, _res: Response, next: NextFunction) => {
        req.userId = 'test-user-e2e';
        req.userEmail = 'test-user-e2e@example.com';
        req.internalUserId = 'test-user-e2e';
        next();
      }
    : requireAuth;

  const getProfileUserKey = (req: Request) => req.internalUserId ?? req.userId ?? 'anonymous';

  const loadApplicationMemoryForRequest = async (req: Request): Promise<{ profile: ApplicantProfile; answerBank: AnswerBankEntry[] }> => {
    const userKey = getProfileUserKey(req);
    if (deps.skipAuth) {
      const memory = getMemoryApplicationMemory(userKey);
      return {
        profile: sanitizeApplicantProfile(memory.profile),
        answerBank: mergeAnswerBankEntries(memory.answerBank),
      };
    }
    const stored = await getStoredApplicationMemory(userKey);
    return {
      profile: sanitizeApplicantProfile(stored.profile),
      answerBank: mergeAnswerBankEntries(stored.answerBank),
    };
  };

  const loadApplicationProfileForRequest = async (req: Request): Promise<ApplicantProfile> => {
    const memory = await loadApplicationMemoryForRequest(req);
    return memory.profile;
  };

  const loadAnswerBankForRequest = async (req: Request): Promise<AnswerBankEntry[]> => {
    const memory = await loadApplicationMemoryForRequest(req);
    return memory.answerBank;
  };

  const saveApplicationMemoryForRequest = async (
    req: Request,
    input: {
      profile?: Partial<ApplicantProfile> | null;
      answerBank?: AnswerBankEntry[] | null;
    },
  ): Promise<{ profile: ApplicantProfile; answerBank: AnswerBankEntry[] }> => {
    const userKey = getProfileUserKey(req);
    if (deps.skipAuth) {
      return setMemoryApplicationMemory(userKey, {
        profile: input.profile,
        answerBank: input.answerBank ?? undefined,
      });
    }
    const existing = await loadApplicationMemoryForRequest(req);
    return upsertStoredApplicationMemory(userKey, {
      profile: sanitizeApplicantProfile(input.profile ?? existing.profile),
      answerBank: mergeAnswerBankEntries(existing.answerBank, input.answerBank),
    });
  };

  const saveApplicationProfileForRequest = async (req: Request, profile: Partial<ApplicantProfile>): Promise<ApplicantProfile> => {
    const memory = await saveApplicationMemoryForRequest(req, { profile });
    return memory.profile;
  };

  const loadDefaultResumeForRequest = async (req: Request): Promise<StoredResumeRecord | null> => {
    const userKey = getProfileUserKey(req);
    if (deps.skipAuth) {
      return getMemoryDefaultResume(userKey);
    }
    return getStoredDefaultResume(userKey);
  };

  const getStoredResumeForRequest = async (req: Request, resumeId: string): Promise<StoredResumeRecord | null> => {
    const userKey = getProfileUserKey(req);
    if (deps.skipAuth) {
      const record = getMemoryDefaultResume(userKey);
      return record?.id === resumeId ? record : null;
    }
    return getStoredResumeById(userKey, resumeId);
  };

  const saveDefaultResumeForRequest = async (
    req: Request,
    input: {
      filename: string;
      fileSizeBytes: number;
      buffer: Buffer;
      candidateProfile: CandidateProfile;
      resume: SourceResumeDocument;
      templateProfile: ResumeTemplateProfile;
      parseWarnings: ExtractionWarning[];
    },
  ): Promise<StoredResumeRecord> => {
    const userKey = getProfileUserKey(req);
    const parsedPayload = {
      resume: input.resume,
      templateProfile: input.templateProfile,
      parseWarnings: input.parseWarnings,
    };

    if (deps.skipAuth) {
      return setMemoryDefaultResume(userKey, {
        filename: input.filename,
        fileSizeBytes: input.fileSizeBytes,
        candidateProfile: input.candidateProfile,
        parsed: parsedPayload,
      });
    }

    return upsertDefaultResume({
      userId: userKey,
      filename: input.filename,
      fileSizeBytes: input.fileSizeBytes,
      buffer: input.buffer,
      candidateProfile: input.candidateProfile,
      parsed: parsedPayload,
    });
  };

  const resolveResumeInputForRequest = async (req: Request): Promise<ResolvedResumeInput> => {
    const resumeId =
      typeof req.body?.resumeId === 'string' && req.body.resumeId.trim()
        ? req.body.resumeId.trim()
        : undefined;

    if (req.file && resumeId) {
      throw badRequest('Provide either a resume upload or resumeId, not both.', 'INVALID_REQUEST', {
        logMessage: 'Received both multipart resume upload and resumeId on the same request.',
      });
    }

    if (resumeId) {
      const stored = await getStoredResumeForRequest(req, resumeId);
      if (!stored) {
        throw badRequest('Saved resume not found.', 'INVALID_REQUEST', {
          logMessage: `Requested saved resume ${resumeId} was not found for the current user.`,
        });
      }
      return {
        resume: stored.parsed.resume,
        templateProfile: stored.parsed.templateProfile,
        candidateProfile: stored.candidateProfile ?? buildCandidateProfile(stored.parsed.resume),
        parseWarnings: stored.parsed.parseWarnings,
        resumeSource: 'default',
        resumeId: stored.id,
        filename: stored.filename,
        fileSizeBytes: stored.fileSizeBytes,
      };
    }

    if (!req.file) {
      throw badRequest('Resume file is required.', 'INVALID_REQUEST', {
        logMessage: 'Missing resume upload or resumeId.',
      });
    }
    if (!isDocxUpload(req.file.mimetype, req.file.originalname, req.file.buffer)) {
      throw badRequest('Resume must be a DOCX file.', 'UNSUPPORTED_FILE_TYPE', {
        logMessage: `Rejected non-DOCX resume upload: ${req.file.originalname}`,
      });
    }

    let parsedResume: Awaited<ReturnType<typeof parseResumeDocx>>;
    try {
      parsedResume = await parseResumeDocx(req.file.buffer);
    } catch (error) {
      throw unprocessable('The uploaded resume could not be parsed.', 'RESUME_PARSE_FAILED', {
        cause: error,
        logMessage: `Failed to parse uploaded resume ${req.file.originalname}.`,
      });
    }

    const baseProfile = buildCandidateProfile(parsedResume.resume);
    const enrichAI = deps.getSearchAI ? deps.getSearchAI(req) : deps.getAI(req);
    return {
      resume: parsedResume.resume,
      templateProfile: parsedResume.templateProfile,
      candidateProfile: await enrichCandidateProfileWithAI(enrichAI, parsedResume.resume, baseProfile),
      parseWarnings: parsedResume.resume.parseWarnings,
      resumeSource: 'upload',
      filename: req.file.originalname,
      fileSizeBytes: req.file.size,
      buffer: req.file.buffer,
    };
  };

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/resumes/default', auth, limitProfile, async (req, res) => {
    try {
      const record = await loadDefaultResumeForRequest(req);
      const body: DefaultResumeResponse = {
        resume: toStoredResumeSummary(record),
      };
      res.json(body);
    } catch (error) {
      sendErrorResponse(res, error, 'default-resume-get');
    }
  });

  app.post('/api/resumes/default', auth, limitProfile, async (req, res) => {
    try {
      await runSingleUpload(upload, req, res, 'resume');
      if (!req.file) {
        throw badRequest('Resume file is required.', 'INVALID_REQUEST', {
          logMessage: 'Missing resume upload for default-resume save.',
        });
      }

      const resolved = await resolveResumeInputForRequest(req);
      if (resolved.resumeSource !== 'upload' || !resolved.buffer || !resolved.filename || !resolved.fileSizeBytes) {
        throw badRequest('A new DOCX upload is required to save the default resume.', 'INVALID_REQUEST', {
          logMessage: 'Default resume save attempted without an uploaded DOCX.',
        });
      }

      const stored = await saveDefaultResumeForRequest(req, {
        filename: resolved.filename,
        fileSizeBytes: resolved.fileSizeBytes,
        buffer: resolved.buffer,
        candidateProfile: resolved.candidateProfile,
        resume: resolved.resume,
        templateProfile: resolved.templateProfile,
        parseWarnings: resolved.parseWarnings,
      });
      const body: DefaultResumeResponse = {
        resume: toStoredResumeSummary(stored),
      };
      res.json(body);
    } catch (error) {
      sendErrorResponse(res, error, 'default-resume-post');
    }
  });

  app.post('/api/extract-jd-url', auth, limitExtract, async (req, res) => {
    try {
      const { url } = extractJdUrlRequestSchema.parse(req.body);
      const rawText = await fetchJobDescriptionText(
        url,
        deps.fetchImpl ?? fetch,
        undefined,
        deps.disablePlaywrightJdFallback ? null : undefined,
      );
      const normalized = buildNormalizedJobDescription(rawText, 'url');
      if (!deps.skipAuth && req.internalUserId) {
        try {
          void Promise.resolve(supabase.from('job_descriptions').insert({
            user_id: req.internalUserId,
            source_type: 'url',
            source_url: url,
            raw_text: normalized.rawText,
            normalized_json: normalized,
          })).catch(() => {});
        } catch { /* ignore — fire-and-forget */ }
      }
      res.json(normalized);
    } catch (error) {
      sendErrorResponse(res, error, 'extract-jd-url');
    }
  });

  app.post('/api/extract-jd-file', auth, limitExtract, async (req, res) => {
    try {
      await runSingleUpload(upload, req, res, 'file');
      if (!req.file) {
        throw badRequest('File is required.', 'INVALID_REQUEST', {
          logMessage: 'Missing file upload for job description extraction.',
        });
      }
      const rawText = await extractTextFromUpload(req.file.buffer, req.file.mimetype, req.file.originalname);
      const normalized = buildNormalizedJobDescription(rawText, 'file');
      res.json(normalized);
    } catch (error) {
      sendErrorResponse(res, error, 'extract-jd-file');
    }
  });

  app.post('/api/extract-jd-text', auth, limitExtract, async (req, res) => {
    try {
      const { text } = z.object({ text: z.string().min(1) }).parse(req.body);
      const normalized = buildNormalizedJobDescription(text, 'paste');
      if (!deps.skipAuth && req.internalUserId) {
        try {
          void Promise.resolve(supabase.from('job_descriptions').insert({
            user_id: req.internalUserId,
            source_type: 'paste',
            raw_text: normalized.rawText,
            normalized_json: normalized,
          })).catch(() => {});
        } catch { /* ignore — fire-and-forget */ }
      }
      res.json(normalized);
    } catch (error) {
      sendErrorResponse(res, error, 'extract-jd-text');
    }
  });

  app.post('/api/tailor-resume', auth, limitTailor, async (req, res) => {
    try {
      // Monthly quota check
      if (!deps.skipAuth && req.userId && await isOverQuota(req.internalUserId ?? req.userId, 'tailor', req.userEmail)) {
        res.status(402).json({ error: 'Monthly tailor limit reached. Upgrade to Pro for more.', code: 'QUOTA_EXCEEDED' });
        return;
      }

      await runSingleUpload(upload, req, res, 'resume');
      const { jdText } = tailorResumeFormSchema.parse(req.body);
      const preferences = parsePreferencesField(req.body.preferences);

      const normalizedJobDescription = buildNormalizedJobDescription(jdText, 'paste');
      const resolvedResume = await resolveResumeInputForRequest(req);
      const { resume, templateProfile, resumeId, resumeSource } = resolvedResume;
      const ai = deps.getAI(req);
      let fallbackAI: AIClient | null = null;
      if (deps.getTailorFallbackAI) {
        try {
          fallbackAI = deps.getTailorFallbackAI(req);
        } catch (error) {
          logger.warn({ error }, 'Tailor fallback AI is not configured; continuing with Gemini only.');
        }
      }

      const jdRequirements = await buildJDRequirementModel(normalizedJobDescription, ai);
      const tailoringPlan = buildTailoringPlan(resume, jdRequirements);
      const gapAnalysis = await buildGapAnalysis(ai, resume, jdRequirements, normalizedJobDescription.cleanText);
      tailoringPlan.gapAnalysis = gapAnalysis;

      const { tailoredResume, providerUsed, fallbackUsed } = await tailorResumeWithAI(
        ai,
        resume,
        normalizedJobDescription.cleanText,
        jdRequirements,
        tailoringPlan,
        preferences,
        fallbackAI,
      );

      const analysis = buildAnalysis(
        resume,
        jdRequirements,
        normalizedJobDescription.cleanText,
        buildTailoredCorpus(tailoredResume),
      );

      tailoringPlan.gapAnalysis = ensureGapAnalysisNarrative(
        tailoringPlan.gapAnalysis,
        analysis,
        jdRequirements,
      );

      const validation = validateTailoredResume(resume, tailoredResume, templateProfile);
      const response: TailorResumeResponse = validation.isValid
        ? {
            blocked: false,
            analysis,
            validation,
            tailoredResume,
            templateProfile,
            tailoringPlan,
            renderReadiness: 'ready',
            normalizedJobDescription,
            parseWarnings: [...normalizedJobDescription.extractionWarnings, ...resolvedResume.parseWarnings],
            jdCompanyName: jdRequirements.companyName,
            resumeSource,
            resumeId,
            providerUsed,
            fallbackUsed,
            promptVersion: TAILOR_PROMPT_VERSION,
            pipelineVersion: TAILOR_PIPELINE_VERSION,
          }
        : {
            blocked: true,
            analysis,
            validation,
            tailoredResume,
            templateProfile,
            tailoringPlan,
            renderReadiness: 'blocked',
            normalizedJobDescription,
            parseWarnings: [...normalizedJobDescription.extractionWarnings, ...resolvedResume.parseWarnings],
            jdCompanyName: jdRequirements.companyName,
            resumeSource,
            resumeId,
            providerUsed,
            fallbackUsed,
            promptVersion: TAILOR_PROMPT_VERSION,
            pipelineVersion: TAILOR_PIPELINE_VERSION,
          };

      if (!deps.skipAuth && req.userId) {
        writeUsageEvent({ userId: req.internalUserId ?? req.userId, eventType: 'tailor', status: validation.isValid ? 'success' : 'blocked' })
          .catch(err => logger.error({ err }, 'Failed to write tailor usage event'));
      }
      res.json(response);
    } catch (error) {
      if (!deps.skipAuth && req.userId) {
        writeUsageEvent({ userId: req.internalUserId ?? req.userId, eventType: 'tailor', status: 'error' })
          .catch(err => logger.error({ err }, 'Failed to write tailor error event'));
      }
      sendErrorResponse(res, error, 'tailor-resume');
    }
  });

  app.post('/api/generate-docx', auth, limitDocx, async (req, res) => {
    try {
      const { tailoredResume, templateProfile } = generateDocxRequestSchema.parse(req.body);

      let buffer: Buffer;
      try {
        buffer = await generateTailoredDocx(
          tailoredResume as TailoredResumeDocument,
          templateProfile as ResumeTemplateProfile,
        );
      } catch (error) {
        throw internalServerError('Failed to generate DOCX.', 'DOCX_RENDER_FAILED', {
          cause: error,
          logMessage: 'DOCX renderer failed.',
        });
      }
      res.setHeader('Content-Disposition', 'attachment; filename=Tailored_Resume.docx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.send(buffer);
    } catch (error) {
      sendErrorResponse(res, error, 'generate-docx');
    }
  });

  // Job search: build candidate profile from resume + search via Gemini grounding
  // Lightweight: parse resume → return candidate profile (no AI search)
  app.post('/api/build-profile', auth, limitProfile, async (req, res) => {
    try {
      await runSingleUpload(upload, req, res, 'resume');
      const resolvedResume = await resolveResumeInputForRequest(req);
      res.json(resolvedResume.candidateProfile);
    } catch (error) {
      sendErrorResponse(res, error, 'build-profile');
    }
  });

  app.get('/api/application-profile', auth, limitProfile, async (req, res) => {
    try {
      const memory = await loadApplicationMemoryForRequest(req);
      const payload: ApplicationProfileResponse = {
        profile: memory.profile,
        answerBank: memory.answerBank,
      };
      res.json(payload);
    } catch (error) {
      sendErrorResponse(res, error, 'application-profile-get');
    }
  });

  app.put('/api/application-profile', auth, limitProfile, async (req, res) => {
    try {
      const answerBankEntrySchema = z.object({
        id: z.string().optional(),
        question: z.string(),
        normalizedQuestion: z.string().optional(),
        answer: z.string(),
        portalType: z.string().optional(),
        semanticType: z.string().optional(),
        source: z.enum(['user_saved', 'managed_browser', 'resume_derived', 'imported']).optional(),
        confidence: z.enum(['confirmed', 'learned']).optional(),
        usageCount: z.number().int().nonnegative().optional(),
        lastUsedAt: z.string().optional(),
        updatedAt: z.string().optional(),
      });
      const body = z.object({
        profile: applicantProfileSchema.optional().default({}),
        answerBank: z.array(answerBankEntrySchema).optional().default([]),
      }).parse(req.body);
      const existing = await loadApplicationMemoryForRequest(req);
      const mergedProfile = mergeApplicantProfiles(existing.profile, body.profile);
      const mergedAnswerBank = mergeAnswerBankEntries(existing.answerBank, body.answerBank as AnswerBankEntry[]);
      const memory = await saveApplicationMemoryForRequest(req, {
        profile: mergedProfile,
        answerBank: mergedAnswerBank,
      });
      const payload: ApplicationProfileResponse = {
        profile: memory.profile,
        answerBank: memory.answerBank,
      };
      res.json(payload);
    } catch (error) {
      sendErrorResponse(res, error, 'application-profile-put');
    }
  });

  // Job search: build candidate profile from resume + search via configured search provider
  app.post('/api/search-jobs', auth, limitSearch, async (req, res) => {
    try {
      // Monthly quota check
      if (!deps.skipAuth && req.userId && await isOverQuota(req.internalUserId ?? req.userId, 'search', req.userEmail)) {
        res.status(402).json({ error: 'Monthly search limit reached. Upgrade to Pro for more.', code: 'QUOTA_EXCEEDED' });
        return;
      }

      await runSingleUpload(upload, req, res, 'resume');
      let preferences: JobSearchPreferences = {};
      if (req.body.preferences) {
        try {
          preferences = JSON.parse(req.body.preferences);
        } catch {
          // ignore malformed prefs
        }
      }

      const resolvedResume = await resolveResumeInputForRequest(req);

      const ai = deps.getSearchAI ? deps.getSearchAI(req) : deps.getAI(req);
      const fallbackAI = deps.getSearchFallbackAI ? deps.getSearchFallbackAI(req) : undefined;
      const t0 = Date.now();
      const effectiveUserIdForSeen = !deps.skipAuth && req.userId ? (req.internalUserId ?? req.userId) : null;
      const seenUrls = effectiveUserIdForSeen && isSupabaseConfigured()
        ? await getSeenJobUrlsForUser(effectiveUserIdForSeen).catch(() => new Set<string>())
        : new Set<string>();
      const response = await searchJobs(resolvedResume.resume, preferences, ai, fallbackAI, deps.fetchImpl ?? fetch, seenUrls);
      response.resumeSource = resolvedResume.resumeSource;
      response.resumeId = resolvedResume.resumeId;

      if (!deps.skipAuth && req.userId) {
        const effectiveUserId = req.internalUserId ?? req.userId;
        writeUsageEvent({ userId: effectiveUserId, eventType: 'search', status: 'success', durationMs: Date.now() - t0 })
          .catch(err => logger.error({ err }, 'Failed to write search usage event'));
        createJobSearchSession({
          userId: effectiveUserId,
          resumeId: resolvedResume.resumeId,
          preferencesJson: preferences,
          candidateProfileJson: response.candidateProfile,
          resultsJson: response.results,
          totalResults: response.totalFound,
        }).catch(err => logger.error({ err }, 'Failed to create job search session'));
        if (isSupabaseConfigured()) {
          Promise.allSettled(response.results.map((result, index) =>
            upsertJobFromSearch(effectiveUserId, result, { searchRank: index }),
          )).catch((err) => logger.error({ err }, 'Failed to persist search results into the job ledger'));
        }
      }
      res.json(response);
    } catch (error) {
      if (!deps.skipAuth && req.userId) {
        writeUsageEvent({ userId: req.internalUserId ?? req.userId, eventType: 'search', status: 'error' })
          .catch(err => logger.error({ err }, 'Failed to write search error event'));
      }
      sendErrorResponse(res, error, 'search-jobs');
    }
  });

  app.get('/api/search-jobs/latest', auth, async (req, res) => {
    try {
      if (deps.skipAuth || !req.userId) {
        const body: LatestJobSearchSessionResponse = { session: null };
        res.json(body);
        return;
      }

      const effectiveUserId = req.internalUserId ?? req.userId;
      const latest = await getLatestJobSearchSession(effectiveUserId);
      if (!latest) {
        const body: LatestJobSearchSessionResponse = { session: null };
        res.json(body);
        return;
      }

      const body: LatestJobSearchSessionResponse = {
        session: {
          id: latest.id,
          createdAt: latest.createdAt,
          preferences: (latest.preferencesJson as JobSearchPreferences | null) ?? {},
          results: Array.isArray(latest.resultsJson) ? latest.resultsJson as JobSearchResult[] : [],
          candidateProfile: (latest.candidateProfileJson as CandidateProfile | null) ?? null,
          totalFound: latest.totalResults ?? 0,
          resumeId: latest.resumeId ?? undefined,
        },
      };
      res.json(body);
    } catch (error) {
      sendErrorResponse(res, error, 'search-jobs-latest');
    }
  });

  // AI-powered form filler — called by the Chrome extension content script
  app.post('/api/smart-fill', auth, limitSmartFill, async (req, res) => {
    try {
      const { fields, prefill } = z.object({
        fields: z.array(z.object({
          name: z.string(),
          label: z.string(),
          placeholder: z.string(),
          type: z.string(),
        })),
        prefill: z.object({
          name: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          linkedin: z.string().optional(),
          location: z.string().optional(),
        }),
      }).parse(req.body);

      const ai = deps.getAI(req);

      const prompt = `You are filling out a job application form on behalf of the user.

User profile:
- Full name: ${prefill.name ?? 'unknown'}
- Email: ${prefill.email ?? 'unknown'}
- Phone: ${prefill.phone ?? 'unknown'}
- LinkedIn: ${prefill.linkedin ?? 'not provided'}
- Location: ${prefill.location ?? 'unknown'}

Form fields (field name, label, placeholder, input type):
${fields.map(f => `  name="${f.name}" | label="${f.label}" | placeholder="${f.placeholder}" | type="${f.type}"`).join('\n')}

Instructions:
- Return ONLY a JSON object mapping field "name" to the value to fill in.
- Only include fields you have confident data for.
- For phone numbers: strip country code prefix and spaces, use only digits (e.g. "+91 91489 69183" → "9148969183").
- For LinkedIn: if the user's linkedin value looks like a URL, strip the "https://www.linkedin.com/in/" prefix and return just the path.
- For fields like CTC, experience, notice period, portfolio — return null (do not guess).
- Return null for any field you are unsure about.
- Return ONLY valid JSON. No explanation, no markdown.`;

      const result = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const raw = (result.text ?? '').replace(/```json\n?|```\n?/g, '').trim();
      const mapping = JSON.parse(raw);
      res.json({ mapping });
    } catch (error) {
      sendErrorResponse(res, error, 'smart-fill');
    }
  });

  app.post('/api/apply/sessions', auth, limitApplySession, async (req, res) => {
    try {
      const body = z.object({
        applyUrl: z.string().url(),
        tailoredResume: z.any(),
        templateProfile: z.any(),
        validation: z.any(),
        applicationProfile: applicantProfileSchema.optional(),
        answerBank: z.array(z.object({
          id: z.string(),
          question: z.string(),
          normalizedQuestion: z.string(),
          answer: z.string(),
          portalType: z.string().optional(),
          semanticType: z.string().optional(),
          source: z.enum(['user_saved', 'managed_browser', 'resume_derived', 'imported']).optional(),
          confidence: z.enum(['confirmed', 'learned']).optional(),
          usageCount: z.number().int().nonnegative().optional(),
          lastUsedAt: z.string().optional(),
          updatedAt: z.string(),
        })).optional(),
        executorMode: z.enum(['extension', 'local_agent']).optional(),
        job: z.object({
          title: z.string().optional(),
          company: z.string().optional(),
          location: z.string().optional(),
          description: z.string().optional(),
        }).optional(),
      }).parse(req.body) as CreateApplySessionRequest;

      const savedProfile = await loadApplicationProfileForRequest(req);
      const savedAnswerBank = await loadAnswerBankForRequest(req);
      const mergedApplicationProfile = mergeApplicantProfiles(savedProfile, body.applicationProfile);
      const mergedAnswerBank = mergeAnswerBankEntries(savedAnswerBank, body.answerBank as AnswerBankEntry[] | undefined);

      if (body.applicationProfile || body.answerBank?.length) {
        try {
          await saveApplicationMemoryForRequest(req, {
            profile: mergedApplicationProfile,
            answerBank: mergedAnswerBank,
          });
        } catch (error) {
          logger.warn({ error }, 'Failed to persist application memory before creating apply session.');
        }
      }

      const response = await createApplySession({
        applyUrl: body.applyUrl,
        userId: req.internalUserId ?? req.userId,
        tailoredResume: body.tailoredResume as TailoredResumeDocument,
        templateProfile: body.templateProfile as ResumeTemplateProfile,
        validation: body.validation as ValidationReport,
        applicationProfile: mergedApplicationProfile,
        answerBank: mergedAnswerBank,
        executorMode: body.executorMode,
        job: body.job,
      });

      res.json(response);
    } catch (error) {
      sendErrorResponse(res, error, 'apply-sessions-create');
    }
  });

  app.get('/api/apply/sessions/:id', auth, limitApplySession, async (req, res) => {
    try {
      const session = getApplySessionForUser(req.params.id, req.internalUserId ?? req.userId);
      res.json(session);
    } catch (error) {
      sendErrorResponse(res, error, 'apply-sessions-get');
    }
  });

  app.get('/api/apply/sessions/:id/trace', auth, limitApplySession, async (req, res) => {
    try {
      const trace = getApplySessionTraceForUser(req.params.id, req.internalUserId ?? req.userId);
      res.json(trace);
    } catch (error) {
      sendErrorResponse(res, error, 'apply-sessions-trace');
    }
  });

  app.get('/api/apply/sessions/:id/context', limitApplySession, async (req, res) => {
    try {
      const context = getApplySessionContext(req.params.id, getExecutorToken(req));
      res.json(context);
    } catch (error) {
      sendErrorResponse(res, error, 'apply-sessions-context');
    }
  });

  app.get('/api/apply/sessions/:id/executor-state', limitApplySession, async (req, res) => {
    try {
      const session = getApplySessionForExecutor(req.params.id, getExecutorToken(req));
      res.json(session);
    } catch (error) {
      sendErrorResponse(res, error, 'apply-sessions-executor-state');
    }
  });

  app.post('/api/apply/sessions/:id/executor-mode', limitApplySession, async (req, res) => {
    try {
      const body = z.object({
        executorMode: z.enum(['extension', 'local_agent']),
        message: z.string().optional(),
      }).parse(req.body);
      const session = setApplySessionExecutorMode(
        req.params.id,
        getExecutorToken(req),
        body.executorMode,
        body.message,
      );
      res.json(session);
    } catch (error) {
      sendErrorResponse(res, error, 'apply-sessions-executor-mode');
    }
  });

  app.get('/api/apply/metrics', auth, limitApplySession, async (req, res) => {
    try {
      const metrics = req.internalUserId && isSupabaseConfigured()
        ? await getApplicationMetricsForUser(req.internalUserId)
        : getApplyAutomationMetricsForUser(req.internalUserId ?? req.userId);
      res.json(metrics);
    } catch (error) {
      sendErrorResponse(res, error, 'apply-metrics');
    }
  });

  app.get('/api/apply/reliability', auth, limitApplySession, async (req, res) => {
    try {
      if (req.internalUserId && isSupabaseConfigured()) {
        const snapshot = await getApplicationReliabilitySnapshotForUser(req.internalUserId);
        res.json(snapshot);
        return;
      }
      res.json({
        metrics: getApplyAutomationMetricsForUser(req.internalUserId ?? req.userId),
        recentIssues: [],
      });
    } catch (error) {
      sendErrorResponse(res, error, 'apply-reliability');
    }
  });

  app.post('/api/apply/sessions/:id/snapshot', limitApplySession, async (req, res) => {
    try {
      const snapshot = z.object({
        url: z.string().url(),
        title: z.string(),
        portalType: z.enum(['linkedin', 'naukri', 'phenom', 'greenhouse', 'lever', 'ashby', 'workday', 'icims', 'smartrecruiters', 'taleo', 'successfactors', 'generic', 'protected', 'unknown']),
        stepKind: z.enum(['profile', 'work_history', 'education', 'questionnaire', 'review', 'submit', 'unknown']),
        stepSignature: z.string(),
        fields: z.array(z.object({
          id: z.string(),
          name: z.string(),
          label: z.string(),
          placeholder: z.string(),
          inputType: z.string(),
          tagName: z.string(),
          widgetKind: z.enum(['text', 'textarea', 'select', 'radio_group', 'checkbox', 'file_upload', 'number', 'date', 'custom_combobox', 'custom_multiselect', 'custom_card_group', 'custom_date', 'custom_number', 'unknown']),
          required: z.boolean(),
          visible: z.boolean(),
          semanticHint: z.enum(['full_name', 'first_name', 'last_name', 'email', 'phone', 'linkedin', 'github', 'location', 'city', 'portfolio', 'website', 'current_company', 'current_title', 'years_of_experience', 'current_ctc', 'expected_ctc', 'notice_period', 'work_authorization', 'requires_sponsorship', 'visa_status', 'gender', 'resume_upload', 'cover_letter_upload', 'unknown']).optional(),
          reviewOnlyReason: z.string().optional(),
          value: z.string().optional(),
          checked: z.boolean().optional(),
          hasValue: z.boolean().optional(),
          options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
        })),
        controls: z.array(z.object({
          id: z.string(),
          label: z.string(),
          kind: z.enum(['next', 'review', 'submit', 'unknown']),
        })),
      }).parse(req.body) as PageSnapshot;

      const plan = planApplySnapshot(req.params.id, getExecutorToken(req), snapshot);
      res.json(plan);
    } catch (error) {
      sendErrorResponse(res, error, 'apply-sessions-snapshot');
    }
  });

  app.post('/api/apply/sessions/:id/events', limitApplySession, async (req, res) => {
    try {
      const event = z.object({
        status: z.enum(['created', 'queued', 'starting', 'filling', 'review_required', 'ready_to_submit', 'submitting', 'submitted', 'protected', 'unsupported', 'manual_required', 'failed']).optional(),
        message: z.string().optional(),
        screenshot: z.string().nullable().optional(),
        filledCount: z.number().int().nonnegative().optional(),
        reviewItems: z.array(z.object({
          fieldId: z.string(),
          label: z.string(),
          reason: z.string(),
          required: z.boolean(),
        })).optional(),
        pageUrl: z.string().url().optional(),
        portalType: z.enum(['linkedin', 'naukri', 'phenom', 'greenhouse', 'lever', 'ashby', 'workday', 'icims', 'smartrecruiters', 'taleo', 'successfactors', 'generic', 'protected', 'unknown']).optional(),
        pauseReason: z.enum(['none', 'protected_portal', 'login_required', 'legal_review_required', 'assessment_required', 'unsupported_widget', 'missing_profile_value', 'ambiguous_required_field', 'no_progress_after_advance', 'manual_required']).optional(),
        stepKind: z.enum(['profile', 'work_history', 'education', 'questionnaire', 'review', 'submit', 'unknown']).optional(),
        stepSignature: z.string().optional(),
      }).parse(req.body) as ApplySessionEvent;

      const session = recordApplySessionEvent(req.params.id, getExecutorToken(req), event);
      res.json(session);
    } catch (error) {
      sendErrorResponse(res, error, 'apply-sessions-events');
    }
  });

  app.post('/api/apply/sessions/:id/learn', auth, limitApplySession, async (req, res) => {
    try {
      const snapshot = z.object({
        url: z.string().url(),
        title: z.string(),
        portalType: z.enum(['linkedin', 'naukri', 'phenom', 'greenhouse', 'lever', 'ashby', 'workday', 'icims', 'smartrecruiters', 'taleo', 'successfactors', 'generic', 'protected', 'unknown']),
        stepKind: z.enum(['profile', 'work_history', 'education', 'questionnaire', 'review', 'submit', 'unknown']),
        stepSignature: z.string(),
        fields: z.array(z.object({
          id: z.string(),
          name: z.string(),
          label: z.string(),
          placeholder: z.string(),
          inputType: z.string(),
          tagName: z.string(),
          widgetKind: z.enum(['text', 'textarea', 'select', 'radio_group', 'checkbox', 'file_upload', 'number', 'date', 'custom_combobox', 'custom_multiselect', 'custom_card_group', 'custom_date', 'custom_number', 'unknown']),
          required: z.boolean(),
          visible: z.boolean(),
          semanticHint: z.enum(['full_name', 'first_name', 'last_name', 'email', 'phone', 'linkedin', 'github', 'location', 'city', 'portfolio', 'website', 'current_company', 'current_title', 'years_of_experience', 'current_ctc', 'expected_ctc', 'notice_period', 'work_authorization', 'requires_sponsorship', 'visa_status', 'gender', 'resume_upload', 'cover_letter_upload', 'unknown']).optional(),
          reviewOnlyReason: z.string().optional(),
          value: z.string().optional(),
          checked: z.boolean().optional(),
          hasValue: z.boolean().optional(),
          options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
        })),
        controls: z.array(z.object({
          id: z.string(),
          label: z.string(),
          kind: z.enum(['next', 'review', 'submit', 'unknown']),
        })),
      }).parse(req.body) as PageSnapshot;

      const learned = learnApplySessionCorrections(req.params.id, req.internalUserId ?? req.userId, snapshot);
      const memory = await saveApplicationMemoryForRequest(req, {
        profile: learned.profileUpdates,
        answerBank: learned.answerBank,
      });
      res.json({
        learnedCount: learned.learnedCount,
        profile: memory.profile,
        answerBank: memory.answerBank,
        session: learned.session,
      });
    } catch (error) {
      sendErrorResponse(res, error, 'apply-sessions-learn');
    }
  });

  app.post('/api/apply/sessions/:id/confirm-submit', auth, limitApplySession, async (req, res) => {
    try {
      const session = confirmApplySessionSubmit(req.params.id, req.internalUserId ?? req.userId);
      res.json(session);
    } catch (error) {
      sendErrorResponse(res, error, 'apply-sessions-confirm-submit');
    }
  });

  app.post('/api/apply/sessions/:id/complete', limitApplySession, async (req, res) => {
    try {
      const { outcome, message } = z.object({
        outcome: z.enum(['submitted', 'protected', 'unsupported', 'manual_required', 'failed']),
        message: z.string().optional(),
      }).parse(req.body);
      const session = completeApplySession(req.params.id, getExecutorToken(req), outcome, message);
      res.json(session);
    } catch (error) {
      sendErrorResponse(res, error, 'apply-sessions-complete');
    }
  });

  // Server-side Playwright auto-apply agent
  app.post('/api/auto-apply', auth, limitAutoApply, async (req, res) => {
    try {
      const body = z.object({
        applyUrl: z.string().url(),
        contactInfo: z.object({
          name: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          linkedin: z.string().optional(),
          location: z.string().optional(),
        }),
        tailoredResume: z.any(),
        templateProfile: z.any(),
        validation: z.any(),
      }).parse(req.body);
      const result = await startAutoApply(
        body.applyUrl,
        body.contactInfo,
        body.tailoredResume,
        body.templateProfile,
        body.validation,
        deps.getAI(req),
      );
      res.json(result);
    } catch (error) {
      sendErrorResponse(res, error, 'auto-apply');
    }
  });

  app.post('/api/auto-apply/submit', auth, limitAutoApply, async (req, res) => {
    try {
      const { sessionId } = z.object({ sessionId: z.string() }).parse(req.body);
      const result = await submitAutoApply(sessionId);
      res.json(result);
    } catch (error) {
      sendErrorResponse(res, error, 'auto-apply-submit');
    }
  });

  app.get('/api/applications', auth, async (req, res) => {
    try {
      if (deps.skipAuth || !req.internalUserId) {
        const body: { applications: ApplicationRecord[] } = { applications: [] };
        res.json(body);
        return;
      }
      const applications = await getApplicationsForUser(req.internalUserId);
      const body: { applications: ApplicationRecord[] } = { applications };
      res.json(body);
    } catch (error) {
      sendErrorResponse(res, error, 'applications-list');
    }
  });

  app.get('/api/applications/:id/trace', auth, async (req, res) => {
    try {
      if (deps.skipAuth || !req.internalUserId) {
        res.json({ trace: [] });
        return;
      }
      const trace = await getApplicationTraceForUser(req.params.id, req.internalUserId);
      res.json({ trace });
    } catch (error) {
      sendErrorResponse(res, error, 'applications-trace');
    }
  });

  app.get('/api/applications/:id/replays', auth, async (req, res) => {
    try {
      if (deps.skipAuth || !req.internalUserId) {
        res.json({ applications: [] });
        return;
      }
      const applications = await getRelatedApplicationsForUser(req.params.id, req.internalUserId);
      res.json({ applications });
    } catch (error) {
      sendErrorResponse(res, error, 'applications-replays');
    }
  });

  app.patch('/api/applications/:id', auth, async (req, res) => {
    try {
      if (deps.skipAuth || !req.internalUserId) {
        res.json({ success: true });
        return;
      }
      const { id } = req.params;
      const { status, notes } = z.object({
        status: z.enum(['queued', 'pending', 'applied', 'rejected', 'review', 'interview', 'offered', 'in_progress', 'manual_required', 'failed']),
        notes: z.string().optional(),
      }).parse(req.body);
      const updated = await updateApplicationStatus(id, status as ApplicationStatus, notes, undefined, req.internalUserId);
      if (!updated) {
        res.status(404).json({ error: 'Application not found.', code: 'NOT_FOUND' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      sendErrorResponse(res, error, 'applications-patch');
    }
  });

  app.get('/api/jobs', auth, async (req, res) => {
    try {
      if (deps.skipAuth || !req.internalUserId) {
        const body: { jobs: JobRecord[] } = { jobs: [] };
        res.json(body);
        return;
      }
      const jobs = await getJobsForUser(req.internalUserId);
      const body: { jobs: JobRecord[] } = { jobs };
      res.json(body);
    } catch (error) {
      sendErrorResponse(res, error, 'jobs-list');
    }
  });

  app.patch('/api/jobs/:id', auth, async (req, res) => {
    try {
      if (deps.skipAuth || !req.internalUserId) {
        res.json({ success: true });
        return;
      }
      const { lifecycleStatus } = z.object({
        lifecycleStatus: z.enum(['discovered', 'shown', 'saved', 'queued', 'applying', 'applied', 'failed', 'manual_required', 'dismissed']),
      }).parse(req.body) as { lifecycleStatus: JobLifecycleStatus };
      const updated = await updateJobLifecycle(req.internalUserId, req.params.id, lifecycleStatus);
      if (!updated) {
        res.status(404).json({ error: 'Job not found.', code: 'NOT_FOUND' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      sendErrorResponse(res, error, 'jobs-patch');
    }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    sendErrorResponse(res, error, 'app-middleware');
  });

  return app;
}
