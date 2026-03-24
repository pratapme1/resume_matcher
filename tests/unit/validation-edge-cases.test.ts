import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseResumeDocx } from '../../server/resume.ts';
import { validateTailoredResume } from '../../server/validate.ts';
import type { TailoredResumeDocument, ResumeTemplateProfile } from '../../src/shared/types.ts';
import { fixturePath, sampleResumePath } from '../helpers/fixture-path.ts';

async function loadBaseParts() {
  const buffer = await readFile(sampleResumePath());
  const { resume, templateProfile } = await parseResumeDocx(buffer);
  const success = JSON.parse(await readFile(fixturePath('mock-ai-success.json'), 'utf8')) as TailoredResumeDocument;
  return { resume, templateProfile, success };
}

describe('validation edge cases', () => {
  it('allows metric reformatting (365K → 365,000) when sourceProvenanceIds present', async () => {
    const { resume, templateProfile, success } = await loadBaseParts();

    // The source has "365K assets" — the tailored resume can say "365,000"
    success.highlightMetrics = [
      {
        value: '365,000',
        label: 'Managed Assets',
        sourceProvenanceIds: ['section-2-p2'],
      },
    ];
    const validation = validateTailoredResume(resume, success, templateProfile);
    expect(validation.unsupportedClaims).not.toContain('365,000');
  });

  it('non-blocking warnings do not set isValid to false when no blocking issues', async () => {
    const { resume, templateProfile, success } = await loadBaseParts();
    // Success fixture should produce a valid result
    const validation = validateTailoredResume(resume, success, templateProfile);
    // If there are warnings but no blocking issues, isValid should still be true
    if (validation.blockingIssues.length === 0) {
      expect(validation.isValid).toBe(true);
    }
  });

  it('blocks when tailored company differs from all source companies', async () => {
    const { resume, templateProfile, success } = await loadBaseParts();
    // Override one experience entry with a fabricated company
    success.experience = [
      {
        ...success.experience[0],
        company: 'Totally Fabricated Corp XYZ 999',
        sourceProvenanceIds: ['section-2-p0'],
      },
    ];
    const validation = validateTailoredResume(resume, success, templateProfile);
    expect(validation.isValid).toBe(false);
    expect(validation.unsupportedClaims).toContain('Totally Fabricated Corp XYZ 999');
  });

  it('blocks when tailored experience has a completely fabricated company (blocked fixture pattern)', async () => {
    const { resume, templateProfile } = await loadBaseParts();
    const blocked = JSON.parse(await readFile(fixturePath('mock-ai-blocked.json'), 'utf8')) as TailoredResumeDocument;
    const validation = validateTailoredResume(resume, blocked, templateProfile);

    expect(validation.isValid).toBe(false);
    expect(validation.blockingIssues.length).toBeGreaterThan(0);
  });

  it('unsupportedClaims is populated with the fabricated company name on block', async () => {
    const { resume, templateProfile } = await loadBaseParts();
    const blocked = JSON.parse(await readFile(fixturePath('mock-ai-blocked.json'), 'utf8')) as TailoredResumeDocument;
    const validation = validateTailoredResume(resume, blocked, templateProfile);
    // The blocked fixture uses "Invented Company" as the fabricated company
    expect(validation.unsupportedClaims).toContain('Invented Company');
  });

  it('validation report includes both blockingIssues and warnings arrays', async () => {
    const { resume, templateProfile, success } = await loadBaseParts();
    const validation = validateTailoredResume(resume, success, templateProfile);
    expect(Array.isArray(validation.blockingIssues)).toBe(true);
    expect(Array.isArray(validation.warnings)).toBe(true);
  });

  it('isValid is true when success fixture passes validation', async () => {
    const { resume, templateProfile, success } = await loadBaseParts();
    const validation = validateTailoredResume(resume, success, templateProfile);
    expect(validation.isValid).toBe(true);
  });
});
