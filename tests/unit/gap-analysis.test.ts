import { describe, it, expect } from 'vitest';
import { buildCandidateProfile } from '../../server/job-search.ts';
import type { SourceResumeDocument } from '../../src/shared/types.ts';

function makeResume(overrides: Partial<SourceResumeDocument> = {}): SourceResumeDocument {
  return {
    contactInfo: { name: 'Jane Doe', email: 'jane@example.com', phone: '', location: 'San Francisco, CA', linkedin: '' },
    headline: 'Senior Product Manager | Enterprise SaaS',
    headlineProvenanceIds: [],
    highlightMetrics: [],
    summary: 'Senior Product Manager with 8 years of experience in B2B SaaS.',
    experience: [
      {
        id: 'exp-1',
        title: 'Senior Product Manager',
        company: 'TechCorp',
        dates: 'Jan 2020 – Present',
        location: 'San Francisco, CA',
        bullets: ['Led roadmap for enterprise platform delivering 3x revenue growth.'],
        provenanceIds: [],
      },
      {
        id: 'exp-2',
        title: 'Product Manager',
        company: 'StartupCo',
        dates: 'Jan 2016 – Dec 2019',
        location: 'Remote',
        bullets: ['Grew user base by 3x over 4 years.'],
        provenanceIds: [],
      },
    ],
    education: [],
    skills: ['product management', 'agile', 'roadmapping', 'SQL', 'stakeholder management'],
    skillCategories: [],
    certifications: [],
    projects: [],
    sectionOrder: [],
    rawSections: [],
    sourceProvenance: [],
    parseWarnings: [],
    ...overrides,
  };
}

describe('buildCandidateProfile', () => {
  it('extracts primaryTitles from experience job titles', () => {
    const profile = buildCandidateProfile(makeResume());
    expect(profile.primaryTitles).toContain('Senior Product Manager');
    expect(profile.primaryTitles).toContain('Product Manager');
  });

  it('deduplicates primaryTitles', () => {
    const resume = makeResume({
      experience: [
        { id: 'e1', title: 'Senior Product Manager', company: 'A', dates: '2022 – Present', location: '', bullets: [], provenanceIds: [] },
        { id: 'e2', title: 'Senior Product Manager', company: 'B', dates: '2020 – 2022', location: '', bullets: [], provenanceIds: [] },
        { id: 'e3', title: 'Product Manager', company: 'C', dates: '2018 – 2020', location: '', bullets: [], provenanceIds: [] },
      ],
    });
    const profile = buildCandidateProfile(resume);
    const counts = profile.primaryTitles.filter(t => t === 'Senior Product Manager').length;
    expect(counts).toBe(1);
  });

  it('deduplicates topSkills and caps at 30', () => {
    const manySkills = Array.from({ length: 40 }, (_, i) => `skill-${i}`);
    const resume = makeResume({ skills: manySkills });
    const profile = buildCandidateProfile(resume);
    expect(profile.topSkills.length).toBeLessThanOrEqual(30);
    const uniqueSkills = new Set(profile.topSkills);
    expect(uniqueSkills.size).toBe(profile.topSkills.length);
  });

  it('infers seniorityLevel as senior from most recent job title containing "Senior"', () => {
    const profile = buildCandidateProfile(makeResume());
    expect(profile.seniorityLevel).toBe('senior');
  });

  it('infers seniorityLevel as staff for staff/lead/architect titles', () => {
    const resume = makeResume({
      experience: [
        { id: 'e1', title: 'Staff Engineer', company: 'X', dates: '2022 – Present', location: '', bullets: [], provenanceIds: [] },
      ],
    });
    const profile = buildCandidateProfile(resume);
    expect(profile.seniorityLevel).toBe('staff');
  });

  it('calculates yearsOfExperience > 0 from experience dates', () => {
    const profile = buildCandidateProfile(makeResume());
    expect(profile.yearsOfExperience).toBeGreaterThan(0);
  });

  it('extracts location from contactInfo', () => {
    const profile = buildCandidateProfile(makeResume());
    expect(profile.location).toBeTruthy();
  });

  it('falls back to headline/summary titles when experience has no role-keyword titles', () => {
    const resume = makeResume({
      headline: 'Senior Product Manager | Dell Technologies',
      experience: [], // no experience entries
      rawSections: [],
    });
    const profile = buildCandidateProfile(resume);
    expect(profile.primaryTitles.length).toBeGreaterThan(0);
  });
});
