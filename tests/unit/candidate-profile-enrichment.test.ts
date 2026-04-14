import { describe, expect, it } from 'vitest';
import { enrichCandidateProfileWithAI, buildCandidateProfile } from '../../server/job-search.ts';
import type { CandidateProfile, SourceResumeDocument } from '../../src/shared/types.ts';
import type { AIClient } from '../../server/app.ts';

const EMPTY_RESUME: SourceResumeDocument = {
  contactInfo: { location: '' },
  headline: '',
  summary: '',
  experience: [],
  education: [],
  projects: [],
  skills: [],
  skillCategories: [],
  certifications: [],
  sectionOrder: [],
  rawSections: [],
  sourceProvenance: [],
  parseWarnings: [],
  headlineProvenanceIds: [],
  highlightMetrics: [],
};

const RESUME_WITH_TITLE: SourceResumeDocument = {
  ...EMPTY_RESUME,
  experience: [
    {
      id: 'exp-0',
      title: 'Software Engineer',
      company: 'Acme Corp',
      dates: '2020 - 2024',
      location: '',
      bullets: [],
      provenanceIds: [],
    },
  ],
};

function makeAI(responseText: string): { ai: AIClient; callCount: () => number } {
  let count = 0;
  const ai: AIClient = {
    models: {
      generateContent: async () => {
        count++;
        return { text: responseText };
      },
    },
  };
  return { ai, callCount: () => count };
}

describe('enrichCandidateProfileWithAI', () => {
  it('fills primaryTitles when heuristics return empty', async () => {
    const { ai } = makeAI(
      JSON.stringify({
        primaryTitles: ['Principal Software Engineer', 'Android Developer'],
        industries: ['enterprise'],
        domainExpertise: ['Mobile Development', 'CI/CD Automation'],
      }),
    );

    const base = buildCandidateProfile(EMPTY_RESUME);
    expect(base.primaryTitles).toHaveLength(0);

    const enriched = await enrichCandidateProfileWithAI(ai, EMPTY_RESUME, base);
    expect(enriched.primaryTitles).toEqual(['Principal Software Engineer', 'Android Developer']);
    expect(enriched.industries).toContain('enterprise');
    expect(enriched.domainExpertise).toContain('Mobile Development');
  });

  it('does NOT call AI when heuristics already found primaryTitles', async () => {
    const { ai, callCount } = makeAI('{}');

    const base = buildCandidateProfile(RESUME_WITH_TITLE);
    expect(base.primaryTitles).toHaveLength(1);

    await enrichCandidateProfileWithAI(ai, RESUME_WITH_TITLE, base);
    expect(callCount()).toBe(0);
  });

  it('returns base profile unchanged (same reference) when AI throws', async () => {
    const ai: AIClient = {
      models: {
        generateContent: async () => {
          throw new Error('AI unavailable');
        },
      },
    };

    const base = buildCandidateProfile(EMPTY_RESUME);
    const result = await enrichCandidateProfileWithAI(ai, EMPTY_RESUME, base);
    expect(result).toBe(base);
  });

  it('returns base profile unchanged when AI returns invalid JSON', async () => {
    const { ai } = makeAI('not valid json {{{');

    const base = buildCandidateProfile(EMPTY_RESUME);
    const result = await enrichCandidateProfileWithAI(ai, EMPTY_RESUME, base);
    expect(result).toBe(base);
  });

  it('does not override industries when heuristics already found them', async () => {
    const { ai } = makeAI(
      JSON.stringify({
        primaryTitles: ['Engineer'],
        industries: ['ai'],
        domainExpertise: ['Machine Learning'],
      }),
    );

    const base: CandidateProfile = {
      ...buildCandidateProfile(EMPTY_RESUME),
      primaryTitles: [],
      industries: ['fintech'],
    };

    const enriched = await enrichCandidateProfileWithAI(ai, EMPTY_RESUME, base);
    expect(enriched.primaryTitles).toEqual(['Engineer']);
    expect(enriched.industries).toEqual(['fintech']); // heuristic value preserved
  });

  it('does not override domainExpertise when heuristics already found it', async () => {
    const { ai } = makeAI(
      JSON.stringify({
        primaryTitles: ['Engineer'],
        industries: [],
        domainExpertise: ['AI Research'],
      }),
    );

    const base: CandidateProfile = {
      ...buildCandidateProfile(EMPTY_RESUME),
      primaryTitles: [],
      domainExpertise: ['Cloud Infrastructure'],
    };

    const enriched = await enrichCandidateProfileWithAI(ai, EMPTY_RESUME, base);
    expect(enriched.domainExpertise).toEqual(['Cloud Infrastructure']); // preserved
  });

  it('handles AI returning empty primaryTitles array gracefully', async () => {
    const { ai } = makeAI(
      JSON.stringify({ primaryTitles: [], industries: [], domainExpertise: [] }),
    );

    const base = buildCandidateProfile(EMPTY_RESUME);
    const result = await enrichCandidateProfileWithAI(ai, EMPTY_RESUME, base);
    expect(result.primaryTitles).toHaveLength(0); // stays empty, not crashed
  });
});
