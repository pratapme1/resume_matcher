import { Type } from '@google/genai';
import type {
  JDRequirementModel,
  SourceProvenance,
  SourceResumeDocument,
  TailoredBullet,
  TailoredExperienceItem,
  TailoredHighlightMetric,
  TailoredProjectItem,
  TailoredResumeDocument,
  TailoredSkillCategory,
  TailoringPlan,
} from '../src/shared/types.ts';
import type { AIClient } from './app.ts';
import type { AIProviderName } from './ai.ts';
import { badGateway } from './errors.ts';
import { tailoredResumeMutableSchema, tailoredResumeSchema } from './schemas.ts';
import { unique } from './utils.ts';

const DEFAULT_TAILOR_MODEL = 'gemini-3-flash-preview';

export const TAILOR_PROMPT_VERSION = '2026-03-24.partial-generation-v1';
export const TAILOR_PIPELINE_VERSION = 'server-merge-v1';

export type TailorAIResult = {
  tailoredResume: TailoredResumeDocument;
  providerUsed: AIProviderName;
  fallbackUsed: boolean;
};

type MutableTailoredResume = {
  headline?: string;
  headlineSourceProvenanceIds?: string[];
  highlightMetrics?: TailoredHighlightMetric[];
  summary: string;
  summarySourceProvenanceIds: string[];
  experience: Array<{
    id: string;
    bullets: TailoredBullet[];
    sourceProvenanceIds?: string[];
  }>;
  projects?: Array<{
    id: string;
    bullets: TailoredBullet[];
    sourceProvenanceIds?: string[];
  }>;
  skillCategories?: TailoredSkillCategory[];
  skills?: string[];
  skillSourceProvenanceIds?: string[];
};

class AIProviderRequestError extends Error {
  providerName: AIProviderName;
  modelName: string;
  status?: number;
  unavailable: boolean;
  cause?: unknown;

  constructor(params: {
    providerName: AIProviderName;
    modelName: string;
    status?: number;
    message: string;
    unavailable: boolean;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = 'AIProviderRequestError';
    this.providerName = params.providerName;
    this.modelName = params.modelName;
    this.status = params.status;
    this.unavailable = params.unavailable;
    this.cause = params.cause;
  }
}

class AIProviderResponseError extends Error {
  providerName: AIProviderName;
  modelName: string;
  cause?: unknown;

