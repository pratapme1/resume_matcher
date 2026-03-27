import type { FieldSemanticType, PortalType, StepKind, WidgetKind } from '../src/shared/types.ts';

export type ControlKind = 'next' | 'review' | 'submit' | 'unknown';

type ControlDescriptor = {
  label: string;
  id?: string;
  name?: string;
  type?: string;
  dataQa?: string;
};

type StepContext = {
  url: string;
  title: string;
  bodyText: string;
};

type PortalDriver = {
  portalType: PortalType;
  detectStepKind: (context: StepContext) => StepKind;
  classifyControl: (control: ControlDescriptor) => ControlKind;
  isSubmissionSuccess: (context: StepContext) => boolean;
  inferSemanticHint: (field: FieldDescriptor) => FieldSemanticType | undefined;
  getReviewOnlyReason: (field: FieldDescriptor) => string | undefined;
};

export type FieldDescriptor = {
  name: string;
  label: string;
  placeholder: string;
  inputType: string;
  widgetKind: WidgetKind;
  required: boolean;
};

function detectGenericStepKind(context: StepContext): StepKind {
  const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
  if (/education/.test(combined)) return 'education';
  if (/review your application|review and submit|submit your application|application submitted|application received|submitted successfully|thank you for applying/.test(combined)) return 'review';
  if (/work experience|employment history|career history/.test(combined)) return 'work_history';
  if (/questionnaire|eligibility|work authorization|screening questions/.test(combined)) return 'questionnaire';
  if (/profile|personal information|contact information|application form/.test(combined)) return 'profile';
  return 'unknown';
}

function classifyGenericControl(control: ControlDescriptor): ControlKind {
  const text = `${control.label} ${control.id ?? ''} ${control.name ?? ''} ${control.dataQa ?? ''} ${control.type ?? ''}`.toLowerCase();
  if (/submit|apply now|send application/.test(text)) return 'submit';
  if (/review/.test(text)) return 'review';
  if (/next|continue|save and continue|continue application/.test(text)) return 'next';
  return 'unknown';
}

const genericDriver: PortalDriver = {
  portalType: 'generic',
  detectStepKind: detectGenericStepKind,
  classifyControl: classifyGenericControl,
  isSubmissionSuccess(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    return /thank you for applying|application submitted|application received|submitted successfully|your application has been submitted|we have received your application/.test(combined);
  },
  inferSemanticHint() {
    return undefined;
  },
  getReviewOnlyReason(field) {
    const combined = `${field.name} ${field.label} ${field.placeholder}`.toLowerCase();
    if (/self[- ]?identify|eeo|equal employment|race|ethnicity|veteran|disability|gender identity|pronouns/.test(combined)) {
      return 'Legal or self-identification questions require manual review.';
    }
    return undefined;
  },
};

