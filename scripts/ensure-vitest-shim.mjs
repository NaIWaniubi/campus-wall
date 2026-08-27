#!/usr/bin/env node
/**
 * Idempotent shim installer: patches node_modules/vitest/vitest.mjs to
 * pre-load scripts/sandbox-exec-shim.mjs at startup. Needed only in the
 * DSH harness sandbox (where child_process.exec() throws EPERM on
 * "net use" probe, breaking vite's optimizeSafeRealPathSync).
 *
 * Outside the harness this is a no-op: the shim file is also safe to load
 * (just installs a no-op wrapper when EPERM doesn't occur).
 *
 * Re-runs are safe: detects already-patched line and exits.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const shimRel = '../../scripts/sandbox-exec-shim.mjs';

if (!existsSync(target)) {
  console.log('[ensure-shim] vitest.mjs not found, skipping (vitest not installed)');
  process.exit(0);
}

const content = readFileSync(target, 'utf8');
const marker = `import '${shimRel}'`;

if (content.includes(marker)) {
  console.log('[ensure-shim] vitest.mjs already patched, skip');
  process.exit(0);
}

const patched = content.replace(
  "import './dist/cli.js'",
  `import '${shimRel}'\nimport './dist/cli.js'`
);
writeFileSync(target, patched, 'utf8');
console.log('[ensure-shim] patched vitest.mjs to preload sandbox shim');
