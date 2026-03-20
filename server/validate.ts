import type {
  ResumeTemplateProfile,
  SourceResumeDocument,
  TailoredResumeDocument,
  ValidationIssue,
  ValidationReport,
} from '../src/shared/types.ts';
import { normalizeWhitespace, sanitizeKeyword, unique } from './utils.ts';

function normalizedSet(values: string[]): Set<string> {
  return new Set(values.map((value) => sanitizeKeyword(value)).filter(Boolean));
}

function collectSourceClaimSet(resume: SourceResumeDocument): Set<string> {
  return normalizedSet(resume.sourceProvenance.map((item) => item.text));
}

function validateExactField(
  source: string[],
  output: string[],
  field: string,
  issues: ValidationIssue[],
  unsupportedClaims: string[],
  severity: 'blocking' | 'warning' = 'blocking',
) {
  const allowed = normalizedSet(source);
  output.forEach((value) => {
    const normalized = sanitizeKeyword(value);
    if (normalized && !allowed.has(normalized)) {
      issues.push({
        code: 'UNSUPPORTED_FIELD_VALUE',
        message: `Unsupported ${field} value detected: ${value}`,
        severity,
        field,
      });
      unsupportedClaims.push(value);
    }
  });
}

function valueSupported(sourceValues: string[], value: string): boolean {
  const normalized = sanitizeKeyword(normalizeWhitespace(value));
  if (!normalized) return true;

  return sourceValues
    .map((sourceValue) => sanitizeKeyword(normalizeWhitespace(sourceValue)))
    .filter(Boolean)
    .some((sourceValue) => normalized === sourceValue || normalized.includes(sourceValue) || sourceValue.includes(normalized));
}

function validateSupportedField(
  source: string[],
  output: string[],
  field: string,
  issues: ValidationIssue[],
  unsupportedClaims: string[],
  severity: 'blocking' | 'warning' = 'blocking',
) {
  output.forEach((value) => {
    if (!valueSupported(source, value)) {
      issues.push({
        code: 'UNSUPPORTED_FIELD_VALUE',
        message: `Unsupported ${field} value detected: ${value}`,
        severity,
        field,
      });
      unsupportedClaims.push(value);
    }
  });
}

function bulletSupported(sourceClaims: Set<string>, bullet: string): boolean {
  const normalized = sanitizeKeyword(normalizeWhitespace(bullet));
  if (!normalized) return true;
  if (sourceClaims.has(normalized)) return true;
  return Array.from(sourceClaims).some((claim) => normalized.includes(claim) || claim.includes(normalized));
}