const linkedinDriver: PortalDriver = {
  portalType: 'linkedin',
  detectStepKind(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    if (/application submitted|your application was sent|job application submitted|application viewed/.test(combined)) return 'review';
    if (/resume|contact info|email address|mobile phone number|easy apply/.test(combined)) return 'profile';
    if (/work experience|experience|current company|title/.test(combined)) return 'work_history';
    if (/screening questions|additional questions|work authorization|sponsorship/.test(combined)) return 'questionnaire';
    if (/review your application|submit application/.test(combined)) return 'review';
    return detectGenericStepKind(context);
  },
  classifyControl(control) {
    const text = `${control.label} ${control.id ?? ''} ${control.name ?? ''} ${control.dataQa ?? ''} ${control.type ?? ''}`.toLowerCase();
    if (/submit application|send application|apply|easy apply submit/.test(text)) return 'submit';
    if (/review/.test(text)) return 'review';
    if (/next|continue|review your application/.test(text)) return 'next';
    return classifyGenericControl(control);
  },
  isSubmissionSuccess(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    return /application submitted|your application was sent|job application submitted|application viewed/.test(combined);
  },
  inferSemanticHint(field) {
    const name = field.name.toLowerCase();
    const combined = `${field.name} ${field.label} ${field.placeholder}`.toLowerCase();
    if (name === 'firstName'.toLowerCase() || /first name/.test(combined)) return 'first_name';
    if (name === 'lastName'.toLowerCase() || /last name/.test(combined)) return 'last_name';
    if (name === 'emailaddress'.toLowerCase() || /email/.test(combined)) return 'email';
    if (name === 'phonenumber'.toLowerCase() || /phone|mobile/.test(combined)) return 'phone';
    if (/city|location/.test(combined)) return 'city';
    if (/linkedin/.test(combined)) return 'linkedin';
    if (/website/.test(combined)) return 'website';
    if (/github/.test(combined)) return 'github';
    if (/portfolio/.test(combined)) return 'portfolio';
    if (/current company/.test(combined)) return 'current_company';
    if (/current title|job title/.test(combined)) return 'current_title';
    if (/years of experience|experience/.test(combined) && field.inputType === 'number') return 'years_of_experience';
    if (/work authorization/.test(combined)) return 'work_authorization';
    if (/sponsorship|visa/.test(combined)) return 'requires_sponsorship';
    return undefined;
  },
  getReviewOnlyReason(field) {
    const combined = `${field.name} ${field.label} ${field.placeholder}`.toLowerCase();
    if (/salary|compensation|notice period|expected salary/.test(combined)) {
      return 'LinkedIn compensation questions require manual review unless explicitly saved.';
    }
    if (/self[- ]?identify|gender identity|ethnicity|race|veteran|disability/.test(combined)) {
      return 'LinkedIn compliance questions require manual review.';
    }
    return genericDriver.getReviewOnlyReason(field);
  },
};

const naukriDriver: PortalDriver = {
  portalType: 'naukri',
  detectStepKind(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    if (/application submitted|successfully applied|you have applied|application sent/.test(combined)) return 'review';
    if (/profile details|personal details|contact details|resume headline/.test(combined)) return 'profile';
    if (/employment details|experience details|total experience|current ctc|expected ctc|notice period/.test(combined)) return 'work_history';
    if (/screening questions|questionnaire|preferences|work authorization/.test(combined)) return 'questionnaire';
    if (/review application|submit application/.test(combined)) return 'review';
    return detectGenericStepKind(context);
  },
  classifyControl(control) {
    const text = `${control.label} ${control.id ?? ''} ${control.name ?? ''} ${control.dataQa ?? ''} ${control.type ?? ''}`.toLowerCase();
    if (/submit application|apply now|send application|confirm apply/.test(text)) return 'submit';
    if (/review/.test(text)) return 'review';
    if (/continue|next|save and continue|proceed/.test(text)) return 'next';
    return classifyGenericControl(control);
  },
  isSubmissionSuccess(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    return /application submitted|successfully applied|you have applied|application sent/.test(combined);
  },
  inferSemanticHint(field) {
    const name = field.name.toLowerCase();
    const combined = `${field.name} ${field.label} ${field.placeholder}`.toLowerCase();
    if (/full name/.test(combined) || name === 'fullname') return 'full_name';
    if (/first name/.test(combined) || name === 'firstname') return 'first_name';
    if (/last name/.test(combined) || name === 'lastname') return 'last_name';
    if (/email/.test(combined)) return 'email';
    if (/phone|mobile/.test(combined)) return 'phone';
    if (/location|city|current location/.test(combined)) return 'location';
    if (/linkedin/.test(combined)) return 'linkedin';
    if (/github/.test(combined)) return 'github';
    if (/portfolio|website/.test(combined)) return /website/.test(combined) ? 'website' : 'portfolio';
    if (/current company|current employer|company name/.test(combined)) return 'current_company';
    if (/current title|designation|job title/.test(combined)) return 'current_title';
    if (/total experience|years of experience/.test(combined)) return 'years_of_experience';
    if (/current ctc|current salary|current compensation/.test(combined)) return 'current_ctc';
    if (/expected ctc|expected salary|expected compensation/.test(combined)) return 'expected_ctc';
    if (/notice period|notice days|availability/.test(combined)) return 'notice_period';
    if (/work authorization/.test(combined)) return 'work_authorization';
    if (/visa|sponsorship/.test(combined)) return 'requires_sponsorship';
    return undefined;
  },
  getReviewOnlyReason(field) {
    const combined = `${field.name} ${field.label} ${field.placeholder}`.toLowerCase();
    if (/resume headline|profile summary|key skills/.test(combined)) {
      return 'Naukri profile-marketing fields require manual review for now.';
    }
    if (/salary negotiation|current ctc breakup|expected ctc breakup/.test(combined)) {
      return 'Detailed Naukri compensation questions require manual review.';
    }
    if (/self[- ]?identify|gender identity|ethnicity|race|veteran|disability/.test(combined)) {
      return 'Naukri compliance questions require manual review.';
    }
    return genericDriver.getReviewOnlyReason(field);
  },
};

