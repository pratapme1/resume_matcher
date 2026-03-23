import type { GapAnalysis, JDRequirementModel, SourceResumeDocument } from '../src/shared/types.ts';
import type { AIClient } from './app.ts';

const DEFAULT_GAP_MODEL = 'gemini-2.5-flash';

const MINIMAL_GAP_ANALYSIS: GapAnalysis = {
  repositioningAngle: '',
  topStrengths: [],
  keyGaps: [],
  bulletPriorities: [],
  summaryOpeningHint: '',
};

function buildResumeSnapshot(resume: SourceResumeDocument): string {
  const parts: string[] = [];
  if (resume.headline) parts.push(resume.headline);
  if (resume.summary) parts.push(resume.summary);
  for (const exp of resume.experience) {
    parts.push(`${exp.title} at ${exp.company}: ${exp.bullets.join('; ')}`);
  }
  parts.push(...resume.skills);
  parts.push(...resume.certifications);
  const full = parts.filter(Boolean).join('\n');
  return full.length > 3000 ? full.slice(0, 3000) + '...' : full;
}

export async function buildGapAnalysis(
  ai: AIClient,
  resume: SourceResumeDocument,
  jdModel: JDRequirementModel,
  jdText: string,
): Promise<GapAnalysis> {
  try {
    const modelName = process.env.GEMINI_GAP_MODEL?.trim() || DEFAULT_GAP_MODEL;
    const resumeSnapshot = buildResumeSnapshot(resume);

    const prompt = `You are a resume positioning strategist. Produce a concise strategic analysis.

Output valid JSON only. No markdown.

{
  "fitScore": number,
  "repositioningAngle": string,
  "topStrengths": string[],
  "keyGaps": string[],
  "bulletPriorities": [{ "experienceId": string, "leadThemes": string[] }],
  "summaryOpeningHint": string
}

Rules:
- fitScore: 0–100. How qualified is this candidate for THIS role based on actual experience and skills,
  independent of keyword phrasing? Judge by scope, domain, tools, and impact — not word matching.
  100 = strong match, 0 = fundamentally unqualified.
- repositioningAngle: one sentence — how to frame this candidate for the target role.
- topStrengths: 2-4 strings citing verifiable facts (tools, metrics, accomplishments) from the resume.
- keyGaps: 1-3 genuine gaps material to this role that cannot be reframed from source facts.
  Return [] if the resume covers all requirements reasonably.
- bulletPriorities: only include experienceIds present in RESUME_EXPERIENCE_IDS.
  leadThemes: 1-3 short phrases from JD_MUST_HAVE_KEYWORDS to front-load in bullets.
- summaryOpeningHint: start with the candidate's strongest identity claim for this role.
  Do not fabricate details not in the resume.

RESUME_SNAPSHOT:
${resumeSnapshot}

RESUME_EXPERIENCE_IDS:
${JSON.stringify(resume.experience.map((e) => ({ id: e.id, title: e.title, company: e.company })))}

JD_MUST_HAVE_KEYWORDS:
${JSON.stringify(jdModel.mustHaveKeywords)}

JD_TARGET_TITLES:
${JSON.stringify(jdModel.targetTitles)}

JOB_DESCRIPTION (first 2000 chars):
${jdText.slice(0, 2000)}`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text || '{}') as unknown;

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as GapAnalysis).repositioningAngle !== 'string' ||
      !Array.isArray((parsed as GapAnalysis).topStrengths) ||
      !Array.isArray((parsed as GapAnalysis).keyGaps) ||
      !Array.isArray((parsed as GapAnalysis).bulletPriorities) ||
      typeof (parsed as GapAnalysis).summaryOpeningHint !== 'string'
    ) {
      return MINIMAL_GAP_ANALYSIS;
    }

    // Clamp fitScore to valid range if present
    const rawFitScore = (parsed as GapAnalysis).fitScore;
    if (typeof rawFitScore === 'number') {
      (parsed as GapAnalysis).fitScore = Math.round(Math.min(100, Math.max(0, rawFitScore)));
    }

    const result = parsed as GapAnalysis;
    const validExperienceIds = new Set(resume.experience.map((e) => e.id));
    result.bulletPriorities = result.bulletPriorities.filter(
      (p) => typeof p.experienceId === 'string' && validExperienceIds.has(p.experienceId),
    );

    return result;
  } catch {
    return MINIMAL_GAP_ANALYSIS;
  }
}
