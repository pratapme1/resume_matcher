import type {
  ResumeTemplateProfile,
  TailoredExperienceItem,
  TailoredResumeDocument,
} from '../src/shared/types.ts';
import { normalizeSectionTitle, normalizeWhitespace } from './utils.ts';

type XmlNode = {
  childNodes?: XmlNode[];
  getAttribute?: (name: string) => string | null;
  getElementsByTagName?: (name: string) => XmlNode[];
  nodeName: string;
  nodeType?: number;
  ownerDocument?: XmlDocument;
  appendChild?: (child: XmlNode) => XmlNode;
  cloneNode?: (deep?: boolean) => XmlNode;
  createTextNode?: (data: string) => XmlNode;
  insertBefore?: (newChild: XmlNode, refChild: XmlNode | null) => XmlNode;
  removeAttribute?: (name: string) => void;
  removeChild?: (child: XmlNode) => XmlNode;
  setAttribute?: (name: string, value: string) => void;
  textContent?: string | null;
};

type XmlDocument = XmlNode & {
  createElement: (name: string) => XmlNode;
};

type SectionName =
  | 'certifications'
  | 'education'
  | 'experience'
  | 'projects'
  | 'skills'
  | 'summary';

type TemplateSection = {
  content: XmlNode[];
  heading: XmlNode;
  name: SectionName;
};

function asArray<T>(value: ArrayLike<T> | undefined | null): T[] {
  return value ? Array.from(value) : [];
}

function elementChildren(node: XmlNode): XmlNode[] {
  return asArray(node.childNodes).filter((child) => child.nodeType === 1);
}

function directChildrenByName(node: XmlNode, nodeName: string): XmlNode[] {
  return elementChildren(node).filter((child) => child.nodeName === nodeName);
}

function getParagraphText(node: XmlNode): string {
  if (!node.getElementsByTagName) return '';
  return normalizeWhitespace(
    asArray(node.getElementsByTagName('w:t'))
      .map((textNode) => textNode.textContent ?? '')
      .join(''),
  );
}

function isParagraph(node: XmlNode): boolean {
  return node.nodeName === 'w:p';
}

function isSectionProperties(node: XmlNode): boolean {
  return node.nodeName === 'w:sectPr';
}

function looksLikeContactParagraphText(text: string): boolean {
  return /@|linkedin|github|portfolio|https?:\/\//i.test(text) || /(?:\+\d{1,3}[\s-]*)?(?:\d[\s-]*){8,14}/.test(text);
}

function paragraphHasListStyle(paragraph: XmlNode): boolean {
  return Boolean(paragraph.getElementsByTagName?.('w:numPr')?.length);
}

function classifySectionHeading(text: string): SectionName | null {
  const normalized = normalizeSectionTitle(text);

  if (normalized === 'summary' || normalized === 'professional summary') return 'summary';
  if (normalized === 'experience' || normalized === 'work experience' || normalized === 'employment history') {
    return 'experience';
  }
  if (normalized.includes('project')) return 'projects';
  if (normalized === 'skills' || normalized === 'technical skills') return 'skills';
  if (normalized === 'education') return 'education';
  if (normalized.includes('certification')) return 'certifications';
  return null;
}

function clearNodeChildren(node: XmlNode) {
  for (const child of [...elementChildren(node), ...asArray(node.childNodes).filter((child) => child.nodeType !== 1)]) {
    node.removeChild?.(child);
  }
}

function cloneNode(node: XmlNode): XmlNode {
  return node.cloneNode?.(true) as XmlNode;
}

function textRunTemplates(paragraph: XmlNode): XmlNode[] {
  return elementChildren(paragraph).filter((child) => child.nodeName === 'w:r');
}

function createRunTemplate(document: XmlDocument): XmlNode {
  const run = document.createElement('w:r');
  const text = document.createElement('w:t');
  run.appendChild?.(text);
  return run;
}