const ashbyDriver: PortalDriver = {
  portalType: 'ashby',
  detectStepKind(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    if (/application submitted|thank you for applying|thanks for applying/.test(combined)) return 'review';
    if (/additional questions|questionnaire|equal employment opportunity/.test(combined)) return 'questionnaire';
    if (/resume|linkedin|contact information|personal information/.test(combined)) return 'profile';
    return detectGenericStepKind(context);
  },
  classifyControl(control) {
    const text = `${control.label} ${control.id ?? ''} ${control.name ?? ''} ${control.dataQa ?? ''} ${control.type ?? ''}`.toLowerCase();
    if (/submit application|apply now|send application|type=submit/.test(text)) return 'submit';
    if (/review/.test(text)) return 'review';
    if (/continue|next|save and continue/.test(text)) return 'next';
    return classifyGenericControl(control);
  },
  isSubmissionSuccess(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    return /application submitted|thank you for applying|application received/.test(combined);
  },
  inferSemanticHint(field) {
    const name = field.name.toLowerCase();
    const combined = `${field.name} ${field.label} ${field.placeholder}`.toLowerCase();
    if (name === 'firstname' || /first name/.test(combined)) return 'first_name';
    if (name === 'lastname' || /last name/.test(combined)) return 'last_name';
    if (/email/.test(combined)) return 'email';
    if (/phone|mobile/.test(combined)) return 'phone';
    if (/location|city/.test(combined)) return 'location';
    if (/linkedin/.test(combined)) return 'linkedin';
    if (/github/.test(combined)) return 'github';
    if (/portfolio/.test(combined)) return 'portfolio';
    if (/website/.test(combined)) return 'website';
    if (/current company/.test(combined)) return 'current_company';
    if (/current title|job title/.test(combined)) return 'current_title';
    if (/years of experience|experience/.test(combined) && field.inputType === 'number') return 'years_of_experience';
    return undefined;
  },
  getReviewOnlyReason(field) {
    const combined = `${field.name} ${field.label} ${field.placeholder}`.toLowerCase();
    if (/equal employment opportunity|eeo|self[- ]?identify|race|ethnicity|veteran|disability|gender identity/.test(combined)) {
      return 'Ashby compliance questions require manual review.';
    }
    return genericDriver.getReviewOnlyReason(field);
  },
};

const greenhouseDriver: PortalDriver = {
  portalType: 'greenhouse',
  detectStepKind(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    if (/application submitted|thank you for applying/.test(combined)) return 'review';
    if (/questions|additional information|school|education/.test(combined)) return 'questionnaire';
    if (/application form|apply for this job|resume\/cv|cover letter|contact/.test(combined)) return 'profile';
    return detectGenericStepKind(context);
  },
  classifyControl(control) {
    const text = `${control.label} ${control.id ?? ''} ${control.name ?? ''} ${control.dataQa ?? ''} ${control.type ?? ''}`.toLowerCase();
    if (/submit_app|submit application|apply now|type=submit/.test(text)) return 'submit';
    if (/review/.test(text)) return 'review';
    return classifyGenericControl(control);
  },
  isSubmissionSuccess(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    return /application submitted|thank you for applying|your application has been submitted|application confirmation/.test(combined);
  },
  inferSemanticHint(field) {
    const name = field.name.toLowerCase();
    if (name === 'first_name') return 'first_name';
    if (name === 'last_name') return 'last_name';
    if (name === 'email') return 'email';
    if (name === 'phone') return 'phone';
    if (name === 'location') return 'location';
    if (name === 'current_company') return 'current_company';
    if (name.includes('linkedin')) return 'linkedin';
    if (name.includes('github')) return 'github';
    if (name.includes('portfolio')) return 'portfolio';
    if (name.includes('website')) return 'website';
    return undefined;
  },
  getReviewOnlyReason(field) {
    const combined = `${field.name} ${field.label} ${field.placeholder}`.toLowerCase();
    if (/eeoc|equal employment opportunity|self[- ]?identify|race|ethnicity|veteran|disability|gender identity/.test(combined)) {
      return 'Greenhouse compliance questions require manual review.';
    }
    return genericDriver.getReviewOnlyReason(field);
  },
};

