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
  resumeSource: ResumeSource;
  resumeId?: string;
  providerUsed: 'gemini' | 'qwen';
  fallbackUsed: boolean;
  promptVersion: string;
  pipelineVersion: string;
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
  resumeSource: ResumeSource;
  resumeId?: string;
  providerUsed: 'gemini' | 'qwen';
  fallbackUsed: boolean;
  promptVersion: string;
  pipelineVersion: string;
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
  formerEmployers?: string[];
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
  sourceHost?: string;
  sourceType?: 'direct' | 'ats' | 'board' | 'aggregator' | 'unknown';
  verifiedSource?: boolean;
  description: string;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  estimatedSalary?: string;
  matchScore: number;
  matchBreakdown: JobMatchBreakdown;
  postedDate?: string;
  companyStage?: string;
  ghostRisk?: 'real' | 'verify' | 'ghost';
  matchReason?: string;
  tags?: string[];
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
  resumeSource?: ResumeSource;
  resumeId?: string;
}

export interface LatestJobSearchSessionResponse {
  session: {
    id: string;
    createdAt: string;
    preferences: JobSearchPreferences;
    results: JobSearchResult[];
    candidateProfile: CandidateProfile | null;
    totalFound: number;
    resumeId?: string;
  } | null;
}

/* ─────────────────────────────────────────
   Apply Sessions
───────────────────────────────────────── */

export type ExecutorMode = 'extension' | 'local_agent' | 'cloud';

export type LocalAgentStatus = 'checking' | 'connected' | 'offline';

export interface LocalAgentHealth {
  service: 'resume-tailor-local-agent';
  version: string;
  executionMode: 'local_agent';
  playwrightAvailable: boolean;
  browserReady: boolean;
  headless: boolean;
  sessions: number;
  userDataDir: string;
}

export interface LocalAgentSessionRequest {
  sessionId: string;
  applyUrl: string;
  apiBaseUrl?: string;
  executorToken?: string;
}

export interface LocalAgentSessionSummary {
  sessionId: string;
  status: 'created' | 'running' | 'paused' | 'completed' | 'failed';
  applyUrl: string;
  pageTitle?: string;
  currentUrl?: string;
  startedAt: string;
  updatedAt: string;
}

export type ResumeSource = 'upload' | 'default';

export interface StoredResumeSummary {
  id: string;
  filename: string;
  updatedAt: string;
  fileHash?: string;
  hasTemplateProfile: boolean;
  parseWarnings: ExtractionWarning[];
  candidateProfile?: CandidateProfile;
}

export interface DefaultResumeResponse {
  resume: StoredResumeSummary | null;
}

export type PortalType =
  | 'linkedin'
  | 'naukri'
  | 'phenom'
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workday'
  | 'icims'
  | 'smartrecruiters'
  | 'taleo'
  | 'successfactors'
  | 'generic'
  | 'protected'
  | 'unknown';

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
  | 'github'
  | 'location'
  | 'city'
  | 'portfolio'
  | 'website'
  | 'current_company'
  | 'current_title'
  | 'years_of_experience'
  | 'current_ctc'
  | 'expected_ctc'
  | 'notice_period'
  | 'work_authorization'
  | 'requires_sponsorship'
  | 'visa_status'
  | 'gender'
  | 'resume_upload'
  | 'cover_letter_upload'
  | 'unknown';

export type FieldSupportStatus = 'supported' | 'needs_review' | 'unsupported';

export type WidgetKind =
  | 'text'
  | 'textarea'
  | 'select'
  | 'radio_group'
  | 'checkbox'
  | 'file_upload'
  | 'number'
  | 'date'
  | 'custom_combobox'
  | 'custom_multiselect'
  | 'custom_card_group'
  | 'custom_date'
  | 'custom_number'
  | 'unknown';

export type StepKind =
  | 'profile'
  | 'work_history'
  | 'education'
  | 'questionnaire'
  | 'review'
  | 'submit'
  | 'unknown';

export type PauseReason =
  | 'none'
  | 'protected_portal'
  | 'login_required'
  | 'legal_review_required'
  | 'assessment_required'
  | 'unsupported_widget'
  | 'missing_profile_value'
  | 'ambiguous_required_field'
  | 'no_progress_after_advance'
  | 'manual_required';

export interface ApplicantProfile {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  location?: string;
  website?: string;
  currentCompany?: string;
  currentTitle?: string;
  yearsOfExperience?: string;
  currentCtcLpa?: string;
  expectedCtcLpa?: string;
  noticePeriodDays?: string;
  workAuthorization?: string;
  requiresSponsorship?: string;
  visaStatus?: string;
  gender?: string;
}

export type AnswerBankPortalScope = PortalType | 'any';
export type AnswerBankSource = 'user_saved' | 'managed_browser' | 'resume_derived' | 'imported';
export type AnswerBankConfidence = 'confirmed' | 'learned';