export function validateTailoredResume(
  source: SourceResumeDocument,
  tailored: TailoredResumeDocument,
  templateProfile: ResumeTemplateProfile,
): ValidationReport {
  const blockingIssues: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const unsupportedClaims: string[] = [];
  const sourceClaims = collectSourceClaimSet(source);
  const provenanceIds = new Set(source.sourceProvenance.map((item) => item.id));
  const sourceProvenanceById = new Map(source.sourceProvenance.map((item) => [item.id, item.text]));

  validateExactField(
    source.experience.map((item) => item.company).filter(Boolean),
    tailored.experience.map((item) => item.company).filter(Boolean),
    'company',
    blockingIssues,
    unsupportedClaims,
  );
  validateExactField(
    source.experience.map((item) => item.title).filter(Boolean),
    tailored.experience.map((item) => item.title).filter(Boolean),
    'title',
    blockingIssues,
    unsupportedClaims,
  );
  validateExactField(
    source.experience.map((item) => item.dates).filter(Boolean),
    tailored.experience.map((item) => item.dates).filter(Boolean),
    'dates',
    blockingIssues,
    unsupportedClaims,
  );
  validateExactField(source.certifications, tailored.certifications, 'certification', blockingIssues, unsupportedClaims);
  validateSupportedField(source.skills, tailored.skills, 'skill', warnings, unsupportedClaims, 'warning');

  if (tailored.summary && source.summary) {
    const normalizedSummary = sanitizeKeyword(tailored.summary);
    const sourceSummary = sanitizeKeyword(source.summary);
    if (normalizedSummary && sourceSummary && !normalizedSummary.includes(sourceSummary.slice(0, Math.min(40, sourceSummary.length)))) {
      warnings.push({
        code: 'SUMMARY_REWRITE_REVIEW',
        message: 'The summary was significantly rewritten. Review for factual fidelity.',
        severity: 'warning',
        field: 'summary',
      });
    }
  }

  if (tailored.headlineSourceProvenanceIds && !tailored.headlineSourceProvenanceIds.every((id) => provenanceIds.has(id))) {
    blockingIssues.push({
      code: 'HEADLINE_PROVENANCE_MISSING',
      message: 'The tailored headline contains missing provenance links.',
      severity: 'blocking',
      field: 'headline',
    });
  }

  tailored.highlightMetrics?.forEach((metric, metricIndex) => {
    if (!metric.sourceProvenanceIds.every((id) => provenanceIds.has(id))) {
      blockingIssues.push({
        code: 'METRIC_PROVENANCE_MISSING',
        message: `Highlight metric ${metricIndex + 1} contains missing provenance links.`,
        severity: 'blocking',
        field: `highlightMetrics.${metricIndex}`,
      });
    }

    const provenanceClaims = metric.sourceProvenanceIds
      .map((id) => sourceProvenanceById.get(id) ?? '')
      .filter(Boolean);
    const globallySupportedMetricValue = valueSupported(
      [...source.highlightMetrics.map((sourceMetric) => sourceMetric.value), ...source.sourceProvenance.map((item) => item.text)],
      metric.value,
    );

    if (!valueSupported(provenanceClaims, metric.value) && !globallySupportedMetricValue) {
      blockingIssues.push({
        code: 'UNSUPPORTED_FIELD_VALUE',
        message: `Unsupported highlight metric value detected: ${metric.value}`,
        severity: 'blocking',
        field: `highlightMetrics.${metricIndex}.value`,
      });
      unsupportedClaims.push(metric.value);
    }
  });

  tailored.skillCategories?.forEach((category, categoryIndex) => {
    if (!category.sourceProvenanceIds.every((id) => provenanceIds.has(id))) {
      blockingIssues.push({
        code: 'SKILL_CATEGORY_PROVENANCE_MISSING',
        message: `Skill category ${categoryIndex + 1} contains missing provenance links.`,
        severity: 'blocking',
        field: `skillCategories.${categoryIndex}`,
      });
    }
  });

  tailored.experience.forEach((item, itemIndex) => {
    if (!item.sourceProvenanceIds.every((id) => provenanceIds.has(id))) {
      blockingIssues.push({
        code: 'EXPERIENCE_PROVENANCE_MISSING',
        message: `Experience entry ${itemIndex + 1} contains missing provenance links.`,
        severity: 'blocking',
        field: `experience.${itemIndex}`,
      });
    }

    item.bullets.forEach((bullet, bulletIndex) => {
      if (!bullet.sourceProvenanceIds.every((id) => provenanceIds.has(id))) {
        blockingIssues.push({
          code: 'BULLET_PROVENANCE_MISSING',
          message: `Experience bullet ${bulletIndex + 1} in entry ${itemIndex + 1} contains missing provenance links.`,
          severity: 'blocking',
          field: `experience.${itemIndex}.bullets.${bulletIndex}`,
        });
      }
      if (!bulletSupported(sourceClaims, bullet.text)) {
        blockingIssues.push({
          code: 'UNSUPPORTED_BULLET_CLAIM',
          message: `Unsupported experience claim detected: ${bullet.text}`,
          severity: 'blocking',
          field: `experience.${itemIndex}.bullets.${bulletIndex}`,
        });
        unsupportedClaims.push(bullet.text);
      }
    });
  });

  tailored.projects.forEach((item, itemIndex) => {
    item.bullets.forEach((bullet, bulletIndex) => {
      if (!bulletSupported(sourceClaims, bullet.text)) {
        blockingIssues.push({
          code: 'UNSUPPORTED_PROJECT_CLAIM',
          message: `Unsupported project claim detected: ${bullet.text}`,
          severity: 'blocking',
          field: `projects.${itemIndex}.bullets.${bulletIndex}`,
        });
        unsupportedClaims.push(bullet.text);
      }
    });
  });

  if (templateProfile.preservationStatus !== 'fully_preserved') {
    warnings.push({
      code: 'DOCX_STYLE_FALLBACK',
      message: 'The reference document layout required a rendering fallback.',
      severity: 'warning',
      field: 'templateProfile',
    });
  }

  return {
    isValid: blockingIssues.length === 0,
    blockingIssues,
    warnings,
    unsupportedClaims: unique(unsupportedClaims),
    formattingFallbackUsed: templateProfile.preservationStatus !== 'fully_preserved',
  };
}
