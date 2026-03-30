import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

type EvalSpecResult = {
  title: string;
  status: 'passed' | 'failed';
  durationMs: number;
  exitCode: number;
};

const EVAL_SPECS = [
  'local-agent path fills supported custom widgets and reaches submit readiness',
  'local-agent advanced widgets capture trace and metrics for harder flows',
  'local-agent expands and fills repeated work-history rows from session context',
  'local-agent expands and fills repeated education rows from session context',
  'local-agent expands and fills repeated project rows from session context',
  'local-agent expands and fills repeated certification rows from session context',
  'local-agent resume restarts from the latest backend page URL after agent loss',
  'local-agent pauses cleanly on login-required gates',
  'local-agent pauses cleanly on protected portals',
  'local-agent pauses cleanly on legal self-id gates',
  'local-agent pauses cleanly on assessment handoff gates',
] as const;

const APP_SERVER_PORT = 3100;
const APP_SERVER_URL = `http://127.0.0.1:${APP_SERVER_PORT}`;

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(url: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // keep polling
    }
    await delay(500);
  }
  return false;
}

async function startAppServer() {
  spawnSync('bash', ['-lc', `fuser -k ${APP_SERVER_PORT}/tcp >/dev/null 2>&1 || true`], {
    cwd: process.cwd(),
    stdio: 'ignore',
  });

  const child = spawn('bash', ['-lc', 'npm run build:ext && VITE_SKIP_AUTH=true tsx tests/e2e/server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      VITE_SKIP_AUTH: 'true',
    },
    stdio: 'inherit',
  });

  const healthy = await waitForHealth(`${APP_SERVER_URL}/api/health`);
  if (!healthy) {
    child.kill('SIGTERM');
    throw new Error('Timed out waiting for the E2E app server to become healthy.');
  }

  return child;
}

async function stopChildProcess(child: ChildProcess | null) {
  if (!child) return;
  if (child.killed || child.exitCode !== null) return;

  child.kill('SIGTERM');
  await Promise.race([
    new Promise<void>((resolve) => child.once('exit', () => resolve())),
    delay(5_000),
  ]);

  if (child.exitCode === null && !child.killed) {
    child.kill('SIGKILL');
  }
}

async function main() {
  const artifactsDir = path.join(process.cwd(), 'evals', 'apply-agent');
  await fs.mkdir(artifactsDir, { recursive: true });
  const tempArtifactsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rtp-apply-agent-evals-'));

  const results: EvalSpecResult[] = [];
  const reportFiles: string[] = [];
  let appServer: ChildProcess | null = null;

  try {
    appServer = await startAppServer();

    for (const [index, title] of EVAL_SPECS.entries()) {
      const reportPath = path.join(tempArtifactsDir, `spec-${index + 1}.json`);
      reportFiles.push(reportPath);
      const startedAt = Date.now();
      const result = spawnSync('npx', [
        'playwright',
        'test',
        'tests/e2e/local-agent-hybrid.spec.ts',
        '--project=local-agent-hybrid',
        '--reporter=json',
        '-g',
        title,
      ], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath,
        },
        stdio: 'inherit',
      });

      results.push({
        title,
        status: result.status === 0 ? 'passed' : 'failed',
        durationMs: Date.now() - startedAt,
        exitCode: result.status ?? 1,
      });
    }
  } finally {
    await stopChildProcess(appServer);
    // Ensure local agent port is freed after the eval run completes — the Playwright
    // fixture sends SIGTERM but the chromium subprocess it launches may outlive the parent.
    spawnSync('bash', ['-lc', 'fuser -k 43111/tcp >/dev/null 2>&1 || true'], {
      cwd: process.cwd(),
      stdio: 'ignore',
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    command: 'isolated playwright runs for tests/e2e/local-agent-hybrid.spec.ts --project=local-agent-hybrid',
    exitCode: results.every((entry) => entry.status === 'passed') ? 0 : 1,
    passed: results.filter((entry) => entry.status === 'passed').length,
    failed: results.filter((entry) => entry.status === 'failed').length,
    skipped: 0,
    flaky: 0,
    durationMs: results.reduce((sum, entry) => sum + entry.durationMs, 0),
    specs: results,
    reports: reportFiles,
  };

  await fs.writeFile(
    path.join(artifactsDir, 'last-summary.json'),
    JSON.stringify(summary, null, 2),
  );

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  await fs.rm(tempArtifactsDir, { recursive: true, force: true }).catch(() => undefined);
  process.exit(summary.exitCode);
}

void main();
