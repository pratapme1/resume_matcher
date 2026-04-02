/**
 * Proof-of-fix tests for form filling improvements.
 * Each test documents a SPECIFIC real-world failure that existed before and is now fixed.
 * Run with: npx vitest run tests/unit/form-filling-proof.test.ts
 */

import { describe, it, expect } from 'vitest';
import { planApplySnapshot, applySessions } from '../../server/apply-sessions.ts';

// ─── helpers ────────────────────────────────────────────────────────────────

const SESSION_ID = 'proof-test-session';
const SESSION_TOKEN = 'proof-tok';

function makeSession(profileOverrides: Record<string, string> = {}) {
  return {
    id: SESSION_ID,
    executorToken: SESSION_TOKEN,
    portalType: 'generic' as const,
    executorMode: 'extension' as const,
    applicantProfile: {
      firstName: 'Vishnu',
      lastName: 'Pratap',
      fullName: 'Vishnu Pratap',
      email: 'vishnu@test.com',
      phone: '9999999999',
      yearsOfExperience: '7',
      noticePeriodDays: '30',
      requiresSponsorship: 'no',
      workAuthorization: 'US Citizen',
      currentCtcLpa: '24 LPA',
      expectedCtcLpa: '35 LPA',
      ...profileOverrides,
    },
    answerBank: [],
    resumeAsset: { filename: 'resume.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', base64: 'ZmFrZQ==' },
    status: 'filling' as const,
    stepHistory: [],
    traceLog: [],
    trace: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as any;
}

function selectField(label: string, options: string[], semanticHint?: string) {
  return {
    id: `field-${label.replace(/\s+/g, '-').toLowerCase()}`,
    label,
    name: label.toLowerCase().replace(/\s+/g, '_'),
    placeholder: '',
    inputType: 'select-one',
    tagName: 'select',
    widgetKind: 'select' as const,
    required: true,
    visible: true,
    hasValue: false,
    value: '',
    semanticHint: semanticHint ?? '',
    options: options.map((o) => ({ label: o, value: o })),
  };
}

function radioField(label: string, options: string[], semanticHint?: string) {
  return {
    id: `field-${label.replace(/\s+/g, '-').toLowerCase()}`,
    label,
    name: label.toLowerCase().replace(/\s+/g, '_'),
    placeholder: '',
    inputType: 'radio',
    tagName: 'input',
    widgetKind: 'radio_group' as const,
    required: true,
    visible: true,
    hasValue: false,
    value: '',
    semanticHint: semanticHint ?? '',
    options: options.map((o) => ({ label: o, value: o })),
  };
}

function snapshot(fields: any[]) {
  return {
    url: 'https://jobs.example.com/apply',
    portalType: 'generic' as const,
    stepKind: 'questionnaire' as const,
    stepSignature: 'sig-1',
    fields,
    controls: [],
  };
}

/** Seed a session into the store and run planApplySnapshot. */
function runPlan(fields: any[], sess: any) {
  applySessions.set(SESSION_ID, sess);
  return planApplySnapshot(SESSION_ID, SESSION_TOKEN, snapshot(fields));
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('FIX 2A — range-based option matching', () => {
  it('BEFORE: "7" years could fail to match "5-8 yrs" with substring-only logic', () => {
    // Old logic: candidate.includes(option) || option.includes(candidate)
    // "7" is a substring of "5-8 yrs"? No → would have returned undefined → review item
    // This test proves the NEW logic handles it:
    const field = selectField('Total Experience', ['0-1 yrs', '1-3 yrs', '3-5 yrs', '5-8 yrs', '8-10 yrs', '10+ yrs'], 'years_of_experience');
    const plan = runPlan([field], makeSession({ yearsOfExperience: '7' }));

    expect(plan.reviewItems).toHaveLength(0);
    expect(plan.actions[0]?.value).toBe('5-8 yrs');
  });

  it('"5 years" matches "5-8 years" via range overlap', () => {
    const field = selectField('Years of Experience', ['0-2 years', '2-5 years', '5-8 years', '8-12 years', '12+ years'], 'years_of_experience');
    const plan = runPlan([field], makeSession({ yearsOfExperience: '5' }));

    expect(plan.reviewItems).toHaveLength(0);
    expect(plan.actions[0]?.value).toBe('5-8 years');
  });

  it('"3 years experience" matches "3-5 yrs"', () => {
    const field = selectField('Experience Level', ['0-2 yrs', '3-5 yrs', '6-9 yrs', '10+ yrs'], 'years_of_experience');
    const plan = runPlan([field], makeSession({ yearsOfExperience: '3' }));

    expect(plan.reviewItems).toHaveLength(0);
    expect(plan.actions[0]?.value).toBe('3-5 yrs');
  });

  it('"12" years matches "10+ years"', () => {
    const field = selectField('Total Experience', ['0-2 years', '3-5 years', '5-8 years', '8-10 years', '10+ years'], 'years_of_experience');
    const plan = runPlan([field], makeSession({ yearsOfExperience: '12' }));

    expect(plan.reviewItems).toHaveLength(0);
    expect(plan.actions[0]?.value).toBe('10+ years');
  });
});

describe('FIX 2C — notice period normalization', () => {
  it('"30" days matches "1 month" dropdown option', () => {
    const field = selectField('Notice Period', ['Immediate', '15 Days', '1 month', '2 months', '3 months'], 'notice_period');
    const plan = runPlan([field], makeSession({ noticePeriodDays: '30' }));

    expect(plan.reviewItems).toHaveLength(0);
    expect(plan.actions[0]?.value).toBe('1 month');
  });

  it('"0" days matches "Immediate"', () => {
    const field = selectField('Availability', ['Immediate', '15 days', '30 days', '60 days', '90 days'], 'notice_period');
    const plan = runPlan([field], makeSession({ noticePeriodDays: '0' }));

    expect(plan.reviewItems).toHaveLength(0);
    expect(plan.actions[0]?.value).toBe('Immediate');
  });

  it('"60" days matches "2 months"', () => {
    const field = selectField('Notice Period', ['Immediate', '1 month', '2 months', '3 months'], 'notice_period');
    const plan = runPlan([field], makeSession({ noticePeriodDays: '60' }));

    expect(plan.reviewItems).toHaveLength(0);
    expect(plan.actions[0]?.value).toBe('2 months');
  });
});

describe('FIX 2C — sponsorship and work auth normalization', () => {
  it('"no" sponsorship matches "No" radio option', () => {
    const field = radioField('Do you require visa sponsorship?', ['Yes', 'No'], 'requires_sponsorship');
    const plan = runPlan([field], makeSession({ requiresSponsorship: 'no' }));

    expect(plan.reviewItems).toHaveLength(0);
    expect(plan.actions[0]?.value).toBe('No');
  });

  it('"US Citizen" work auth maps to "Yes" on authorized-to-work radio', () => {
    const field = radioField('Are you authorized to work in the US?', ['Yes', 'No'], 'work_authorization');
    const plan = runPlan([field], makeSession({ workAuthorization: 'US Citizen' }));

    expect(plan.reviewItems).toHaveLength(0);
    expect(plan.actions[0]?.value).toBe('Yes');
  });
});

describe('FIX 2C — CTC normalization', () => {
  it('"24 LPA" stripped to "24" for numeric CTC field', () => {
    const field = selectField('Current CTC (in LPA)', ['10', '12', '15', '18', '20', '24', '30', '35'], 'current_ctc');
    const plan = runPlan([field], makeSession({ currentCtcLpa: '24 LPA' }));

    expect(plan.reviewItems).toHaveLength(0);
    expect(plan.actions[0]?.value).toBe('24');
  });
});

describe('FIX 2B — answer bank consulted for select/radio', () => {
  it('answer bank value used directly for select field when profile value would miss', () => {
    const field = selectField('What is your notice period?', ['Immediate joiner', 'Within 2 weeks', 'Within a month', 'More than a month'], 'notice_period');

    // Profile has raw "30" which alone might not match "Within a month"
    // But the answer bank has the exact string from a previous application
    const sess = makeSession({ noticePeriodDays: '30' });
    sess.answerBank = [
      {
        normalizedQuestion: 'what is your notice period',
        answer: 'Within a month',
        semanticType: 'notice_period',
        portalType: 'any',
        confidence: 'confirmed',
      },
    ];

    const plan = runPlan([field], sess);

    expect(plan.reviewItems).toHaveLength(0);
    expect(plan.actions[0]?.value).toBe('Within a month');
  });
});

describe('Regression — existing passing cases still work', () => {
  it('exact match still works (email, name etc)', () => {
    const field = {
      id: 'field-email',
      label: 'Email',
      name: 'email',
      placeholder: '',
      inputType: 'text',
      tagName: 'input',
      widgetKind: 'text' as const,
      required: true,
      visible: true,
      hasValue: false,
      value: '',
      semanticHint: 'email',
      options: [],
    };
    const plan = runPlan([field], makeSession());

    expect(plan.reviewItems).toHaveLength(0);
    expect(plan.actions[0]?.type).toBe('fill');
    expect(plan.actions[0]?.value).toBe('vishnu@test.com');
  });

  it('select with exact matching option still resolves correctly', () => {
    const field = selectField('Years of Experience', ['Less than 1 year', '1-2 years', '3-5 years', '5-10 years', '10+ years'], 'years_of_experience');
    const plan = runPlan([field], makeSession({ yearsOfExperience: '7' }));

    // 7 falls in the "5-10 years" range
    expect(plan.reviewItems).toHaveLength(0);
    expect(plan.actions[0]?.value).toBe('5-10 years');
  });
});
