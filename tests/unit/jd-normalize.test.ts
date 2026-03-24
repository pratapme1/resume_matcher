import { describe, it, expect } from 'vitest';
import { normalizeJobDescription } from '../../server/jd.ts';

// A realistic JD with good structure and length
const WELL_STRUCTURED_JD = `
Senior Software Engineer - Full Stack

About the Role:
We are looking for a Senior Software Engineer to join our growing platform team.
You will design, build, and maintain scalable backend services and React frontends.

Requirements (Must Have):
- 5+ years of experience with TypeScript and React
- Strong knowledge of Node.js, REST APIs, and microservices
- Experience with AWS, Docker, and Kubernetes
- Proficiency in SQL and NoSQL databases

Nice to Have:
- Experience with GraphQL and real-time systems
- Familiarity with CI/CD pipelines and testing frameworks
- Python or Go experience is a plus

Responsibilities:
- Design and implement new product features end to end
- Collaborate with product managers and designers
- Mentor junior engineers and lead technical decisions
- Participate in on-call rotation for platform reliability

About TechCorp:
TechCorp builds the next generation of enterprise software used by thousands of companies worldwide.
We value engineering excellence, ownership, and fast iteration.
Apply now to join us in San Francisco or remotely!

Benefits:
- Competitive salary and equity
- Health, dental, and vision coverage
- Unlimited PTO policy
`;

describe('normalizeJobDescription', () => {
  it('qualityScore >= 80 for a well-structured long JD', () => {
    const result = normalizeJobDescription(WELL_STRUCTURED_JD, 'paste');
    expect(result.qualityScore).toBeGreaterThanOrEqual(80);
  });

  it('adds JD_TOO_SHORT warning and lower score for short JD (<400 chars)', () => {
    const shortJD = 'Senior engineer needed. Must have React and TypeScript. Email us.';
    const result = normalizeJobDescription(shortJD, 'paste');
    const codes = result.extractionWarnings.map(w => w.code);
    expect(codes).toContain('JD_TOO_SHORT');
    expect(result.qualityScore).toBeLessThan(100);
  });

  it('adds JD_LOW_STRUCTURE warning for unstructured single-line text', () => {
    const unstructured = 'Senior engineer needed. Must have React TypeScript JavaScript SQL. Great team. Apply now.';
    const result = normalizeJobDescription(unstructured, 'paste');
    const codes = result.extractionWarnings.map(w => w.code);
    expect(codes).toContain('JD_LOW_STRUCTURE');
  });

  it('strips boilerplate noise (privacy policy, sign-in buttons)', () => {
    const noisyJD = WELL_STRUCTURED_JD + '\nPrivacy Policy | Terms of Use | Cookie Preferences | Sign In | Create Account\nShare this job with a friend.';
    const result = normalizeJobDescription(noisyJD, 'paste');
    expect(result.cleanText).not.toMatch(/privacy policy/i);
    expect(result.cleanText).not.toMatch(/sign in/i);
    expect(result.cleanText).not.toMatch(/cookie preferences/i);
  });

  it('sets sourceType correctly for url input', () => {
    const result = normalizeJobDescription(WELL_STRUCTURED_JD, 'url');
    expect(result.sourceType).toBe('url');
  });

  it('sets sourceType correctly for paste input', () => {
    const result = normalizeJobDescription(WELL_STRUCTURED_JD, 'paste');
    expect(result.sourceType).toBe('paste');
  });

  it('sets sourceType correctly for file input', () => {
    const result = normalizeJobDescription(WELL_STRUCTURED_JD, 'file');
    expect(result.sourceType).toBe('file');
  });

  it('preserves rawText as-is', () => {
    const result = normalizeJobDescription(WELL_STRUCTURED_JD, 'paste');
    expect(result.rawText).toBe(WELL_STRUCTURED_JD);
  });

  it('clamps qualityScore between 30 and 100', () => {
    const tiny = 'a';
    const result = normalizeJobDescription(tiny, 'paste');
    expect(result.qualityScore).toBeGreaterThanOrEqual(30);
    expect(result.qualityScore).toBeLessThanOrEqual(100);
  });
});
