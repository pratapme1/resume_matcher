import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import multer from 'multer';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { z } from 'zod';
import { buildAnalysis, buildTailoringPlan } from './analysis.ts';
import { buildGapAnalysis } from './gap-analysis.ts';
import { generateTailoredDocx } from './docx-render.ts';
import {
  getMemoryApplicationProfile,
  mergeApplicantProfiles,
  sanitizeApplicantProfile,
  setMemoryApplicationProfile,
} from './application-profile.ts';
import {
  createApplySession,
  confirmApplySessionSubmit,
  completeApplySession,
  getApplySessionForUser,
  planApplySnapshot,
  recordApplySessionEvent,
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
import { tailorResumeWithAI } from './tailor.ts';
import { validateTailoredResume } from './validate.ts';
import { startAutoApply, submitAutoApply } from './auto-apply.ts';
import { searchJobs, buildCandidateProfile } from './job-search.ts';
import { requireAuth } from './middleware/auth.ts';
import { writeUsageEvent, isOverQuota } from './db/queries/usage.ts';
import { getStoredApplicationProfile, upsertStoredApplicationProfile } from './db/queries/application-profiles.ts';
import { createJobSearchSession } from './db/queries/sessions.ts';
import { supabase } from './db/client.ts';
import { logger } from './logger.ts';
import type {
  ApplicantProfile,
  ApplySessionEvent,
  PageSnapshot,
  JobSearchPreferences,
  ResumeTemplateProfile,
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

export interface AIClient {
  models: {
    generateContent: (args: unknown) => Promise<{ text?: string | null }>;
  };
}

export interface AppDependencies {
  getAI: (req?: Request) => AIClient;
  fetchImpl?: typeof fetch;
  disablePlaywrightJdFallback?: boolean;
  /** Skip auth + DB writes — for unit/integration tests */
  skipAuth?: boolean;
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
  const limitExtract = deps.skipAuth ? bypassRateLimit : rateLimitExtract;
  const limitTailor = deps.skipAuth ? bypassRateLimit : rateLimitTailor;
  const limitDocx = deps.skipAuth ? bypassRateLimit : rateLimitDocx;
  const limitProfile = deps.skipAuth ? bypassRateLimit : rateLimitProfile;
  const limitSearch = deps.skipAuth ? bypassRateLimit : rateLimitSearch;
  const limitSmartFill = deps.skipAuth ? bypassRateLimit : rateLimitSmartFill;
  const limitAutoApply = deps.skipAuth ? bypassRateLimit : rateLimitAutoApply;
  const limitApplySession = deps.skipAuth ? bypassRateLimit : rateLimitApplySession;
  const upload = multer({
    limits: { fileSize: MAX_UPLOAD_BYTES },
    storage: multer.memoryStorage(),
  });

  const appUrl = process.env.APP_URL;
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

  const loadApplicationProfileForRequest = async (req: Request): Promise<ApplicantProfile> => {
    const userKey = getProfileUserKey(req);
    if (deps.skipAuth) {
      return sanitizeApplicantProfile(getMemoryApplicationProfile(userKey));
    }
    const stored = await getStoredApplicationProfile(userKey);
    return sanitizeApplicantProfile(stored);
  };

  const saveApplicationProfileForRequest = async (req: Request, profile: Partial<ApplicantProfile>): Promise<ApplicantProfile> => {
    const userKey = getProfileUserKey(req);
    const sanitized = sanitizeApplicantProfile(profile);
    if (deps.skipAuth) {
      return setMemoryApplicationProfile(userKey, sanitized);
    }
    return upsertStoredApplicationProfile(userKey, sanitized);
  };

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
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
      if (!req.file) {
        throw badRequest('Resume file is required.', 'INVALID_REQUEST', {
          logMessage: 'Missing resume upload for tailoring request.',
        });
      }
      if (!isDocxUpload(req.file.mimetype, req.file.originalname, req.file.buffer)) {
        throw badRequest('Reference resume must be a DOCX file for high-fidelity tailoring.', 'UNSUPPORTED_FILE_TYPE', {
          logMessage: `Rejected non-DOCX resume upload: ${req.file.originalname}`,
        });
      }

      const { jdText } = tailorResumeFormSchema.parse(req.body);
      const preferences = parsePreferencesField(req.body.preferences);

      const normalizedJobDescription = buildNormalizedJobDescription(jdText, 'paste');

      let parsedResume: Awaited<ReturnType<typeof parseResumeDocx>>;
      try {
        parsedResume = await parseResumeDocx(req.file.buffer);
      } catch (error) {
        throw unprocessable('The uploaded resume could not be parsed.', 'RESUME_PARSE_FAILED', {
          cause: error,
          logMessage: `Failed to parse uploaded resume ${req.file.originalname}.`,
        });
      }

      const { resume, templateProfile } = parsedResume;
      const ai = deps.getAI(req);

      const jdRequirements = await buildJDRequirementModel(normalizedJobDescription, ai);
      const tailoringPlan = buildTailoringPlan(resume, jdRequirements);
      const gapAnalysis = await buildGapAnalysis(ai, resume, jdRequirements, normalizedJobDescription.cleanText);
      tailoringPlan.gapAnalysis = gapAnalysis;

      const tailoredResume = await tailorResumeWithAI(
        ai,
        resume,
        normalizedJobDescription.cleanText,
        jdRequirements,
        tailoringPlan,
        preferences,
      );

      const analysis = buildAnalysis(
        resume,
        jdRequirements,
        normalizedJobDescription.cleanText,
        buildTailoredCorpus(tailoredResume),
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
            parseWarnings: [...normalizedJobDescription.extractionWarnings, ...resume.parseWarnings],
            jdCompanyName: jdRequirements.companyName,
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
            parseWarnings: [...normalizedJobDescription.extractionWarnings, ...resume.parseWarnings],
            jdCompanyName: jdRequirements.companyName,
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
      if (!req.file) {
        throw badRequest('Resume file is required.', 'INVALID_REQUEST', { logMessage: 'Missing resume for build-profile.' });
      }
      if (!isDocxUpload(req.file.mimetype, req.file.originalname, req.file.buffer)) {
        throw badRequest('Resume must be a DOCX file.', 'UNSUPPORTED_FILE_TYPE', { logMessage: `Rejected non-DOCX for build-profile: ${req.file.originalname}` });
      }
      let parsedResume: Awaited<ReturnType<typeof parseResumeDocx>>;
      try {
        parsedResume = await parseResumeDocx(req.file.buffer);
      } catch (error) {
        throw unprocessable('The uploaded resume could not be parsed.', 'RESUME_PARSE_FAILED', { cause: error, logMessage: `Failed to parse resume for build-profile.` });
      }
      const profile = buildCandidateProfile(parsedResume.resume);
      if (!deps.skipAuth && req.internalUserId) {
        try {
          void Promise.resolve(supabase.from('uploaded_resumes').insert({
            user_id: req.internalUserId,
            filename: req.file.originalname,
            storage_path: `${req.internalUserId}/${Date.now()}_${req.file.originalname}`,
            file_size_bytes: req.file.size,
            candidate_profile_json: profile,
            parsed_json: null,
          })).catch(() => {});
        } catch { /* ignore — fire-and-forget */ }
      }
      res.json(profile);
    } catch (error) {
      sendErrorResponse(res, error, 'build-profile');
    }
  });

  app.get('/api/application-profile', auth, limitProfile, async (req, res) => {
    try {
      const profile = await loadApplicationProfileForRequest(req);
      res.json({ profile });
    } catch (error) {
      sendErrorResponse(res, error, 'application-profile-get');
    }
  });

  app.put('/api/application-profile', auth, limitProfile, async (req, res) => {
    try {
      const body = z.object({ profile: applicantProfileSchema }).parse(req.body);
      const existingProfile = await loadApplicationProfileForRequest(req);
      const mergedProfile = mergeApplicantProfiles(existingProfile, body.profile);
      const profile = await saveApplicationProfileForRequest(req, mergedProfile);
      res.json({ profile });
    } catch (error) {
      sendErrorResponse(res, error, 'application-profile-put');
    }
  });

  // Job search: build candidate profile from resume + search via Gemini grounding
  app.post('/api/search-jobs', auth, limitSearch, async (req, res) => {
    try {
      // Monthly quota check
      if (!deps.skipAuth && req.userId && await isOverQuota(req.internalUserId ?? req.userId, 'search', req.userEmail)) {
        res.status(402).json({ error: 'Monthly search limit reached. Upgrade to Pro for more.', code: 'QUOTA_EXCEEDED' });
        return;
      }

      await runSingleUpload(upload, req, res, 'resume');
      if (!req.file) {
        throw badRequest('Resume file is required.', 'INVALID_REQUEST', {
          logMessage: 'Missing resume upload for job search.',
        });
      }
      if (!isDocxUpload(req.file.mimetype, req.file.originalname, req.file.buffer)) {
        throw badRequest('Resume must be a DOCX file.', 'UNSUPPORTED_FILE_TYPE', {
          logMessage: `Rejected non-DOCX resume for job search: ${req.file.originalname}`,
        });
      }

      let preferences: JobSearchPreferences = {};
      if (req.body.preferences) {
        try {
          preferences = JSON.parse(req.body.preferences);
        } catch {
          // ignore malformed prefs
        }
      }

      let parsedResume: Awaited<ReturnType<typeof parseResumeDocx>>;
      try {
        parsedResume = await parseResumeDocx(req.file.buffer);
      } catch (error) {
        throw unprocessable('The uploaded resume could not be parsed.', 'RESUME_PARSE_FAILED', {
          cause: error,
          logMessage: `Failed to parse resume for job search: ${req.file.originalname}`,
        });
      }

      const ai = deps.getAI(req);
      const t0 = Date.now();
      const response = await searchJobs(parsedResume.resume, preferences, ai);

      if (!deps.skipAuth && req.userId) {
        const effectiveUserId = req.internalUserId ?? req.userId;
        writeUsageEvent({ userId: effectiveUserId, eventType: 'search', status: 'success', durationMs: Date.now() - t0 })
          .catch(err => logger.error({ err }, 'Failed to write search usage event'));
        createJobSearchSession({
          userId: effectiveUserId,
          preferencesJson: preferences,
          candidateProfileJson: response.candidateProfile,
          resultsJson: response.results,
          totalResults: response.totalFound,
        }).catch(err => logger.error({ err }, 'Failed to create job search session'));
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
      }).parse(req.body);

      const savedProfile = await loadApplicationProfileForRequest(req);
      const mergedApplicationProfile = mergeApplicantProfiles(savedProfile, body.applicationProfile);

      if (body.applicationProfile) {
        try {
          await saveApplicationProfileForRequest(req, mergedApplicationProfile);
        } catch (error) {
          logger.warn({ error }, 'Failed to persist application profile before creating apply session.');
        }
      }

      const response = await createApplySession({
        applyUrl: body.applyUrl,
        userId: req.internalUserId ?? req.userId,
        tailoredResume: body.tailoredResume as TailoredResumeDocument,
        templateProfile: body.templateProfile as ResumeTemplateProfile,
        validation: body.validation as ValidationReport,
        applicationProfile: mergedApplicationProfile,
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

  app.post('/api/apply/sessions/:id/snapshot', limitApplySession, async (req, res) => {
    try {
      const snapshot = z.object({
        url: z.string().url(),
        title: z.string(),
        portalType: z.enum(['phenom', 'greenhouse', 'lever', 'ashby', 'workday', 'icims', 'smartrecruiters', 'taleo', 'successfactors', 'generic', 'protected', 'unknown']),
        stepKind: z.enum(['profile', 'work_history', 'education', 'questionnaire', 'review', 'submit', 'unknown']),
        stepSignature: z.string(),
        fields: z.array(z.object({
          id: z.string(),
          name: z.string(),
          label: z.string(),
          placeholder: z.string(),
          inputType: z.string(),
          tagName: z.string(),
          widgetKind: z.enum(['text', 'textarea', 'select', 'radio_group', 'checkbox', 'file_upload', 'number', 'date', 'custom_combobox', 'custom_multiselect', 'custom_date', 'custom_number', 'unknown']),
          required: z.boolean(),
          visible: z.boolean(),
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
        portalType: z.enum(['phenom', 'greenhouse', 'lever', 'ashby', 'workday', 'icims', 'smartrecruiters', 'taleo', 'successfactors', 'generic', 'protected', 'unknown']).optional(),
        pauseReason: z.enum(['none', 'protected_portal', 'login_required', 'unsupported_widget', 'missing_profile_value', 'ambiguous_required_field', 'no_progress_after_advance', 'manual_required']).optional(),
        stepKind: z.enum(['profile', 'work_history', 'education', 'questionnaire', 'review', 'submit', 'unknown']).optional(),
        stepSignature: z.string().optional(),
      }).parse(req.body) as ApplySessionEvent;

      const session = recordApplySessionEvent(req.params.id, getExecutorToken(req), event);
      res.json(session);
    } catch (error) {
      sendErrorResponse(res, error, 'apply-sessions-events');
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

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    sendErrorResponse(res, error, 'app-middleware');
  });

  return app;
}
