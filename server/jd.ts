import type {
  ExtractionWarning,
  InputSourceType,
  JDRequirementModel,
  NormalizedJobDescription,
} from '../src/shared/types.ts';
import { clamp, normalizeWhitespace, sanitizeKeyword, splitLines, unique } from './utils.ts';

const NOISE_PATTERNS = [
  /privacy policy/gi,
  /terms of use/gi,
  /cookie preferences/gi,
  /apply now/gi,
  /sign in/gi,
  /create account/gi,
  /share this job/gi,
];

const MUST_HAVE_MARKERS = ['required', 'must have', 'must-have', 'minimum', 'qualifications'];
const NICE_TO_HAVE_MARKERS = ['preferred', 'nice to have', 'plus', 'bonus'];
const SENIORITY_TERMS = ['senior', 'staff', 'lead', 'principal', 'manager', 'director', 'entry level', 'junior'];

const KEYWORD_PATTERNS = [
  /\b(?:react|typescript|javascript|node\.?js|python|java|aws|gcp|azure|docker|kubernetes|sql|graphql|rest|microservices|leadership|product|analytics|testing|ci\/cd)\b/gi,
];

export function normalizeJobDescription(rawText: string, sourceType: InputSourceType): NormalizedJobDescription {
  const warnings: ExtractionWarning[] = [];
  const lineCount = splitLines(rawText).length;
  let cleanText = rawText;

  for (const pattern of NOISE_PATTERNS) {
    cleanText = cleanText.replace(pattern, ' ');
  }

  cleanText = normalizeWhitespace(cleanText);

  if (cleanText.length < 400) {
    warnings.push({
      code: 'JD_TOO_SHORT',
      message: 'The extracted job description is short and may be incomplete.',
      severity: 'warning',
    });
  }

  if (lineCount < 5) {
    warnings.push({
      code: 'JD_LOW_STRUCTURE',
      message: 'The job description had very little structure after extraction.',
      severity: 'warning',
    });
  }

  const repeatedRatio = rawText.length > 0 ? 1 - cleanText.length / rawText.length : 0;
  if (repeatedRatio > 0.25) {
    warnings.push({
      code: 'JD_HEAVY_CLEANUP',
      message: 'A significant amount of boilerplate was removed from the job description.',
      severity: 'info',
    });
  }

  const qualityPenalty = warnings.reduce((total, warning) => {
    if (warning.severity === 'warning') return total + 15;
    if (warning.severity === 'error') return total + 30;
    return total + 5;
  }, 0);

  return {
    sourceType,
    rawText,
    cleanText,
    extractionWarnings: warnings,
    qualityScore: clamp(100 - qualityPenalty, 30, 100),
  };
}

function extractKeywords(text: string): string[] {
  const values: string[] = [];
  for (const pattern of KEYWORD_PATTERNS) {
    const matches = text.match(pattern) ?? [];
    for (const match of matches) {
      values.push(sanitizeKeyword(match));
    }
  }
  return unique(values.filter(Boolean));
}

export function buildJDRequirementModel(jd: NormalizedJobDescription): JDRequirementModel {
  const lines = splitLines(jd.cleanText);
  const mustHaveKeywords = new Set<string>();
  const niceToHaveKeywords = new Set<string>();
  const responsibilities: string[] = [];
  const targetTitles: string[] = [];
  const senioritySignals: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    const keywords = extractKeywords(line);

    if (/(engineer|developer|manager|architect|analyst|designer|consultant)/i.test(line) && line.length < 140) {
      targetTitles.push(line);
    }

    if (MUST_HAVE_MARKERS.some((marker) => lower.includes(marker))) {
      keywords.forEach((keyword) => mustHaveKeywords.add(keyword));
    } else if (NICE_TO_HAVE_MARKERS.some((marker) => lower.includes(marker))) {
      keywords.forEach((keyword) => niceToHaveKeywords.add(keyword));
    }

    if (/^(responsibilities|what you will do|what you'll do|role overview)/i.test(line) || lower.includes('responsible for')) {
      responsibilities.push(line);
    }

    SENIORITY_TERMS.forEach((term) => {
      if (lower.includes(term)) senioritySignals.push(term);
    });
  }

  const fallbackKeywords = extractKeywords(jd.cleanText);
  if (!mustHaveKeywords.size) {
    fallbackKeywords.slice(0, 8).forEach((keyword) => mustHaveKeywords.add(keyword));
  }

  return {
    targetTitles: unique(targetTitles).slice(0, 5),
    mustHaveKeywords: Array.from(mustHaveKeywords).slice(0, 12),
    niceToHaveKeywords: Array.from(niceToHaveKeywords)
      .filter((keyword) => !mustHaveKeywords.has(keyword))
      .slice(0, 10),
    responsibilities: unique(responsibilities).slice(0, 8),
    senioritySignals: unique(senioritySignals),
  };
}
