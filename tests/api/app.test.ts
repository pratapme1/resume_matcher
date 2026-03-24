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
    let callCount = 0;
    const invalidPayloadApp = createTestApp({
      getAI: (_req?: Request) => ({
        models: {
          generateContent: async () => {
            callCount++;
            if (callCount === 1) return { text: JSON.stringify({ mustHaveKeywords: [], niceToHaveKeywords: [], targetTitles: [], seniorityLevel: '' }) };
            if (callCount === 2) return { text: JSON.stringify({ repositioningAngle: '', topStrengths: [], keyGaps: [], bulletPriorities: [], summaryOpeningHint: '' }) };
            return { text: '{"summary":"missing most fields"}' };
          },
        },
      }),
    });

    const response = await request(invalidPayloadApp)
      .post('/api/tailor-resume')
      .attach('resume', sampleResumePath())
      .field('jdText', await readFile(fixturePath('jd-valid.txt'), 'utf8'));

    expect(response.status).toBe(502);
    expect(response.body.code).toBe('AI_INVALID_RESPONSE');
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
        fields: [
          { id: 'name', name: 'name', label: 'Full Name', placeholder: '', inputType: 'text', tagName: 'input', required: true, visible: true, value: '', hasValue: false },
          { id: 'email', name: 'email', label: 'Email', placeholder: '', inputType: 'email', tagName: 'input', required: true, visible: true, value: '', hasValue: false },
          { id: 'resume', name: 'resume', label: 'Resume', placeholder: '', inputType: 'file', tagName: 'input', required: true, visible: true, hasValue: false },
        ],
        controls: [
          { id: 'submit', label: 'Submit Application', kind: 'submit' },
        ],
      });

    expect(snapshotResponse.status).toBe(200);
    expect(snapshotResponse.body.status).toBe('ready_to_submit');
    expect(snapshotResponse.body.actions.map((action: { type: string }) => action.type)).toEqual(expect.arrayContaining(['fill', 'upload']));

    const eventResponse = await request(applyApp)
      .post(`/api/apply/sessions/${sessionId}/events`)
      .set('Authorization', `Bearer ${executorToken}`)
      .send({
        status: 'ready_to_submit',
        message: 'Ready for confirmation',
        filledCount: 3,
        reviewItems: [],
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
