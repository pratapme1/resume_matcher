/**
 * Generates the sample DOCX fixture required by tests.
 * Run: node scripts/generate-sample-resume.mjs
 */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType,
} from 'docx';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'Vishnu_Resume_HPE_IoT.docx');

const doc = new Document({
  sections: [{
    children: [
      // Name
      new Paragraph({
        children: [new TextRun({ text: 'VISHNU PRATAP KUMAR', bold: true, size: 32 })],
        alignment: AlignmentType.CENTER,
      }),
      // Contact
      new Paragraph({
        children: [
          new TextRun('vishnupratapkumar@gmail.com | +91 91489 69183 | Bengaluru, India'),
        ],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ children: [new TextRun('')] }),

      // Summary
      new Paragraph({ text: 'PROFESSIONAL SUMMARY', heading: HeadingLevel.HEADING_2 }),
      new Paragraph({
        children: [new TextRun(
          'IoT Product Manager with 10+ years of experience in technology leadership, enterprise software, automation, and AI platforms. ' +
          'Proven track record of delivering AI-first solutions at scale across enterprise environments.'
        )],
      }),
      new Paragraph({ children: [new TextRun('')] }),

      // Experience
      new Paragraph({ text: 'EXPERIENCE', heading: HeadingLevel.HEADING_2 }),

      new Paragraph({
        children: [new TextRun({ text: 'Dell Technologies (via UST Global)', bold: true })],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Product Manager — Enterprise Software, Automation & AI Platforms', italics: true }),
          new TextRun('  |  May 2022 – Present  |  Bengaluru, India'),
        ],
      }),
      new Paragraph({
        children: [new TextRun(
          '• Led product strategy for AI-powered Software Management Center launched to 100K+ Dell employees (20K MAU), ' +
          'directly supporting a CIO initiative to reduce software titles from 12K to 2K with projected $300–400M in savings.'
        )],
      }),
      new Paragraph({
        children: [new TextRun(
          '• Delivered AI-first self-service platform using open-source LLM with RAG architecture over 365K assets ' +
          'via REST API integrations across multiple internal enterprise systems.'
        )],
      }),
      new Paragraph({
        children: [new TextRun(
          '• Managed cross-functional teams of 12 engineers across 3 time zones. Reduced deployment cycle from 6 weeks to 2 weeks.'
        )],
      }),
      new Paragraph({ children: [new TextRun('')] }),

      new Paragraph({
        children: [new TextRun({ text: 'Hewlett Packard Enterprise (HPE)', bold: true })],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Senior Product Manager — IoT & Edge Computing', italics: true }),
          new TextRun('  |  Jun 2018 – Apr 2022  |  Bengaluru, India'),
        ],
      }),
      new Paragraph({
        children: [new TextRun(
          '• Owned end-to-end product lifecycle for HPE IoT edge platform deployed across 200+ enterprise customers.'
        )],
      }),
      new Paragraph({
        children: [new TextRun(
          '• Defined OKRs, roadmaps, and go-to-market strategy for three product lines generating $45M ARR.'
        )],
      }),
      new Paragraph({ children: [new TextRun('')] }),

      new Paragraph({
        children: [new TextRun({ text: 'Wipro Technologies', bold: true })],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Product Manager', italics: true }),
          new TextRun('  |  Aug 2014 – May 2018  |  Bengaluru, India'),
        ],
      }),
      new Paragraph({
        children: [new TextRun(
          '• Built and launched B2B SaaS products for manufacturing and logistics verticals. 0-to-1 product delivery for 3 clients.'
        )],
      }),
      new Paragraph({ children: [new TextRun('')] }),

      // Skills
      new Paragraph({ text: 'SKILLS', heading: HeadingLevel.HEADING_2 }),
      new Paragraph({
        children: [new TextRun(
          'Product Strategy · OKR Framework · AI/ML Product Management · IoT · Edge Computing · LLM/RAG · REST APIs · ' +
          'Agile/Scrum · Roadmapping · Stakeholder Management · Data Analytics · SQL · Tableau · Jira · Confluence'
        )],
      }),
      new Paragraph({ children: [new TextRun('')] }),

      // Education
      new Paragraph({ text: 'EDUCATION', heading: HeadingLevel.HEADING_2 }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Indian Institute of Technology (IIT), Delhi', bold: true }),
          new TextRun('  —  B.Tech, Computer Science  |  2010–2014'),
        ],
      }),
    ],
  }],
});

const buffer = await Packer.toBuffer(doc);
await writeFile(outPath, buffer);
console.log(`Generated: ${outPath} (${buffer.length} bytes)`);