  constructor(params: {
    providerName: AIProviderName;
    modelName: string;
    message: string;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = 'AIProviderResponseError';
    this.providerName = params.providerName;
    this.modelName = params.modelName;
    this.cause = params.cause;
  }
}

function getProviderName(ai: AIClient): AIProviderName {
  return ((ai as { providerName?: AIProviderName }).providerName ?? 'gemini');
}

function isProviderUnavailableError(error: { status?: number; message?: string }): boolean {
  if (typeof error.status === 'number') {
    if (error.status === 408 || error.status === 409 || error.status === 425 || error.status === 429) return true;
    if (error.status >= 500 && error.status < 600) return true;
    if (error.status === 404) return true;
    if (error.status === 400 && /model|provider|available|unavailable|not found/i.test(error.message ?? '')) return true;
  }

  const message = (error.message ?? '').toLowerCase();
  return [
    'resource_exhausted',
    'quota',
    'rate limit',
    'rate-limit',
    'timeout',
    'timed out',
    'fetch failed',
    'network',
    'connection',
    'econnreset',
    'enotfound',
    'unavailable',
    'overloaded',
    'model not found',
    'no such model',
  ].some((token) => message.includes(token));
}

function buildProviderError(error: AIProviderRequestError): never {
  const isGeminiQuota =
    error.providerName === 'gemini' && (error.status === 429 || error.message.includes('RESOURCE_EXHAUSTED'));
  throw badGateway(
    isGeminiQuota
      ? 'The configured Gemini model is out of quota. Please retry shortly or switch to a lighter model.'
      : 'The AI tailoring service is currently unavailable.',
    'AI_PROVIDER_ERROR',
    {
      cause: error.cause ?? error,
      logMessage: `AI provider request failed during resume tailoring using ${error.providerName}:${error.modelName}.`,
    },
  );
}

function buildInvalidResponseError(error: AIProviderResponseError): never {
  throw badGateway('The AI tailoring service returned invalid data.', 'AI_INVALID_RESPONSE', {
    cause: error.cause ?? error,
    logMessage: `AI provider returned an invalid tailoring payload for ${error.providerName}:${error.modelName}.`,
  });
}

function buildCandidateAnalysisSection(plan: TailoringPlan): string {
  const gap = plan.gapAnalysis;
  if (
    !gap ||
    (!gap.repositioningAngle &&
      gap.topStrengths.length === 0 &&
      gap.keyGaps.length === 0 &&
      gap.bulletPriorities.length === 0 &&
      !gap.summaryOpeningHint)
  ) {
    return '';
  }

  const gapLine =
    gap.keyGaps.length > 0
      ? `Genuine gaps (do NOT overreach): ${gap.keyGaps.join(' | ')}`
      : 'No significant gaps identified.';

  const priorityLines = gap.bulletPriorities
    .map((p) => `- Experience ${p.experienceId}: lead with themes [${p.leadThemes.join(', ')}]`)
    .join('\n');

  return `CANDIDATE_ANALYSIS:
Repositioning angle: ${gap.repositioningAngle}
Top strengths: ${gap.topStrengths.join(' | ')}
${gapLine}
Summary opening hint: ${gap.summaryOpeningHint}

Per-role bullet priorities:
${priorityLines}`;
}

function buildSourceFacts(resume: SourceResumeDocument) {
  return {
    contactInfo: resume.contactInfo,
    headline: resume.headline,
    headlineProvenanceIds: resume.headlineProvenanceIds,
    highlightMetrics: resume.highlightMetrics,
    summary: resume.summary,
    experience: resume.experience.map((item) => ({
      id: item.id,
      company: item.company,
      title: item.title,
      dates: item.dates,
      location: item.location,
      bullets: item.bullets,
      provenanceIds: item.provenanceIds,
    })),
    education: resume.education,
    skills: resume.skills,
    skillCategories: resume.skillCategories,
    projects: resume.projects,
    certifications: resume.certifications,
    sectionOrder: resume.sectionOrder,
  };
}

function provenanceIdsForText(sourceProvenance: SourceProvenance[], text: string): string[] {
  if (!text) return [];
  return sourceProvenance
    .filter((item) => item.text === text)
    .map((item) => item.id);
}

function filterKnownProvenance(ids: string[] | undefined, known: Set<string>): string[] {
  return unique((ids ?? []).filter((id) => known.has(id)));
}

function defaultHighlightMetrics(resume: SourceResumeDocument): TailoredHighlightMetric[] {
  return (resume.highlightMetrics ?? []).slice(0, 4).map((metric) => ({
    value: metric.value,
    label: metric.label,
    sourceProvenanceIds: metric.provenanceIds,
  }));
}

function defaultSkillSourceIds(resume: SourceResumeDocument): string[] {
  return unique([
    ...resume.skillCategories.flatMap((category) => category.provenanceIds),
    ...resume.skills.flatMap((skill) => provenanceIdsForText(resume.sourceProvenance, skill)),
  ]);
}

function defaultSkillCategories(resume: SourceResumeDocument): TailoredSkillCategory[] {
  return resume.skillCategories.map((category) => ({
    label: category.label,
    items: [...category.items],
    sourceProvenanceIds: [...category.provenanceIds],
  }));
}

function flattenSkills(categories: TailoredSkillCategory[] | undefined, fallback: string[]): string[] {
  const categoryItems = categories?.flatMap((category) => category.items) ?? [];
  return unique([...(categoryItems.length > 0 ? categoryItems : []), ...fallback].filter(Boolean));
}

function buildMergedExperienceItem(
  source: SourceResumeDocument['experience'][number],
  mutable: MutableTailoredResume['experience'][number] | undefined,
  knownProvenanceIds: Set<string>,
  sourceProvenance: SourceProvenance[],
): TailoredExperienceItem {
  const bullets = (mutable?.bullets?.length ? mutable.bullets : source.bullets.map((text) => ({
    text,
    sourceProvenanceIds: provenanceIdsForText(sourceProvenance, text),
  }))).map((bullet) => ({
    text: bullet.text,
    sourceProvenanceIds: filterKnownProvenance(
      bullet.sourceProvenanceIds?.length ? bullet.sourceProvenanceIds : provenanceIdsForText(sourceProvenance, bullet.text),
      knownProvenanceIds,
    ),
  }));

  return {
    id: source.id,
    company: source.company,
    title: source.title,
    dates: source.dates,
    location: source.location,
    bullets,
    sourceProvenanceIds: filterKnownProvenance(
      mutable?.sourceProvenanceIds?.length ? mutable.sourceProvenanceIds : source.provenanceIds,
      knownProvenanceIds,
    ),
  };
}

function buildMergedProjectItem(
  source: SourceResumeDocument['projects'][number],
  mutable: MutableTailoredResume['projects'][number] | undefined,
  knownProvenanceIds: Set<string>,
  sourceProvenance: SourceProvenance[],
): TailoredProjectItem {
  const bullets = (mutable?.bullets?.length ? mutable.bullets : source.bullets.map((text) => ({
    text,
    sourceProvenanceIds: provenanceIdsForText(sourceProvenance, text),
  }))).map((bullet) => ({
    text: bullet.text,
    sourceProvenanceIds: filterKnownProvenance(
      bullet.sourceProvenanceIds?.length ? bullet.sourceProvenanceIds : provenanceIdsForText(sourceProvenance, bullet.text),
      knownProvenanceIds,
    ),
  }));

  return {
    id: source.id,
    name: source.name,
    description: source.description,
    bullets,
    sourceProvenanceIds: filterKnownProvenance(
      mutable?.sourceProvenanceIds?.length ? mutable.sourceProvenanceIds : source.provenanceIds,
      knownProvenanceIds,
    ),
  };
}

function coerceSkillCategories(
  categories: TailoredSkillCategory[] | undefined,
  knownProvenanceIds: Set<string>,
): TailoredSkillCategory[] | undefined {
  if (!categories?.length) return undefined;
  return categories.map((category) => ({
    label: category.label,
    items: unique(category.items.filter(Boolean)),
    sourceProvenanceIds: filterKnownProvenance(category.sourceProvenanceIds, knownProvenanceIds),
  }));
}

function mergeTailoredResume(resume: SourceResumeDocument, mutable: MutableTailoredResume): TailoredResumeDocument {
  const knownProvenanceIds = new Set(resume.sourceProvenance.map((item) => item.id));
  const experienceById = new Map(mutable.experience.map((item) => [item.id, item]));
  const projectById = new Map((mutable.projects ?? []).map((item) => [item.id, item]));
  const skillCategories = coerceSkillCategories(mutable.skillCategories, knownProvenanceIds) ?? defaultSkillCategories(resume);
  const skills = unique(
    (mutable.skills?.length ? mutable.skills : flattenSkills(skillCategories, resume.skills))
      .map((skill) => skill.trim())
      .filter(Boolean),
  );

  return {
    contactInfo: { ...resume.contactInfo },
    headline: mutable.headline?.trim() || resume.headline,
    headlineSourceProvenanceIds: filterKnownProvenance(
      mutable.headlineSourceProvenanceIds?.length ? mutable.headlineSourceProvenanceIds : resume.headlineProvenanceIds,
      knownProvenanceIds,
    ),
    highlightMetrics: (mutable.highlightMetrics?.length ? mutable.highlightMetrics : defaultHighlightMetrics(resume))
      .slice(0, 4)
      .map((metric) => ({
        value: metric.value,
        label: metric.label,
        sourceProvenanceIds: filterKnownProvenance(metric.sourceProvenanceIds, knownProvenanceIds),
      })),
    summary: mutable.summary.trim() || resume.summary,
    summarySourceProvenanceIds: filterKnownProvenance(
      mutable.summarySourceProvenanceIds?.length
        ? mutable.summarySourceProvenanceIds
        : provenanceIdsForText(resume.sourceProvenance, resume.summary),
      knownProvenanceIds,
    ),
    experience: resume.experience.map((item) =>
      buildMergedExperienceItem(item, experienceById.get(item.id), knownProvenanceIds, resume.sourceProvenance),
    ),
    education: resume.education.map((item) => ({
      id: item.id,
      institution: item.institution,
      degree: item.degree,
      dates: item.dates,
      location: item.location,
      sourceProvenanceIds: [...item.provenanceIds],
    })),
    skills,
    skillCategories,
    skillSourceProvenanceIds: filterKnownProvenance(
      mutable.skillSourceProvenanceIds?.length ? mutable.skillSourceProvenanceIds : defaultSkillSourceIds(resume),
      knownProvenanceIds,
    ),
    projects: resume.projects.map((item) =>
      buildMergedProjectItem(item, projectById.get(item.id), knownProvenanceIds, resume.sourceProvenance),
    ),
    certifications: [...resume.certifications],
    certificationSourceProvenanceIds: unique(
      resume.certifications.flatMap((item) => provenanceIdsForText(resume.sourceProvenance, item)),
    ),
    sectionOrder: [...resume.sectionOrder],
  };
}

function coerceMutableTailoredResume(payload: unknown): MutableTailoredResume {
  const partial = tailoredResumeMutableSchema.safeParse(payload);
  if (partial.success) {
    return partial.data as MutableTailoredResume;
  }

  const full = tailoredResumeSchema.safeParse(payload);
  if (full.success) {
    const data = full.data;
    return {
      headline: data.headline,
      headlineSourceProvenanceIds: data.headlineSourceProvenanceIds,
      highlightMetrics: data.highlightMetrics,
      summary: data.summary,
      summarySourceProvenanceIds: data.summarySourceProvenanceIds,
      experience: data.experience.map((item) => ({
        id: item.id,
        bullets: item.bullets,
        sourceProvenanceIds: item.sourceProvenanceIds,
      })),
      projects: data.projects.map((item) => ({
        id: item.id,
        bullets: item.bullets,
        sourceProvenanceIds: item.sourceProvenanceIds,
      })),
      skillCategories: data.skillCategories,
      skills: data.skills,
      skillSourceProvenanceIds: data.skillSourceProvenanceIds,
    };
  }

  throw partial.error;
}

export async function tailorResumeWithAI(
  ai: AIClient,
  resume: SourceResumeDocument,
  jdText: string,
  jdRequirements: JDRequirementModel,
  plan: TailoringPlan,
  preferences: { targetRole?: string; tone?: string; seniority?: string },
  fallbackAI?: AIClient | null,
): Promise<TailorAIResult> {
  const primaryModelName = process.env.GEMINI_TAILOR_MODEL?.trim() || DEFAULT_TAILOR_MODEL;
  const fallbackModelName = process.env.OPENROUTER_QWEN_MODEL?.trim();
  const prompt = `
You are an elite ATS-focused resume editor.
You are tailoring an existing resume to a target role while preserving factual accuracy and the reference resume's visual system.
Output valid JSON only. Do not wrap it in markdown.

You do NOT own the entire resume document. The server will merge your response into locked source facts.
Only rewrite mutable sections.

Non-negotiable rules (CRITICAL — never violate):
- Use only facts already present in SOURCE_FACTS.
- Never invent experience, tools, metrics, employers, titles, dates, institutions, clients, or certifications.
- Never change contact info, employers, job titles, dates, locations, education entries, project names, project descriptions, certification names, or section order.
- Copy job titles VERBATIM from SOURCE_FACTS — never shorten, abbreviate, or paraphrase them.
- Never create new metrics. Prefer SOURCE_FACTS.highlightMetrics, but you may elevate strong numeric proof points from sourced experience bullets when directly backed by provenance.
- Do not add a tool or skill unless it already appears in SOURCE_FACTS.skills or SOURCE_FACTS.skillCategories.
- Every generated summary sentence or bullet must remain grounded in the cited provenance ids.
- Return only the mutable fields listed below. Do not echo locked resume fields.

Mutable fields you may return:
- headline + headlineSourceProvenanceIds
- highlightMetrics
- summary + summarySourceProvenanceIds
- experience[].bullets for existing experience ids only
- projects[].bullets for existing project ids only
- reordered skillCategories, skills, skillSourceProvenanceIds

Content objectives:
- Headline: crisp, premium, ATS-aligned, and matched to the JD's product/domain language.
- Highlight metrics: 4 metrics only, ordered for maximum relevance to the JD.
- Summary: open with CANDIDATE_ANALYSIS.summaryOpeningHint if provided, then cover topStrengths in 1-2 sentences, then address role scope. Prefer 2 concise paragraphs. If gapAnalysis is empty, use best judgment from JD and source facts.
- Experience bullets: for each experience id listed in CANDIDATE_ANALYSIS bullet priorities, front-load the first 1-2 bullets addressing the specified leadThemes using verified source facts. Remaining bullets may follow original ordering with sharpened JD framing.
- Skills: make the skills section scan well for ATS and human reviewers by reordering categories and surfacing the strongest relevant keywords early.

Write like a high-caliber product or technical resume, not generic career-coach prose:
- Use precise domain language.
- Keep claims concrete and credible.
- Avoid buzzword spam, filler adjectives, and empty leadership clichés.
- Favor readable ATS phrases over clever wording.
- Make the candidate look exceptional through framing, prioritization, and specificity, not invention.

${buildCandidateAnalysisSection(plan)}

Gap handling:
- When CANDIDATE_ANALYSIS lists genuine gaps, do NOT invent experience to fill them.
- Instead, reframe existing experience to demonstrate adjacent competency.
- When gaps are material and unavoidable, write bullets that honestly show related scope rather than claiming the missing skill.

JOB_DESCRIPTION:
${jdText}

JD_REQUIREMENTS:
${JSON.stringify(jdRequirements, null, 2)}

TAILORING_PLAN:
${JSON.stringify(plan, null, 2)}

USER_PREFERENCES:
${JSON.stringify(preferences, null, 2)}

SOURCE_FACTS:
${JSON.stringify(buildSourceFacts(resume), null, 2)}

Return this shape only:
{
  "headline": "",
  "headlineSourceProvenanceIds": ["..."],
  "highlightMetrics": [
    {
      "value": "",
      "label": "",
      "sourceProvenanceIds": ["..."]
    }
  ],
  "summary": "",
  "summarySourceProvenanceIds": ["..."],
  "experience": [
    {
      "id": "",
      "bullets": [
        { "text": "", "sourceProvenanceIds": ["..."] }
      ],
      "sourceProvenanceIds": ["..."]
    }
  ],
  "projects": [
    {
      "id": "",
      "bullets": [
        { "text": "", "sourceProvenanceIds": ["..."] }
      ],
      "sourceProvenanceIds": ["..."]
    }
  ],
  "skillCategories": [
    {
      "label": "",
      "items": ["..."],
      "sourceProvenanceIds": ["..."]
    }
  ],
  "skills": ["..."],
  "skillSourceProvenanceIds": ["..."]
}
`;

  const buildRequestArgs = (modelName: string) => ({
    model: modelName,
    contents: prompt,
    config: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          headline: { type: Type.STRING },
          headlineSourceProvenanceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          highlightMetrics: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.STRING },
                label: { type: Type.STRING },
                sourceProvenanceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['value', 'label', 'sourceProvenanceIds'],
            },
          },
          summary: { type: Type.STRING },
          summarySourceProvenanceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          experience: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                bullets: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING },
                      sourceProvenanceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                    },
                    required: ['text', 'sourceProvenanceIds'],
                  },
                },
                sourceProvenanceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['id', 'bullets'],
            },
          },
          projects: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                bullets: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING },
                      sourceProvenanceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                    },
                    required: ['text', 'sourceProvenanceIds'],
                  },
                },
                sourceProvenanceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['id', 'bullets'],
            },
          },
          skillCategories: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                items: { type: Type.ARRAY, items: { type: Type.STRING } },
                sourceProvenanceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['label', 'items', 'sourceProvenanceIds'],
            },
          },
          skills: { type: Type.ARRAY, items: { type: Type.STRING } },
          skillSourceProvenanceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['summary', 'summarySourceProvenanceIds', 'experience'],
      },
    },
  });

  const attemptProvider = async (client: AIClient, modelName: string): Promise<TailoredResumeDocument> => {
    const providerName = getProviderName(client);
    let response: { text?: string | null };

    try {
      response = await client.models.generateContent(buildRequestArgs(modelName));
    } catch (error) {
      const providerError = error as { status?: number; message?: string } | undefined;
      throw new AIProviderRequestError({
        providerName,
        modelName,
        status: providerError?.status,
        message: providerError?.message ?? 'AI provider request failed.',
        unavailable: isProviderUnavailableError({
          status: providerError?.status,
          message: providerError?.message,
        }),
        cause: error,
      });
    }

    try {
      const payload = JSON.parse(response.text || '{}');
      const mutable = coerceMutableTailoredResume(payload);
      return mergeTailoredResume(resume, mutable);
    } catch (error) {
      throw new AIProviderResponseError({
        providerName,
        modelName,
        message: 'AI provider returned an invalid tailoring payload.',
        cause: error,
      });
    }
  };

  try {
    const tailoredResume = await attemptProvider(ai, primaryModelName);
    return {
      tailoredResume,
      providerUsed: getProviderName(ai),
      fallbackUsed: false,
    };
  } catch (error) {
    if (error instanceof AIProviderRequestError && error.unavailable && fallbackAI && fallbackModelName) {
      try {
        const tailoredResume = await attemptProvider(fallbackAI, fallbackModelName);
        return {
          tailoredResume,
          providerUsed: getProviderName(fallbackAI),
          fallbackUsed: true,
        };
      } catch (fallbackError) {
        if (fallbackError instanceof AIProviderResponseError) {
          buildInvalidResponseError(fallbackError);
        }
        if (fallbackError instanceof AIProviderRequestError) {
          throw badGateway('The AI tailoring service is currently unavailable.', 'AI_PROVIDER_ERROR', {
            cause: fallbackError.cause ?? fallbackError,
            logMessage: `Primary tailoring provider ${error.providerName}:${error.modelName} failed and fallback ${fallbackError.providerName}:${fallbackError.modelName} also failed.`,
          });
        }
        throw fallbackError;
      }
    }

    if (error instanceof AIProviderResponseError) {
      buildInvalidResponseError(error);
    }
    if (error instanceof AIProviderRequestError) {
      buildProviderError(error);
    }
    throw error;
  }
}