const leverDriver: PortalDriver = {
  portalType: 'lever',
  detectStepKind(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    if (/application submitted|thanks for applying|thank you for applying/.test(combined)) return 'review';
    if (/additional information|questionnaire|equal employment opportunity/.test(combined)) return 'questionnaire';
    if (/apply to|resume\/cv|full name|email|phone/.test(combined)) return 'profile';
    return detectGenericStepKind(context);
  },
  classifyControl(control) {
    const text = `${control.label} ${control.id ?? ''} ${control.name ?? ''} ${control.dataQa ?? ''} ${control.type ?? ''}`.toLowerCase();
    if (/btn-submit-application|submit application|apply for this job|type=submit/.test(text)) return 'submit';
    if (/review/.test(text)) return 'review';
    return classifyGenericControl(control);
  },
  isSubmissionSuccess(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    return /thanks for applying|thank you for applying|application submitted|application received/.test(combined);
  },
  inferSemanticHint(field) {
    const name = field.name.toLowerCase();
    if (name === 'name') return 'full_name';
    if (name === 'email') return 'email';
    if (name === 'phone') return 'phone';
    if (name === 'org' || name === 'company') return 'current_company';
    if (name.includes('linkedin')) return 'linkedin';
    if (name.includes('github')) return 'github';
    if (name.includes('portfolio')) return 'portfolio';
    if (name.includes('experienceyears')) return 'years_of_experience';
    return undefined;
  },
  getReviewOnlyReason(field) {
    const combined = `${field.name} ${field.label} ${field.placeholder}`.toLowerCase();
    if (/equal employment opportunity|eeo|self[- ]?identify|race|ethnicity|veteran|disability|gender identity/.test(combined)) {
      return 'Lever compliance questions require manual review.';
    }
    return genericDriver.getReviewOnlyReason(field);
  },
};

const phenomDriver: PortalDriver = {
  portalType: 'phenom',
  detectStepKind(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    if (/review-submit|review and submit|submit application|application submitted|thank you for applying/.test(combined)) return 'review';
    if (/stepname=.*work|work and education|work history|work experience|employment history/.test(combined)) return 'work_history';
    if (/stepname=.*education|education/.test(combined)) return 'education';
    if (/stepname=.*question|questionnaire|screening questions|additional information/.test(combined)) return 'questionnaire';
    if (/stepname=.*profile|candidate profile|contact information|personal information/.test(combined)) return 'profile';
    return detectGenericStepKind(context);
  },
  classifyControl(control) {
    const text = `${control.label} ${control.id ?? ''} ${control.name ?? ''} ${control.dataQa ?? ''} ${control.type ?? ''}`.toLowerCase();
    if (/submit application|apply now|send application|type=submit/.test(text)) return 'submit';
    if (/review/.test(text)) return 'review';
    if (/save and continue|continue application|next/.test(text)) return 'next';
    return classifyGenericControl(control);
  },
  isSubmissionSuccess(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    return /application submitted|thank you for applying|application confirmation|we have received your application/.test(combined);
  },
  inferSemanticHint(field) {
    const name = field.name.toLowerCase();
    if (name === 'full_name') return 'full_name';
    if (name === 'email') return 'email';
    if (name === 'phone') return 'phone';
    if (name === 'location' || name === 'currentlocation') return 'location';
    if (name === 'experienceyears' || name === 'experience') return 'years_of_experience';
    if (name === 'currentcompany') return 'current_company';
    if (name === 'currenttitle') return 'current_title';
    if (name.includes('linkedin')) return 'linkedin';
    if (name.includes('github')) return 'github';
    if (name.includes('portfolio')) return 'portfolio';
    return undefined;
  },
  getReviewOnlyReason(field) {
    const combined = `${field.name} ${field.label} ${field.placeholder}`.toLowerCase();
    if (/self[- ]?identify|eeo|equal employment|race|ethnicity|veteran|disability|gender identity/.test(combined)) {
      return 'Phenom compliance questions require manual review.';
    }
    if (field.widgetKind.startsWith('custom_') && /employment history|education history|previous employer|school/.test(combined)) {
      return 'Phenom work-history and education widgets require manual review.';
    }
    return genericDriver.getReviewOnlyReason(field);
  },
};

