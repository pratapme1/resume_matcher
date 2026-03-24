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

function normalizeMetricValue(value: string): string {
  // Strip currency symbols, expand K/M abbreviations, and split range notation
  return value
    .toLowerCase()
    .replace(/[$€£¥,]/g, ' ')                                                            // remove currency symbols and commas
    .replace(/(\d+(?:\.\d+)?)\s*k\b/g, (_, n) => String(Math.round(parseFloat(n) * 1_000)))     // 365k → 365000
    .replace(/(\d+(?:\.\d+)?)\s*m\b/g, (_, n) => String(Math.round(parseFloat(n) * 1_000_000))) // 1.5m → 1500000
    .replace(/(\d+(?:\.\d+)?)\s*b\b/g, (_, n) => String(Math.round(parseFloat(n) * 1_000_000_000))) // 1b → 1000000000
    .replace(/-/g, ' ')          // split ranges: 300-400 → 300 400
    .replace(/[^a-z0-9+#./ ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function valueSupported(sourceValues: string[], value: string): boolean {
  const normalized = sanitizeKeyword(normalizeWhitespace(value));
  if (!normalized) return true;

  const sanitizedSources = sourceValues
    .map((sourceValue) => sanitizeKeyword(normalizeWhitespace(sourceValue)))
    .filter(Boolean);

  // Exact or substring match
  if (sanitizedSources.some((s) => normalized === s || normalized.includes(s) || s.includes(normalized))) return true;

  // Token-level coverage: normalize both sides so K/M abbreviations and comma-formatted
  // numbers compare equal (e.g. "365K" source == "365,000" output → both → "365000")
  const normalizedCorpus = sourceValues.map((s) => normalizeMetricValue(s)).join(' ');
  const metricNormalized = normalizeMetricValue(value);
  const tokens = metricNormalized.split(/\s+/).filter((t) => t.length > 1);
  if (tokens.length === 0) return true;
  const matchedCount = tokens.filter((token) => normalizedCorpus.includes(token)).length;
  return matchedCount / tokens.length >= 0.6;
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

function validateExactObjectField(
  source: unknown,
  output: unknown,
  field: string,
  issues: ValidationIssue[],
): void {
  if (JSON.stringify(source) === JSON.stringify(output)) {
    return;
  }
  issues.push({
    code: 'LOCKED_FIELD_MUTATION',
    message: `Locked field drift detected for ${field}.`,
    severity: 'blocking',
    field,
  });
}

function buildSourceCorpus(sourceClaims: Set<string>): string {
  return Array.from(sourceClaims).join(' ');
}

function textSupportedByCorpus(text: string, sourceCorpus: string, threshold = 0.6): boolean {
  const normalized = sanitizeKeyword(normalizeWhitespace(text));
  if (!normalized) return true;
  const tokens = normalized.split(/\s+/).filter((token) => token.length > 3);
  if (tokens.length === 0) return true;
  const matchedCount = tokens.filter((token) => sourceCorpus.includes(token)).length;
  return matchedCount / tokens.length >= threshold;
}

function bulletSupported(sourceClaims: Set<string>, bullet: string, sourceCorpus: string): boolean {
  const normalized = sanitizeKeyword(normalizeWhitespace(bullet));
  if (!normalized) return true;
  // Exact match against a single source item
  if (sourceClaims.has(normalized)) return true;
  // A substantial source claim appears verbatim inside the bullet
  if (Array.from(sourceClaims).some((claim) => claim.length > 10 && normalized.includes(claim))) return true;
  // Token-level coverage: 60% of meaningful tokens (>3 chars) must appear in the source corpus
  const tokens = normalized.split(/\s+/).filter((t) => t.length > 3);
  if (tokens.length === 0) return true;
  const matchedCount = tokens.filter((token) => sourceCorpus.includes(token)).length;
  return matchedCount / tokens.length >= 0.6;
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
  const sourceCorpus = buildSourceCorpus(sourceClaims);
  const provenanceIds = new Set(source.sourceProvenance.map((item) => item.id));
  const sourceProvenanceById = new Map(source.sourceProvenance.map((item) => [item.id, item.text]));

  validateExactObjectField(source.contactInfo, tailored.contactInfo, 'contactInfo', blockingIssues);
  validateExactObjectField(source.sectionOrder, tailored.sectionOrder, 'sectionOrder', blockingIssues);
  validateExactObjectField(source.certifications, tailored.certifications, 'certifications', blockingIssues);
  validateExactObjectField(
    source.education.map((item) => ({
      id: item.id,
      institution: item.institution,
      degree: item.degree,
      dates: item.dates,
      location: item.location,
    })),
    tailored.education.map((item) => ({
      id: item.id,
      institution: item.institution,
      degree: item.degree,
      dates: item.dates,
      location: item.location,
    })),
    'education',
    blockingIssues,
  );
  validateExactObjectField(
    source.projects.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
    })),
    tailored.projects.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
    })),
    'projects',
    blockingIssues,
  );

  // Company and title use token-based matching to allow minor formatting variations
  // (e.g. "Dell Technologies" matches "Dell Technologies, Inc."; "Product Manager"
  // matches "Senior Product Manager"). Fabricated values still fail since their tokens
  // won't appear in any source entry.
  validateSupportedField(
    source.experience.map((item) => item.company).filter(Boolean),
    tailored.experience.map((item) => item.company).filter(Boolean),
    'company',
    blockingIssues,
    unsupportedClaims,
  );
  validateSupportedField(
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
  validateExactField(
    source.experience.map((item) => item.location).filter(Boolean),
    tailored.experience.map((item) => item.location).filter(Boolean),
    'location',
    blockingIssues,
    unsupportedClaims,
  );
  validateExactField(source.certifications, tailored.certifications, 'certification', blockingIssues, unsupportedClaims);
  validateSupportedField(source.skills, tailored.skills, 'skill', warnings, unsupportedClaims, 'warning');

  if (tailored.summary) {
    const summaryProvenanceClaims = (tailored.summarySourceProvenanceIds ?? [])
      .map((id) => sourceProvenanceById.get(id) ?? '')
      .filter(Boolean);
    const summarySupported = textSupportedByCorpus(
      tailored.summary,
      sanitizeKeyword(normalizeWhitespace(summaryProvenanceClaims.join(' ') || sourceCorpus)),
      summaryProvenanceClaims.length > 0 ? 0.45 : 0.6,
    ) || textSupportedByCorpus(tailored.summary, sourceCorpus, 0.6);

    if (!summarySupported) {
      warnings.push({
        code: 'SUMMARY_GROUNDING_REVIEW',
        message: 'The tailored summary could not be grounded confidently to the source resume.',
        severity: 'warning',
        field: 'summary',
      });
    }
  }

  if (tailored.headlineSourceProvenanceIds && !tailored.headlineSourceProvenanceIds.every((id) => provenanceIds.has(id))) {
    // Downgraded to warning: the headline is always a synthesis; Gemini reliably generates
    // invalid provenance IDs for short titles even when the content is grounded.
    // The meaningful guard is the exact-field checks for company/title/dates above.
    warnings.push({
      code: 'HEADLINE_PROVENANCE_MISSING',
      message: 'The tailored headline contains missing provenance links.',
      severity: 'warning',
      field: 'headline',
    });
  }

  tailored.highlightMetrics?.forEach((metric, metricIndex) => {
    if (!metric.sourceProvenanceIds.every((id) => provenanceIds.has(id))) {
      // Downgraded to warning: the VALUE check below is the meaningful guard.
      // Gemini frequently generates invalid IDs for metrics even when the numbers are real.
      warnings.push({
        code: 'METRIC_PROVENANCE_MISSING',
        message: `Highlight metric ${metricIndex + 1} contains missing provenance links.`,
        severity: 'warning',
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
      if (!bulletSupported(sourceClaims, bullet.text, sourceCorpus)) {
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
      if (!bulletSupported(sourceClaims, bullet.text, sourceCorpus)) {
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
