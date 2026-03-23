import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AIClient } from '../../server/app.ts';

export class MockAIClient implements AIClient {
  private callCount = 0;

  constructor(private readonly fixtures: string[]) {}

  models = {
    generateContent: async () => {
      const fixture = this.fixtures[this.callCount] ?? this.fixtures[this.fixtures.length - 1];
      this.callCount++;
      const filePath = path.join(process.cwd(), 'tests', 'fixtures', fixture);
      const text = await readFile(filePath, 'utf8');
      return { text };
    },
  };
}
