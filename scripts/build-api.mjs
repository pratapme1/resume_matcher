#!/usr/bin/env node
// Bundles api/_index.ts into api/index.mjs for Vercel deployment.
// @vercel/node doesn't bundle transitive .ts imports, so we pre-bundle here.
import { execSync } from 'child_process';

const banner = `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`;

execSync(
  [
    'npx esbuild api/_index.ts',
    '--bundle',
    '--platform=node',
    '--target=node20',
    '--format=esm',
    '--outfile=api/index.mjs',
    '--external:fsevents',
    '--external:@playwright/test',
    '--define:process.env.RTP_BUNDLED_API=\\"true\\"',
    `--banner:js="${banner}"`,
  ].join(' '),
  { stdio: 'inherit' }
);
