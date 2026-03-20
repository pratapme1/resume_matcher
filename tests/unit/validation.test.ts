import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseResumeDocx } from '../../server/resume.ts';
import { validateTailoredResume } from '../../server/validate.ts';
import type { TailoredResumeDocument } from '../../src/shared/types.ts';
import { fixturePath, sampleResumePath } from '../helpers/fixture-path.ts';

describe('validation', () => {
  it('blocks unsupported claims from the blocked fixture shape', async () => {
    const buffer = await readFile(sampleResumePath());
    const { resume, templateProfile } = await parseResumeDocx(buffer);
    const blocked = JSON.parse(await readFile(fixturePath('mock-ai-blocked.json'), 'utf8'));
    const validation = validateTailoredResume(resume, blocked, templateProfile);

    expect(validation.isValid).toBe(false);
    expect(validation.blockingIssues.length).toBeGreaterThan(0);
    expect(validation.unsupportedClaims).toContain('Invented Company');
  });

  it('accepts sourced metric variants and ATS-friendly skill clarifiers', async () => {
    const buffer = await readFile(sampleResumePath());
    const { resume, templateProfile } = await parseResumeDocx(buffer);
    const tailored = JSON.parse(
      await readFile(fixturePath('mock-ai-success.json'), 'utf8'),
    ) as TailoredResumeDocument;

    tailored.highlightMetrics = [
      {
        value: '$300–400M',
        label: 'Projected Savings',
        sourceProvenanceIds: ['section-2-p2'],
      },
      {
        value: '100K+',
        label: 'Enterprise User Reach',
        sourceProvenanceIds: ['section-0-p3', 'section-2-p2'],
      },
      {
        value: '98K',
        label: 'Global Endpoint Coverage',
        sourceProvenanceIds: ['section-2-p4'],
      },
      {
        value: '70%',
        label: 'Deployment Cycle Reduction',
        sourceProvenanceIds: ['section-2-p5'],
      },
    ];
    tailored.skills = ['n8n (workflow automation)', 'REST API', 'Open Source LLMs'];
    tailored.skillCategories = [
      {
        label: 'AI & Automation',
        items: tailored.skills,
        sourceProvenanceIds: ['section-3-p3', 'section-3-p4'],
      },
    ];
    tailored.skillSourceProvenanceIds = ['section-3-p3', 'section-3-p4'];

    const validation = validateTailoredResume(resume, tailored, templateProfile);

    expect(validation.unsupportedClaims).not.toContain('$300–400M');
    expect(validation.unsupportedClaims).not.toContain('100K+');
    expect(validation.unsupportedClaims).not.toContain('98K');
    expect(validation.unsupportedClaims).not.toContain('70%');
    expect(validation.unsupportedClaims).not.toContain('n8n (workflow automation)');
  });
});