function setRunText(run: XmlNode, text: string) {
  const document = run.ownerDocument as XmlDocument | undefined;
  if (!document) return;

  const properties = elementChildren(run).find((child) => child.nodeName === 'w:rPr');
  clearNodeChildren(run);
  if (properties) {
    run.appendChild?.(properties);
  }

  const textNode = document.createElement('w:t');
  if (/^\s|\s$/.test(text)) {
    textNode.setAttribute?.('xml:space', 'preserve');
  } else {
    textNode.removeAttribute?.('xml:space');
  }
  textNode.appendChild?.(document.createTextNode?.(text) as XmlNode);
  run.appendChild?.(textNode);
}

function setParagraphSegments(paragraph: XmlNode, segments: string[]) {
  const document = paragraph.ownerDocument as XmlDocument | undefined;
  if (!document) return;

  const paragraphProperties = elementChildren(paragraph).find((child) => child.nodeName === 'w:pPr');
  const runTemplates = textRunTemplates(paragraph);
  const fallbackRun = cloneNode(runTemplates[0] ?? createRunTemplate(document));
  const normalizedSegments = segments.map((segment) => segment ?? '').filter((segment) => segment.length > 0);

  clearNodeChildren(paragraph);
  if (paragraphProperties) {
    paragraph.appendChild?.(paragraphProperties);
  }

  for (const [index, segment] of (normalizedSegments.length ? normalizedSegments : ['']).entries()) {
    const runTemplate = cloneNode(runTemplates[index] ?? fallbackRun);
    setRunText(runTemplate, segment);
    paragraph.appendChild?.(runTemplate);
  }
}

function setParagraphText(paragraph: XmlNode, text: string) {
  setParagraphSegments(paragraph, [text]);
}

function cloneParagraphWithSegments(templateParagraph: XmlNode, segments: string[]): XmlNode {
  const paragraph = cloneNode(templateParagraph);
  setParagraphSegments(paragraph, segments);
  return paragraph;
}

function cloneParagraphWithText(templateParagraph: XmlNode, text: string): XmlNode {
  return cloneParagraphWithSegments(templateParagraph, [text]);
}

