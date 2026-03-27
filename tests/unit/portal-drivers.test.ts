import { describe, expect, it } from 'vitest';
import { getPortalDriver } from '../../local-agent/portal-drivers.ts';

describe('portal drivers', () => {
  it('infers semantic hints for linkedin easy-apply fields', () => {
    const driver = getPortalDriver('linkedin');

    expect(driver.inferSemanticHint({
      name: 'phoneNumber',
      label: 'Mobile phone number',
      placeholder: '',
      inputType: 'tel',
      widgetKind: 'text',
      required: true,
    })).toBe('phone');

    expect(driver.inferSemanticHint({
      name: 'city',
      label: 'City',
      placeholder: '',
      inputType: 'text',
      widgetKind: 'text',
      required: true,
    })).toBe('city');
  });

  it('flags linkedin compliance and compensation questions as review-only', () => {
    const driver = getPortalDriver('linkedin');

    expect(driver.getReviewOnlyReason({
      name: 'salaryExpectation',
      label: 'Expected Salary',
      placeholder: '',
      inputType: 'text',
      widgetKind: 'text',
      required: true,
    })).toContain('LinkedIn compensation');

    expect(driver.getReviewOnlyReason({
      name: 'genderIdentity',
      label: 'Gender Identity',
      placeholder: '',
      inputType: 'select-one',
      widgetKind: 'select',
      required: true,
    })).toContain('LinkedIn compliance');
  });

  it('infers semantic hints and review-only rules for naukri fields', () => {
    const driver = getPortalDriver('naukri');

    expect(driver.inferSemanticHint({
      name: 'currentCTC',
      label: 'Current CTC (LPA)',
      placeholder: '',
      inputType: 'number',
      widgetKind: 'number',
      required: true,
    })).toBe('current_ctc');

    expect(driver.inferSemanticHint({
      name: 'noticePeriod',
      label: 'Notice Period (Days)',
      placeholder: '',
      inputType: 'number',
      widgetKind: 'number',
      required: true,
    })).toBe('notice_period');

    expect(driver.getReviewOnlyReason({
      name: 'resumeHeadline',
      label: 'Resume Headline',
      placeholder: '',
      inputType: 'text',
      widgetKind: 'text',
      required: true,
    })).toContain('Naukri profile-marketing');
  });

  it('infers semantic hints for greenhouse fields', () => {
    const driver = getPortalDriver('greenhouse');

    expect(driver.inferSemanticHint({
      name: 'first_name',
      label: 'First Name',
      placeholder: '',
      inputType: 'text',
      widgetKind: 'text',
      required: true,
    })).toBe('first_name');

    expect(driver.inferSemanticHint({
      name: 'current_company',
      label: 'Current Company',
      placeholder: '',
      inputType: 'text',
      widgetKind: 'text',
      required: true,
    })).toBe('current_company');
  });

  it('flags greenhouse compliance questions as review-only', () => {
    const driver = getPortalDriver('greenhouse');

    expect(driver.getReviewOnlyReason({
      name: 'eeoc_race',
      label: 'Equal Employment Opportunity - Race',
      placeholder: '',
      inputType: 'select-one',
      widgetKind: 'select',
      required: true,
    })).toContain('Greenhouse compliance');
  });

  it('infers semantic hints for lever fields', () => {
    const driver = getPortalDriver('lever');

    expect(driver.inferSemanticHint({
      name: 'name',
      label: 'Full Name',
      placeholder: '',
      inputType: 'text',
      widgetKind: 'text',
      required: true,
    })).toBe('full_name');

    expect(driver.inferSemanticHint({
      name: 'urls[LinkedIn]',
      label: 'LinkedIn',
      placeholder: '',
      inputType: 'url',
      widgetKind: 'text',
      required: false,
    })).toBe('linkedin');
  });

  it('detects phenom fields and review-only work-history widgets', () => {
    const driver = getPortalDriver('phenom');

    expect(driver.inferSemanticHint({
      name: 'experienceYears',
      label: 'Total Experience (Years)',
      placeholder: '',
      inputType: 'number',
      widgetKind: 'number',
      required: true,
    })).toBe('years_of_experience');

    expect(driver.getReviewOnlyReason({
      name: 'employmentHistoryWidget',
      label: 'Employment History',
      placeholder: '',
      inputType: 'custom',
      widgetKind: 'custom_combobox',
      required: true,
    })).toContain('Phenom work-history');
  });

  it('flags workday compliance questions as review-only', () => {
    const driver = getPortalDriver('workday');

    expect(driver.getReviewOnlyReason({
      name: 'voluntarySelfIdentification',
      label: 'Voluntary Self-Identification of Disability',
      placeholder: '',
      inputType: 'select-one',
      widgetKind: 'select',
      required: true,
    })).toContain('Workday compliance');
  });

  it('supports ashby semantic hints and compliance review rules', () => {
    const driver = getPortalDriver('ashby');

    expect(driver.inferSemanticHint({
      name: 'linkedinUrl',
      label: 'LinkedIn',
      placeholder: '',
      inputType: 'url',
      widgetKind: 'text',
      required: false,
    })).toBe('linkedin');

    expect(driver.getReviewOnlyReason({
      name: 'eeoSurvey',
      label: 'Equal Employment Opportunity',
      placeholder: '',
      inputType: 'select-one',
      widgetKind: 'select',
      required: true,
    })).toContain('Ashby compliance');
  });

  it('supports iCIMS semantic hints and compliance review rules', () => {
    const driver = getPortalDriver('icims');

    expect(driver.inferSemanticHint({
      name: 'workAuthorization',
      label: 'Work Authorization',
      placeholder: '',
      inputType: 'text',
      widgetKind: 'text',
      required: true,
    })).toBe('work_authorization');

    expect(driver.getReviewOnlyReason({
      name: 'selfIdentification',
      label: 'Self-Identification of Disability',
      placeholder: '',
      inputType: 'select-one',
      widgetKind: 'select',
      required: true,
    })).toContain('iCIMS compliance');
  });

  it('supports SmartRecruiters semantic hints and compliance review rules', () => {
    const driver = getPortalDriver('smartrecruiters');

    expect(driver.inferSemanticHint({
      name: 'portfolioLink',
      label: 'Portfolio',
      placeholder: '',
      inputType: 'url',
      widgetKind: 'text',
      required: false,
    })).toBe('portfolio');

    expect(driver.getReviewOnlyReason({
      name: 'eeoQuestion',
      label: 'EEO Survey',
      placeholder: '',
      inputType: 'select-one',
      widgetKind: 'select',
      required: true,
    })).toContain('SmartRecruiters compliance');
  });

  it('supports Taleo semantic hints and compliance review rules', () => {
    const driver = getPortalDriver('taleo');

    expect(driver.inferSemanticHint({
      name: 'visaStatus',
      label: 'Visa Sponsorship Required',
      placeholder: '',
      inputType: 'text',
      widgetKind: 'text',
      required: true,
    })).toBe('requires_sponsorship');

    expect(driver.getReviewOnlyReason({
      name: 'veteranStatus',
      label: 'Veteran Status',
      placeholder: '',
      inputType: 'select-one',
      widgetKind: 'select',
      required: true,
    })).toContain('Taleo compliance');
  });

  it('supports SuccessFactors semantic hints and compliance review rules', () => {
    const driver = getPortalDriver('successfactors');

    expect(driver.inferSemanticHint({
      name: 'currentEmployer',
      label: 'Current Company',
      placeholder: '',
      inputType: 'text',
      widgetKind: 'text',
      required: true,
    })).toBe('current_company');

    expect(driver.getReviewOnlyReason({
      name: 'genderIdentity',
      label: 'Gender Identity',
      placeholder: '',
      inputType: 'select-one',
      widgetKind: 'select',
      required: true,
    })).toContain('SuccessFactors compliance');
  });
});
