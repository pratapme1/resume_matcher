import mammoth from 'mammoth';
import type {
  ContactInfo,
  ExtractionWarning,
  ResumeHighlightMetric,
  ResumeSection,
  ResumeSkillCategory,
  ResumeTemplateProfile,
  SourceProvenance,
  SourceResumeDocument,
} from '../src/shared/types.ts';
import { normalizeSectionTitle, normalizeWhitespace, splitLines, unique } from './utils.ts';

type XmlNode = {
  nodeName: string;
  childNodes?: XmlNode[];
  textContent?: string | null;
  getAttribute?: (name: string) => string | null;
  getElementsByTagName?: (name: string) => XmlNode[];
};

const SECTION_TITLES = [
  'summary',
  'professional summary',
  'experience',
  'work experience',
  'employment history',
  'education',
  'skills',
  'technical skills',
  'projects',
  'certifications',
];

export async function extractResumeText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function loadZipXml(buffer: Buffer, filename: string): Promise<string | null> {
  try {
    const JSZipModule = await import('jszip');
    const JSZip = (JSZipModule as any).default ?? JSZipModule;
    const zip = await JSZip.loadAsync(buffer);
    const file = zip.file(filename);
    if (!file) return null;
    return file.async('string');
  } catch {
    return null;
  }
}

async function parseXml(xml: string): Promise<XmlNode | null> {
  try {
    const xmldom = await import('@xmldom/xmldom');
    const parser = new xmldom.DOMParser();
    return parser.parseFromString(xml, 'text/xml') as unknown as XmlNode;
  } catch {
    return null;
  }
}

function collectParagraphsFromDocument(root: XmlNode | null): string[] {
  if (!root || !root.getElementsByTagName) return [];
  const paragraphs = Array.from(root.getElementsByTagName('w:p') ?? []);
  const results: string[] = [];

  for (const paragraph of paragraphs) {
    const texts = Array.from(paragraph.getElementsByTagName?.('w:t') ?? []);
    const content = Array.from(texts)
      .map((node) => node.textContent ?? '')
      .join('')
      .trim();
    if (content) results.push(content);
  }

  return results;
}

function detectSectionTitle(line: string): boolean {
  const normalized = normalizeSectionTitle(line);
  return SECTION_TITLES.includes(normalized) || /^[A-Z ]{4,}$/.test(line.trim());
}

function splitIntoSections(paragraphs: string[]): ResumeSection[] {
  const sections: ResumeSection[] = [];
  let current: ResumeSection | null = null;
  let sectionIndex = 0;

  for (const paragraph of paragraphs) {
    if (detectSectionTitle(paragraph)) {
      current = {
        id: `section-${sectionIndex++}`,
        title: paragraph.trim(),
        normalizedTitle: normalizeSectionTitle(paragraph),
        paragraphs: [],
      };
      sections.push(current);
      continue;
    }

    if (!current) {
      current = {
        id: `section-${sectionIndex++}`,
        title: sectionIndex === 1 ? 'Header' : `Section ${sectionIndex}`,
        normalizedTitle: sectionIndex === 1 ? 'header' : `section ${sectionIndex}`,
        paragraphs: [],
      };
      sections.push(current);
    }

    current.paragraphs.push(normalizeWhitespace(paragraph));
  }

  return sections;
}

function buildProvenance(sections: ResumeSection[]): SourceProvenance[] {
  const entries: SourceProvenance[] = [];

  sections.forEach((section) => {
    section.paragraphs.forEach((paragraph, index) => {
      entries.push({
        id: `${section.id}-p${index}`,
        section: section.normalizedTitle,
        path: `${section.normalizedTitle}.${index}`,
        text: paragraph,
      });
    });
  });

  return entries;
}

function provenanceIdsForText(provenance: SourceProvenance[], text: string): string[] {
  return provenance.filter((item) => item.text === text).map((item) => item.id);
}