function splitSummaryIntoParagraphs(summary: string, maxParagraphs: number): string[] {
  const explicitParagraphs = summary
    .split(/\n\s*\n/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

  if (explicitParagraphs.length > 0) {
    if (maxParagraphs <= 1) {
      return [explicitParagraphs.join(' ')];
    }

    if (explicitParagraphs.length <= maxParagraphs) {
      return explicitParagraphs;
    }

    const [first, ...rest] = explicitParagraphs;
    return [first, rest.join(' ')].filter(Boolean).slice(0, maxParagraphs);
  }

  const sentences = summary.match(/[^.!?]+[.!?]?/g)?.map((part) => normalizeWhitespace(part))?.filter(Boolean) ?? [];
  if (sentences.length <= 1 || maxParagraphs <= 1) {
    return [normalizeWhitespace(summary)];
  }

  const paragraphCount = Math.min(maxParagraphs, sentences.length);
  const chunks: string[][] = [];
  let cursor = 0;

  for (let index = 0; index < paragraphCount; index += 1) {
    const remainingParagraphs = paragraphCount - index;
    const remainingSentences = sentences.length - cursor;
    const chunkSize = Math.ceil(remainingSentences / remainingParagraphs);
    chunks.push(sentences.slice(cursor, cursor + chunkSize));
    cursor += chunkSize;
  }

  return chunks.map((chunk) => chunk.join(' ')).filter(Boolean);
}

function findBodyNode(document: XmlDocument): XmlNode | null {
  return document.getElementsByTagName?.('w:body')?.[0] ?? null;
}

function buildTemplateSections(body: XmlNode): {
  preamble: XmlNode[];
  sections: TemplateSection[];
  sectionProperties: XmlNode | null;
} {
  const preamble: XmlNode[] = [];
  const sections: TemplateSection[] = [];
  let currentSection: TemplateSection | null = null;
  let sectionProperties: XmlNode | null = null;

  for (const child of elementChildren(body)) {
    if (isSectionProperties(child)) {
      sectionProperties = cloneNode(child);
      continue;
    }

    if (isParagraph(child)) {
      const sectionName = classifySectionHeading(getParagraphText(child));
      if (sectionName) {
        currentSection = {
          content: [],
          heading: cloneNode(child),
          name: sectionName,
        };
        sections.push(currentSection);
        continue;
      }
    }

    if (currentSection) {
      currentSection.content.push(cloneNode(child));
    } else {
      preamble.push(cloneNode(child));
    }
  }

  return { preamble, sectionProperties, sections };
}

function paragraphNodes(nodes: XmlNode[]): XmlNode[] {
  return nodes.filter(isParagraph);
}

function buildPreambleNodes(preamble: XmlNode[], tailoredResume: TailoredResumeDocument): XmlNode[] {
  const nodes = preamble.map(cloneNode);
  const nonEmptyParagraphs = nodes
    .map((node, index) => ({ index, node, text: isParagraph(node) ? getParagraphText(node) : '' }))
    .filter((entry) => entry.text);

  if (tailoredResume.headline?.trim()) {
    const headlineEntry = nonEmptyParagraphs.find(
      (entry, index) => index > 0 && !looksLikeContactParagraphText(entry.text),
    );
    if (headlineEntry) {
      setParagraphText(headlineEntry.node, tailoredResume.headline.trim());
    }
  }

  const metrics = tailoredResume.highlightMetrics?.filter((metric) => metric.value && metric.label) ?? [];
  if (metrics.length > 0) {
    const metricsTable = nodes.find((node) => node.nodeName === 'w:tbl');
    const firstRow = metricsTable ? directChildrenByName(metricsTable, 'w:tr')[0] : null;
    const cells = firstRow ? directChildrenByName(firstRow, 'w:tc') : [];

    cells.forEach((cell, index) => {
      const metric = metrics[index];
      if (!metric) return;
      const paragraphs = directChildrenByName(cell, 'w:p');
      if (paragraphs[0]) setParagraphText(paragraphs[0], metric.value);
      if (paragraphs[1]) setParagraphText(paragraphs[1], metric.label);
    });
  }

  return nodes;
}

function buildSummaryNodes(section: TemplateSection, summary: string): XmlNode[] {
  const templates = paragraphNodes(section.content).filter((paragraph) => getParagraphText(paragraph));
  if (!summary.trim() || templates.length === 0) {
    return section.content.map(cloneNode);
  }

  const chunks = splitSummaryIntoParagraphs(summary, templates.length);
  return chunks.map((chunk, index) => cloneParagraphWithText(templates[Math.min(index, templates.length - 1)], chunk));
}

function findExperienceTemplates(content: XmlNode[]) {
  const paragraphs = paragraphNodes(content).filter((paragraph) => getParagraphText(paragraph));
  const bulletTemplate = paragraphs.find(paragraphHasListStyle) ?? paragraphs[0];

  let companyTemplate: XmlNode | undefined;
  let roleTemplate: XmlNode | undefined;

  for (const paragraph of paragraphs) {
    if (paragraphHasListStyle(paragraph)) continue;
    if (!companyTemplate) {
      companyTemplate = paragraph;
      continue;
    }
    roleTemplate = paragraph;
    break;
  }

  return {
    bulletTemplate: bulletTemplate ?? companyTemplate ?? content[0],
    companyTemplate: companyTemplate ?? bulletTemplate ?? content[0],
    roleTemplate: roleTemplate ?? companyTemplate ?? bulletTemplate ?? content[0],
  };
}

function buildExperienceParagraphs(
  templates: ReturnType<typeof findExperienceTemplates>,
  experience: TailoredExperienceItem[],
): XmlNode[] {
  const nodes: XmlNode[] = [];

  for (const item of experience) {
    nodes.push(
      cloneParagraphWithSegments(templates.companyTemplate, [
        item.company,
        item.dates ? `   |   ${item.dates}` : '',
      ]),
    );

    if (item.title || item.location) {
      nodes.push(
        cloneParagraphWithSegments(templates.roleTemplate, [
          item.title,
          item.location ? `   ·   ${item.location}` : '',
        ]),
      );
    }

    const bullets = item.bullets.length > 0 ? item.bullets : [{ text: '', sourceProvenanceIds: [] }];
    for (const bullet of bullets) {
      nodes.push(cloneParagraphWithText(templates.bulletTemplate, bullet.text));
    }
  }

  return nodes;
}

function buildExperienceNodes(section: TemplateSection, experience: TailoredExperienceItem[]): XmlNode[] {
  if (experience.length === 0 || section.content.length === 0) {
    return section.content.map(cloneNode);
  }

  const templates = findExperienceTemplates(section.content);
  return buildExperienceParagraphs(templates, experience);
}

function buildSkillsNodes(section: TemplateSection, tailoredResume: TailoredResumeDocument): XmlNode[] {
  const categories =
    tailoredResume.skillCategories?.filter((category) => category.label && category.items.length > 0) ?? [];

  if (categories.length === 0) {
    return section.content.map(cloneNode);
  }

  const templates = paragraphNodes(section.content).filter((paragraph) => getParagraphText(paragraph));
  if (templates.length === 0) {
    return section.content.map(cloneNode);
  }

  return categories.map((category, index) =>
    cloneParagraphWithSegments(templates[Math.min(index, templates.length - 1)], [
      `${category.label}: `,
      category.items.join('  ·  '),
    ]),
  );
}

function buildTemplateSectionContent(section: TemplateSection, tailoredResume: TailoredResumeDocument): XmlNode[] {
  if (section.name === 'summary') {
    return buildSummaryNodes(section, tailoredResume.summary);
  }

  if (section.name === 'experience') {
    return buildExperienceNodes(section, tailoredResume.experience);
  }

  if (section.name === 'skills') {
    return buildSkillsNodes(section, tailoredResume);
  }

  return section.content.map(cloneNode);
}

async function generateTemplateBasedDocx(
  tailoredResume: TailoredResumeDocument,
  templateProfile: ResumeTemplateProfile,
): Promise<Buffer> {
  const templateBuffer = Buffer.from(templateProfile.templateDocxBase64 ?? '', 'base64');
  const JSZipModule = await import('jszip');
  const xmldom = await import('@xmldom/xmldom');
  const JSZip = (JSZipModule as any).default ?? JSZipModule;
  const zip = await JSZip.loadAsync(templateBuffer);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) {
    throw new Error('Template DOCX is missing word/document.xml.');
  }

  const documentXml = await documentFile.async('string');
  const parser = new xmldom.DOMParser();
  const serializer = new xmldom.XMLSerializer();
  const document = parser.parseFromString(documentXml, 'text/xml') as unknown as XmlDocument;
  const body = findBodyNode(document);
  if (!body) {
    throw new Error('Template DOCX is missing the body node.');
  }

  const { preamble, sectionProperties, sections } = buildTemplateSections(body);
  const rebuiltNodes: XmlNode[] = buildPreambleNodes(preamble, tailoredResume);

  for (const section of sections) {
    rebuiltNodes.push(cloneNode(section.heading));
    rebuiltNodes.push(...buildTemplateSectionContent(section, tailoredResume));
  }

  if (sectionProperties) {
    rebuiltNodes.push(sectionProperties);
  }

  clearNodeChildren(body);
  for (const node of rebuiltNodes) {
    body.appendChild?.(node);
  }

  zip.file('word/document.xml', serializer.serializeToString(document as unknown as Node));
  return (await zip.generateAsync({ type: 'nodebuffer' })) as Buffer;
}

