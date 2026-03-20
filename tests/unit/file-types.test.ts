import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { detectFileKind, isDocxUpload } from '../../server/file-types.ts';
import { sampleResumePath } from '../helpers/fixture-path.ts';

describe('file type detection', () => {
  it('accepts docx uploads when multipart mime is octet-stream', () => {
    const buffer = readFileSync(sampleResumePath());
    expect(detectFileKind('application/octet-stream', 'resume.docx', buffer)).toBe('docx');
    expect(isDocxUpload('application/octet-stream', 'resume.docx', buffer)).toBe(true);
  });
});
