import path from 'node:path';

export function fixturePath(name: string): string {
  return path.join(process.cwd(), 'tests', 'fixtures', name);
}

export function sampleResumePath(): string {
  return path.join(process.cwd(), 'Vishnu_Resume_HPE_IoT.docx');
}