export interface AnswerBankEntry {
  id: string;
  question: string;
  normalizedQuestion: string;
  answer: string;
  portalType?: AnswerBankPortalScope;
  semanticType?: FieldSemanticType;
  source?: AnswerBankSource;
  confidence?: AnswerBankConfidence;
  usageCount?: number;
  lastUsedAt?: string;
  updatedAt: string;
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
  widgetKind: WidgetKind;
  required: boolean;
  visible: boolean;
  semanticHint?: FieldSemanticType;
  reviewOnlyReason?: string;
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
  stepKind: StepKind;
  stepSignature: string;
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
  pauseReason?: PauseReason;
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
  reviewItems?: ReviewItem[];
  latestMessage?: string;
  latestScreenshot?: string | null;
  latestPauseReason?: PauseReason;
  latestPageUrl?: string;
  latestStepKind?: StepKind;
  latestStepSignature?: string;
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

export interface CreateApplySessionRequest {
  applyUrl: string;
  tailoredResume: TailoredResumeDocument;
  templateProfile: ResumeTemplateProfile;
  validation: ValidationReport;
  applicationProfile?: Partial<ApplicantProfile>;
  answerBank?: AnswerBankEntry[];
  executorMode?: Extract<ExecutorMode, 'extension' | 'local_agent'>;
  job?: {
    title?: string;
    company?: string;
    location?: string;
    description?: string;
  };
}

export interface ApplicationProfileResponse {
  profile: ApplicantProfile;
  answerBank: AnswerBankEntry[];
}

export interface ApplySessionEvent {
  status?: ApplySessionStatus;
  message?: string;
  screenshot?: string | null;
  filledCount?: number;
  reviewItems?: ReviewItem[];
  pageUrl?: string;
  portalType?: PortalType;
  pauseReason?: PauseReason;
  stepKind?: StepKind;
  stepSignature?: string;
}

export interface ApplySessionTraceEntry {
  id: string;
  at: string;
  source: 'system' | 'planner' | 'executor' | 'user';
  event:
    | 'created'
    | 'plan_generated'
    | 'executor_event'
    | 'executor_mode_changed'
    | 'confirm_submit'
    | 'learn'
    | 'completed';
  status?: ApplySessionStatus;
  message?: string;
  portalType?: PortalType;
  pauseReason?: PauseReason;
  pageUrl?: string;
  stepKind?: StepKind;
  stepSignature?: string;
  filledCount?: number;
  reviewCount?: number;
  actionCount?: number;
}

export interface ApplySessionTraceResponse {
  session: ApplySessionSummary;
  trace: ApplySessionTraceEntry[];
}

export interface ApplyAutomationMetrics {
  totalSessions: number;
  byStatus: Record<string, number>;
  byPortalType: Record<string, number>;
  byPauseReason: Record<string, number>;
  byExecutorMode: Record<string, number>;
}

export interface ApplyReliabilitySnapshot {
  metrics: ApplyAutomationMetrics;
  recentIssues: Array<{
    applicationId: string;
    status: string;
    portalType?: PortalType | null;
    pauseReason?: PauseReason | null;
    executorMode?: ExecutorMode | null;
    lastMessage?: string | null;
    updatedAt: string;
  }>;
}

export interface ApplySessionContextResponse {
  experienceEntries: Array<{
    company: string;
    title: string;
    location?: string;
    dates?: string;
  }>;
  educationEntries: Array<{
    institution: string;
    degree: string;
    location?: string;
    dates?: string;
  }>;
  projectEntries: Array<{
    name: string;
    description: string;
  }>;
  certificationEntries: Array<{
    name: string;
  }>;
}

/* ─────────────────────────────────────────
   Applications & Jobs
───────────────────────────────────────── */

export type JobLifecycleStatus =
  | 'discovered'
  | 'shown'
  | 'saved'
  | 'queued'
  | 'applying'
  | 'applied'
  | 'failed'
  | 'manual_required'
  | 'dismissed';

export type ApplicationStatus =
  | 'queued'
  | 'pending'
  | 'applied'
  | 'rejected'
  | 'review'
  | 'interview'
  | 'offered'
  | 'in_progress'
  | 'manual_required'
  | 'failed';

export interface JobRecord {
  id: string;
  userId: string;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  url?: string | null;
  applyUrl?: string | null;
  description?: string | null;
  sourceHost?: string | null;
  sourceType?: string | null;
  verifiedSource?: boolean | null;
  lastVerifiedAt?: string | null;
  lifecycleStatus?: JobLifecycleStatus | null;
  seenCount?: number | null;
  lastSearchRank?: number | null;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  savedAt?: string | null;
  dismissedAt?: string | null;
  lastAppliedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationRecord {
  id: string;
  userId: string;
  jobId: string;
  sessionId?: string | null;
  applyUrl?: string | null;
  status: ApplicationStatus;
  notes?: string | null;
  errorMessage?: string | null;
  lastPauseReason?: PauseReason | null;
  lastMessage?: string | null;
  lastStepKind?: StepKind | null;
  portalType?: PortalType | null;
  executorMode?: ExecutorMode | null;
  traceCount?: number | null;
  lastTraceAt?: string | null;
  retryCount?: number | null;
  replayOfApplicationId?: string | null;
  supersededByApplicationId?: string | null;
  createdAt: string;
  updatedAt: string;
  job?: JobRecord | null;
}
