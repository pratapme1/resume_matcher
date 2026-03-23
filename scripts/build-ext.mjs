// Build script for the Resume Tailor Pro Chrome extension
// Uses esbuild (already in project dependencies)
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'fs';

const out = 'extension/dist';
mkdirSync(`${out}/popup`, { recursive: true });

cpSync('extension/manifest.json', `${out}/manifest.json`);
cpSync('extension/popup/index.html', `${out}/popup/index.html`);

await build({
  entryPoints: ['extension/background.ts'],
  bundle: true, format: 'esm', outfile: `${out}/background.js`,
});

// Content script uses IIFE (no ES module export) for broadest Chrome compatibility
await build({
  entryPoints: ['extension/content.ts'],
  bundle: true, format: 'iife', outfile: `${out}/content.js`,
});

// Popup React app
await build({
  entryPoints: ['extension/popup/main.tsx'],
  bundle: true, format: 'esm', outfile: `${out}/popup/main.js`,
  jsx: 'automatic', jsxImportSource: 'react',
});

console.log('✓ Extension built →', out);
console.log('  Load in Chrome: Settings → Extensions → Developer mode → Load unpacked →', out);
