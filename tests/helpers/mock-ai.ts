import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AIClient } from '../../server/app.ts';

export class MockAIClient implements AIClient {
  constructor(private readonly fixtureName: string) {}

  models = {
    generateContent: async () => {
      const filePath = path.join(process.cwd(), 'tests', 'fixtures', this.fixtureName);
      const text = await readFile(filePath, 'utf8');
      return { text };
    },
  };
}
