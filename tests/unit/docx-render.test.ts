import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { generateTailoredDocx } from '../../server/docx-render.ts';
import { parseResumeDocx } from '../../server/resume.ts';
import type { TailoredResumeDocument } from '../../src/shared/types.ts';
import { fixturePath, sampleResumePath } from '../helpers/fixture-path.ts';

describe('docx renderer', () => {
  it('reuses the source template layout when a reference DOCX is available', async () => {
    const sourceBuffer = await readFile(sampleResumePath());
    const { templateProfile } = await parseResumeDocx(sourceBuffer);
    const tailoredResume = JSON.parse(
      await readFile(fixturePath('mock-ai-success.json'), 'utf8'),
    ) as TailoredResumeDocument;
    tailoredResume.headline =
      'Product Manager — AI Automation Platforms  |  Enterprise SaaS  |  Workflow Orchestration';
    tailoredResume.headlineSourceProvenanceIds = ['section-0-p0', 'section-1-p0'];
    tailoredResume.highlightMetrics = [
      {
        value: '100K+ Users',
        label: 'Enterprise AI Platform Scale',
        sourceProvenanceIds: ['section-0-p3', 'section-0-p4'],
      },
      {
        value: '35% Adoption Increase',
        label: 'Workflow Adoption Lift',
        sourceProvenanceIds: ['section-0-p9', 'section-0-p10'],
      },
      {
        value: '$1.4M+ Revenue',
        label: 'Connected Product Revenue',
        sourceProvenanceIds: ['section-0-p7', 'section-0-p8'],
      },
      {
        value: '60% Energy Saving',
        label: 'IoT Efficiency Improvement',
        sourceProvenanceIds: ['section-0-p5', 'section-0-p6'],
      },
    ];
    tailoredResume.skillCategories = [
      {
        label: 'AI & Automation',
        items: ['n8n', 'Gemini', 'Open Source LLMs', 'Agentic Workflow Design'],
        sourceProvenanceIds: ['section-3-p3'],
      },
      {
        label: 'Integration & APIs',
        items: ['REST API', 'RAG Systems', 'Edge-to-Cloud Architecture'],
        sourceProvenanceIds: ['section-3-p0', 'section-3-p3', 'section-3-p4'],
      },
    ];
    tailoredResume.skills = tailoredResume.skillCategories.flatMap((category) => category.items);

    const renderedBuffer = await generateTailoredDocx(tailoredResume, templateProfile);
    const zip = await JSZip.loadAsync(renderedBuffer);
    const documentXml = await zip.file('word/document.xml')?.async('string');

    expect(documentXml).toContain('<w:tbl>');
    expect(documentXml).toContain('Workflow Orchestration');
    expect(documentXml).toContain('Enterprise AI Platform Scale');
    expect(documentXml).toContain('Agentic Workflow Design');
    expect(documentXml).toContain('PROFESSIONAL SUMMARY');
    expect(documentXml).toContain(tailoredResume.summary);
    expect(documentXml).toContain('Dell Technologies (via UST Global)');
  });
});
