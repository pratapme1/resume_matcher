import type {
  ExtractionWarning,
  InputSourceType,
  JDRequirementModel,
  NormalizedJobDescription,
} from '../src/shared/types.ts';
import type { AIClient } from './app.ts';
import { readSanitizedEnv } from './env.ts';
import { clamp, normalizeWhitespace, sanitizeKeyword, splitLines, unique } from './utils.ts';

const DEFAULT_JD_MODEL = 'gemini-2.5-flash';

interface AIJDExtractionResult {
  mustHaveKeywords: string[];
  niceToHaveKeywords: string[];
  targetTitles: string[];
  seniorityLevel: string;
  companyName: string;
}

async function extractJDRequirementsWithAI(
  ai: AIClient,
  jdText: string,
): Promise<AIJDExtractionResult | null> {
  try {
    const modelName = readSanitizedEnv('GEMINI_JD_MODEL') || DEFAULT_JD_MODEL;
    const prompt = `You are a job description analyst. Extract structured requirements from the job description below.
Work across ALL domains (software, finance, design, marketing, data science, operations, product, etc.).

Output valid JSON only. No markdown. No explanation.

{
  "mustHaveKeywords": string[],
  "niceToHaveKeywords": string[],
  "targetTitles": string[],
  "seniorityLevel": string,
  "companyName": string
}

STRICT Rules:
- mustHaveKeywords: extract SKILLS and DOMAIN KNOWLEDGE only.
  Each keyword MUST be 1-3 words. NEVER more than 3 words. NEVER a full sentence.
  ONLY extract from the Skills/Qualifications/Requirements sections — NOT from Education or Experience duration fields.
  DO NOT extract: years of experience, degree requirements, education fields, adjectives alone, or full sentences.
  DO NOT extract: "15 years experience", "bachelor's degree", "computer science", "business administration",
    "fast-paced environment", "delivering results", "passionate about".
  DO extract: skills, tools, methodologies, domain terms.
  Good examples: "product management", "roadmap", "stakeholder management", "cross-functional teams",
    "product strategy", "user research", "OKRs", "tech events", "agile", "product lifecycle",
    "customer feedback", "product delivery", "Figma", "SQL", "P&L", "DCF modeling".
  Max 12 keywords.
- niceToHaveKeywords: same STRICT 1-3 word format. Only items explicitly marked preferred/bonus/nice-to-have. Max 8.
- targetTitles: the exact role title(s) this posting is for. Max 3.
- seniorityLevel: one of: entry, mid, senior, staff, lead, manager, director, vp, "" if unclear.
- companyName: the hiring company name exactly as it appears. "" if not found.

JOB_DESCRIPTION:
${jdText}`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text || '{}') as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as AIJDExtractionResult).mustHaveKeywords) ||
      !Array.isArray((parsed as AIJDExtractionResult).niceToHaveKeywords) ||
      !Array.isArray((parsed as AIJDExtractionResult).targetTitles) ||
      (parsed as AIJDExtractionResult).mustHaveKeywords.some((k) => typeof k !== 'string') ||
      (parsed as AIJDExtractionResult).niceToHaveKeywords.some((k) => typeof k !== 'string') ||
      (parsed as AIJDExtractionResult).targetTitles.some((k) => typeof k !== 'string')
    ) {
      return null;
    }

    return parsed as AIJDExtractionResult;
  } catch {
    return null;
  }
}

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

function buildJDRequirementModelHeuristic(jd: NormalizedJobDescription): JDRequirementModel {
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
    aiExtracted: false,
  };
}

export async function buildJDRequirementModel(
  jd: NormalizedJobDescription,
  ai: AIClient,
): Promise<JDRequirementModel> {
  const lines = splitLines(jd.cleanText);
  const responsibilities: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (/^(responsibilities|what you will do|what you'll do|role overview)/i.test(line) || lower.includes('responsible for')) {
      responsibilities.push(line);
    }
  }

  const senioritySignals: string[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    SENIORITY_TERMS.forEach((term) => {
      if (lower.includes(term)) senioritySignals.push(term);
    });
  }

  const aiResult = await extractJDRequirementsWithAI(ai, jd.cleanText);

  const isConciseKeyword = (k: string) => k.trim().split(/\s+/).length <= 4;

  if (aiResult && aiResult.mustHaveKeywords.length > 0) {
    const mustHaveKeywords = unique(
      aiResult.mustHaveKeywords.map(sanitizeKeyword).filter(Boolean).filter(isConciseKeyword),
    ).slice(0, 12);
    const niceToHaveKeywords = unique(
      aiResult.niceToHaveKeywords.map(sanitizeKeyword).filter(Boolean).filter(isConciseKeyword),
    )
      .filter((k) => !mustHaveKeywords.includes(k))
      .slice(0, 8);
    const targetTitles = aiResult.targetTitles.slice(0, 5);
    const aiSenioritySignals = aiResult.seniorityLevel ? [aiResult.seniorityLevel] : [];

    return {
      targetTitles,
      mustHaveKeywords,
      niceToHaveKeywords,
      responsibilities: unique(responsibilities).slice(0, 8),
      senioritySignals: unique([...aiSenioritySignals, ...senioritySignals]),
      aiExtracted: true,
      companyName: aiResult.companyName?.trim() || undefined,
    };
  }

  return buildJDRequirementModelHeuristic(jd);
}
