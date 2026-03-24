import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import { createTestApp } from '../helpers/test-app.ts';
import { sampleResumePath } from '../helpers/fixture-path.ts';
import { MockAIClient } from '../helpers/mock-ai.ts';
import path from 'node:path';

const TXT_FIXTURE = path.join(process.cwd(), 'tests', 'fixtures', 'jd-valid.txt');

describe('/api/build-profile', () => {
  it('returns CandidateProfile from valid DOCX (primaryTitles, topSkills, seniorityLevel, yearsOfExperience)', async () => {
    const resumeBuffer = await readFile(sampleResumePath());
    const app = createTestApp();
    const res = await request(app)
      .post('/api/build-profile')
      .attach('resume', resumeBuffer, 'resume.docx');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.primaryTitles)).toBe(true);
    expect(Array.isArray(res.body.topSkills)).toBe(true);
    expect(res.body.seniorityLevel).toBeDefined();
    expect(typeof res.body.yearsOfExperience).toBe('number');
  });

  it('returns 400 INVALID_REQUEST when no file attached', async () => {
    const app = createTestApp();
    const res = await request(app).post('/api/build-profile');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 UNSUPPORTED_FILE_TYPE for non-DOCX upload', async () => {
    const app = createTestApp();
    const txtBuffer = await readFile(TXT_FIXTURE);
    const res = await request(app)
      .post('/api/build-profile')
      .attach('resume', txtBuffer, 'resume.txt');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSUPPORTED_FILE_TYPE');
  });
});

describe('/api/search-jobs', () => {
  it('returns scored JobSearchResponse (results[], candidateProfile, totalFound) sorted by matchScore desc', async () => {
    const resumeBuffer = await readFile(sampleResumePath());
    const app = createTestApp({
      getAI: () => new MockAIClient(['mock-ai-job-search.json']),
    });
    const res = await request(app)
      .post('/api/search-jobs')
      .attach('resume', resumeBuffer, 'resume.docx');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.candidateProfile).toBeDefined();
    expect(typeof res.body.totalFound).toBe('number');

    // Results should be sorted by matchScore descending
    const scores = res.body.results.map((r: { matchScore: number }) => r.matchScore);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    }
  });

  it('results[0] has matchScore 0–100 and matchBreakdown.overallFit defined', async () => {
    const resumeBuffer = await readFile(sampleResumePath());
    const app = createTestApp({
      getAI: () => new MockAIClient(['mock-ai-job-search.json']),
    });
    const res = await request(app)
      .post('/api/search-jobs')
      .attach('resume', resumeBuffer, 'resume.docx');
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThan(0);
    const first = res.body.results[0];
    expect(first.matchScore).toBeGreaterThanOrEqual(0);
    expect(first.matchScore).toBeLessThanOrEqual(100);
    expect(first.matchBreakdown).toBeDefined();
    expect(typeof first.matchBreakdown.overallFit).toBe('string');
  });

  it('returns empty results array (not error) when AI returns {"jobs":[]}', async () => {
    const resumeBuffer = await readFile(sampleResumePath());
    const emptyFixtureName = 'mock-ai-empty-jobs.json';
    // Inline the empty fixture by writing it temporarily or use a direct string
    // We use a custom AI client that returns the empty fixture inline
    const app = createTestApp({
      getAI: () => ({
        models: {
          generateContent: async () => ({ text: '{"jobs":[]}' }),
        },
      }),
    });
    const res = await request(app)
      .post('/api/search-jobs')
      .attach('resume', resumeBuffer, 'resume.docx');
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });

  it('returns 400 UNSUPPORTED_FILE_TYPE for non-DOCX resume', async () => {
    const app = createTestApp({
      getAI: () => new MockAIClient(['mock-ai-job-search.json']),
    });
    const txtBuffer = await readFile(TXT_FIXTURE);
    const res = await request(app)
      .post('/api/search-jobs')
      .attach('resume', txtBuffer, 'resume.txt');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('returns 400 INVALID_REQUEST when no file attached', async () => {
    const app = createTestApp({
      getAI: () => new MockAIClient(['mock-ai-job-search.json']),
    });
    const res = await request(app).post('/api/search-jobs');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_REQUEST');
  });

});