const workdayDriver: PortalDriver = {
  portalType: 'workday',
  detectStepKind(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    if (/workandeducation|employment history|experience profile/.test(combined)) return 'work_history';
    if (/my information|contact information|personal information/.test(combined)) return 'profile';
    if (/questionnaire|work authorization|voluntary self-identification/.test(combined)) return 'questionnaire';
    if (/review and submit|review/.test(combined)) return 'review';
    return detectGenericStepKind(context);
  },
  classifyControl(control) {
    const text = `${control.label} ${control.id ?? ''} ${control.name ?? ''} ${control.dataQa ?? ''}`.toLowerCase();
    if (/submit/.test(text)) return 'submit';
    if (/review/.test(text)) return 'review';
    if (/continue|next|save and continue/.test(text)) return 'next';
    return 'unknown';
  },
  isSubmissionSuccess(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    return /thank you for applying|application submitted|submission complete/.test(combined);
  },
  inferSemanticHint(field) {
    const name = field.name.toLowerCase();
    if (name === 'legalfirstname') return 'first_name';
    if (name === 'legallastname') return 'last_name';
    if (name === 'email') return 'email';
    if (name === 'phonenumber') return 'phone';
    if (name === 'location') return 'location';
    if (name === 'currenttitle') return 'current_title';
    if (name === 'currentcompany') return 'current_company';
    if (name === 'yearsexperience') return 'years_of_experience';
    return undefined;
  },
  getReviewOnlyReason(field) {
    const combined = `${field.name} ${field.label} ${field.placeholder}`.toLowerCase();
    if (/voluntary self-identification|self[- ]?identify|gender identity|ethnicity|race|veteran|disability/.test(combined)) {
      return 'Workday compliance questions require manual review.';
    }
    return genericDriver.getReviewOnlyReason(field);
  },
};

const icimsDriver: PortalDriver = {
  portalType: 'icims',
  detectStepKind(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    if (/application submitted|thank you for applying|application confirmation/.test(combined)) return 'review';
    if (/screening questions|prescreening|eligibility|additional information/.test(combined)) return 'questionnaire';
    if (/work experience|employment|career history/.test(combined)) return 'work_history';
    if (/contact information|personal information|candidate profile|upload resume/.test(combined)) return 'profile';
    return detectGenericStepKind(context);
  },
  classifyControl(control) {
    const text = `${control.label} ${control.id ?? ''} ${control.name ?? ''} ${control.dataQa ?? ''} ${control.type ?? ''}`.toLowerCase();
    if (/submit application|apply now|finish application|complete application/.test(text)) return 'submit';
    if (/review/.test(text)) return 'review';
    if (/continue|next|save and continue/.test(text)) return 'next';
    return classifyGenericControl(control);
  },
  isSubmissionSuccess(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    return /application submitted|thank you for applying|application confirmation|application received/.test(combined);
  },
  inferSemanticHint(field) {
    const name = field.name.toLowerCase();
    const combined = `${field.name} ${field.label} ${field.placeholder}`.toLowerCase();
    if (/first name/.test(combined) || name === 'firstname') return 'first_name';
    if (/last name/.test(combined) || name === 'lastname') return 'last_name';
    if (/email/.test(combined)) return 'email';
    if (/phone|mobile/.test(combined)) return 'phone';
    if (/location|city/.test(combined)) return 'location';
    if (/current company|employer/.test(combined)) return 'current_company';
    if (/current title|job title/.test(combined)) return 'current_title';
    if (/years of experience|experience/.test(combined) && /number|text/.test(field.inputType || '')) return 'years_of_experience';
    if (/work authorization/.test(combined)) return 'work_authorization';
    if (/sponsorship|visa/.test(combined)) return 'requires_sponsorship';
    if (/linkedin/.test(combined)) return 'linkedin';
    return undefined;
  },
  getReviewOnlyReason(field) {
    const combined = `${field.name} ${field.label} ${field.placeholder}`.toLowerCase();
    if (/self[- ]?identify|equal employment|eeo|race|ethnicity|veteran|disability|gender identity/.test(combined)) {
      return 'iCIMS compliance questions require manual review.';
    }
    return genericDriver.getReviewOnlyReason(field);
  },
};