function parseContactInfo(headerSection: ResumeSection | undefined): ContactInfo {
  const lines = headerSection?.paragraphs ?? [];
  const joined = lines.join(' ');
  const nameLine =
    (headerSection?.title && /^[A-Z][A-Z\s.]+$/.test(headerSection.title) ? headerSection.title : '') ||
    (lines.find((line) => /^[A-Z][A-Z\s.]+$/.test(line) && line.split(/\s+/).length >= 2) ??
      lines[0] ??
      '');
  const email = joined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)?.[0] ?? '';
  const phone = joined.match(/(?:\+\d{1,3}[\s-]*)?(?:\d[\s-]*){8,14}/)?.[0]?.replace(/\s+/g, ' ').trim() ?? '';
  const linkedin = joined.match(/(?:linkedin\.com\/[^\s|]+)/i)?.[0] ?? '';
  const locationLine =
    lines.find((line) => line.includes('·') && (/\bIndia\b|\bUSA\b|\bUnited States\b/i.test(line) || /,\s*[A-Z]{2}\b/.test(line))) ??
    lines.find((line) => /,\s*[A-Z]{2}\b/.test(line) || /\bIndia\b|\bUSA\b|\bUnited States\b/i.test(line)) ??
    '';
  const location =
    locationLine
      .split('·')
      .map((part) => part.trim())
      .find((part) => /,\s*[A-Z]{2}\b/.test(part) || /\bIndia\b|\bUSA\b|\bUnited States\b/i.test(part)) ?? '';
  return {
    name: nameLine,
    email,
    phone,
    linkedin,
    location,
  };
}

function looksLikeContactLine(line: string): boolean {
  return /@|linkedin|github|portfolio|www\.|https?:\/\//i.test(line) || /(?:\+\d{1,3}[\s-]*)?(?:\d[\s-]*){8,14}/.test(line);
}

function looksLikeMetricValue(line: string): boolean {
  return /\d/.test(line) || /[%$]/.test(line) || /\b(?:K|M|B)\+?\b/.test(line);
}

function inferHeadline(
  headerSection: ResumeSection | undefined,
  provenance: SourceProvenance[],
): Pick<SourceResumeDocument, 'headline' | 'headlineProvenanceIds'> {
  const lines = headerSection?.paragraphs ?? [];
  const headline = lines.find((line, index) => index === 0 && !looksLikeContactLine(line)) ?? '';

  return {
    headline,
    headlineProvenanceIds: headline ? provenanceIdsForText(provenance, headline) : [],
  };
}

function inferHighlightMetrics(
  headerSection: ResumeSection | undefined,
  provenance: SourceProvenance[],
): ResumeHighlightMetric[] {
  const lines = headerSection?.paragraphs ?? [];
  if (lines.length < 3) return [];

  const linkLineIndex = lines.findIndex((line) => /(linkedin|github|portfolio|website)/i.test(line));
  const metricStartIndex = linkLineIndex >= 0 ? linkLineIndex + 1 : 3;
  const metricLines = lines.slice(metricStartIndex).filter(Boolean);
  const metrics: ResumeHighlightMetric[] = [];

  for (let index = 0; index + 1 < metricLines.length; index += 2) {
    const value = metricLines[index] ?? '';
    const label = metricLines[index + 1] ?? '';
    if (!value || !label || !looksLikeMetricValue(value)) continue;

    metrics.push({
      value,
      label,
      provenanceIds: [...provenanceIdsForText(provenance, value), ...provenanceIdsForText(provenance, label)],
    });
  }

  return metrics;
}

function inferExperience(section: ResumeSection | undefined, provenance: SourceProvenance[]) {
  if (!section) return [];
  const items: SourceResumeDocument['experience'] = [];
  const lines = section.paragraphs;
  let current: SourceResumeDocument['experience'][number] | null = null;
  let index = 0;

  const isDateRange = (line: string) => /(?:19|20)\d{2}|\bPresent\b|\bCurrent\b/i.test(line);
  const isHeaderLine = (line: string) => line.includes('|') && isDateRange(line);
  const isRoleLine = (line: string) =>
    !line.startsWith('-') &&
    !line.startsWith('*') &&
    !line.startsWith('•') &&
    /(?:manager|engineer|lead|director|executive|architect|consultant|developer|specialist)/i.test(line);

  for (const line of lines) {
    const isBullet = /^[-*•]/.test(line);
    if (isHeaderLine(line)) {
      const parts = line.split('|').map((part) => part.trim()).filter(Boolean);
      const company = parts[0] ?? line;
      const dates = parts.slice(1).join(' | ');
      const prov = provenance.find((item) => item.text === line);
      current = {
        id: `exp-${index++}`,
        title: '',
        company,
        dates,
        location: '',
        bullets: [],
        provenanceIds: prov ? [prov.id] : [],
      };
      items.push(current);
      continue;
    }

    if (current && !isBullet && isRoleLine(line) && !current.title) {
      const [title, ...rest] = line.split('·').map((part) => part.trim()).filter(Boolean);
      current.title = title ?? '';
      current.location = rest.join(' · ');
      const prov = provenance.find((item) => item.text === line);
      if (prov) current.provenanceIds.push(prov.id);
      continue;
    }

    if (!current) {
      continue;
    }

    current.bullets.push(line.replace(/^[-*•]\s*/, ''));
    const prov = provenance.find((item) => item.text === line);
    if (prov) current.provenanceIds.push(prov.id);
  }

  return items;
}

