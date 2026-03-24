import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { buildAnalysis, buildTailoringPlan } from '../server/analysis.ts';
import { buildGapAnalysis } from '../server/gap-analysis.ts';
import { buildJDRequirementModel, normalizeJobDescription } from '../server/jd.ts';
import { parseResumeDocx } from '../server/resume.ts';
import {
  TAILOR_PIPELINE_VERSION,
  TAILOR_PROMPT_VERSION,
  tailorResumeWithAI,
} from '../server/tailor.ts';
import { validateTailoredResume } from '../server/validate.ts';
import type { TailoredResumeDocument } from '../src/shared/types.ts';

type EvalCase = {
  id: string;
  label: string;
  resumePath: string;
  jdPath: string;
  repeats?: number;
};

type EvalRun = {
  validationPass: boolean;
  blockingIssues: number;
  warningCount: number;
  unsupportedClaims: number;
  preAlignmentScore: number;
  alignmentScore: number;
  fitScore: number;
  lockedFieldsStable: boolean;
  sectionOrderStable: boolean;
};

type EvalCaseReport = {
  id: string;
  label: string;
  repeats: number;
  runs: EvalRun[];
  fitScoreVariance: number;
  alignmentScoreVariance: number;
  allValidationPass: boolean;
  allLockedFieldsStable: boolean;
};

dotenv.config({ path: '.env.local' });
dotenv.config();

function getAI(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY is required to run live tailoring evals.');
  }
  return new GoogleGenAI({ apiKey });
}

function resolveRepoPath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}

function computeVariance(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

function lockedFieldsStable(source: Awaited<ReturnType<typeof parseResumeDocx>>['resume'], output: TailoredResumeDocument) {
  return (
    JSON.stringify(source.contactInfo) === JSON.stringify(output.contactInfo) &&
    JSON.stringify(source.sectionOrder) === JSON.stringify(output.sectionOrder) &&
    JSON.stringify(
      source.experience.map((item) => ({
        id: item.id,
        company: item.company,
        title: item.title,
        dates: item.dates,
        location: item.location,
      })),
    ) ===
      JSON.stringify(
        output.experience.map((item) => ({
          id: item.id,
          company: item.company,
          title: item.title,
          dates: item.dates,
          location: item.location,
        })),
      ) &&
    JSON.stringify(
      source.education.map((item) => ({
        id: item.id,
        institution: item.institution,
        degree: item.degree,
        dates: item.dates,
        location: item.location,
      })),
    ) ===
      JSON.stringify(
        output.education.map((item) => ({
          id: item.id,
          institution: item.institution,
          degree: item.degree,
          dates: item.dates,
          location: item.location,
        })),
      )
  );
}

async function runCase(ai: GoogleGenAI, testCase: EvalCase): Promise<EvalCaseReport> {
  const resumeBuffer = await readFile(resolveRepoPath(testCase.resumePath));
  const jdText = await readFile(resolveRepoPath(testCase.jdPath), 'utf8');
  const parsedResume = await parseResumeDocx(resumeBuffer);
  const normalizedJd = normalizeJobDescription(jdText, 'file');
  const repeats = Math.max(1, testCase.repeats ?? Number.parseInt(process.env.TAILOR_EVAL_RUNS ?? '5', 10));
  const runs: EvalRun[] = [];

  for (let index = 0; index < repeats; index++) {
    const jdRequirements = await buildJDRequirementModel(normalizedJd, ai);
    const tailoringPlan = buildTailoringPlan(parsedResume.resume, jdRequirements);
    tailoringPlan.gapAnalysis = await buildGapAnalysis(ai, parsedResume.resume, jdRequirements, normalizedJd.cleanText);
    const { tailoredResume } = await tailorResumeWithAI(ai, parsedResume.resume, normalizedJd.cleanText, jdRequirements, tailoringPlan, {});
    const validation = validateTailoredResume(parsedResume.resume, tailoredResume, parsedResume.templateProfile);
    const analysis = buildAnalysis(
      parsedResume.resume,
      jdRequirements,
      normalizedJd.cleanText,
      [
        tailoredResume.headline,
        tailoredResume.summary,
        ...tailoredResume.skills,
        ...tailoredResume.experience.flatMap((item) => item.bullets.map((bullet) => bullet.text)),
        ...tailoredResume.projects.flatMap((item) => item.bullets.map((bullet) => bullet.text)),
      ]
        .filter(Boolean)
        .join(' '),
    );

    runs.push({
      validationPass: validation.isValid,
      blockingIssues: validation.blockingIssues.length,
      warningCount: validation.warnings.length,
      unsupportedClaims: validation.unsupportedClaims.length,
      preAlignmentScore: analysis.preAlignmentScore,
      alignmentScore: analysis.alignmentScore,
      fitScore: typeof tailoringPlan.gapAnalysis?.fitScore === 'number' ? tailoringPlan.gapAnalysis.fitScore : analysis.preAlignmentScore,
      lockedFieldsStable: lockedFieldsStable(parsedResume.resume, tailoredResume),
      sectionOrderStable: JSON.stringify(parsedResume.resume.sectionOrder) === JSON.stringify(tailoredResume.sectionOrder),
    });
  }

  return {
    id: testCase.id,
    label: testCase.label,
    repeats,
    runs,
    fitScoreVariance: computeVariance(runs.map((run) => run.fitScore)),
    alignmentScoreVariance: computeVariance(runs.map((run) => run.alignmentScore)),
    allValidationPass: runs.every((run) => run.validationPass),
    allLockedFieldsStable: runs.every((run) => run.lockedFieldsStable),
  };
}

async function main() {
  const ai = getAI();
  const casesPath = resolveRepoPath('evals/tailor-golden/cases.json');
  const cases = JSON.parse(await readFile(casesPath, 'utf8')) as EvalCase[];
  const reports: EvalCaseReport[] = [];

  for (const testCase of cases) {
    reports.push(await runCase(ai, testCase));
  }

  const output = {
    generatedAt: new Date().toISOString(),
    promptVersion: TAILOR_PROMPT_VERSION,
    pipelineVersion: TAILOR_PIPELINE_VERSION,
    reports,
  };

  const outputDir = resolveRepoPath('evals/tailor-golden');
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'latest-report.json');
  await writeFile(outputPath, JSON.stringify(output, null, 2));

  console.log(`Wrote tailoring eval report to ${outputPath}`);
  for (const report of reports) {
    console.log(
      `${report.id}: validation=${report.allValidationPass ? 'pass' : 'fail'} locked=${report.allLockedFieldsStable ? 'stable' : 'drift'} fitVar=${report.fitScoreVariance} alignVar=${report.alignmentScoreVariance}`,
    );
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
