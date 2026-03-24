import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { setMockUser, createMockSupabaseFactory } from '../helpers/mock-auth.ts';
import { MockAIClient } from '../helpers/mock-ai.ts';
import { createApp } from '../../server/app.ts';

// Mock supabase-js so requireAuth works without real Supabase creds
vi.mock('@supabase/supabase-js', () => createMockSupabaseFactory());

// Provide dummy env vars so middleware doesn't throw on missing keys
process.env.VITE_SUPABASE_URL = 'https://dummy.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'dummy-anon-key';

function createAuthApp() {
  return createApp({
    getAI: () => new MockAIClient(['mock-ai-jd.json']),
    fetchImpl: async () => new Response('<html><body>Job description text</body></html>', { status: 200 }),
    disablePlaywrightJdFallback: true,
    skipAuth: false, // Enable real auth middleware
  });
}

describe('auth middleware', () => {
  beforeEach(() => {
    setMockUser(null); // Reset to no user
  });

  it('GET /api/health passes without auth header', async () => {
    const app = createAuthApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('returns 401 UNAUTHENTICATED when Authorization header is absent', async () => {
    const app = createAuthApp();
    const res = await request(app).post('/api/extract-jd-text').send({ text: 'Some job description' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('returns 401 when Authorization is not Bearer format', async () => {
    const app = createAuthApp();
    const res = await request(app)
      .post('/api/extract-jd-text')
      .set('Authorization', 'Basic sometoken')
      .send({ text: 'Some job description' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('returns 401 when Supabase getUser returns an error', async () => {
    setMockUser(null, new Error('Token expired'));
    const app = createAuthApp();
    const res = await request(app)
      .post('/api/extract-jd-text')
      .set('Authorization', 'Bearer expired-token')
      .send({ text: 'Some job description' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('returns 401 when Supabase returns null user (valid token, no user)', async () => {
    setMockUser(null, null); // No user, no error
    const app = createAuthApp();
    const res = await request(app)
      .post('/api/extract-jd-text')
      .set('Authorization', 'Bearer some-valid-token')
      .send({ text: 'Some job description' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('allows request through and returns 200 when auth succeeds', async () => {
    setMockUser('test-user-uuid-001');
    const app = createAuthApp();
    const res = await request(app)
      .post('/api/extract-jd-text')
      .set('Authorization', 'Bearer valid-token')
      .send({ text: 'Senior Software Engineer at TechCorp. Required: TypeScript, React, Node.js. Experience with cloud platforms and microservices. Must have 5+ years of software engineering experience. Preferred: GraphQL, Kubernetes.' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('cleanText');
  });
});