const smartRecruitersDriver: PortalDriver = {
  portalType: 'smartrecruiters',
  detectStepKind(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    if (/application submitted|thank you for applying|application complete/.test(combined)) return 'review';
    if (/additional questions|screening questions|privacy policy|consent/.test(combined)) return 'questionnaire';
    if (/resume|cover letter|contact information|basic information/.test(combined)) return 'profile';
    return detectGenericStepKind(context);
  },
  classifyControl(control) {
    const text = `${control.label} ${control.id ?? ''} ${control.name ?? ''} ${control.dataQa ?? ''} ${control.type ?? ''}`.toLowerCase();
    if (/submit application|apply now|send application|type=submit/.test(text)) return 'submit';
    if (/review/.test(text)) return 'review';
    if (/continue|next|save and continue/.test(text)) return 'next';
    return classifyGenericControl(control);
  },
  isSubmissionSuccess(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    return /application submitted|thank you for applying|application complete|application received/.test(combined);
  },
  inferSemanticHint(field) {
    const combined = `${field.name} ${field.label} ${field.placeholder}`.toLowerCase();
    if (/first name/.test(combined)) return 'first_name';
    if (/last name/.test(combined)) return 'last_name';
    if (/email/.test(combined)) return 'email';
    if (/phone|mobile/.test(combined)) return 'phone';
    if (/location|city/.test(combined)) return 'location';
    if (/linkedin/.test(combined)) return 'linkedin';
    if (/github/.test(combined)) return 'github';
    if (/portfolio/.test(combined)) return 'portfolio';
    if (/website/.test(combined)) return 'website';
    if (/current company/.test(combined)) return 'current_company';
    if (/current title|job title/.test(combined)) return 'current_title';
    if (/work authorization/.test(combined)) return 'work_authorization';
    if (/sponsorship|visa/.test(combined)) return 'requires_sponsorship';
    return undefined;
  },
  getReviewOnlyReason(field) {
    const combined = `${field.name} ${field.label} ${field.placeholder}`.toLowerCase();
    if (/self[- ]?identify|equal employment|eeo|race|ethnicity|veteran|disability|gender identity/.test(combined)) {
      return 'SmartRecruiters compliance questions require manual review.';
    }
    return genericDriver.getReviewOnlyReason(field);
  },
};

