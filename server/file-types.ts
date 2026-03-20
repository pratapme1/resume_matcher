import mammoth from 'mammoth';
// @ts-ignore
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { badRequest, unprocessable } from './errors.ts';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME = 'application/pdf';
const TEXT_MIME = 'text/plain';

function hasDocxSignature(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function hasPdfSignature(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
}

export function detectFileKind(mimetype: string, originalname: string, buffer: Buffer): 'docx' | 'pdf' | 'txt' | 'unknown' {
  const lowerName = originalname.toLowerCase();
  if (mimetype === DOCX_MIME || lowerName.endsWith('.docx') || (mimetype === 'application/octet-stream' && hasDocxSignature(buffer))) {
    return 'docx';
  }
  if (mimetype === PDF_MIME || lowerName.endsWith('.pdf') || (mimetype === 'application/octet-stream' && hasPdfSignature(buffer))) {
    return 'pdf';
  }
  if (mimetype === TEXT_MIME || lowerName.endsWith('.txt')) {
    return 'txt';
  }
  return 'unknown';
}

export async function extractTextFromUpload(buffer: Buffer, mimetype: string, originalname: string): Promise<string> {
  const kind = detectFileKind(mimetype, originalname, buffer);
  if (kind === 'unknown') {
    throw badRequest('Unsupported file type. Upload a DOCX, PDF, or TXT file.', 'UNSUPPORTED_FILE_TYPE', {
      logMessage: `Rejected unsupported upload type: ${mimetype} (${originalname})`,
    });
  }

  try {
    if (kind === 'pdf') {
      const data = await pdfParse(buffer);
      return data.text;
    }
    if (kind === 'docx') {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    return buffer.toString('utf-8');
  } catch (error) {
    throw unprocessable('The uploaded file could not be parsed.', 'INVALID_UPLOAD', {
      cause: error,
      logMessage: `Failed to parse ${kind} upload: ${originalname}`,
    });
  }
}

export function isDocxUpload(mimetype: string, originalname: string, buffer: Buffer): boolean {
  return detectFileKind(mimetype, originalname, buffer) === 'docx';
}
