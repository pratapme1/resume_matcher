import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { test as base, expect } from './extension-fixtures.ts';

type LocalAgentFixtures = {
  localAgentBaseUrl: string;
};

async function waitForHealth(url: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return true;
    } catch {
      // keep polling until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

const LOCAL_AGENT_PORT = 43111;
const LOCAL_AGENT_BASE_URL = `http://127.0.0.1:${LOCAL_AGENT_PORT}`;

export const test = base.extend<LocalAgentFixtures>({
  localAgentBaseUrl: async ({}, use) => {
    spawnSync('bash', ['-lc', `fuser -k ${LOCAL_AGENT_PORT}/tcp >/dev/null 2>&1 || true`], {
      cwd: process.cwd(),
      stdio: 'ignore',
    });
    let child: ChildProcessWithoutNullStreams | null = null;
    let userDataDir: string | null = null;

    userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rtp-local-agent-'));
    child = spawn('npx', ['tsx', 'local-agent/server.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        LOCAL_AGENT_HEADLESS: 'true',
        LOCAL_AGENT_PORT: String(LOCAL_AGENT_PORT),
        LOCAL_AGENT_USER_DATA_DIR: userDataDir,
      },
      stdio: 'pipe',
    });

    const healthy = await waitForHealth(LOCAL_AGENT_BASE_URL);
    if (!healthy) {
      const stderr = await new Promise<string>((resolve) => {
        const chunks: string[] = [];
        child?.stderr.on('data', (chunk) => chunks.push(String(chunk)));
        setTimeout(() => resolve(chunks.join('')), 500);
      });
      child.kill('SIGTERM');
      throw new Error(`Local agent failed to start for E2E tests.${stderr ? `\n${stderr}` : ''}`);
    }

    try {
      await use(LOCAL_AGENT_BASE_URL);
    } finally {
      if (child) {
        child.kill('SIGTERM');
      }
      if (userDataDir) {
        await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  },
});

export { expect };
