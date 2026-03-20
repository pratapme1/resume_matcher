import { Type } from '@google/genai';
import type {
  JDRequirementModel,
  SourceResumeDocument,
  TailoredResumeDocument,
  TailoringPlan,
} from '../src/shared/types.ts';
import type { AIClient } from './app.ts';
import { badGateway } from './errors.ts';
import { tailoredResumeSchema } from './schemas.ts';

const DEFAULT_TAILOR_MODEL = 'gemini-2.5-flash';

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

export async function tailorResumeWithAI(
  ai: AIClient,
  resume: SourceResumeDocument,
  jdText: string,
  jdRequirements: JDRequirementModel,
  plan: TailoringPlan,
  preferences: { targetRole?: string; tone?: string; seniority?: string },
): Promise<TailoredResumeDocument> {
  const modelName = process.env.GEMINI_TAILOR_MODEL?.trim() || DEFAULT_TAILOR_MODEL;
  const prompt = `
You are an elite ATS-focused resume editor.
You are tailoring an existing resume to a target role while preserving factual accuracy and the reference resume's visual system.
Output valid JSON only. Do not wrap it in markdown.

Follow this process internally before writing JSON:
1. Identify the target role, company, and the top job-description priorities.
2. Rank the JD keywords that should appear naturally in the resume.
3. Decide how to reposition the candidate without inventing experience.
4. Select the 4 most relevant existing highlight metrics from SOURCE_FACTS.
5. Reorder skills so the most role-relevant categories lead.

Non-negotiable rules:
- Use only facts already present in SOURCE_FACTS.
- Never invent experience, tools, metrics, employers, titles, dates, institutions, clients, or certifications.
- Never change employers, job titles, dates, locations, education entries, or certification names.
- Never create new metrics. Prefer SOURCE_FACTS.highlightMetrics, but you may also elevate strong numeric proof points from sourced experience or project bullets when they are directly backed by provenance.
- Do not add a tool or skill unless it already appears in SOURCE_FACTS.skills or SOURCE_FACTS.skillCategories.
- You may translate verified skills into closer JD terminology only when the mapping is legitimate. Example: "n8n" can become "n8n (workflow automation)".
- Every generated summary sentence or bullet must remain grounded in the cited provenance ids.
- Keep sectionOrder aligned to SOURCE_FACTS.sectionOrder. Do not invent new sections.

Content objectives:
- Headline: crisp, premium, ATS-aligned, and matched to the JD's product/domain language.
- Highlight metrics: 4 metrics only, ordered for maximum relevance to the JD.
- Summary: executive-quality and keyword-rich without sounding stuffed. Prefer 2 concise paragraphs separated by a blank line.
- Experience bullets: keep the same facts and numbers, but sharpen framing around the JD's priorities when useful.
- Skills: make the skills section scan well for ATS and human reviewers by reordering categories and surfacing the strongest relevant keywords early.

Write like a high-caliber product or technical resume, not generic career-coach prose:
- Use precise domain language.
- Keep claims concrete and credible.
- Avoid buzzword spam, filler adjectives, and empty leadership clichés.
- Favor readable ATS phrases over clever wording.
- Make the candidate look exceptional through framing, prioritization, and specificity, not invention.

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

Return this shape:
{
  "contactInfo": { "name": "", "email": "", "phone": "", "linkedin": "", "location": "" },
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
      "company": "",
      "title": "",
      "dates": "",
      "location": "",
      "bullets": [
        { "text": "", "sourceProvenanceIds": ["..."] }
      ],
      "sourceProvenanceIds": ["..."]
    }
  ],
  "education": [
    {
      "id": "",
      "institution": "",
      "degree": "",
      "dates": "",
      "location": "",
      "sourceProvenanceIds": ["..."]
    }
  ],
  "skills": ["..."],
  "skillCategories": [
    {
      "label": "",
      "items": ["..."],
      "sourceProvenanceIds": ["..."]
    }
  ],
  "skillSourceProvenanceIds": ["..."],
  "projects": [
    {
      "id": "",
      "name": "",
      "description": "",
      "bullets": [
        { "text": "", "sourceProvenanceIds": ["..."] }
      ],
      "sourceProvenanceIds": ["..."]
    }
  ],
  "certifications": ["..."],
  "certificationSourceProvenanceIds": ["..."],
  "sectionOrder": ["summary", "experience", "skills", "education"]
}

Field guidance:
- headline: tailor the existing headline for the target role. Keep it compact and premium.
- headlineSourceProvenanceIds: cite the original headline and any supporting source facts used to justify the new positioning.
- highlightMetrics: return exactly 4 entries when enough sourced metrics exist. Metric values may be compact sourced variants such as "100K+" from "100K+ Users", but they must remain traceable to the cited provenance.
- summary: 4-6 sentences total, optimized for ATS and executive skim-reading. Use "\\n\\n" between the two paragraphs when possible.
- skills: return a flat ATS keyword list derived from skillCategories.
- skillCategories: keep the section believable and recruiter-friendly. Reorder categories by JD relevance, rename categories only when justified by source facts, and keep item wording tightly aligned to the job description.
`;

  let response: { text?: string | null };

  try {
    response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            contactInfo: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                email: { type: Type.STRING },
                phone: { type: Type.STRING },
                linkedin: { type: Type.STRING },
                location: { type: Type.STRING },
              },
              required: ['name', 'email', 'phone', 'linkedin', 'location'],
            },
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
                  company: { type: Type.STRING },
                  title: { type: Type.STRING },
                  dates: { type: Type.STRING },
                  location: { type: Type.STRING },
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
                required: ['id', 'company', 'title', 'dates', 'location', 'bullets', 'sourceProvenanceIds'],
              },
            },
            education: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  institution: { type: Type.STRING },
                  degree: { type: Type.STRING },
                  dates: { type: Type.STRING },
                  location: { type: Type.STRING },
                  sourceProvenanceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['id', 'institution', 'degree', 'dates', 'location', 'sourceProvenanceIds'],
              },
            },
            skills: { type: Type.ARRAY, items: { type: Type.STRING } },
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
            skillSourceProvenanceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
            projects: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
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
                required: ['id', 'name', 'description', 'bullets', 'sourceProvenanceIds'],
              },
            },
            certifications: { type: Type.ARRAY, items: { type: Type.STRING } },
            certificationSourceProvenanceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
            sectionOrder: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: [
            'contactInfo',
            'summary',
            'summarySourceProvenanceIds',
            'experience',
            'education',
            'skills',
            'skillSourceProvenanceIds',
            'projects',
            'certifications',
            'certificationSourceProvenanceIds',
            'sectionOrder',
          ],
        },
      },
    });
  } catch (error) {
    const providerError = error as { status?: number; message?: string } | undefined;
    const isQuotaError = providerError?.status === 429 || providerError?.message?.includes('RESOURCE_EXHAUSTED');
    throw badGateway(
      isQuotaError
        ? 'The configured Gemini model is out of quota. Please retry shortly or switch to a lighter model.'
        : 'The AI tailoring service is currently unavailable.',
      'AI_PROVIDER_ERROR',
      {
        cause: error,
        logMessage: `AI provider request failed during resume tailoring using model ${modelName}.`,
      },
    );
  }

  try {
    return tailoredResumeSchema.parse(JSON.parse(response.text || '{}')) as TailoredResumeDocument;
  } catch (error) {
    throw badGateway('The AI tailoring service returned invalid data.', 'AI_INVALID_RESPONSE', {
      cause: error,
      logMessage: 'AI provider returned an invalid tailoring payload.',
    });
  }
}
