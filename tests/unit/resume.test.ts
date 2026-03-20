import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseResumeDocx } from '../../server/resume.ts';
import { sampleResumePath } from '../helpers/fixture-path.ts';

describe('resume parser', () => {
  it('extracts contact and first experience fields from the sample resume', async () => {
    const buffer = await readFile(sampleResumePath());
    const { resume } = await parseResumeDocx(buffer);

    expect(resume.contactInfo.name).toBe('VISHNU PRATAP KUMAR');
    expect(resume.contactInfo.email).toBe('vishnupratapkumar@gmail.com');
    expect(resume.contactInfo.phone).toContain('+91');
    expect(resume.contactInfo.location).toBe('Bengaluru, India');
    expect(resume.headline).toContain('IoT Product Manager');
    expect(resume.highlightMetrics).toHaveLength(4);
    expect(resume.highlightMetrics[0]).toMatchObject({
      value: '100K+ Users',
      label: 'Enterprise Platform Launch',
    });
    expect(resume.skillCategories[0]?.label).toBe('Wireless Protocols & IoT Connectivity');
    expect(resume.skills).toContain('n8n');
    expect(resume.skills).toContain('Open Source LLMs');

    expect(resume.experience[0]?.company).toContain('Dell Technologies');
    expect(resume.experience[0]?.title).toContain('Product Manager');
    expect(resume.experience[0]?.dates).toContain('May 2022');
    expect(resume.experience[0]?.location).toContain('Bengaluru');
  });
});
