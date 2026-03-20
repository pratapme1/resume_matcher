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
}

export interface TailoringPlan {
  summaryStrategy: string;
  sectionPriority: string[];
  experienceBulletEmphasis: string[];
  keywordTargets: string[];
  sectionsLocked: string[];
  sectionsOptional: string[];
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
}

export interface TailorResumeBlockedResponse {
  blocked: true;
  analysis: ResumeAnalysis;
  validation: ValidationReport;
  templateProfile: ResumeTemplateProfile;
  tailoringPlan: TailoringPlan;
  renderReadiness: 'blocked';
  normalizedJobDescription: NormalizedJobDescription;
  parseWarnings: ExtractionWarning[];
}

export type TailorResumeResponse =
  | TailorResumeSuccessResponse
  | TailorResumeBlockedResponse;
