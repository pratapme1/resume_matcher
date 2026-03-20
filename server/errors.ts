export type ApiErrorCode =
  | 'AI_INVALID_RESPONSE'
  | 'AI_PROVIDER_ERROR'
  | 'DOCX_RENDER_FAILED'
  | 'EMPTY_EXTRACTED_TEXT'
  | 'INTERNAL_ERROR'
  | 'INVALID_REQUEST'
  | 'INVALID_UPLOAD'
  | 'RENDER_BLOCKED'
  | 'RESUME_PARSE_FAILED'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'UPLOAD_TOO_LARGE'
  | 'URL_FETCH_FAILED'
  | 'URL_FETCH_TIMEOUT';

type AppErrorOptions = {
  cause?: unknown;
  logMessage?: string;
};

export class AppError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly cause?: unknown;
  readonly logMessage?: string;

  constructor(status: number, code: ApiErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.cause = options.cause;
    this.logMessage = options.logMessage;
  }
}

export function badGateway(message: string, code: ApiErrorCode, options?: AppErrorOptions): AppError {
  return new AppError(502, code, message, options);
}

export function badRequest(message: string, code: ApiErrorCode = 'INVALID_REQUEST', options?: AppErrorOptions): AppError {
  return new AppError(400, code, message, options);
}

export function gatewayTimeout(message: string, code: ApiErrorCode, options?: AppErrorOptions): AppError {
  return new AppError(504, code, message, options);
}

export function internalServerError(
  message = 'An internal server error occurred.',
  code: ApiErrorCode = 'INTERNAL_ERROR',
  options?: AppErrorOptions,
): AppError {
  return new AppError(500, code, message, options);
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function payloadTooLarge(message: string, code: ApiErrorCode, options?: AppErrorOptions): AppError {
  return new AppError(413, code, message, options);
}

export function toApiError(error: unknown): {
  error: AppError;
  body: {
    error: string;
    code: ApiErrorCode;
  };
} {
  const appError = isAppError(error) ? error : internalServerError(undefined, 'INTERNAL_ERROR', { cause: error });
  return {
    error: appError,
    body: {
      error: appError.message,
      code: appError.code,
    },
  };
}

export function unprocessable(message: string, code: ApiErrorCode, options?: AppErrorOptions): AppError {
  return new AppError(422, code, message, options);
}
