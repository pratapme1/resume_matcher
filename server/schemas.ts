import { z } from 'zod';

export const extractJdUrlRequestSchema = z.object({
  url: z.string().trim().min(1, 'URL is required.'),
});

export const preferencesSchema = z.object({
  seniority: z.string().trim().min(1).optional(),
  targetRole: z.string().trim().min(1).optional(),
  tone: z.string().trim().min(1).optional(),
});

export const tailorResumeFormSchema = z.object({
  jdText: z.string().trim().min(10, 'Job description text must be at least 10 characters.'),
});

const contactInfoSchema = z.object({
  email: z.string(),
  linkedin: z.string(),
  location: z.string(),
  name: z.string(),
  phone: z.string(),
});

const tailoredBulletSchema = z.object({
  sourceProvenanceIds: z.array(z.string()),
  text: z.string(),
});

const tailoredHighlightMetricSchema = z.object({
  label: z.string(),
  sourceProvenanceIds: z.array(z.string()),
  value: z.string(),
});

const tailoredSkillCategorySchema = z.object({
  items: z.array(z.string()),
  label: z.string(),
  sourceProvenanceIds: z.array(z.string()),
});

const tailoredExperienceItemSchema = z.object({
  bullets: z.array(tailoredBulletSchema),
  company: z.string(),
  dates: z.string(),
  id: z.string(),
  location: z.string(),
  sourceProvenanceIds: z.array(z.string()),
  title: z.string(),
});

const tailoredEducationItemSchema = z.object({
  dates: z.string(),
  degree: z.string(),
  id: z.string(),
  institution: z.string(),
  location: z.string(),
  sourceProvenanceIds: z.array(z.string()),
});

const tailoredProjectItemSchema = z.object({
  bullets: z.array(tailoredBulletSchema),
  description: z.string(),
  id: z.string(),
  name: z.string(),
  sourceProvenanceIds: z.array(z.string()),
});

export const tailoredResumeSchema = z.object({
  certificationSourceProvenanceIds: z.array(z.string()),
  certifications: z.array(z.string()),
  contactInfo: contactInfoSchema,
  education: z.array(tailoredEducationItemSchema),
  experience: z.array(tailoredExperienceItemSchema),
  headline: z.string().optional(),
  headlineSourceProvenanceIds: z.array(z.string()).optional(),
  highlightMetrics: z.array(tailoredHighlightMetricSchema).optional(),
  projects: z.array(tailoredProjectItemSchema),
  sectionOrder: z.array(z.string()),
  skillCategories: z.array(tailoredSkillCategorySchema).optional(),
  skillSourceProvenanceIds: z.array(z.string()),
  skills: z.array(z.string()),
  summary: z.string(),
  summarySourceProvenanceIds: z.array(z.string()),
});

const tailoredMutableExperienceItemSchema = z.object({
  id: z.string(),
  bullets: z.array(tailoredBulletSchema),
  sourceProvenanceIds: z.array(z.string()).optional(),
});

const tailoredMutableProjectItemSchema = z.object({
  id: z.string(),
  bullets: z.array(tailoredBulletSchema),
  sourceProvenanceIds: z.array(z.string()).optional(),
});

export const tailoredResumeMutableSchema = z.object({
  headline: z.string().optional(),
  headlineSourceProvenanceIds: z.array(z.string()).optional(),
  highlightMetrics: z.array(tailoredHighlightMetricSchema).optional(),
  summary: z.string(),
  summarySourceProvenanceIds: z.array(z.string()),
  experience: z.array(tailoredMutableExperienceItemSchema),
  projects: z.array(tailoredMutableProjectItemSchema).optional(),
  skillCategories: z.array(tailoredSkillCategorySchema).optional(),
  skills: z.array(z.string()).optional(),
  skillSourceProvenanceIds: z.array(z.string()).optional(),
});

export const resumeTemplateProfileSchema = z.object({
  bulletStyle: z.object({
    indent: z.number().optional(),
    type: z.enum(['bullet', 'dash', 'mixed', 'unknown']),
  }),
  fontSizes: z.array(z.number()),
  fonts: z.array(z.string()),
  headerFooterPresence: z.boolean(),
  layoutMode: z.enum(['single-column', 'multi-column', 'unknown']),
  margins: z.object({
    bottom: z.number(),
    left: z.number(),
    right: z.number(),
    top: z.number(),
  }),
  paragraphSpacing: z.object({
    after: z.number().optional(),
    before: z.number().optional(),
    line: z.number().optional(),
  }),
  preservationStatus: z.enum(['fully_preserved', 'minor_fallback', 'fallback_template']),
  sectionHeadingStyle: z.object({
    bold: z.boolean().optional(),
    font: z.string().optional(),
    size: z.number().optional(),
    uppercase: z.boolean().optional(),
  }),
  tabStops: z.array(z.number()),
  templateDocxBase64: z.string().optional(),
});

const validationIssueSchema = z.object({
  code: z.string(),
  field: z.string().optional(),
  message: z.string(),
  severity: z.enum(['blocking', 'warning']),
});

export const validationReportSchema = z.object({
  blockingIssues: z.array(validationIssueSchema),
  formattingFallbackUsed: z.boolean(),
  isValid: z.boolean(),
  unsupportedClaims: z.array(z.string()),
  warnings: z.array(validationIssueSchema),
});

export const generateDocxRequestSchema = z.object({
  tailoredResume: tailoredResumeSchema,
  templateProfile: resumeTemplateProfileSchema,
  validation: validationReportSchema,
});

export type ResumePreferences = z.infer<typeof preferencesSchema>;
