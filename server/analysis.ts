import type {
  JDRequirementModel,
  ResumeAnalysis,
  SourceResumeDocument,
  TailoringPlan,
} from '../src/shared/types.ts';
import { clamp, sanitizeKeyword, tokenizeText, unique } from './utils.ts';

function collectResumeCorpus(resume: SourceResumeDocument): string {
  return [
    resume.summary,
    ...resume.skills,
    ...resume.certifications,
    ...resume.experience.flatMap((item) => [item.title, item.company, item.dates, ...item.bullets]),
    ...resume.projects.flatMap((item) => [item.name, item.description, ...item.bullets]),
    ...resume.education.flatMap((item) => [item.institution, item.degree]),
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildTailoringPlan(resume: SourceResumeDocument, jd: JDRequirementModel): TailoringPlan {
  const sectionPriority = unique([
    'summary',
    jd.mustHaveKeywords.length > 0 ? 'skills' : '',
    'experience',
    resume.projects.length > 0 ? 'projects' : '',
    'education',
    resume.certifications.length > 0 ? 'certifications' : '',
  ].filter(Boolean));

  const emphasis = jd.mustHaveKeywords.slice(0, 6);
  const weakSections: string[] = [];
  if (!resume.summary) weakSections.push('summary');
  if (!resume.skills.length) weakSections.push('skills');

  return {
    summaryStrategy: resume.summary
      ? 'Rewrite the summary using only verified facts and emphasize matching role, scope, and tools.'
      : 'Build a concise summary from verified experience and skill facts only.',
    sectionPriority,
    experienceBulletEmphasis: emphasis,
    keywordTargets: unique([...jd.mustHaveKeywords, ...jd.niceToHaveKeywords]).slice(0, 12),
    sectionsLocked: ['contactInfo', 'education', 'certifications'],
    sectionsOptional: weakSections,
  };
}

export function buildAnalysis(
  resume: SourceResumeDocument,
  jd: JDRequirementModel,
  normalizedJdText: string,
): ResumeAnalysis {
  const corpus = sanitizeKeyword(collectResumeCorpus(resume));
  const matchedKeywords = jd.mustHaveKeywords.filter((keyword) => corpus.includes(keyword));
  const missingMustHaveKeywords = jd.mustHaveKeywords.filter((keyword) => !corpus.includes(keyword));
  const missingNiceToHaveKeywords = jd.niceToHaveKeywords.filter((keyword) => !corpus.includes(keyword));

  const titleMatch = jd.targetTitles.some((title) =>
    tokenizeText(title).some((token) => corpus.includes(token)),
  );
  const seniorityMatch = jd.senioritySignals.some((signal) => corpus.includes(signal));

  const keywordCoverage = jd.mustHaveKeywords.length
    ? matchedKeywords.length / jd.mustHaveKeywords.length
    : 0.5;
  const niceCoverage = jd.niceToHaveKeywords.length
    ? (jd.niceToHaveKeywords.length - missingNiceToHaveKeywords.length) / jd.niceToHaveKeywords.length
    : 0.5;

  const structureScore = [
    resume.summary ? 1 : 0,
    resume.experience.length > 0 ? 1 : 0,
    resume.skills.length > 0 ? 1 : 0,
    resume.education.length > 0 ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0) / 4;

  const alignmentScore = Math.round(
    clamp(
      keywordCoverage * 35 +
        keywordCoverage * 30 +
        (titleMatch ? 1 : 0.4) * 15 +
        (seniorityMatch ? 1 : 0.5) * 10 +
        structureScore * 10 +
        niceCoverage * 5,
      0,
      100,
    ),
  );

  const strongestAlignedExperiences = resume.experience
    .map((item) => {
      const content = sanitizeKeyword([item.title, item.company, ...item.bullets].join(' '));
      const score = jd.mustHaveKeywords.filter((keyword) => content.includes(keyword)).length;
      return { label: `${item.title}${item.company ? ` at ${item.company}` : ''}`, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.label);

  const weakSections = unique([
    !resume.summary ? 'Summary' : '',
    missingMustHaveKeywords.length > 4 ? 'Skills' : '',
    resume.projects.length === 0 && jd.mustHaveKeywords.some((keyword) => ['product', 'graphql', 'aws'].includes(keyword)) ? 'Projects' : '',
    resume.certifications.length === 0 && normalizedJdText.toLowerCase().includes('certification') ? 'Certifications' : '',
  ].filter(Boolean));

  const recommendations = unique([
    missingMustHaveKeywords.length
      ? `Emphasize verified experience related to ${missingMustHaveKeywords.slice(0, 3).join(', ')} without adding new claims.`
      : '',
    !resume.summary ? 'Create a concise summary from verified experience and skills.' : '',
    resume.skills.length < 6 ? 'Promote verified tools and technologies into the skills section for ATS clarity.' : '',
    strongestAlignedExperiences.length === 0 ? 'Reorder experience bullets to highlight the most relevant verified work first.' : '',
  ].filter(Boolean));

  return {
    jdSummary: normalizedJdText.slice(0, 220).trim(),
    matchedKeywords,
    missingMustHaveKeywords,
    missingNiceToHaveKeywords,
    alignmentScore,
    strongestAlignedExperiences,
    weakSections,
    recommendations,
  };
}
