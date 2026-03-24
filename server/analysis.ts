import type {
  GapAnalysis,
  JDRequirementModel,
  ResumeAnalysis,
  ScoreBreakdown,
  SourceResumeDocument,
  TailoringPlan,
} from '../src/shared/types.ts';
import { clamp, sanitizeKeyword, tokenizeText, unique } from './utils.ts';

function collectResumeCorpus(resume: SourceResumeDocument): string {
  return [
    resume.headline,
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

function tokenInCorpus(token: string, corpus: string): boolean {
  if (corpus.includes(token)) return true;
  // Singular fallback: strip trailing 's' (e.g. "processes"→"process", "integrations"→"integration")
  if (token.endsWith('s') && token.length > 4) {
    return corpus.includes(token.slice(0, -1));
  }
  return false;
}

function keywordMatches(sanitizedCorpus: string, keyword: string): boolean {
  if (sanitizedCorpus.includes(keyword)) return true;
  // Multi-word fallback: ≥50% of tokens (>1 char) must appear in corpus
  const tokens = keyword.split(/\s+/).filter((t) => t.length > 1);
  if (tokens.length < 2) return false;
  const matched = tokens.filter((t) => tokenInCorpus(t, sanitizedCorpus)).length;
  return matched / tokens.length >= 0.5;
}

function computeScore(
  sanitizedCorpus: string,
  jd: JDRequirementModel,
  shared: { titleMatch: boolean; seniorityMatch: boolean; structureScore: number },
): { score: number; breakdown: ScoreBreakdown } {
  const matchedMustHave = jd.mustHaveKeywords.filter((k) => keywordMatches(sanitizedCorpus, k));
  const matchedNice = jd.niceToHaveKeywords.filter((k) => keywordMatches(sanitizedCorpus, k));

  const keywordCoverage = jd.mustHaveKeywords.length ? matchedMustHave.length / jd.mustHaveKeywords.length : 0.5;
  const niceCoverage = jd.niceToHaveKeywords.length ? matchedNice.length / jd.niceToHaveKeywords.length : 0.5;

  const { titleMatch, seniorityMatch, structureScore } = shared;

  const score = Math.round(
    clamp(
      keywordCoverage * 50 +
        niceCoverage * 15 +
        (titleMatch ? 1 : 0.4) * 15 +
        (seniorityMatch ? 1 : 0.5) * 10 +
        structureScore * 10,
      0,
      100,
    ),
  );

  return {
    score,
    breakdown: { keywordCoverage, niceCoverage, titleMatch, seniorityMatch, structureScore },
  };
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
  tailoredCorpus?: string,
): ResumeAnalysis {
  const sourceCorpus = sanitizeKeyword(collectResumeCorpus(resume));
  const matchedKeywords = jd.mustHaveKeywords.filter((keyword) => keywordMatches(sourceCorpus, keyword));
  const missingMustHaveKeywords = jd.mustHaveKeywords.filter((keyword) => !keywordMatches(sourceCorpus, keyword));
  const missingNiceToHaveKeywords = jd.niceToHaveKeywords.filter((keyword) => !keywordMatches(sourceCorpus, keyword));

  const titleMatch = jd.targetTitles.some((title) =>
    tokenizeText(title).some((token) => sourceCorpus.includes(token)),
  );
  const seniorityMatch = jd.senioritySignals.some((signal) => sourceCorpus.includes(signal));

  const structureScore = [
    resume.summary ? 1 : 0,
    resume.experience.length > 0 ? 1 : 0,
    resume.skills.length > 0 ? 1 : 0,
    resume.education.length > 0 ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0) / 4;

  const shared = { titleMatch, seniorityMatch, structureScore };
  const { score: preScore, breakdown: preBreakdown } = computeScore(sourceCorpus, jd, shared);
  const preAlignmentScore = preScore;

  let alignmentScore: number;
  let scoreBreakdown: ScoreBreakdown;

  if (tailoredCorpus) {
    const sanitizedTailored = sanitizeKeyword(tailoredCorpus);
    const { score: postScore, breakdown: postBreakdown } = computeScore(sanitizedTailored, jd, shared);
    alignmentScore = postScore;
    scoreBreakdown = postBreakdown;
  } else {
    alignmentScore = preScore;
    scoreBreakdown = preBreakdown;
  }

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
    preAlignmentScore,
    scoreBreakdown,
    strongestAlignedExperiences,
    weakSections,
    recommendations,
  };
}

export function ensureGapAnalysisNarrative(
  gapAnalysis: GapAnalysis | undefined,
  analysis: ResumeAnalysis,
  jd: JDRequirementModel,
): GapAnalysis {
  const matchedKeywords = analysis.matchedKeywords.slice(0, 3);
  const missingKeywords = analysis.missingMustHaveKeywords.slice(0, 3);
  const strongestExperiences = analysis.strongestAlignedExperiences.slice(0, 2);
  const targetTitle = jd.targetTitles[0]?.trim() || 'the target role';
  const fallbackFitScore =
    typeof gapAnalysis?.fitScore === 'number' && Number.isFinite(gapAnalysis.fitScore)
      ? gapAnalysis.fitScore
      : analysis.preAlignmentScore;

  const fallbackTopStrengths = unique([
    matchedKeywords.length > 0 ? `Verified overlap with ${matchedKeywords.join(', ')}.` : '',
    strongestExperiences.length > 0
      ? `Most aligned experience includes ${strongestExperiences.join(' and ')}.`
      : '',
    analysis.scoreBreakdown.titleMatch ? `Past role titles align credibly with ${targetTitle}.` : '',
    analysis.scoreBreakdown.seniorityMatch ? 'Resume signals the expected seniority for this role.' : '',
  ].filter(Boolean)).slice(0, 4);

  const fallbackKeyGaps = unique([
    ...missingKeywords.map((keyword) => `Limited explicit evidence for ${keyword}.`),
    ...(missingKeywords.length === 0
      ? analysis.weakSections.slice(0, 2).map((section) => `Resume could strengthen the ${section.toLowerCase()} section for this role.`)
      : []),
  ]).slice(0, 3);

  const fallbackRepositioningAngle =
    matchedKeywords.length > 0
      ? `Position the candidate as a fit for ${targetTitle} by foregrounding verified work in ${matchedKeywords.join(', ')}.`
      : `Position the candidate for ${targetTitle} by emphasizing the most aligned verified experience first.`;

  const fallbackSummaryOpeningHint =
    matchedKeywords.length > 0
      ? `${targetTitle} with proven experience in ${matchedKeywords[0]}${matchedKeywords[1] ? ` and ${matchedKeywords[1]}` : ''}`
      : `Experience aligned to ${targetTitle}`;

  return {
    fitScore: fallbackFitScore,
    repositioningAngle: gapAnalysis?.repositioningAngle?.trim() || fallbackRepositioningAngle,
    topStrengths: gapAnalysis?.topStrengths?.length ? gapAnalysis.topStrengths : fallbackTopStrengths,
    keyGaps: gapAnalysis?.keyGaps?.length ? gapAnalysis.keyGaps : fallbackKeyGaps,
    bulletPriorities: gapAnalysis?.bulletPriorities ?? [],
    summaryOpeningHint: gapAnalysis?.summaryOpeningHint?.trim() || fallbackSummaryOpeningHint,
  };
}
