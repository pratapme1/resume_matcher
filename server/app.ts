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
import { createJobSearchSession } from './db/queries/sessions.ts';
import { logger } from './logger.ts';
import type {
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

export function createApp(deps: AppDependencies): Express {
  const app = express();
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
    ? (_req: Request, _res: Response, next: NextFunction) => next()
    : requireAuth;

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/extract-jd-url', auth, rateLimitExtract, async (req, res) => {
    try {
      const { url } = extractJdUrlRequestSchema.parse(req.body);
      const rawText = await fetchJobDescriptionText(
        url,
        deps.fetchImpl ?? fetch,
        undefined,
        deps.disablePlaywrightJdFallback ? null : undefined,
      );
      const normalized = buildNormalizedJobDescription(rawText, 'url');
      res.json(normalized);
    } catch (error) {
      sendErrorResponse(res, error, 'extract-jd-url');
    }
  });

  app.post('/api/extract-jd-file', auth, rateLimitExtract, async (req, res) => {
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

  app.post('/api/extract-jd-text', auth, rateLimitExtract, async (req, res) => {
    try {
      const { text } = z.object({ text: z.string().min(1) }).parse(req.body);
      const normalized = buildNormalizedJobDescription(text, 'paste');
      res.json(normalized);
    } catch (error) {
      sendErrorResponse(res, error, 'extract-jd-text');
    }
  });

  app.post('/api/tailor-resume', auth, rateLimitTailor, async (req, res) => {
    try {
      // Monthly quota check
      if (!deps.skipAuth && req.userId && await isOverQuota(req.userId, 'tailor')) {
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
            templateProfile,
            tailoringPlan,
            renderReadiness: 'blocked',
            normalizedJobDescription,
            parseWarnings: [...normalizedJobDescription.extractionWarnings, ...resume.parseWarnings],
            jdCompanyName: jdRequirements.companyName,
          };

      if (!deps.skipAuth && req.userId) {
        writeUsageEvent({ userId: req.userId, eventType: 'tailor', status: validation.isValid ? 'success' : 'blocked' })
          .catch(err => logger.error({ err }, 'Failed to write tailor usage event'));
      }
      res.json(response);
    } catch (error) {
      if (!deps.skipAuth && req.userId) {
        writeUsageEvent({ userId: req.userId, eventType: 'tailor', status: 'error' })
          .catch(err => logger.error({ err }, 'Failed to write tailor error event'));
      }
      sendErrorResponse(res, error, 'tailor-resume');
    }
  });

  app.post('/api/generate-docx', auth, rateLimitDocx, async (req, res) => {
    try {
      const { tailoredResume, templateProfile, validation } = generateDocxRequestSchema.parse(req.body);
      if (!validation.isValid) {
        throw unprocessable('DOCX generation is blocked until validation issues are resolved.', 'RENDER_BLOCKED', {
          logMessage: 'DOCX generation blocked because validation was not successful.',
        });
      }

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
  app.post('/api/build-profile', auth, rateLimitProfile, async (req, res) => {
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
      res.json(profile);
    } catch (error) {
      sendErrorResponse(res, error, 'build-profile');
    }
  });

  // Job search: build candidate profile from resume + search via Gemini grounding
  app.post('/api/search-jobs', auth, rateLimitSearch, async (req, res) => {
    try {
      // Monthly quota check
      if (!deps.skipAuth && req.userId && await isOverQuota(req.userId, 'search')) {
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
        writeUsageEvent({ userId: req.userId, eventType: 'search', status: 'success', durationMs: Date.now() - t0 })
          .catch(err => logger.error({ err }, 'Failed to write search usage event'));
        createJobSearchSession({
          userId: req.userId,
          preferencesJson: preferences,
          candidateProfileJson: response.candidateProfile,
          resultsJson: response.results,
          totalResults: response.totalFound,
        }).catch(err => logger.error({ err }, 'Failed to create job search session'));
      }
      res.json(response);
    } catch (error) {
      if (!deps.skipAuth && req.userId) {
        writeUsageEvent({ userId: req.userId, eventType: 'search', status: 'error' })
          .catch(err => logger.error({ err }, 'Failed to write search error event'));
      }
      sendErrorResponse(res, error, 'search-jobs');
    }
  });

  // AI-powered form filler — called by the Chrome extension content script
  app.post('/api/smart-fill', auth, rateLimitSmartFill, async (req, res) => {
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

  // Server-side Playwright auto-apply agent
  app.post('/api/auto-apply', auth, rateLimitAutoApply, async (req, res) => {
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

  app.post('/api/auto-apply/submit', auth, rateLimitAutoApply, async (req, res) => {
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
