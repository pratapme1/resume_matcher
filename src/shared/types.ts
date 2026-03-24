export type InputSourceType = 'url' | 'file' | 'paste';

export interface ExtractionWarning {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface NormalizedJobDescription {
  sourceType: InputSourceType;
  rawText: string;
  cleanText: string;
  extractionWarnings: ExtractionWarning[];
  qualityScore: number;
}

export interface SourceProvenance {
  id: string;
  section: string;
  path: string;
  text: string;
}

export interface ResumeHighlightMetric {
  value: string;
  label: string;
  provenanceIds: string[];
}

export interface ResumeSkillCategory {
  label: string;
  items: string[];
  provenanceIds: string[];
}

export interface ContactInfo {
  name: string;
  email: string;
  phone: string;
  linkedin: string;
  location: string;
}

export interface ResumeExperienceItem {
  id: string;
  company: string;
  title: string;
  dates: string;
  location: string;
  bullets: string[];
  provenanceIds: string[];
}

export interface ResumeEducationItem {
  id: string;
  institution: string;
  degree: string;
  dates: string;
  location: string;
  provenanceIds: string[];
}

export interface ResumeProjectItem {
  id: string;
  name: string;
  description: string;
  bullets: string[];
  provenanceIds: string[];
}

export interface ResumeSection {
  id: string;
  title: string;
  normalizedTitle: string;
  paragraphs: string[];
}

export interface SourceResumeDocument {
  contactInfo: ContactInfo;
  headline: string;
  headlineProvenanceIds: string[];
  highlightMetrics: ResumeHighlightMetric[];
  summary: string;
  experience: ResumeExperienceItem[];
  education: ResumeEducationItem[];
  projects: ResumeProjectItem[];
  skills: string[];
  skillCategories: ResumeSkillCategory[];
  certifications: string[];
  sectionOrder: string[];
  rawSections: ResumeSection[];
  sourceProvenance: SourceProvenance[];
  parseWarnings: ExtractionWarning[];
}

export interface ResumeTemplateProfile {
  fonts: string[];
  fontSizes: number[];
  templateDocxBase64?: string;
  sectionHeadingStyle: {
    font?: string;
    size?: number;
    bold?: boolean;
    uppercase?: boolean;
  };
  paragraphSpacing: {
    before?: number;
    after?: number;
    line?: number;
  };
  bulletStyle: {
    type: 'bullet' | 'dash' | 'mixed' | 'unknown';
    indent?: number;
  };
  tabStops: number[];
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  layoutMode: 'single-column' | 'multi-column' | 'unknown';
  headerFooterPresence: boolean;
  preservationStatus: 'fully_preserved' | 'minor_fallback' | 'fallback_template';
}

export interface JDRequirementModel {
  targetTitles: string[];
  mustHaveKeywords: string[];
  niceToHaveKeywords: string[];
  responsibilities: string[];
  senioritySignals: string[];
  aiExtracted: boolean;
  companyName?: string;
}

export interface BulletPriorityHint {
  experienceId: string;
  leadThemes: string[];
}

export interface GapAnalysis {
  fitScore?: number;
  repositioningAngle: string;
  topStrengths: string[];
  keyGaps: string[];
  bulletPriorities: BulletPriorityHint[];
  summaryOpeningHint: string;
}

export interface ScoreBreakdown {
  keywordCoverage: number;
  niceCoverage: number;
  titleMatch: boolean;
  seniorityMatch: boolean;
  structureScore: number;
}

export interface TailoringPlan {
  summaryStrategy: string;
  sectionPriority: string[];
  experienceBulletEmphasis: string[];
  keywordTargets: string[];
  sectionsLocked: string[];
  sectionsOptional: string[];
  gapAnalysis?: GapAnalysis;
}

export interface TailoredBullet {
  text: string;
  sourceProvenanceIds: string[];
}

export interface TailoredHighlightMetric {
  value: string;
  label: string;
  sourceProvenanceIds: string[];
}

export interface TailoredSkillCategory {
  label: string;
  items: string[];
  sourceProvenanceIds: string[];
}

export interface TailoredExperienceItem {
  id: string;
  company: string;
  title: string;
  dates: string;
  location: string;
  bullets: TailoredBullet[];
  sourceProvenanceIds: string[];
}

export interface TailoredEducationItem {
  id: string;
  institution: string;
  degree: string;
  dates: string;
  location: string;
  sourceProvenanceIds: string[];
}

export interface TailoredProjectItem {
  id: string;
  name: string;
  description: string;
  bullets: TailoredBullet[];
  sourceProvenanceIds: string[];
}

export interface TailoredResumeDocument {
  contactInfo: ContactInfo;
  headline?: string;
  headlineSourceProvenanceIds?: string[];
  highlightMetrics?: TailoredHighlightMetric[];
  summary: string;
  summarySourceProvenanceIds: string[];
  experience: TailoredExperienceItem[];
  education: TailoredEducationItem[];
  skills: string[];
  skillCategories?: TailoredSkillCategory[];
  skillSourceProvenanceIds: string[];
  projects: TailoredProjectItem[];
  certifications: string[];
  certificationSourceProvenanceIds: string[];
  sectionOrder: string[];
}

export interface ValidationIssue {
  code: string;
  message: string;
  severity: 'blocking' | 'warning';
  field?: string;
}

export interface ValidationReport {
  isValid: boolean;
  blockingIssues: ValidationIssue[];
  warnings: ValidationIssue[];
  unsupportedClaims: string[];
  formattingFallbackUsed: boolean;
}

export interface ResumeAnalysis {
  jdSummary: string;
  matchedKeywords: string[];
  missingMustHaveKeywords: string[];
  missingNiceToHaveKeywords: string[];
  alignmentScore: number;
  preAlignmentScore: number;
  scoreBreakdown: ScoreBreakdown;
  strongestAlignedExperiences: string[];
  weakSections: string[];
  recommendations: string[];
}

export interface TailorResumeSuccessResponse {
  blocked: false;
  analysis: ResumeAnalysis;
  validation: ValidationReport;
  tailoredResume: TailoredResumeDocument;
  templateProfile: ResumeTemplateProfile;
  tailoringPlan: TailoringPlan;
  renderReadiness: 'ready';
  normalizedJobDescription: NormalizedJobDescription;
  parseWarnings: ExtractionWarning[];
  jdCompanyName?: string;
}

export interface TailorResumeBlockedResponse {
  blocked: true;
  analysis: ResumeAnalysis;
  validation: ValidationReport;
  tailoredResume: TailoredResumeDocument;
  templateProfile: ResumeTemplateProfile;
  tailoringPlan: TailoringPlan;
  renderReadiness: 'blocked';
  normalizedJobDescription: NormalizedJobDescription;
  parseWarnings: ExtractionWarning[];
  jdCompanyName?: string;
}

export type TailorResumeResponse =
  | TailorResumeSuccessResponse
  | TailorResumeBlockedResponse;

/* ─────────────────────────────────────────
   Job Search
───────────────────────────────────────── */

export interface CandidateProfile {
  primaryTitles: string[];
  topSkills: string[];
  technologiesAndTools: string[];
  industries: string[];
  seniorityLevel: 'junior' | 'mid' | 'senior' | 'staff' | 'principal';
  yearsOfExperience: number;
  location: string;
  educationLevel: string;
  domainExpertise: string[];
}

export interface JobMatchBreakdown {
  skillsOverlap: number;
  titleSimilarity: number;
  seniorityFit: 'under' | 'match' | 'over';
  domainMatch: number;
  topMatchingSkills: string[];
  keyGaps: string[];
  overallFit: 'strong' | 'good' | 'moderate' | 'stretch';
}

export interface JobSearchResult {
  id: string;
  title: string;
  company: string;
  location: string;
  remoteType: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  url?: string;
  description: string;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  estimatedSalary?: string;
  matchScore: number;
  matchBreakdown: JobMatchBreakdown;
  postedDate?: string;
  companyStage?: string;
}

export interface JobSearchPreferences {
  location?: string;
  country?: string;
  remotePreference?: 'remote' | 'hybrid' | 'onsite' | 'any';
  roleType?: string;
}

export interface JobSearchResponse {
  results: JobSearchResult[];
  candidateProfile: CandidateProfile;
  totalFound: number;
}

/* ─────────────────────────────────────────
   Apply Sessions
───────────────────────────────────────── */

export type ExecutorMode = 'extension' | 'cloud';

export type PortalType = 'greenhouse' | 'lever' | 'ashby' | 'generic' | 'protected' | 'unknown';

export type ApplySessionStatus =
  | 'created'
  | 'queued'
  | 'starting'
  | 'filling'
  | 'review_required'
  | 'ready_to_submit'
  | 'submitting'
  | 'submitted'
  | 'protected'
  | 'unsupported'
  | 'manual_required'
  | 'failed';

export type FieldSemanticType =
  | 'full_name'
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'phone'
  | 'linkedin'
  | 'location'
  | 'city'
  | 'portfolio'
  | 'website'
  | 'resume_upload'
  | 'cover_letter_upload'
  | 'unknown';

export type FieldSupportStatus = 'supported' | 'needs_review' | 'unsupported';

export interface ApplicantProfile {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  location?: string;
  website?: string;
}

export interface DetectedFieldOption {
  label: string;
  value: string;
}

export interface DetectedField {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  inputType: string;
  tagName: string;
  required: boolean;
  visible: boolean;
  value?: string;
  checked?: boolean;
  hasValue?: boolean;
  options?: DetectedFieldOption[];
}

export interface DetectedControl {
  id: string;
  label: string;
  kind: 'next' | 'review' | 'submit' | 'unknown';
}

export interface PageSnapshot {
  url: string;
  title: string;
  portalType: PortalType;
  fields: DetectedField[];
  controls: DetectedControl[];
}

export interface ReviewItem {
  fieldId: string;
  label: string;
  reason: string;
  required: boolean;
}

export type PlannedAction =
  | {
      type: 'fill';
      fieldId: string;
      value: string;
      semanticType: FieldSemanticType;
    }
  | {
      type: 'toggle';
      fieldId: string;
      checked: boolean;
      semanticType: FieldSemanticType;
    }
  | {
      type: 'select';
      fieldId: string;
      value: string;
      semanticType: FieldSemanticType;
    }
  | {
      type: 'upload';
      fieldId: string;
      filename: string;
      mimeType: string;
      base64: string;
      semanticType: FieldSemanticType;
    };

export interface ApplyPlanResponse {
  portalType: PortalType;
  status: ApplySessionStatus;
  actions: PlannedAction[];
  reviewItems: ReviewItem[];
  nextControlId?: string;
  submitControlId?: string;
}

export interface ApplySessionSummary {
  id: string;
  applyUrl: string;
  executorMode: ExecutorMode;
  portalType: PortalType;
  status: ApplySessionStatus;
  latestMessage?: string;
  latestScreenshot?: string | null;
  filledCount: number;
  reviewCount: number;
  submitConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApplySessionResponse {
  session: ApplySessionSummary;
  executorToken: string;
}

export interface ApplySessionEvent {
  status?: ApplySessionStatus;
  message?: string;
  screenshot?: string | null;
  filledCount?: number;
  reviewItems?: ReviewItem[];
  pageUrl?: string;
}