async function generateGenericDocx(
  tailoredResume: TailoredResumeDocument,
  templateProfile: ResumeTemplateProfile,
): Promise<Buffer> {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TabStopPosition,
    TabStopType,
    TextRun,
    WidthType,
  } = await import('docx');

  const baseFont = templateProfile.fonts[0] || 'Arial';
  const bodySize = templateProfile.fontSizes[0] || 21;
  const headingSize = templateProfile.sectionHeadingStyle.size || bodySize + 2;
  const highlightMetrics = tailoredResume.highlightMetrics?.filter((metric) => metric.value && metric.label).slice(0, 4) ?? [];
  const summaryParagraphs = splitSummaryIntoParagraphs(tailoredResume.summary, 2);

  const createSectionHeader = (text: string) =>
    new Paragraph({
      text: templateProfile.sectionHeadingStyle.uppercase ? text.toUpperCase() : text,
      heading: HeadingLevel.HEADING_2,
      border: {
        bottom: { color: 'auto', space: 1, style: BorderStyle.SINGLE, size: 12 },
      },
      spacing: {
        before: templateProfile.paragraphSpacing.before ?? 240,
        after: templateProfile.paragraphSpacing.after ?? 120,
      },
    });

  const highlightMetricTable =
    highlightMetrics.length > 0
      ? [
          new Table({
            width: {
              size: 9360,
              type: WidthType.DXA,
            },
            rows: [
              new TableRow({
                children: highlightMetrics.map(
                  (metric) =>
                    new TableCell({
                      width: {
                        size: 2340,
                        type: WidthType.DXA,
                      },
                      shading: {
                        fill: 'EAF0FB',
                      },
                      borders: {
                        top: { color: '2E5FA3', size: 6, style: BorderStyle.SINGLE },
                        bottom: { color: '2E5FA3', size: 6, style: BorderStyle.SINGLE },
                        left: { color: 'FFFFFF', size: 0, style: BorderStyle.NONE },
                        right: { color: 'FFFFFF', size: 0, style: BorderStyle.NONE },
                      },
                      margins: {
                        top: 100,
                        bottom: 100,
                        left: 120,
                        right: 120,
                      },
                      children: [
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          spacing: { after: 20 },
                          children: [new TextRun({ text: metric.value, bold: true, color: '1F3864', size: 22 })],
                        }),
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [new TextRun({ text: metric.label, color: '555555', size: 16 })],
                        }),
                      ],
                    }),
                ),
              }),
            ],
          }),
        ]
      : [];

  const sectionBlocks: Record<string, any[]> = {
    certifications:
      tailoredResume.certifications.length > 0
        ? [
            createSectionHeader('Certifications'),
            ...tailoredResume.certifications.map(
              (certification) =>
                new Paragraph({
                  text: certification,
                  bullet: { level: 0 },
                  spacing: { before: 60, after: 60 },
                }),
            ),
          ]
        : [],
    education:
      tailoredResume.education.length > 0
        ? [
            createSectionHeader('Education'),
            ...tailoredResume.education.flatMap((edu) => [
              new Paragraph({
                spacing: { before: 120 },
                tabStops: [
                  {
                    type: TabStopType.RIGHT,
                    position: templateProfile.tabStops[0] || TabStopPosition.MAX,
                  },
                ],
                children: [
                  new TextRun({ text: edu.institution, bold: true }),
                  new TextRun({ text: `\t${edu.location || ''}` }),
                ],
              }),
              new Paragraph({
                spacing: { after: 120 },
                tabStops: [
                  {
                    type: TabStopType.RIGHT,
                    position: templateProfile.tabStops[0] || TabStopPosition.MAX,
                  },
                ],
                children: [
                  new TextRun({ text: edu.degree }),
                  new TextRun({ text: `\t${edu.dates || ''}`, italics: true }),
                ],
              }),
            ]),
          ]
        : [],
    experience:
      tailoredResume.experience.length > 0
        ? [
            createSectionHeader('Experience'),
            ...tailoredResume.experience.flatMap((exp) => [
              new Paragraph({
                spacing: { before: 120 },
                tabStops: [
                  {
                    type: TabStopType.RIGHT,
                    position: templateProfile.tabStops[0] || TabStopPosition.MAX,
                  },
                ],
                children: [
                  new TextRun({ text: exp.title, bold: true, size: headingSize }),
                  new TextRun({ text: `\t${exp.dates}` }),
                ],
              }),
              new Paragraph({
                spacing: { after: 120 },
                tabStops: [
                  {
                    type: TabStopType.RIGHT,
                    position: templateProfile.tabStops[0] || TabStopPosition.MAX,
                  },
                ],
                children: [
                  new TextRun({ text: exp.company, bold: true }),
                  new TextRun({ text: `\t${exp.location || ''}`, italics: true }),
                ],
              }),
              ...exp.bullets.map(
                (bullet) =>
                  new Paragraph({
                    text: bullet.text,
                    bullet: { level: 0 },
                    spacing: { before: 60, after: 60 },
                  }),
              ),
            ]),
          ]
        : [],
    projects:
      tailoredResume.projects.length > 0
        ? [
            createSectionHeader('Projects'),
            ...tailoredResume.projects.flatMap((project) => [
              new Paragraph({
                spacing: { before: 120, after: 120 },
                children: [
                  new TextRun({ text: project.name, bold: true, size: headingSize }),
                  ...(project.description ? [new TextRun({ text: ` - ${project.description}` })] : []),
                ],
              }),
              ...project.bullets.map(
                (bullet) =>
                  new Paragraph({
                    text: bullet.text,
                    bullet: { level: 0 },
                    spacing: { before: 60, after: 60 },
                  }),
              ),
            ]),
          ]
        : [],
    skills:
      tailoredResume.skillCategories?.length
        ? [
            createSectionHeader('Skills & Technologies'),
            ...tailoredResume.skillCategories.map(
              (category, index) =>
                new Paragraph({
                  spacing: { before: index === 0 ? 60 : 0, after: 28 },
                  children: [
                    new TextRun({ text: `${category.label}: `, bold: true }),
                    new TextRun({ text: category.items.join('  ·  ') }),
                  ],
                }),
            ),
          ]
        : tailoredResume.skills.length > 0
          ? [
              createSectionHeader('Skills & Technologies'),
              new Paragraph({
                spacing: { after: 120 },
                children: [new TextRun({ text: tailoredResume.skills.join(', ') })],
              }),
            ]
          : [],
    summary: summaryParagraphs.length > 0
      ? [
          createSectionHeader('Professional Summary'),
          ...summaryParagraphs.map(
            (paragraph, index) =>
              new Paragraph({
                spacing: {
                  before: index === 0 ? 0 : 40,
                  after: templateProfile.paragraphSpacing.after ?? 120,
                },
                children: [new TextRun({ text: paragraph })],
              }),
          ),
        ]
      : [],
  };

  const orderedSections = tailoredResume.sectionOrder.length
    ? tailoredResume.sectionOrder
    : ['summary', 'experience', 'projects', 'education', 'skills', 'certifications'];

  const document = new Document({
    styles: {
      default: {
        document: {
          run: {
            color: '1f2937',
            font: baseFont,
            size: bodySize,
          },
        },
        heading2: {
          run: {
            bold: templateProfile.sectionHeadingStyle.bold ?? true,
            color: '111827',
            font: baseFont,
            size: headingSize,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: templateProfile.margins,
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [new TextRun({ text: tailoredResume.contactInfo.name || '', bold: true, size: headingSize + 12 })],
          }),
          ...(tailoredResume.headline?.trim()
            ? [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 40 },
                  children: [new TextRun({ text: tailoredResume.headline.trim(), color: '444444', size: 19 })],
                }),
              ]
            : []),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            children: [
              new TextRun({
                text: [
                  tailoredResume.contactInfo.email,
                  tailoredResume.contactInfo.phone,
                  tailoredResume.contactInfo.location,
                  tailoredResume.contactInfo.linkedin,
                ]
                  .filter(Boolean)
                  .join('  |  '),
              }),
            ],
          }),
          ...highlightMetricTable,
          ...orderedSections.flatMap((section) => sectionBlocks[section] ?? []),
        ],
      },
    ],
  });

  return Packer.toBuffer(document);
}

export async function generateTailoredDocx(
  tailoredResume: TailoredResumeDocument,
  templateProfile: ResumeTemplateProfile,
): Promise<Buffer> {
  if (templateProfile.templateDocxBase64) {
    try {
      return await generateTemplateBasedDocx(tailoredResume, templateProfile);
    } catch (error) {
      console.warn('Template-based DOCX render failed, falling back to generic renderer.', error);
    }
  }

  return generateGenericDocx(tailoredResume, templateProfile);
}