function inferEducation(section: ResumeSection | undefined, provenance: SourceProvenance[]) {
  if (!section) return [];
  return section.paragraphs.map((line, index) => {
    const prov = provenance.find((item) => item.text === line);
    return {
      id: `edu-${index}`,
      institution: line.split('|')[0]?.trim() ?? line,
      degree: line.split('|')[1]?.trim() ?? '',
      dates: line.match(/(?:19|20)\d{2}[^|]*$/)?.[0]?.trim() ?? '',
      location: '',
      provenanceIds: prov ? [prov.id] : [],
    };
  });
}

function inferProjects(section: ResumeSection | undefined, provenance: SourceProvenance[]) {
  if (!section) return [];
  const items: SourceResumeDocument['projects'] = [];
  let current: SourceResumeDocument['projects'][number] | null = null;
  let index = 0;

  for (const line of section.paragraphs) {
    const prov = provenance.find((item) => item.text === line);
    if (!current || !/^[-*•]/.test(line)) {
      current = {
        id: `proj-${index++}`,
        name: line.replace(/^[-*•]\s*/, ''),
        description: '',
        bullets: [],
        provenanceIds: prov ? [prov.id] : [],
      };
      items.push(current);
      continue;
    }

    current.bullets.push(line.replace(/^[-*•]\s*/, ''));
    if (prov) current.provenanceIds.push(prov.id);
  }

  return items;
}