const taleoDriver: PortalDriver = {
  portalType: 'taleo',
  detectStepKind(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    if (/application submitted|thank you for applying|submission complete/.test(combined)) return 'review';
    if (/pre-screening|questionnaire|additional information|eligibility/.test(combined)) return 'questionnaire';
    if (/work experience|employment history|experience/.test(combined)) return 'work_history';
    if (/candidate profile|personal information|resume|cover letter|contact information/.test(combined)) return 'profile';
    return detectGenericStepKind(context);
  },
  classifyControl(control) {
    const text = `${control.label} ${control.id ?? ''} ${control.name ?? ''} ${control.dataQa ?? ''} ${control.type ?? ''}`.toLowerCase();
    if (/submit application|apply now|finish|complete submission/.test(text)) return 'submit';
    if (/review/.test(text)) return 'review';
    if (/continue|next|save and continue/.test(text)) return 'next';
    return classifyGenericControl(control);
  },
  isSubmissionSuccess(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    return /application submitted|thank you for applying|submission complete|application received/.test(combined);
  },
  inferSemanticHint(field) {
    const combined = `${field.name} ${field.label} ${field.placeholder}`.toLowerCase();
    if (/first name/.test(combined)) return 'first_name';
    if (/last name/.test(combined)) return 'last_name';
    if (/email/.test(combined)) return 'email';
    if (/phone/.test(combined)) return 'phone';
    if (/location|city/.test(combined)) return 'location';
    if (/current company/.test(combined)) return 'current_company';
    if (/current title|job title/.test(combined)) return 'current_title';
    if (/years of experience|experience/.test(combined) && field.inputType === 'number') return 'years_of_experience';
    if (/work authorization/.test(combined)) return 'work_authorization';
    if (/sponsorship|visa/.test(combined)) return 'requires_sponsorship';
    return undefined;
  },
  getReviewOnlyReason(field) {
    const combined = `${field.name} ${field.label} ${field.placeholder}`.toLowerCase();
    if (/self[- ]?identify|equal employment|eeo|race|ethnicity|veteran|disability|gender identity/.test(combined)) {
      return 'Taleo compliance questions require manual review.';
    }
    return genericDriver.getReviewOnlyReason(field);
  },
};

const successFactorsDriver: PortalDriver = {
  portalType: 'successfactors',
  detectStepKind(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    if (/application submitted|thank you for applying|application complete/.test(combined)) return 'review';
    if (/pre-screening|questionnaire|additional information|legal declaration/.test(combined)) return 'questionnaire';
    if (/work experience|employment history|experience/.test(combined)) return 'work_history';
    if (/candidate profile|personal information|contact information|resume/.test(combined)) return 'profile';
    return detectGenericStepKind(context);
  },
  classifyControl(control) {
    const text = `${control.label} ${control.id ?? ''} ${control.name ?? ''} ${control.dataQa ?? ''} ${control.type ?? ''}`.toLowerCase();
    if (/submit application|apply now|complete application|finish/.test(text)) return 'submit';
    if (/review/.test(text)) return 'review';
    if (/continue|next|save and continue/.test(text)) return 'next';
    return classifyGenericControl(control);
  },
  isSubmissionSuccess(context) {
    const combined = `${context.url} ${context.title} ${context.bodyText}`.toLowerCase();
    return /application submitted|thank you for applying|application complete|application received/.test(combined);
  },
  inferSemanticHint(field) {
    const combined = `${field.name} ${field.label} ${field.placeholder}`.toLowerCase();
    if (/first name/.test(combined)) return 'first_name';
    if (/last name/.test(combined)) return 'last_name';
    if (/email/.test(combined)) return 'email';
    if (/phone|mobile/.test(combined)) return 'phone';
    if (/location|city/.test(combined)) return 'location';
    if (/current company/.test(combined)) return 'current_company';
    if (/current title|job title/.test(combined)) return 'current_title';
    if (/years of experience|experience/.test(combined) && /number|text/.test(field.inputType || '')) return 'years_of_experience';
    if (/work authorization/.test(combined)) return 'work_authorization';
    if (/sponsorship|visa/.test(combined)) return 'requires_sponsorship';
    return undefined;
  },
  getReviewOnlyReason(field) {
    const combined = `${field.name} ${field.label} ${field.placeholder}`.toLowerCase();
    if (/self[- ]?identify|equal employment|eeo|race|ethnicity|veteran|disability|gender identity/.test(combined)) {
      return 'SuccessFactors compliance questions require manual review.';
    }
    return genericDriver.getReviewOnlyReason(field);
  },
};

const DRIVER_MAP: Partial<Record<PortalType, PortalDriver>> = {
  linkedin: linkedinDriver,
  naukri: naukriDriver,
  phenom: phenomDriver,
  greenhouse: greenhouseDriver,
  lever: leverDriver,
  ashby: ashbyDriver,
  workday: workdayDriver,
  icims: icimsDriver,
  smartrecruiters: smartRecruitersDriver,
  taleo: taleoDriver,
  successfactors: successFactorsDriver,
};

export function getPortalDriver(portalType: PortalType): PortalDriver {
  return DRIVER_MAP[portalType] ?? genericDriver;
}
