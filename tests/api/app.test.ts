import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import type { Request } from 'express';
import { MAX_UPLOAD_BYTES } from '../../server/app.ts';
import { createTestApp } from '../helpers/test-app.ts';
import { fixturePath, sampleResumePath } from '../helpers/fixture-path.ts';
import { MockAIClient } from '../helpers/mock-ai.ts';

describe('api integration', () => {
  const app = createTestApp();
  const createInlineAIApp = (responses: Array<string | Record<string, unknown>>) =>
    createTestApp({
      getAI: (_req?: Request) => {
        let index = 0;
        return {
          models: {
            generateContent: async () => {
              const value = responses[index] ?? responses[responses.length - 1] ?? {};
              index++;
              return {
                text: typeof value === 'string' ? value : JSON.stringify(value),
              };
            },
          },
        };
      },
    });

  it('returns health', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('extracts jd file from octet-stream docx upload', async () => {
    const buffer = await readFile(sampleResumePath());
    const response = await request(app)
      .post('/api/extract-jd-file')
      .attach('file', buffer, { filename: 'sample.docx', contentType: 'application/octet-stream' });

    expect(response.status).toBe(200);
    expect(response.body.cleanText).toContain('VISHNU PRATAP KUMAR');
  });

  it('returns a validation error for malformed JSON request bodies', async () => {
    const response = await request(app)
      .post('/api/extract-jd-url')
      .set('Content-Type', 'application/json')
      .send('{"url":');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_REQUEST');
  });

  it('returns a validation error for malformed URLs', async () => {
    const response = await request(app)
      .post('/api/extract-jd-url')
      .send({ url: 'not-a-url' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_REQUEST');
  });

  it('returns an upstream error when JD URL fetch fails', async () => {
    const upstreamApp = createTestApp({
      fetchImpl: async () => new Response('missing', { status: 404 }),
    });

    const response = await request(upstreamApp)
      .post('/api/extract-jd-url')
      .send({ url: 'https://example.com/job' });

    expect(response.status).toBe(502);
    expect(response.body.code).toBe('URL_FETCH_FAILED');
  });

  it('returns 422 when JD file extraction finds no readable text', async () => {
    const response = await request(app)
      .post('/api/extract-jd-file')
      .attach('file', Buffer.from('   \n   '), { filename: 'empty.txt', contentType: 'text/plain' });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('EMPTY_EXTRACTED_TEXT');
  });

  it('returns 413 for oversized file uploads', async () => {
    const response = await request(app)
      .post('/api/extract-jd-file')
      .attach('file', Buffer.alloc(MAX_UPLOAD_BYTES + 1, 'a'), { filename: 'huge.txt', contentType: 'text/plain' });

    expect(response.status).toBe(413);
    expect(response.body.code).toBe('UPLOAD_TOO_LARGE');
  });

  it('returns ready tailoring result for success fixture', async () => {
    const response = await request(app)
      .post('/api/tailor-resume')
      .attach('resume', sampleResumePath())
      .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'))
      .field('preferences', JSON.stringify({ targetRole: 'Senior Frontend Engineer' }));

    expect(response.status).toBe(200);
    expect(response.body.blocked).toBe(false);
    expect(response.body.validation.isValid).toBe(true);
    expect(response.body.renderReadiness).toBe('ready');
    expect(response.body.providerUsed).toBe('gemini');
    expect(response.body.fallbackUsed).toBe(false);
  });

  it('returns blocked tailoring result for blocked fixture', async () => {
    const response = await request(app)
      .post('/api/tailor-resume')
      .attach('resume', sampleResumePath())
      .field('jdText', `${await readFile(fixturePath('jd-valid.txt'), 'utf8')}\n[blocked]`)
      .field('preferences', JSON.stringify({ targetRole: 'Senior Frontend Engineer' }));

    expect(response.status).toBe(200);
    expect(response.body.blocked).toBe(true);
    expect(response.body.validation.isValid).toBe(false);
    expect(response.body.providerUsed).toBe('gemini');
    expect(response.body.fallbackUsed).toBe(false);
  });

  it('falls back to Qwen when Gemini is unavailable during tailoring', async () => {
    const previousModel = process.env.OPENROUTER_QWEN_MODEL;
    process.env.OPENROUTER_QWEN_MODEL = 'qwen/test-model';
    let primaryCallCount = 0;
    let fallbackCallCount = 0;
    const fallbackPayload = await readFile(fixturePath('mock-ai-success.json'), 'utf8');
    const appWithFallback = createTestApp({
      getAI: () => ({
        providerName: 'gemini',
        models: {
          generateContent: async () => {
            primaryCallCount++;
            if (primaryCallCount === 1) {
              return { text: JSON.stringify({ mustHaveKeywords: [], niceToHaveKeywords: [], targetTitles: [], seniorityLevel: '' }) };
            }
            if (primaryCallCount === 2) {
              return { text: JSON.stringify({ repositioningAngle: '', topStrengths: [], keyGaps: [], bulletPriorities: [], summaryOpeningHint: '' }) };
            }
            const error = new Error('RESOURCE_EXHAUSTED: quota exceeded') as Error & { status?: number };
            error.status = 429;
            throw error;
          },
        },
      }),
      getTailorFallbackAI: () => ({
        providerName: 'qwen',
        models: {
          generateContent: async () => {
            fallbackCallCount++;
            return { text: fallbackPayload };
          },
        },
      }),
    });

    try {
      const response = await request(appWithFallback)
        .post('/api/tailor-resume')
        .attach('resume', sampleResumePath())
        .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'))
        .field('preferences', JSON.stringify({ targetRole: 'Senior Frontend Engineer' }));

      expect(response.status).toBe(200);
      expect(response.body.blocked).toBe(false);
      expect(response.body.providerUsed).toBe('qwen');
      expect(response.body.fallbackUsed).toBe(true);
      expect(primaryCallCount).toBe(3);
      expect(fallbackCallCount).toBe(1);
    } finally {
      if (previousModel === undefined) {
        delete process.env.OPENROUTER_QWEN_MODEL;
      } else {
        process.env.OPENROUTER_QWEN_MODEL = previousModel;
      }
    }
  });

  it('saves and reloads a default resume', async () => {
    const saveResponse = await request(app)
      .post('/api/resumes/default')
      .attach('resume', sampleResumePath());

    expect(saveResponse.status).toBe(200);
    expect(saveResponse.body.resume.filename).toContain('.docx');

    const loadResponse = await request(app).get('/api/resumes/default');
    expect(loadResponse.status).toBe(200);
    expect(loadResponse.body.resume.filename).toBe(saveResponse.body.resume.filename);
    expect(loadResponse.body.resume.candidateProfile.primaryTitles.length).toBeGreaterThan(0);
  });

  it('searches jobs using a saved default resumeId', async () => {
    const saveResponse = await request(app)
      .post('/api/resumes/default')
      .attach('resume', sampleResumePath());

    const searchApp = createTestApp({
      getAI: () => new MockAIClient(['mock-ai-job-search.json']),
    });

    const response = await request(searchApp)
      .post('/api/search-jobs')
      .field('resumeId', saveResponse.body.resume.id)
      .field('preferences', JSON.stringify({ roleType: 'Frontend Engineer' }));

    expect(response.status).toBe(200);
    expect(response.body.resumeSource).toBe('default');
    expect(Array.isArray(response.body.results)).toBe(true);
  });

  it('falls back to Gemini when Perplexity search is unavailable', async () => {
    const saveResponse = await request(app)
      .post('/api/resumes/default')
      .attach('resume', sampleResumePath());

    let primaryCallCount = 0;
    let fallbackCallCount = 0;
    const searchApp = createTestApp({
      getSearchAI: () => ({
        providerName: 'perplexity',
        models: {
          generateContent: async () => {
            primaryCallCount++;
            const error = new Error('upstream overloaded') as Error & { status?: number };
            error.status = 503;
            throw error;
          },
        },
      }),
      getSearchFallbackAI: () => ({
        providerName: 'gemini',
        models: {
          generateContent: async () => {
            fallbackCallCount++;
            return { text: await readFile(fixturePath('mock-ai-job-search.json'), 'utf8') };
          },
        },
      }),
    });

    const response = await request(searchApp)
      .post('/api/search-jobs')
      .field('resumeId', saveResponse.body.resume.id)
      .field('preferences', JSON.stringify({ roleType: 'Frontend Engineer' }));

    expect(response.status).toBe(200);
    expect(response.body.results.length).toBeGreaterThan(0);
    expect(primaryCallCount).toBe(1);
    expect(fallbackCallCount).toBe(1);
  });

  it('falls back to a stable fit score when gap analysis omits fitScore', async () => {
    const response = await request(app)
      .post('/api/tailor-resume')
      .attach('resume', sampleResumePath())
      .field('jdText', `${await readFile(fixturePath('jd-valid.txt'), 'utf8')}\n[missing-fit]`)
      .field('preferences', JSON.stringify({ targetRole: 'Senior Frontend Engineer' }));

    expect(response.status).toBe(200);
    expect(response.body.blocked).toBe(false);
    expect(response.body.tailoringPlan?.gapAnalysis?.fitScore).toBe(response.body.analysis.preAlignmentScore);
  });

  it('restores role-fit narrative when gap analysis falls back to minimal output', async () => {
    let callCount = 0;
    const minimalGapApp = createTestApp({
      getAI: () => ({
        models: {
          generateContent: async () => {
            callCount++;
            if (callCount === 1) {
              return { text: JSON.stringify({ mustHaveKeywords: ['react', 'typescript', 'testing'], niceToHaveKeywords: ['graphql'], targetTitles: ['Senior Frontend Engineer'], seniorityLevel: 'senior' }) };
            }
            if (callCount === 2) {
              return { text: '{"unexpected":true}' };
            }
            return { text: await readFile(fixturePath('mock-ai-success.json'), 'utf8') };
          },
        },
      }),
    });

    const response = await request(minimalGapApp)
      .post('/api/tailor-resume')
      .attach('resume', sampleResumePath())
      .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'))
      .field('preferences', JSON.stringify({ targetRole: 'Senior Frontend Engineer' }));

    expect(response.status).toBe(200);
    expect(response.body.tailoringPlan?.gapAnalysis?.fitScore).toBe(response.body.analysis.preAlignmentScore);
    expect(response.body.tailoringPlan?.gapAnalysis?.repositioningAngle).toBeTruthy();
    expect(response.body.tailoringPlan?.gapAnalysis?.topStrengths?.length).toBeGreaterThan(0);
  });

  it('rebuilds the final tailored resume from locked source fields when the model drifts', async () => {
    const saveResponse = await request(app)
      .post('/api/resumes/default')
      .attach('resume', sampleResumePath());

    const mutatedTailorPayload = JSON.parse(await readFile(fixturePath('mock-ai-success.json'), 'utf8'));
    mutatedTailorPayload.contactInfo.name = 'Hallucinated Person';
    mutatedTailorPayload.contactInfo.email = 'fake@example.com';
    mutatedTailorPayload.experience[0].company = 'Fake Corp';
    mutatedTailorPayload.experience[0].title = 'Chief Wizard';
    mutatedTailorPayload.experience[0].dates = '2099 - Present';
    mutatedTailorPayload.sectionOrder = ['skills', 'summary', 'experience'];

    const driftApp = createInlineAIApp([
      JSON.parse(await readFile(fixturePath('mock-ai-jd.json'), 'utf8')),
      JSON.parse(await readFile(fixturePath('mock-ai-gap.json'), 'utf8')),
      mutatedTailorPayload,
    ]);

    const response = await request(driftApp)
      .post('/api/tailor-resume')
      .field('resumeId', saveResponse.body.resume.id)
      .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'))
      .field('preferences', JSON.stringify({ targetRole: 'Senior Frontend Engineer' }));

    expect(response.status).toBe(200);
    expect(response.body.resumeSource).toBe('default');
    expect(response.body.tailoredResume.contactInfo.name).toBe('VISHNU PRATAP KUMAR');
    expect(response.body.tailoredResume.contactInfo.email).toBe('vishnupratapkumar@gmail.com');
    expect(response.body.tailoredResume.experience[0].company).not.toBe('Fake Corp');
    expect(response.body.tailoredResume.experience[0].title).not.toBe('Chief Wizard');
    expect(response.body.tailoredResume.sectionOrder).not.toEqual(['skills', 'summary', 'experience']);
    expect(response.body.promptVersion).toBeTruthy();
    expect(response.body.pipelineVersion).toBeTruthy();
  });

  it('returns 400 for malformed preferences JSON', async () => {
    const response = await request(app)
      .post('/api/tailor-resume')
      .attach('resume', sampleResumePath())
      .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'))
      .field('preferences', '{');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 for non-DOCX resume uploads', async () => {
    const response = await request(app)
      .post('/api/tailor-resume')
      .attach('resume', Buffer.from('resume'), { filename: 'resume.txt', contentType: 'text/plain' })
      .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('returns 502 when the AI provider fails', async () => {
    let callCount = 0;
    const failingApp = createTestApp({
      getAI: (_req?: Request) => ({
        models: {
          generateContent: async () => {
            callCount++;
            if (callCount === 1) return { text: JSON.stringify({ mustHaveKeywords: [], niceToHaveKeywords: [], targetTitles: [], seniorityLevel: '' }) };
            if (callCount === 2) return { text: JSON.stringify({ repositioningAngle: '', topStrengths: [], keyGaps: [], bulletPriorities: [], summaryOpeningHint: '' }) };
            throw new Error('provider down');
          },
        },
      }),
    });

    const response = await request(failingApp)
      .post('/api/tailor-resume')
      .attach('resume', sampleResumePath())
      .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'));

    expect(response.status).toBe(502);
    expect(response.body.code).toBe('AI_PROVIDER_ERROR');
  });

  it('returns 502 when the AI payload is invalid', async () => {
    const previousModel = process.env.OPENROUTER_QWEN_MODEL;
    process.env.OPENROUTER_QWEN_MODEL = 'qwen/test-model';
    let callCount = 0;
    let fallbackCallCount = 0;
    const invalidPayloadApp = createTestApp({
      getAI: (_req?: Request) => ({
        providerName: 'gemini',
        models: {
          generateContent: async () => {
            callCount++;
            if (callCount === 1) return { text: JSON.stringify({ mustHaveKeywords: [], niceToHaveKeywords: [], targetTitles: [], seniorityLevel: '' }) };
            if (callCount === 2) return { text: JSON.stringify({ repositioningAngle: '', topStrengths: [], keyGaps: [], bulletPriorities: [], summaryOpeningHint: '' }) };
            return { text: '{"summary":"missing most fields"}' };
          },
        },
      }),
      getTailorFallbackAI: () => ({
        providerName: 'qwen',
        models: {
          generateContent: async () => {
            fallbackCallCount++;
            return { text: await readFile(fixturePath('mock-ai-success.json'), 'utf8') };
          },
        },
      }),
    });

    try {
      const response = await request(invalidPayloadApp)
        .post('/api/tailor-resume')
        .attach('resume', sampleResumePath())
        .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'));

      expect(response.status).toBe(502);
      expect(response.body.code).toBe('AI_INVALID_RESPONSE');
      expect(fallbackCallCount).toBe(0);
    } finally {
      if (previousModel === undefined) {
        delete process.env.OPENROUTER_QWEN_MODEL;
      } else {
        process.env.OPENROUTER_QWEN_MODEL = previousModel;
      }
    }
  });

  it('returns 400 when DOCX generation payload is incomplete', async () => {
    const response = await request(app)
      .post('/api/generate-docx')
      .send({ validation: { isValid: false } });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_REQUEST');
  });

  it('generates DOCX even when validation.isValid is false (soft validation — warnings only)', async () => {
    const tailoringResponse = await request(app)
      .post('/api/tailor-resume')
      .attach('resume', sampleResumePath())
      .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'))
      .field('preferences', JSON.stringify({ targetRole: 'Senior Frontend Engineer' }));

    const response = await request(app)
      .post('/api/generate-docx')
      .send({
        tailoredResume: tailoringResponse.body.tailoredResume,
        templateProfile: tailoringResponse.body.templateProfile,
        validation: {
          ...tailoringResponse.body.validation,
          isValid: false,
        },
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('wordprocessingml');
  });

  it('extracts JD from pasted text — /api/extract-jd-text returns NormalizedJobDescription', async () => {
    const response = await request(app)
      .post('/api/extract-jd-text')
      .send({ text: 'Senior Software Engineer at TechCorp. Required: TypeScript, React, Node.js. Must have cloud platform and microservices experience. Nice to have: GraphQL, Kubernetes.' });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('cleanText');
    expect(response.body).toHaveProperty('sourceType', 'paste');
    expect(typeof response.body.qualityScore).toBe('number');
  });

  it('returns 400 for empty text in /api/extract-jd-text', async () => {
    const response = await request(app)
      .post('/api/extract-jd-text')
      .send({ text: '' });
    expect(response.status).toBe(400);
  });

  it('/api/smart-fill returns mapping object with field values', async () => {
    const smartFillApp = createTestApp({
      getAI: () => new MockAIClient(['mock-ai-smart-fill.json']),
    });
    const response = await request(smartFillApp)
      .post('/api/smart-fill')
      .send({
        fields: [
          { name: 'first_name', label: 'First Name', placeholder: 'Enter first name', type: 'text' },
          { name: 'email', label: 'Email', placeholder: 'your@email.com', type: 'email' },
        ],
        prefill: {
          name: 'Vishnu Pratap Kumar',
          email: 'vishnupratapkumar@gmail.com',
          phone: '9148969183',
        },
      });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('mapping');
    expect(typeof response.body.mapping).toBe('object');
  });

  it('/api/generate-docx returns binary DOCX with correct Content-Type', async () => {
    // First tailor to get a valid result
    const tailoringResponse = await request(app)
      .post('/api/tailor-resume')
      .attach('resume', sampleResumePath())
      .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'));
    expect(tailoringResponse.status).toBe(200);
    expect(tailoringResponse.body.blocked).toBe(false);

    const response = await request(app)
      .post('/api/generate-docx')
      .send({
        tailoredResume: tailoringResponse.body.tailoredResume,
        templateProfile: tailoringResponse.body.templateProfile,
        validation: tailoringResponse.body.validation,
      });
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/wordprocessingml/);
  });

  it('/api/auto-apply returns 400 for missing applyUrl', async () => {
    const response = await request(app)
      .post('/api/auto-apply')
      .send({
        contactInfo: { name: 'Test User', email: 'test@example.com' },
        tailoredResume: {},
        templateProfile: {},
        validation: { isValid: true },
    });
    expect(response.status).toBe(400);
  });

  it('loads and persists the application profile for Stage 5', async () => {
    const profileApp = createTestApp();

    const initialResponse = await request(profileApp)
      .get('/api/application-profile');

    expect(initialResponse.status).toBe(200);
    expect(initialResponse.body.profile).toEqual({});

    const updateResponse = await request(profileApp)
      .put('/api/application-profile')
      .send({
        profile: {
          currentCtcLpa: '12.5',
          expectedCtcLpa: '18.0',
          noticePeriodDays: '30',
          github: 'github.com/vishnu',
          requiresSponsorship: 'No',
        },
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.profile.currentCtcLpa).toBe('12.5');

    const mergeResponse = await request(profileApp)
      .put('/api/application-profile')
      .send({
        profile: {
          visaStatus: 'H1B',
        },
      });

    expect(mergeResponse.status).toBe(200);
    expect(mergeResponse.body.profile.currentCtcLpa).toBe('12.5');
    expect(mergeResponse.body.profile.visaStatus).toBe('H1B');

    const getResponse = await request(profileApp)
      .get('/api/application-profile');

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.profile.noticePeriodDays).toBe('30');
    expect(getResponse.body.profile.github).toBe('github.com/vishnu');
    expect(getResponse.body.profile.visaStatus).toBe('H1B');
  });

  it('creates and fetches an apply session for Stage 5 orchestration', async () => {
    const applyApp = createTestApp();
    const tailoringResponse = await request(applyApp)
      .post('/api/tailor-resume')
      .attach('resume', sampleResumePath())
      .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'))
      .field('preferences', JSON.stringify({ targetRole: 'Senior Frontend Engineer' }));

    const createResponse = await request(applyApp)
      .post('/api/apply/sessions')
      .send({
        applyUrl: 'https://boards.greenhouse.io/acme/jobs/123',
        tailoredResume: tailoringResponse.body.tailoredResume,
        templateProfile: tailoringResponse.body.templateProfile,
        validation: tailoringResponse.body.validation,
      });

    expect(createResponse.status).toBe(200);
    expect(createResponse.body.session.executorMode).toBe('extension');
    expect(createResponse.body.session.portalType).toBe('greenhouse');
    expect(createResponse.body.executorToken).toEqual(expect.any(String));

    const getResponse = await request(applyApp)
      .get(`/api/apply/sessions/${createResponse.body.session.id}`);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.id).toBe(createResponse.body.session.id);
    expect(getResponse.body.status).toBe('created');
  });

  it('classifies portal types from major ATS URLs during session creation', async () => {
    const applyApp = createTestApp();
    const tailoringResponse = await request(applyApp)
      .post('/api/tailor-resume')
      .attach('resume', sampleResumePath())
      .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'))
      .field('preferences', JSON.stringify({ targetRole: 'Senior Frontend Engineer' }));

    const urls = [
      ['https://jobs.lever.co/acme/123', 'lever'],
      ['https://boards.greenhouse.io/acme/jobs/123', 'greenhouse'],
      ['https://acme.wd5.myworkdayjobs.com/en-US/careers/job/Senior-Engineer', 'workday'],
      ['https://acme.icims.com/jobs/123/job', 'icims'],
      ['https://jobs.smartrecruiters.com/Acme/123', 'smartrecruiters'],
      ['https://career5.successfactors.eu/career?job=123', 'successfactors'],
      ['https://acme.taleo.net/careersection/2/jobdetail.ftl?job=123', 'taleo'],
    ] as const;

    for (const [applyUrl, expectedPortalType] of urls) {
      const response = await request(applyApp)
        .post('/api/apply/sessions')
        .send({
          applyUrl,
          tailoredResume: tailoringResponse.body.tailoredResume,
          templateProfile: tailoringResponse.body.templateProfile,
          validation: tailoringResponse.body.validation,
        });

      expect(response.status).toBe(200);
      expect(response.body.session.portalType).toBe(expectedPortalType);
    }
  });

  it('plans, updates, confirms, and completes an apply session', async () => {
    const applyApp = createTestApp();
    const tailoringResponse = await request(applyApp)
      .post('/api/tailor-resume')
      .attach('resume', sampleResumePath())
      .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'))
      .field('preferences', JSON.stringify({ targetRole: 'Senior Frontend Engineer' }));

    const createResponse = await request(applyApp)
      .post('/api/apply/sessions')
      .send({
        applyUrl: 'https://jobs.lever.co/acme/123',
        tailoredResume: tailoringResponse.body.tailoredResume,
        templateProfile: tailoringResponse.body.templateProfile,
        validation: tailoringResponse.body.validation,
        applicationProfile: {
          currentCtcLpa: '12.5',
          expectedCtcLpa: '18.0',
          noticePeriodDays: '30',
          github: 'github.com/vishnu',
          requiresSponsorship: 'No',
        },
      });

    const sessionId = createResponse.body.session.id;
    const executorToken = createResponse.body.executorToken;

    const snapshotResponse = await request(applyApp)
      .post(`/api/apply/sessions/${sessionId}/snapshot`)
      .set('Authorization', `Bearer ${executorToken}`)
      .send({
        url: 'https://jobs.lever.co/acme/123',
        title: 'Apply for Senior Frontend Engineer',
        portalType: 'lever',
        stepKind: 'questionnaire',
        stepSignature: 'questionnaire:test',
        fields: [
          { id: 'name', name: 'name', label: 'Full Name', placeholder: '', inputType: 'text', tagName: 'input', widgetKind: 'text', required: true, visible: true, value: '', hasValue: false },
          { id: 'email', name: 'email', label: 'Email', placeholder: '', inputType: 'email', tagName: 'input', widgetKind: 'text', required: true, visible: true, value: '', hasValue: false },
          { id: 'experience', name: 'totalExperience', label: 'Total Experience (Years)', placeholder: '5', inputType: 'text', tagName: 'input', widgetKind: 'text', required: true, visible: true, value: '', hasValue: false },
          { id: 'currentCtc', name: 'currentCtc', label: 'Current CTC (LPA)', placeholder: '12.5', inputType: 'text', tagName: 'input', widgetKind: 'text', required: true, visible: true, value: '', hasValue: false },
          { id: 'expectedCtc', name: 'expectedCtc', label: 'Expected CTC (LPA)', placeholder: '18.0', inputType: 'text', tagName: 'input', widgetKind: 'text', required: true, visible: true, value: '', hasValue: false },
          { id: 'notice', name: 'noticePeriod', label: 'Notice Period (Days)', placeholder: '30', inputType: 'text', tagName: 'input', widgetKind: 'text', required: true, visible: true, value: '', hasValue: false },
          { id: 'github', name: 'portfolio', label: 'Portfolio / GitHub', placeholder: 'github.com/yourprofile', inputType: 'text', tagName: 'input', widgetKind: 'text', required: false, visible: true, value: '', hasValue: false },
          { id: 'resume', name: 'resume', label: 'Resume', placeholder: '', inputType: 'file', tagName: 'input', widgetKind: 'file_upload', required: true, visible: true, hasValue: false },
        ],
        controls: [
          { id: 'submit', label: 'Submit Application', kind: 'submit' },
        ],
      });

    expect(snapshotResponse.status).toBe(200);
    expect(snapshotResponse.body.status).toBe('ready_to_submit');
    expect(snapshotResponse.body.actions.map((action: { type: string }) => action.type)).toEqual(expect.arrayContaining(['fill', 'upload']));
    expect(snapshotResponse.body.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: 'experience', value: expect.any(String), semanticType: 'years_of_experience' }),
      expect.objectContaining({ fieldId: 'currentCtc', value: '12.5', semanticType: 'current_ctc' }),
      expect.objectContaining({ fieldId: 'expectedCtc', value: '18.0', semanticType: 'expected_ctc' }),
      expect.objectContaining({ fieldId: 'notice', value: '30', semanticType: 'notice_period' }),
      expect.objectContaining({ fieldId: 'github', value: 'github.com/vishnu', semanticType: 'github' }),
    ]));

    const eventResponse = await request(applyApp)
      .post(`/api/apply/sessions/${sessionId}/events`)
      .set('Authorization', `Bearer ${executorToken}`)
      .send({
        status: 'ready_to_submit',
        message: 'Ready for confirmation',
        filledCount: 3,
        reviewItems: [],
        pauseReason: 'none',
        stepKind: 'submit',
        stepSignature: 'submit:test',
      });

    expect(eventResponse.status).toBe(200);
    expect(eventResponse.body.filledCount).toBe(3);

    const confirmResponse = await request(applyApp)
      .post(`/api/apply/sessions/${sessionId}/confirm-submit`);

    expect(confirmResponse.status).toBe(200);
    expect(confirmResponse.body.submitConfirmed).toBe(true);
    expect(confirmResponse.body.status).toBe('submitting');

    const completeResponse = await request(applyApp)
      .post(`/api/apply/sessions/${sessionId}/complete`)
      .set('Authorization', `Bearer ${executorToken}`)
      .send({
        outcome: 'submitted',
        message: 'Application submitted from extension',
      });

    expect(completeResponse.status).toBe(200);
    expect(completeResponse.body.status).toBe('submitted');

    const getResponse = await request(applyApp)
      .get(`/api/apply/sessions/${sessionId}`);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.status).toBe('submitted');
    expect(getResponse.body.latestMessage).toBe('Application submitted from extension');
  });
});
