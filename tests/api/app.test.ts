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

  it('returns 422 when the JD URL points to a dead listing', async () => {
    const upstreamApp = createTestApp({
      fetchImpl: async () => new Response('missing', { status: 404 }),
    });

    const response = await request(upstreamApp)
      .post('/api/extract-jd-url')
      .send({ url: 'https://example.com/job' });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('EMPTY_EXTRACTED_TEXT');
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

  it('normalizes search results to infer company names and drop aggregator listings', async () => {
    const saveResponse = await request(app)
      .post('/api/resumes/default')
      .attach('resume', sampleResumePath());

    const searchPayload = {
      jobs: [
        {
          title: 'Senior Frontend Engineer',
          company: '',
          location: 'Remote',
          remoteType: 'remote',
          url: 'https://boards.greenhouse.io/acme/jobs/123456',
          description: 'Build modern React and TypeScript experiences for the product platform.',
          requiredSkills: ['React', 'TypeScript'],
          niceToHaveSkills: ['GraphQL'],
          estimatedSalary: null,
          postedDate: null,
          companyStage: 'growth',
        },
        {
          title: 'Frontend Engineer',
          company: '',
          location: 'Bengaluru',
          remoteType: 'hybrid',
          url: 'https://indeed.com/viewjob?jk=abc123',
          description: 'A short snippet.',
          requiredSkills: [],
          niceToHaveSkills: [],
          estimatedSalary: null,
          postedDate: null,
          companyStage: 'unknown',
        },
      ],
    };

    const searchApp = createTestApp({
      getSearchAI: () => ({
        providerName: 'perplexity',
        models: {
          generateContent: async () => ({ text: JSON.stringify(searchPayload) }),
        },
      }),
    });

    const response = await request(searchApp)
      .post('/api/search-jobs')
      .field('resumeId', saveResponse.body.resume.id)
      .field('preferences', JSON.stringify({ roleType: 'Frontend Engineer' }));

    expect(response.status).toBe(200);
    expect(response.body.results).toHaveLength(1);
    expect(response.body.results[0].company).toBe('Acme');
    expect(response.body.results[0].sourceType).toBe('ats');
    expect(response.body.results[0].sourceHost).toContain('greenhouse.io');
  });

  it('drops dead job URLs from search results before returning them', async () => {
    const saveResponse = await request(app)
      .post('/api/resumes/default')
      .attach('resume', sampleResumePath());

    const searchPayload = {
      jobs: [
        {
          title: 'Principal Product Manager, AI',
          company: 'Builtin Candidate',
          location: 'Remote',
          remoteType: 'remote',
          url: 'https://builtin.com/job/principal-product-manager-ai/123456',
          description: 'Drive AI product strategy and execution for a platform business.',
          requiredSkills: ['Product Strategy', 'AI'],
          niceToHaveSkills: ['B2B SaaS'],
          estimatedSalary: null,
          postedDate: null,
          companyStage: 'growth',
        },
        {
          title: 'Senior Frontend Engineer',
          company: 'Acme',
          location: 'Remote',
          remoteType: 'remote',
          url: 'https://boards.greenhouse.io/acme/jobs/123456',
          description: 'Build modern React and TypeScript experiences for the product platform.',
          requiredSkills: ['React', 'TypeScript'],
          niceToHaveSkills: ['GraphQL'],
          estimatedSalary: null,
          postedDate: null,
          companyStage: 'growth',
        },
      ],
    };

    const searchApp = createTestApp({
      getSearchAI: () => ({
        providerName: 'perplexity',
        models: {
          generateContent: async () => ({ text: JSON.stringify(searchPayload) }),
        },
      }),
      fetchImpl: async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('builtin.com')) {
          return new Response('missing', { status: 404 });
        }
        return new Response('<html><body>Live job posting</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      },
    });

    const response = await request(searchApp)
      .post('/api/search-jobs')
      .field('resumeId', saveResponse.body.resume.id)
      .field('preferences', JSON.stringify({ roleType: 'Product Manager' }));

    expect(response.status).toBe(200);
    expect(response.body.results).toHaveLength(1);
    expect(response.body.results[0].url).toContain('greenhouse.io');
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

  it('falls back to Gemini when Perplexity search returns a provider request error', async () => {
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
            const error = new Error('unsupported parameter: response_format') as Error & { status?: number };
            error.status = 400;
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
    expect(initialResponse.body.answerBank).toEqual([]);

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
        answerBank: [
          {
            id: 'relocation-answer',
            question: 'Are you open to relocation?',
            answer: 'Yes',
            portalType: 'any',
            updatedAt: new Date().toISOString(),
          },
        ],
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.profile.currentCtcLpa).toBe('12.5');
    expect(updateResponse.body.answerBank).toEqual([
      expect.objectContaining({
        question: 'Are you open to relocation?',
        answer: 'Yes',
        normalizedQuestion: 'are you open to relocation',
        portalType: 'any',
      }),
    ]);

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
    expect(getResponse.body.answerBank).toHaveLength(1);
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

  it('creates a local-agent apply session when requested', async () => {
    const applyApp = createTestApp();
    const tailoringResponse = await request(applyApp)
      .post('/api/tailor-resume')
      .attach('resume', sampleResumePath())
      .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'))
      .field('preferences', JSON.stringify({ targetRole: 'Senior Frontend Engineer' }));

    const createResponse = await request(applyApp)
      .post('/api/apply/sessions')
      .send({
        applyUrl: 'https://careers.example.com/apply/123',
        tailoredResume: tailoringResponse.body.tailoredResume,
        templateProfile: tailoringResponse.body.templateProfile,
        validation: tailoringResponse.body.validation,
        executorMode: 'local_agent',
      });

    expect(createResponse.status).toBe(200);
    expect(createResponse.body.session.executorMode).toBe('local_agent');
    expect(createResponse.body.session.status).toBe('created');
  });

  it('returns apply-session context and plans repeated work-history rows from resume entries', async () => {
    const applyApp = createTestApp();
    const tailoringResponse = await request(applyApp)
      .post('/api/tailor-resume')
      .attach('resume', sampleResumePath())
      .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'))
      .field('preferences', JSON.stringify({ targetRole: 'Senior Frontend Engineer' }));

    const repeatedResume = {
      ...tailoringResponse.body.tailoredResume,
      experience: [
        tailoringResponse.body.tailoredResume.experience[0],
        {
          id: 'exp-1',
          company: 'Acme Labs',
          title: 'Senior Frontend Engineer',
          dates: 'Jan 2020 – Apr 2022',
          location: 'Pune, India',
          bullets: [
            {
              text: 'Built internal frontend tooling for enterprise teams.',
              sourceProvenanceIds: ['synthetic-exp-1'],
            },
          ],
          sourceProvenanceIds: ['synthetic-exp-1'],
        },
      ],
    };

    const createResponse = await request(applyApp)
      .post('/api/apply/sessions')
      .send({
        applyUrl: 'https://jobs.smartrecruiters.com/Acme/repeater',
        tailoredResume: repeatedResume,
        templateProfile: tailoringResponse.body.templateProfile,
        validation: tailoringResponse.body.validation,
        executorMode: 'local_agent',
      });

    const contextResponse = await request(applyApp)
      .get(`/api/apply/sessions/${createResponse.body.session.id}/context`)
      .set('Authorization', `Bearer ${createResponse.body.executorToken}`);

    expect(contextResponse.status).toBe(200);
    expect(contextResponse.body.experienceEntries).toHaveLength(2);
    expect(contextResponse.body.experienceEntries[1].company).toBe('Acme Labs');

    const snapshotResponse = await request(applyApp)
      .post(`/api/apply/sessions/${createResponse.body.session.id}/snapshot`)
      .set('Authorization', `Bearer ${createResponse.body.executorToken}`)
      .send({
        url: 'https://jobs.smartrecruiters.com/Acme/repeater',
        title: 'Work Experience',
        portalType: 'smartrecruiters',
        stepKind: 'work_history',
        stepSignature: 'work_history:repeater',
        fields: [
          {
            id: 'exp0-company',
            name: 'experience[0].company',
            label: 'Company',
            placeholder: '',
            inputType: 'text',
            tagName: 'input',
            widgetKind: 'text',
            required: true,
            visible: true,
            value: '',
            hasValue: false,
          },
          {
            id: 'exp1-company',
            name: 'experience[1].company',
            label: 'Company',
            placeholder: '',
            inputType: 'text',
            tagName: 'input',
            widgetKind: 'text',
            required: true,
            visible: true,
            value: '',
            hasValue: false,
          },
          {
            id: 'exp1-title',
            name: 'experience[1].title',
            label: 'Job Title',
            placeholder: '',
            inputType: 'text',
            tagName: 'input',
            widgetKind: 'text',
            required: true,
            visible: true,
            value: '',
            hasValue: false,
          },
          {
            id: 'exp1-dates',
            name: 'experience[1].dates',
            label: 'Employment Dates',
            placeholder: '',
            inputType: 'text',
            tagName: 'input',
            widgetKind: 'text',
            required: true,
            visible: true,
            value: '',
            hasValue: false,
          },
          {
            id: 'exp1-location',
            name: 'experience[1].location',
            label: 'Location',
            placeholder: '',
            inputType: 'text',
            tagName: 'input',
            widgetKind: 'text',
            required: true,
            visible: true,
            value: '',
            hasValue: false,
          },
        ],
        controls: [{ id: 'submit', label: 'Submit Application', kind: 'submit' }],
      });

    expect(snapshotResponse.status).toBe(200);
    expect(snapshotResponse.body.status).toBe('ready_to_submit');
    expect(snapshotResponse.body.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: 'exp1-company', type: 'fill', value: 'Acme Labs', semanticType: 'unknown' }),
      expect.objectContaining({ fieldId: 'exp1-title', type: 'fill', value: 'Senior Frontend Engineer', semanticType: 'unknown' }),
      expect.objectContaining({ fieldId: 'exp1-dates', type: 'fill', value: 'Jan 2020 – Apr 2022', semanticType: 'unknown' }),
      expect.objectContaining({ fieldId: 'exp1-location', type: 'fill', value: 'Pune, India', semanticType: 'unknown' }),
    ]));
  });

  it('plans supported custom widgets for local-agent apply sessions', async () => {
    const applyApp = createTestApp();
    const tailoringResponse = await request(applyApp)
      .post('/api/tailor-resume')
      .attach('resume', sampleResumePath())
      .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'))
      .field('preferences', JSON.stringify({ targetRole: 'Senior Frontend Engineer' }));

    const createResponse = await request(applyApp)
      .post('/api/apply/sessions')
      .send({
        applyUrl: 'https://jobs.smartrecruiters.com/Acme/123',
        tailoredResume: tailoringResponse.body.tailoredResume,
        templateProfile: tailoringResponse.body.templateProfile,
        validation: tailoringResponse.body.validation,
        executorMode: 'local_agent',
        applicationProfile: {
          yearsOfExperience: '6',
          workAuthorization: 'Authorized to work in India',
        },
      });

    const snapshotResponse = await request(applyApp)
      .post(`/api/apply/sessions/${createResponse.body.session.id}/snapshot`)
      .set('Authorization', `Bearer ${createResponse.body.executorToken}`)
      .send({
        url: 'https://jobs.smartrecruiters.com/Acme/123',
        title: 'Apply to Senior Frontend Engineer',
        portalType: 'smartrecruiters',
        stepKind: 'questionnaire',
        stepSignature: 'questionnaire:custom',
        fields: [
          {
            id: 'experience',
            name: 'yearsExperience',
            label: 'Total Experience (Years)',
            placeholder: '',
            inputType: 'custom',
            tagName: 'div',
            widgetKind: 'custom_number',
            required: true,
            visible: true,
            value: '',
            hasValue: false,
          },
          {
            id: 'workAuthorization',
            name: 'workAuthorization',
            label: 'Work Authorization',
            placeholder: '',
            inputType: 'custom',
            tagName: 'div',
            widgetKind: 'custom_combobox',
            required: true,
            visible: true,
            value: '',
            hasValue: false,
            options: [
              { label: 'Authorized to work in India', value: 'Authorized to work in India' },
              { label: 'Require sponsorship', value: 'Require sponsorship' },
            ],
          },
        ],
        controls: [{ id: 'submit', label: 'Submit Application', kind: 'submit' }],
      });

    expect(snapshotResponse.status).toBe(200);
    expect(snapshotResponse.body.status).toBe('ready_to_submit');
    expect(snapshotResponse.body.reviewItems).toEqual([]);
    expect(snapshotResponse.body.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: 'experience', type: 'fill', semanticType: 'years_of_experience', value: '6' }),
      expect.objectContaining({ fieldId: 'workAuthorization', type: 'select', semanticType: 'work_authorization', value: 'Authorized to work in India' }),
    ]));
  });

  it('plans multiselect and card-group widgets for local-agent apply sessions', async () => {
    const applyApp = createTestApp();
    const tailoringResponse = await request(applyApp)
      .post('/api/tailor-resume')
      .attach('resume', sampleResumePath())
      .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'))
      .field('preferences', JSON.stringify({ targetRole: 'Senior Frontend Engineer' }));

    const createResponse = await request(applyApp)
      .post('/api/apply/sessions')
      .send({
        applyUrl: 'https://jobs.smartrecruiters.com/Acme/advanced',
        tailoredResume: tailoringResponse.body.tailoredResume,
        templateProfile: tailoringResponse.body.templateProfile,
        validation: tailoringResponse.body.validation,
        executorMode: 'local_agent',
        answerBank: [
          {
            id: 'skills-bank',
            question: 'Primary Skills',
            normalizedQuestion: 'primary skills',
            answer: 'React, TypeScript',
            portalType: 'smartrecruiters',
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'relocation-bank',
            question: 'Are you open to relocation?',
            normalizedQuestion: 'are you open to relocation',
            answer: 'Yes',
            portalType: 'smartrecruiters',
            updatedAt: new Date().toISOString(),
          },
        ],
      });

    const snapshotResponse = await request(applyApp)
      .post(`/api/apply/sessions/${createResponse.body.session.id}/snapshot`)
      .set('Authorization', `Bearer ${createResponse.body.executorToken}`)
      .send({
        url: 'https://jobs.smartrecruiters.com/Acme/advanced',
        title: 'Apply to Senior Frontend Engineer',
        portalType: 'smartrecruiters',
        stepKind: 'questionnaire',
        stepSignature: 'questionnaire:advanced-widgets',
        fields: [
          {
            id: 'skills',
            name: 'primarySkills',
            label: 'Primary Skills',
            placeholder: '',
            inputType: 'custom',
            tagName: 'div',
            widgetKind: 'custom_multiselect',
            required: true,
            visible: true,
            value: '',
            hasValue: false,
            options: [
              { label: 'React', value: 'React' },
              { label: 'TypeScript', value: 'TypeScript' },
            ],
          },
          {
            id: 'relocation',
            name: 'relocationPreference',
            label: 'Are you open to relocation?',
            placeholder: '',
            inputType: 'custom',
            tagName: 'div',
            widgetKind: 'custom_card_group',
            required: true,
            visible: true,
            value: '',
            hasValue: false,
            options: [
              { label: 'Yes', value: 'Yes' },
              { label: 'No', value: 'No' },
            ],
          },
        ],
        controls: [{ id: 'submit', label: 'Submit Application', kind: 'submit' }],
      });

    expect(snapshotResponse.status).toBe(200);
    expect(snapshotResponse.body.status).toBe('ready_to_submit');
    expect(snapshotResponse.body.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: 'skills', type: 'select', value: 'React, TypeScript' }),
      expect.objectContaining({ fieldId: 'relocation', type: 'select', value: 'Yes' }),
    ]));
  });

  it('fills unknown required fields from the saved answer bank before pausing for review', async () => {
    const applyApp = createTestApp();
    const tailoringResponse = await request(applyApp)
      .post('/api/tailor-resume')
      .attach('resume', sampleResumePath())
      .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'))
      .field('preferences', JSON.stringify({ targetRole: 'Senior Frontend Engineer' }));

    const createResponse = await request(applyApp)
      .post('/api/apply/sessions')
      .send({
        applyUrl: 'https://jobs.smartrecruiters.com/Acme/789',
        tailoredResume: tailoringResponse.body.tailoredResume,
        templateProfile: tailoringResponse.body.templateProfile,
        validation: tailoringResponse.body.validation,
        executorMode: 'local_agent',
        answerBank: [
          {
            id: 'onsite-answer',
            question: 'Are you willing to work onsite 5 days a week?',
            normalizedQuestion: 'are you willing to work onsite 5 days a week',
            answer: 'Yes',
            portalType: 'smartrecruiters',
            updatedAt: new Date().toISOString(),
          },
        ],
      });

    const snapshotResponse = await request(applyApp)
      .post(`/api/apply/sessions/${createResponse.body.session.id}/snapshot`)
      .set('Authorization', `Bearer ${createResponse.body.executorToken}`)
      .send({
        url: 'https://jobs.smartrecruiters.com/Acme/789',
        title: 'Apply to Senior Frontend Engineer',
        portalType: 'smartrecruiters',
        stepKind: 'questionnaire',
        stepSignature: 'questionnaire:answer-bank',
        fields: [
          {
            id: 'onsite',
            name: 'onsiteQuestion',
            label: 'Are you willing to work onsite 5 days a week?',
            placeholder: '',
            inputType: 'text',
            tagName: 'input',
            widgetKind: 'text',
            required: true,
            visible: true,
            value: '',
            hasValue: false,
          },
        ],
        controls: [{ id: 'submit', label: 'Submit Application', kind: 'submit' }],
      });

    expect(snapshotResponse.status).toBe(200);
    expect(snapshotResponse.body.status).toBe('ready_to_submit');
    expect(snapshotResponse.body.reviewItems).toEqual([]);
    expect(snapshotResponse.body.actions).toEqual([
      expect.objectContaining({
        fieldId: 'onsite',
        type: 'fill',
        semanticType: 'unknown',
        value: 'Yes',
      }),
    ]);
  });

  it('learns corrected review fields from a managed-browser snapshot into saved memory', async () => {
    const applyApp = createTestApp();
    const tailoringResponse = await request(applyApp)
      .post('/api/tailor-resume')
      .attach('resume', sampleResumePath())
      .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'))
      .field('preferences', JSON.stringify({ targetRole: 'Senior Frontend Engineer' }));

    const createResponse = await request(applyApp)
      .post('/api/apply/sessions')
      .send({
        applyUrl: 'https://jobs.smartrecruiters.com/Acme/987',
        tailoredResume: tailoringResponse.body.tailoredResume,
        templateProfile: tailoringResponse.body.templateProfile,
        validation: tailoringResponse.body.validation,
        executorMode: 'local_agent',
      });

    const initialSnapshot = {
      url: 'https://jobs.smartrecruiters.com/Acme/987',
      title: 'Apply to Senior Frontend Engineer',
      portalType: 'smartrecruiters',
      stepKind: 'questionnaire',
      stepSignature: 'questionnaire:learn-before',
      fields: [
        {
          id: 'gender',
          name: 'gender',
          label: 'Gender',
          placeholder: '',
          inputType: 'text',
          tagName: 'input',
          widgetKind: 'text',
          required: true,
          visible: true,
          value: '',
          hasValue: false,
        },
        {
          id: 'relocation',
          name: 'relocationQuestion',
          label: 'Do you have experience supporting SAP Ariba procurement workflows?',
          placeholder: '',
          inputType: 'text',
          tagName: 'input',
          widgetKind: 'text',
          required: true,
          visible: true,
          value: '',
          hasValue: false,
        },
      ],
      controls: [{ id: 'next', label: 'Next', kind: 'next' }],
    };

    const initialPlanResponse = await request(applyApp)
      .post(`/api/apply/sessions/${createResponse.body.session.id}/snapshot`)
      .set('Authorization', `Bearer ${createResponse.body.executorToken}`)
      .send(initialSnapshot);

    expect(initialPlanResponse.status).toBe(200);
    expect(initialPlanResponse.body.status).toBe('review_required');

    const learnResponse = await request(applyApp)
      .post(`/api/apply/sessions/${createResponse.body.session.id}/learn`)
      .send({
        ...initialSnapshot,
        stepSignature: 'questionnaire:learn-after',
        fields: [
          {
            ...initialSnapshot.fields[0],
            value: 'Male',
            hasValue: true,
          },
          {
            ...initialSnapshot.fields[1],
            value: 'Yes',
            hasValue: true,
          },
        ],
      });

    expect(learnResponse.status).toBe(200);
    expect(learnResponse.body.learnedCount).toBe(2);
    expect(learnResponse.body.profile.gender).toBe('Male');
    expect(learnResponse.body.answerBank).toEqual(expect.arrayContaining([
      expect.objectContaining({
        question: 'Do you have experience supporting SAP Ariba procurement workflows?',
        answer: 'Yes',
        portalType: 'smartrecruiters',
      }),
    ]));

    const storedMemory = await request(applyApp).get('/api/application-profile');
    expect(storedMemory.status).toBe(200);
    expect(storedMemory.body.profile.gender).toBe('Male');
    expect(storedMemory.body.answerBank).toEqual(expect.arrayContaining([
      expect.objectContaining({
        question: 'Do you have experience supporting SAP Ariba procurement workflows?',
        answer: 'Yes',
      }),
    ]));
  });

  it('keeps custom widgets in review for extension apply sessions', async () => {
    const applyApp = createTestApp();
    const tailoringResponse = await request(applyApp)
      .post('/api/tailor-resume')
      .attach('resume', sampleResumePath())
      .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'))
      .field('preferences', JSON.stringify({ targetRole: 'Senior Frontend Engineer' }));

    const createResponse = await request(applyApp)
      .post('/api/apply/sessions')
      .send({
        applyUrl: 'https://jobs.smartrecruiters.com/Acme/123',
        tailoredResume: tailoringResponse.body.tailoredResume,
        templateProfile: tailoringResponse.body.templateProfile,
        validation: tailoringResponse.body.validation,
        executorMode: 'extension',
        applicationProfile: {
          yearsOfExperience: '6',
        },
      });

    const snapshotResponse = await request(applyApp)
      .post(`/api/apply/sessions/${createResponse.body.session.id}/snapshot`)
      .set('Authorization', `Bearer ${createResponse.body.executorToken}`)
      .send({
        url: 'https://jobs.smartrecruiters.com/Acme/123',
        title: 'Apply to Senior Frontend Engineer',
        portalType: 'smartrecruiters',
        stepKind: 'questionnaire',
        stepSignature: 'questionnaire:custom-extension',
        fields: [
          {
            id: 'experience',
            name: 'yearsExperience',
            label: 'Total Experience (Years)',
            placeholder: '',
            inputType: 'custom',
            tagName: 'div',
            widgetKind: 'custom_number',
            required: true,
            visible: true,
            value: '',
            hasValue: false,
          },
        ],
        controls: [{ id: 'submit', label: 'Submit Application', kind: 'submit' }],
      });

    expect(snapshotResponse.status).toBe(200);
    expect(snapshotResponse.body.status).toBe('review_required');
    expect(snapshotResponse.body.pauseReason).toBe('unsupported_widget');
    expect(snapshotResponse.body.reviewItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: 'experience', required: true }),
    ]));
  });

  it('returns the dashboard applications response shape', async () => {
    const app = createTestApp();

    const response = await request(app)
      .get('/api/applications');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ applications: [] });
  });

  it('accepts manual_required status updates for dashboard controls', async () => {
    const app = createTestApp();

    const response = await request(app)
      .patch('/api/applications/app-123')
      .send({ status: 'manual_required' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
  });

  it('returns apply-session trace entries and aggregate apply metrics', async () => {
    const applyApp = createTestApp();
    const tailoringResponse = await request(applyApp)
      .post('/api/tailor-resume')
      .attach('resume', sampleResumePath())
      .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'))
      .field('preferences', JSON.stringify({ targetRole: 'Senior Frontend Engineer' }));

    const createResponse = await request(applyApp)
      .post('/api/apply/sessions')
      .send({
        applyUrl: 'https://boards.greenhouse.io/acme/jobs/trace-metrics',
        tailoredResume: tailoringResponse.body.tailoredResume,
        templateProfile: tailoringResponse.body.templateProfile,
        validation: tailoringResponse.body.validation,
      });

    const sessionId = createResponse.body.session.id;
    const executorToken = createResponse.body.executorToken;

    await request(applyApp)
      .post(`/api/apply/sessions/${sessionId}/snapshot`)
      .set('Authorization', `Bearer ${executorToken}`)
      .send({
        url: 'https://boards.greenhouse.io/acme/jobs/trace-metrics',
        title: 'Apply for Senior Frontend Engineer',
        portalType: 'greenhouse',
        stepKind: 'profile',
        stepSignature: 'profile:trace-metrics',
        fields: [
          { id: 'first', name: 'first_name', label: 'First Name', placeholder: '', inputType: 'text', tagName: 'input', widgetKind: 'text', required: true, visible: true, value: '', hasValue: false },
        ],
        controls: [{ id: 'submit', label: 'Submit Application', kind: 'submit' }],
      });

    await request(applyApp)
      .post(`/api/apply/sessions/${sessionId}/events`)
      .set('Authorization', `Bearer ${executorToken}`)
      .send({
        status: 'ready_to_submit',
        message: 'Ready for confirmation',
        pauseReason: 'none',
        stepKind: 'submit',
        stepSignature: 'submit:trace-metrics',
      });

    const traceResponse = await request(applyApp).get(`/api/apply/sessions/${sessionId}/trace`);
    expect(traceResponse.status).toBe(200);
    expect(traceResponse.body.trace).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: 'created', source: 'system' }),
      expect.objectContaining({ event: 'plan_generated', source: 'planner' }),
      expect.objectContaining({ event: 'executor_event', source: 'executor' }),
    ]));

    const metricsResponse = await request(applyApp).get('/api/apply/metrics');
    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.body.totalSessions).toBeGreaterThan(0);
    expect(metricsResponse.body.byPortalType.greenhouse).toBeGreaterThan(0);
    expect(metricsResponse.body.byStatus.ready_to_submit).toBeGreaterThan(0);
  });

  it('classifies portal types from major ATS URLs during session creation', async () => {
    const applyApp = createTestApp();
    const tailoringResponse = await request(applyApp)
      .post('/api/tailor-resume')
      .attach('resume', sampleResumePath())
      .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'))
      .field('preferences', JSON.stringify({ targetRole: 'Senior Frontend Engineer' }));

    const urls = [
      ['https://www.linkedin.com/jobs/view/1234567890/', 'linkedin'],
      ['https://www.naukri.com/job-listings-senior-frontend-engineer-acme-123456', 'naukri'],
      ['https://jobs.lever.co/acme/123', 'lever'],
      ['https://boards.greenhouse.io/acme/jobs/123', 'greenhouse'],
      ['https://jobs.ashbyhq.com/acme/12345678-90ab-cdef-1234-567890abcdef', 'ashby'],
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