function inferSimpleList(section: ResumeSection | undefined): string[] {
  if (!section) return [];
  return unique(
    section.paragraphs
      .flatMap((line) => line.split(/[;,|·]/))
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function inferSkillCategories(
  section: ResumeSection | undefined,
  provenance: SourceProvenance[],
): ResumeSkillCategory[] {
  if (!section) return [];

  return section.paragraphs
    .map((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex < 0) return null;

      const label = normalizeWhitespace(line.slice(0, separatorIndex));
      const items = unique(
        line
          .slice(separatorIndex + 1)
          .split(/\s*[·|;]\s*/)
          .map((item) => normalizeWhitespace(item))
          .filter(Boolean),
      );

      if (!label || items.length === 0) return null;

      return {
        label,
        items,
        provenanceIds: provenanceIdsForText(provenance, line),
      };
    })
    .filter((category): category is ResumeSkillCategory => Boolean(category));
}

async function buildTemplateProfile(buffer: Buffer, paragraphs: string[]): Promise<ResumeTemplateProfile> {
  const docXml = await loadZipXml(buffer, 'word/document.xml');
  const stylesXml = await loadZipXml(buffer, 'word/styles.xml');
  const settingsXml = await loadZipXml(buffer, 'word/settings.xml');

  const fonts: string[] = [];
  const fontSizes: number[] = [];
  const tabStops: number[] = [];
  const margins = { top: 1440, right: 1440, bottom: 1440, left: 1440 };
  let headingBold = true;
  let layoutMode: ResumeTemplateProfile['layoutMode'] = 'single-column';
  let preservationStatus: ResumeTemplateProfile['preservationStatus'] = 'fully_preserved';

  const styleRoot = await parseXml(stylesXml ?? '');
  const documentRoot = await parseXml(docXml ?? '');

  if (styleRoot?.getElementsByTagName) {
    const runFonts = styleRoot.getElementsByTagName('w:rFonts') ?? [];
    Array.from(runFonts).forEach((node) => {
      const font = node.getAttribute?.('w:ascii') ?? node.getAttribute?.('ascii');
      if (font) fonts.push(font);
    });

    const sizeNodes = styleRoot.getElementsByTagName('w:sz') ?? [];
    Array.from(sizeNodes).forEach((node) => {
      const value = Number(node.getAttribute?.('w:val') ?? node.getAttribute?.('val'));
      if (!Number.isNaN(value)) fontSizes.push(value);
    });
  }

  if (documentRoot?.getElementsByTagName) {
    const tabNodes = documentRoot.getElementsByTagName('w:tab') ?? [];
    Array.from(tabNodes).forEach((node) => {
      const value = Number(node.getAttribute?.('w:pos') ?? node.getAttribute?.('pos'));
      if (!Number.isNaN(value)) tabStops.push(value);
    });

    const cols = documentRoot.getElementsByTagName('w:cols') ?? [];
    Array.from(cols).forEach((node) => {
      const num = Number(node.getAttribute?.('w:num') ?? node.getAttribute?.('num'));
      if (num > 1) {
        layoutMode = 'multi-column';
        preservationStatus = 'minor_fallback';
      }
    });

    const marginNode = documentRoot.getElementsByTagName('w:pgMar')?.[0];
    if (marginNode?.getAttribute) {
      margins.top = Number(marginNode.getAttribute('w:top') ?? marginNode.getAttribute('top') ?? margins.top);
      margins.right = Number(marginNode.getAttribute('w:right') ?? marginNode.getAttribute('right') ?? margins.right);
      margins.bottom = Number(marginNode.getAttribute('w:bottom') ?? marginNode.getAttribute('bottom') ?? margins.bottom);
      margins.left = Number(marginNode.getAttribute('w:left') ?? marginNode.getAttribute('left') ?? margins.left);
    }
  }

  return {
    fonts: unique(fonts).slice(0, 5),
    fontSizes: unique(fontSizes).sort((a, b) => a - b).slice(0, 6),
    templateDocxBase64: buffer.toString('base64'),
    sectionHeadingStyle: {
      font: fonts[0],
      size: fontSizes[fontSizes.length - 1],
      bold: headingBold,
      uppercase: paragraphs.some((line) => detectSectionTitle(line) && line === line.toUpperCase()),
    },
    paragraphSpacing: {
      before: 120,
      after: 120,
      line: 276,
    },
    bulletStyle: {
      type: paragraphs.some((line) => /^[-*•]/.test(line)) ? 'mixed' : 'unknown',
      indent: 360,
    },
    tabStops: unique(tabStops).slice(0, 5),
    margins,
    layoutMode,
    headerFooterPresence: Boolean(settingsXml),
    preservationStatus,
  };
}

export async function parseResumeDocx(buffer: Buffer): Promise<{
  resume: SourceResumeDocument;
  templateProfile: ResumeTemplateProfile;
}> {
  const text = await extractResumeText(buffer);
  const rawLines = splitLines(text);
  const documentXml = await loadZipXml(buffer, 'word/document.xml');
  const parsedXml = await parseXml(documentXml ?? '');
  const xmlParagraphs = collectParagraphsFromDocument(parsedXml);
  const paragraphs = xmlParagraphs.length > 0 ? xmlParagraphs : rawLines;
  const sections = splitIntoSections(paragraphs);
  const provenance = buildProvenance(sections);
  const headerSection = sections[0];
  const summarySection = sections.find((section) => ['summary', 'professional summary'].includes(section.normalizedTitle));
  const experienceSection = sections.find((section) => ['experience', 'work experience', 'employment history'].includes(section.normalizedTitle));
  const educationSection = sections.find((section) => section.normalizedTitle === 'education');
  const projectsSection = sections.find((section) => section.normalizedTitle === 'projects');
  const skillsSection = sections.find((section) => ['skills', 'technical skills'].includes(section.normalizedTitle));
  const certificationsSection = sections.find((section) => section.normalizedTitle === 'certifications');

  const parseWarnings: ExtractionWarning[] = [];
  if (!experienceSection) {
    parseWarnings.push({
      code: 'RESUME_EXPERIENCE_SECTION_MISSING',
      message: 'No explicit experience section was detected. Tailoring quality may be limited.',
      severity: 'warning',
    });
  }

  const templateProfile = await buildTemplateProfile(buffer, paragraphs);
  const { headline, headlineProvenanceIds } = inferHeadline(headerSection, provenance);
  const highlightMetrics = inferHighlightMetrics(headerSection, provenance);
  const skillCategories = inferSkillCategories(skillsSection, provenance);
  const fallbackSkills = inferSimpleList(skillsSection);

  return {
    resume: {
      contactInfo: parseContactInfo(headerSection),
      headline,
      headlineProvenanceIds,
      highlightMetrics,
      summary: summarySection?.paragraphs.join(' ') ?? '',
      experience: inferExperience(experienceSection, provenance),
      education: inferEducation(educationSection, provenance),
      projects: inferProjects(projectsSection, provenance),
      skills: skillCategories.length > 0 ? unique(skillCategories.flatMap((category) => category.items)) : fallbackSkills,
      skillCategories,
      certifications: inferSimpleList(certificationsSection),
      sectionOrder: sections
        .map((section) => section.normalizedTitle)
        .filter((normalizedTitle) => SECTION_TITLES.includes(normalizedTitle)),
      rawSections: sections,
      sourceProvenance: provenance,
      parseWarnings,
    },
    templateProfile,
  };
}
