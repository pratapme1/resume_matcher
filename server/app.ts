import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';
import multer from 'multer';
import cors from 'cors';
import { z } from 'zod';
import { buildAnalysis, buildTailoringPlan } from './analysis.ts';
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
import type {
  ResumeTemplateProfile,
  TailorResumeResponse,
  TailoredResumeDocument,
  ValidationReport,
} from '../src/shared/types.ts';
import { normalizeWhitespace } from './utils.ts';

export interface AIClient {
  models: {
    generateContent: (args: unknown) => Promise<{ text?: string | null }>;
  };
}

export interface AppDependencies {
  getAI: (req?: Request) => AIClient;
  fetchImpl?: typeof fetch;
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

export function createApp(deps: AppDependencies): Express {
  const app = express();
  const upload = multer({
    limits: { fileSize: MAX_UPLOAD_BYTES },
    storage: multer.memoryStorage(),
  });

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/extract-jd-url', async (req, res) => {
    try {
      const { url } = extractJdUrlRequestSchema.parse(req.body);
      const rawText = await fetchJobDescriptionText(url, deps.fetchImpl ?? fetch);
      const normalized = buildNormalizedJobDescription(rawText, 'url');
      res.json(normalized);
    } catch (error) {
      sendErrorResponse(res, error, 'extract-jd-url');
    }
  });

  app.post('/api/extract-jd-file', async (req, res) => {
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

  app.post('/api/tailor-resume', async (req, res) => {
    try {
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
      const jdRequirements = buildJDRequirementModel(normalizedJobDescription);
      const tailoringPlan = buildTailoringPlan(resume, jdRequirements);
      const analysis = buildAnalysis(resume, jdRequirements, normalizedJobDescription.cleanText);

      const tailoredResume = await tailorResumeWithAI(
        deps.getAI(req),
        resume,
        normalizedJobDescription.cleanText,
        jdRequirements,
        tailoringPlan,
        preferences,
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
          };

      res.json(response);
    } catch (error) {
      sendErrorResponse(res, error, 'tailor-resume');
    }
  });

  app.post('/api/generate-docx', async (req, res) => {
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

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    sendErrorResponse(res, error, 'app-middleware');
  });

  return app;
}
