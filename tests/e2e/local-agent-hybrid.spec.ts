import { readFile } from 'node:fs/promises';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './local-agent-fixtures.ts';
import { sampleResumePath } from '../helpers/fixture-path.ts';

const resumePath = sampleResumePath();
const portalBaseUrl = 'http://127.0.0.1:3100';

async function skipToJDStep(page: Page) {
  const pasteBtn = page.getByRole('button', { name: /Paste a job/i });
  if (await pasteBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await pasteBtn.click();
    return;
  }
  await page.getByRole('button', { name: /Skip.*specific job/i }).click();
}

async function reachStepFive(page: Page, portalPath: string) {
  const portalUrl = `${portalBaseUrl}${portalPath}`;
  await page.goto('/');
  await skipToJDStep(page);
  await page.getByRole('button', { name: 'URL' }).click();
  await page.locator('input[type="url"]').fill(portalUrl);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.setInputFiles('input[accept=".docx"]', resumePath);
  await page.getByRole('button', { name: 'Tailor Resume' }).click();
  await expect(page.getByText('Resume Tailored Successfully')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Download Tailored Resume \(DOCX\)|Download with Warnings/i }).click();
  await expect(page.getByRole('heading', { name: /Apply to/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Extension connected')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/local agent/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('input[type="url"]')).toHaveValue(portalUrl);
}

async function startHybridApply(page: Page) {
  const createSessionResponse = page.waitForResponse((response) =>
    response.url().includes('/api/apply/sessions') &&
    response.request().method() === 'POST' &&
    !response.url().includes('/snapshot') &&
    !response.url().includes('/events') &&
    !response.url().includes('/complete'),
  );

  await page.getByRole('button', { name: /Start Hybrid Apply/i }).click();
  const response = await createSessionResponse;
  const body = await response.json() as { session: { id: string; executorMode: string } };
  return body.session;
}

async function waitForSessionStatus(
  request: APIRequestContext,
  sessionId: string,
  expectedStatuses: string[],
  timeoutMs = 20_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await request.get(`/api/apply/sessions/${sessionId}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json() as {
      status: string;
      latestPauseReason?: string | null;
      latestMessage?: string | null;
      latestScreenshot?: string | null;
      latestPageUrl?: string | null;
      portalType?: string;
    };
    if (expectedStatuses.includes(body.status)) {
      return body;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for apply session ${sessionId} to reach one of: ${expectedStatuses.join(', ')}`);
}

async function waitForLocalAgentSnapshot(request: APIRequestContext, baseUrl: string, sessionId: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await request.get(`${baseUrl}/sessions/${sessionId}/debug`);
    if (response.ok()) {
      const body = await response.json() as {
        snapshot?: {
          url: string;
          fields: Array<{
            name: string;
            label?: string;
            value?: string;
            hasValue?: boolean;
            widgetKind: string;
          }>;
        };
      };
      if (body.snapshot) {
        return body.snapshot;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for local-agent snapshot for session ${sessionId}`);
}

async function createLocalAgentSessionForPortal(
  request: APIRequestContext,
  localAgentBaseUrl: string,
  portalPath: string,
) {
  const resumeBuffer = await readFile(resumePath);
  const tailorResponse = await request.post('/api/tailor-resume', {
    multipart: {
      resume: {
        name: 'resume.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: resumeBuffer,
      },
      jdText: 'Senior Frontend Engineer role requiring strong React, TypeScript, testing, and collaboration skills.',
      preferences: JSON.stringify({ targetRole: 'Senior Frontend Engineer' }),
    },
  });
  expect(tailorResponse.ok()).toBeTruthy();
  const tailoringBody = await tailorResponse.json() as {
    tailoredResume: unknown;
    templateProfile: unknown;
    validation: unknown;
  };

  const createResponse = await request.post('/api/apply/sessions', {
    data: {
      applyUrl: `${portalBaseUrl}${portalPath}`,
      tailoredResume: tailoringBody.tailoredResume,
      templateProfile: tailoringBody.templateProfile,
      validation: tailoringBody.validation,
      executorMode: 'local_agent',
    },
  });
  expect(createResponse.ok()).toBeTruthy();
  const createBody = await createResponse.json() as {
    session: { id: string; executorMode: string };
    executorToken: string;
  };

  const agentStart = await request.post(`${localAgentBaseUrl}/sessions/start`, {
    data: {
      sessionId: createBody.session.id,
      applyUrl: `${portalBaseUrl}${portalPath}`,
      apiBaseUrl: portalBaseUrl,
      executorToken: createBody.executorToken,
    },
  });
  expect(agentStart.ok()).toBeTruthy();
  expect(createBody.session.executorMode).toBe('local_agent');

  return createBody;
}

test('local-agent path fills supported custom widgets and reaches submit readiness', async ({ page, request, extensionId, localAgentBaseUrl }) => {
  expect(extensionId).toMatch(/[a-p]{32}/);
  await reachStepFive(page, '/__fixtures__/apply/custom-widget-supported');
  await page.getByLabel('Total Experience (Years)').fill('6');
  await page.getByLabel('Work Authorization').fill('Authorized to work in India');

  const session = await startHybridApply(page);
  expect(session.executorMode).toBe('local_agent');
  await expect(page.getByText('Executor: local_agent')).toBeVisible({ timeout: 15_000 });

  const ready = await waitForSessionStatus(request, session.id, ['ready_to_submit'], 25_000);
  expect(ready.portalType).toBe('generic');

  const snapshot = await waitForLocalAgentSnapshot(request, localAgentBaseUrl, session.id, 10_000);
  const experience = snapshot.fields.find((field) => field.name === 'experience');
  const workAuth = snapshot.fields.find((field) => field.name === 'work_auth');
  const resume = snapshot.fields.find((field) => field.name === 'resume');

  expect(experience?.widgetKind).toBe('custom_number');
  expect(experience?.value || '').toContain('6');
  expect(workAuth?.widgetKind).toBe('custom_combobox');
  expect(resume?.hasValue).toBe(true);

  const confirmSubmit = await request.post(`/api/apply/sessions/${session.id}/confirm-submit`);
  expect(confirmSubmit.ok()).toBeTruthy();
  const submitResponse = await request.post(`${localAgentBaseUrl}/sessions/${session.id}/submit`);
  if (!submitResponse.ok()) {
    throw new Error(`Local-agent submit failed: ${submitResponse.status()} ${await submitResponse.text()}`);
  }
  await waitForSessionStatus(request, session.id, ['submitted'], 20_000);
});

test('local-agent advanced widgets capture trace and metrics for harder flows', async ({ page, request, extensionId, localAgentBaseUrl }) => {
  expect(extensionId).toMatch(/[a-p]{32}/);

  const profileSave = await request.put('/api/application-profile', {
    data: {
      profile: {
        location: 'Bengaluru, India',
      },
      answerBank: [
        {
          id: 'skills-answer',
          question: 'Primary Skills',
          normalizedQuestion: 'primary skills',
          answer: 'React, TypeScript',
          portalType: 'any',
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'relocation-answer',
          question: 'Are you open to relocation?',
          normalizedQuestion: 'are you open to relocation',
          answer: 'Yes',
          portalType: 'any',
          updatedAt: new Date().toISOString(),
        },
      ],
    },
  });
  expect(profileSave.ok()).toBeTruthy();

  await reachStepFive(page, '/__fixtures__/apply/local-agent-advanced-widgets');
  const session = await startHybridApply(page);
  expect(session.executorMode).toBe('local_agent');

  const ready = await waitForSessionStatus(request, session.id, ['ready_to_submit'], 25_000);
  expect(ready.portalType).toBe('generic');

  const snapshot = await waitForLocalAgentSnapshot(request, localAgentBaseUrl, session.id, 10_000);
  expect(snapshot.fields.find((field) => field.name === 'preferred_location')?.value || '').toMatch(/benga/i);
  expect(snapshot.fields.find((field) => field.name === 'primary_skills')?.widgetKind).toBe('custom_multiselect');
  expect(snapshot.fields.find((field) => field.name === 'relocation_preference')?.widgetKind).toBe('custom_card_group');
  expect(snapshot.fields.find((field) => field.name === 'relocation_preference')?.value || '').toContain('Yes');

  const traceResponse = await request.get(`/api/apply/sessions/${session.id}/trace`);
  expect(traceResponse.ok()).toBeTruthy();
  const traceBody = await traceResponse.json() as { trace: Array<{ event: string; source: string }> };
  expect(traceBody.trace).toEqual(expect.arrayContaining([
    expect.objectContaining({ event: 'created', source: 'system' }),
    expect.objectContaining({ event: 'plan_generated', source: 'planner' }),
    expect.objectContaining({ event: 'executor_event', source: 'executor' }),
  ]));

  const metricsResponse = await request.get('/api/apply/metrics');
  expect(metricsResponse.ok()).toBeTruthy();
  const metricsBody = await metricsResponse.json() as {
    totalSessions: number;
    byStatus: Record<string, number>;
    byPortalType: Record<string, number>;
  };
  expect(metricsBody.totalSessions).toBeGreaterThan(0);
  expect(metricsBody.byStatus.ready_to_submit).toBeGreaterThan(0);
  expect(metricsBody.byPortalType.generic).toBeGreaterThan(0);
});

test('local-agent expands and fills repeated work-history rows from session context', async ({ request, localAgentBaseUrl }) => {
  const resumeBuffer = await readFile(resumePath);
  const tailorResponse = await request.post('/api/tailor-resume', {
    multipart: {
      resume: {
        name: 'resume.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: resumeBuffer,
      },
      jdText: 'Senior Frontend Engineer role requiring strong React, TypeScript, testing, and collaboration skills.',
      preferences: JSON.stringify({ targetRole: 'Senior Frontend Engineer' }),
    },
  });
  expect(tailorResponse.ok()).toBeTruthy();
  const tailoringBody = await tailorResponse.json() as {
    tailoredResume: {
      experience: Array<{
        id: string;
        company: string;
        title: string;
        dates: string;
        location: string;
        bullets: Array<{ text: string; sourceProvenanceIds: string[] }>;
        sourceProvenanceIds: string[];
      }>;
    };
    templateProfile: unknown;
    validation: unknown;
  };

  const repeatedResume = {
    ...tailoringBody.tailoredResume,
    experience: [
      tailoringBody.tailoredResume.experience[0],
      {
        id: 'exp-1',
        company: 'Acme Labs',
        title: 'Senior Frontend Engineer',
        dates: 'Jan 2020 – Apr 2022',
        location: 'Pune, India',
        bullets: [
          {
            text: 'Built frontend platforms and workflow automation for enterprise teams.',
            sourceProvenanceIds: ['synthetic-exp-1'],
          },
        ],
        sourceProvenanceIds: ['synthetic-exp-1'],
      },
    ],
  };

  const createResponse = await request.post('/api/apply/sessions', {
    data: {
      applyUrl: `${portalBaseUrl}/__fixtures__/apply/local-agent-repeated-experience`,
      tailoredResume: repeatedResume,
      templateProfile: tailoringBody.templateProfile,
      validation: tailoringBody.validation,
      executorMode: 'local_agent',
    },
  });
  expect(createResponse.ok()).toBeTruthy();
  const createBody = await createResponse.json() as {
    session: { id: string };
    executorToken: string;
  };

  const contextResponse = await request.get(`/api/apply/sessions/${createBody.session.id}/context`, {
    headers: {
      Authorization: `Bearer ${createBody.executorToken}`,
    },
  });
  expect(contextResponse.ok()).toBeTruthy();
  const contextBody = await contextResponse.json() as {
    experienceEntries: Array<{ company: string }>;
  };
  expect(contextBody.experienceEntries).toHaveLength(2);

  const agentStart = await request.post(`${localAgentBaseUrl}/sessions/start`, {
    data: {
      sessionId: createBody.session.id,
      applyUrl: `${portalBaseUrl}/__fixtures__/apply/local-agent-repeated-experience`,
      apiBaseUrl: portalBaseUrl,
      executorToken: createBody.executorToken,
    },
  });
  expect(agentStart.ok()).toBeTruthy();

  const ready = await waitForSessionStatus(request, createBody.session.id, ['ready_to_submit'], 25_000);
  expect(ready.portalType).toBe('generic');

  const snapshot = await waitForLocalAgentSnapshot(request, localAgentBaseUrl, createBody.session.id, 10_000);
  expect(snapshot.fields.find((field) => field.name === 'experience[1].company')?.value || '').toContain('Acme Labs');
  expect(snapshot.fields.find((field) => field.name === 'experience[1].title')?.value || '').toContain('Senior Frontend Engineer');
  expect(snapshot.fields.find((field) => field.name === 'experience[1].location')?.value || '').toContain('Pune');
});

test('local-agent expands and fills repeated education rows from session context', async ({ request, localAgentBaseUrl }) => {
  const resumeBuffer = await readFile(resumePath);
  const tailorResponse = await request.post('/api/tailor-resume', {
    multipart: {
      resume: {
        name: 'resume.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: resumeBuffer,
      },
      jdText: 'Senior Frontend Engineer role requiring strong React, TypeScript, testing, and collaboration skills.',
      preferences: JSON.stringify({ targetRole: 'Senior Frontend Engineer' }),
    },
  });
  expect(tailorResponse.ok()).toBeTruthy();
  const tailoringBody = await tailorResponse.json() as {
    tailoredResume: {
      education: Array<{
        id: string;
        institution: string;
        degree: string;
        dates: string;
        location: string;
        sourceProvenanceIds: string[];
      }>;
    };
    templateProfile: unknown;
    validation: unknown;
  };

  const repeatedResume = {
    ...tailoringBody.tailoredResume,
    education: [
      {
        id: 'edu-0',
        institution: 'Visvesvaraya Technological University',
        degree: 'B.E. in Information Science',
        dates: '2011 – 2015',
        location: 'Bengaluru, India',
        sourceProvenanceIds: ['synthetic-edu-0'],
      },
      {
        id: 'edu-1',
        institution: 'National Institute of Technology',
        degree: 'B.Tech in Computer Science',
        dates: '2015 – 2019',
        location: 'Surathkal, India',
        sourceProvenanceIds: ['synthetic-edu-1'],
      },
    ],
  };

  const createResponse = await request.post('/api/apply/sessions', {
    data: {
      applyUrl: `${portalBaseUrl}/__fixtures__/apply/local-agent-repeated-education`,
      tailoredResume: repeatedResume,
      templateProfile: tailoringBody.templateProfile,
      validation: tailoringBody.validation,
      executorMode: 'local_agent',
    },
  });
  expect(createResponse.ok()).toBeTruthy();
  const createBody = await createResponse.json() as {
    session: { id: string };
    executorToken: string;
  };

  const contextResponse = await request.get(`/api/apply/sessions/${createBody.session.id}/context`, {
    headers: {
      Authorization: `Bearer ${createBody.executorToken}`,
    },
  });
  expect(contextResponse.ok()).toBeTruthy();
  const contextBody = await contextResponse.json() as {
    educationEntries: Array<{ institution: string }>;
  };
  expect(contextBody.educationEntries).toHaveLength(2);

  const agentStart = await request.post(`${localAgentBaseUrl}/sessions/start`, {
    data: {
      sessionId: createBody.session.id,
      applyUrl: `${portalBaseUrl}/__fixtures__/apply/local-agent-repeated-education`,
      apiBaseUrl: portalBaseUrl,
      executorToken: createBody.executorToken,
    },
  });
  expect(agentStart.ok()).toBeTruthy();

  const ready = await waitForSessionStatus(request, createBody.session.id, ['ready_to_submit'], 25_000);
  expect(ready.portalType).toBe('generic');

  const snapshot = await waitForLocalAgentSnapshot(request, localAgentBaseUrl, createBody.session.id, 10_000);
  expect(snapshot.fields.find((field) => field.name === 'education[1].institution')?.value || '').toContain('National Institute of Technology');
  expect(snapshot.fields.find((field) => field.name === 'education[1].degree')?.value || '').toContain('B.Tech');
  expect(snapshot.fields.find((field) => field.name === 'education[1].location')?.value || '').toContain('Surathkal');
});

test('local-agent expands and fills repeated project rows from session context', async ({ request, localAgentBaseUrl }) => {
  const resumeBuffer = await readFile(resumePath);
  const tailorResponse = await request.post('/api/tailor-resume', {
    multipart: {
      resume: {
        name: 'resume.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: resumeBuffer,
      },
      jdText: 'Frontend platform role requiring demonstrable shipped projects and portfolio evidence.',
      preferences: JSON.stringify({ targetRole: 'Frontend Platform Engineer' }),
    },
  });
  expect(tailorResponse.ok()).toBeTruthy();
  const tailoringBody = await tailorResponse.json() as {
    tailoredResume: {
      projects: Array<{
        id: string;
        name: string;
        description: string;
        bullets: Array<{ text: string; sourceProvenanceIds: string[] }>;
        sourceProvenanceIds: string[];
      }>;
    };
    templateProfile: unknown;
    validation: unknown;
  };

  const repeatedResume = {
    ...tailoringBody.tailoredResume,
    projects: [
      {
        id: 'project-0',
        name: 'Resume Tailor Pro',
        description: 'Built an AI-assisted workflow for job search, resume tailoring, and hybrid auto-apply orchestration.',
        bullets: [
          {
            text: 'Designed a full-stack workflow spanning search, tailoring, and apply automation with strong browser execution support.',
            sourceProvenanceIds: ['project-0-bullet-0'],
          },
        ],
        sourceProvenanceIds: ['project-0'],
      },
      {
        id: 'project-1',
        name: 'Candidate Tracking Dashboard',
        description: 'Built a recruiter-facing dashboard for job search ranking, application tracking, and candidate analytics.',
        bullets: [
          {
            text: 'Delivered a React and TypeScript dashboard that aggregated application health, ATS coverage, and recruiter review workflows.',
            sourceProvenanceIds: ['project-1-bullet-0'],
          },
        ],
        sourceProvenanceIds: ['project-1'],
      },
    ],
  };

  const createResponse = await request.post('/api/apply/sessions', {
    data: {
      applyUrl: `${portalBaseUrl}/__fixtures__/apply/local-agent-repeated-projects`,
      tailoredResume: repeatedResume,
      templateProfile: tailoringBody.templateProfile,
      validation: tailoringBody.validation,
      executorMode: 'local_agent',
    },
  });
  expect(createResponse.ok()).toBeTruthy();
  const createBody = await createResponse.json() as {
    session: { id: string };
    executorToken: string;
  };

  const contextResponse = await request.get(`/api/apply/sessions/${createBody.session.id}/context`, {
    headers: {
      Authorization: `Bearer ${createBody.executorToken}`,
    },
  });
  expect(contextResponse.ok()).toBeTruthy();
  const contextBody = await contextResponse.json() as {
    projectEntries: Array<{ name: string }>;
  };
  expect(contextBody.projectEntries).toHaveLength(2);

  const agentStart = await request.post(`${localAgentBaseUrl}/sessions/start`, {
    data: {
      sessionId: createBody.session.id,
      applyUrl: `${portalBaseUrl}/__fixtures__/apply/local-agent-repeated-projects`,
      apiBaseUrl: portalBaseUrl,
      executorToken: createBody.executorToken,
    },
  });
  expect(agentStart.ok()).toBeTruthy();

  const ready = await waitForSessionStatus(request, createBody.session.id, ['ready_to_submit'], 25_000);
  expect(ready.portalType).toBe('generic');

  const snapshot = await waitForLocalAgentSnapshot(request, localAgentBaseUrl, createBody.session.id, 10_000);
  expect(snapshot.fields.find((field) => field.name === 'projects[1].name')?.value || '').toContain('Candidate Tracking Dashboard');
  expect(snapshot.fields.find((field) => field.name === 'projects[1].description')?.value || '').toContain('candidate analytics');
});

test('local-agent expands and fills repeated certification rows from session context', async ({ request, localAgentBaseUrl }) => {
  const resumeBuffer = await readFile(resumePath);
  const tailorResponse = await request.post('/api/tailor-resume', {
    multipart: {
      resume: {
        name: 'resume.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: resumeBuffer,
      },
      jdText: 'Frontend leadership role preferring certifications and formal training evidence.',
      preferences: JSON.stringify({ targetRole: 'Frontend Engineering Lead' }),
    },
  });
  expect(tailorResponse.ok()).toBeTruthy();
  const tailoringBody = await tailorResponse.json() as {
    tailoredResume: {
      certifications: string[];
    };
    templateProfile: unknown;
    validation: unknown;
  };

  const repeatedResume = {
    ...tailoringBody.tailoredResume,
    certifications: [
      tailoringBody.tailoredResume.certifications[0] || 'AWS Certified Developer - Associate',
      'Google Professional Cloud Developer',
    ],
  };

  const createResponse = await request.post('/api/apply/sessions', {
    data: {
      applyUrl: `${portalBaseUrl}/__fixtures__/apply/local-agent-repeated-certifications`,
      tailoredResume: repeatedResume,
      templateProfile: tailoringBody.templateProfile,
      validation: tailoringBody.validation,
      executorMode: 'local_agent',
    },
  });
  expect(createResponse.ok()).toBeTruthy();
  const createBody = await createResponse.json() as {
    session: { id: string };
    executorToken: string;
  };

  const contextResponse = await request.get(`/api/apply/sessions/${createBody.session.id}/context`, {
    headers: {
      Authorization: `Bearer ${createBody.executorToken}`,
    },
  });
  expect(contextResponse.ok()).toBeTruthy();
  const contextBody = await contextResponse.json() as {
    certificationEntries: Array<{ name: string }>;
  };
  expect(contextBody.certificationEntries).toHaveLength(2);

  const agentStart = await request.post(`${localAgentBaseUrl}/sessions/start`, {
    data: {
      sessionId: createBody.session.id,
      applyUrl: `${portalBaseUrl}/__fixtures__/apply/local-agent-repeated-certifications`,
      apiBaseUrl: portalBaseUrl,
      executorToken: createBody.executorToken,
    },
  });
  expect(agentStart.ok()).toBeTruthy();

  const ready = await waitForSessionStatus(request, createBody.session.id, ['ready_to_submit'], 25_000);
  expect(ready.portalType).toBe('generic');

  const snapshot = await waitForLocalAgentSnapshot(request, localAgentBaseUrl, createBody.session.id, 10_000);
  expect(snapshot.fields.find((field) => field.name === 'certifications[1].name')?.value || '').toContain('Google Professional Cloud Developer');
});

test('local-agent resume restarts from the latest backend page URL after agent loss', async ({ page, request, localAgentBaseUrl }) => {
  await reachStepFive(page, '/__fixtures__/apply/local-agent-recovery');
  const session = await startHybridApply(page);
  expect(session.executorMode).toBe('local_agent');

  const review = await waitForSessionStatus(request, session.id, ['review_required'], 25_000);
  expect(review.latestPageUrl || '').toContain('step=2');

  const closeResponse = await request.post(`${localAgentBaseUrl}/sessions/${session.id}/close`);
  expect(closeResponse.ok()).toBeTruthy();

  await page.getByRole('button', { name: /Resume Agent/i }).click();
  const resumed = await waitForSessionStatus(request, session.id, ['review_required'], 25_000);
  expect(resumed.latestPageUrl || '').toContain('step=2');

  const snapshot = await waitForLocalAgentSnapshot(request, localAgentBaseUrl, session.id, 10_000);
  expect(snapshot.url).toContain('step=2');
  expect(snapshot.fields.find((field) => field.name === 'erpWorkflowQuestion')?.label || '').toContain('ERP workflow tool');
});

test('local-agent pauses cleanly on login-required gates', async ({ request, localAgentBaseUrl }) => {
  const session = await createLocalAgentSessionForPortal(request, localAgentBaseUrl, '/__fixtures__/apply/workday-login');
  const blocked = await waitForSessionStatus(request, session.session.id, ['manual_required'], 20_000);
  expect(blocked.latestPauseReason).toBe('login_required');
  expect(blocked.latestScreenshot).toBeTruthy();
  expect(blocked.portalType).toBe('workday');
});

test('local-agent pauses cleanly on protected portals', async ({ request, localAgentBaseUrl }) => {
  const session = await createLocalAgentSessionForPortal(request, localAgentBaseUrl, '/__fixtures__/apply/protected');
  const blocked = await waitForSessionStatus(request, session.session.id, ['protected'], 20_000);
  expect(blocked.latestPauseReason).toBe('protected_portal');
  expect(blocked.latestScreenshot).toBeTruthy();
});

test('local-agent pauses cleanly on legal self-id gates', async ({ request, localAgentBaseUrl }) => {
  const session = await createLocalAgentSessionForPortal(request, localAgentBaseUrl, '/__fixtures__/apply/legal-self-id');
  const blocked = await waitForSessionStatus(request, session.session.id, ['manual_required'], 20_000);
  expect(blocked.latestPauseReason).toBe('legal_review_required');
  expect(blocked.latestScreenshot).toBeTruthy();
});

test('local-agent pauses cleanly on assessment handoff gates', async ({ request, localAgentBaseUrl }) => {
  const session = await createLocalAgentSessionForPortal(request, localAgentBaseUrl, '/__fixtures__/apply/assessment');
  const blocked = await waitForSessionStatus(request, session.session.id, ['manual_required'], 20_000);
  expect(blocked.latestPauseReason).toBe('assessment_required');
  expect(blocked.latestScreenshot).toBeTruthy();
});
