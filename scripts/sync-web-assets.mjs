#!/usr/bin/env node
/**
 * Copies the compiled OvraBid artifacts the browser dApp needs into
 * web/public/contract/ovraBid/:
 *
 *   keys/{circuit}.prover|.verifier   — zkConfig assets (FetchZkConfigProvider)
 *   zkir/{circuit}.bzkir             — zkConfig assets (FetchZkConfigProvider)
 *   contract/index.js                — compiled circuit + ledger bindings
 *   contract/package.json            — module marker
 *
 * Run after every `npm run compile`: node scripts/sync-web-assets.mjs
 * The served copies are git-tracked so the deployed dApp and reviewers do not
 * need the Compact toolchain.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const src = join(root, 'contracts', 'managed', 'ovraBid');
const dest = join(root, 'web', 'public', 'contract', 'ovraBid');

if (!existsSync(src)) {
  console.error('Compiled contract missing — run `npm run compile` first.');
  process.exit(1);
}

for (const dir of ['keys', 'zkir', 'contract']) {
  if (!existsSync(join(src, dir))) {
    console.error(`Missing ${dir}/ in compiled output — re-run \`npm run compile\`.`);
    process.exit(1);
  }
}

mkdirSync(join(dest, 'keys'), { recursive: true });
mkdirSync(join(dest, 'zkir'), { recursive: true });
mkdirSync(join(dest, 'contract'), { recursive: true });

// zkConfig assets, served statically for FetchZkConfigProvider.
cpSync(join(src, 'keys'), join(dest, 'keys'), { recursive: true });
cpSync(join(src, 'zkir'), join(dest, 'zkir'), { recursive: true });

// The compiled contract module. package.json inside keeps it resolvable as a
// package when imported through the Vite dev server.
cpSync(join(src, 'contract', 'index.js'), join(dest, 'contract', 'index.js'));
if (existsSync(join(src, 'contract', 'package.json'))) {
  cpSync(join(src, 'contract', 'package.json'), join(dest, 'contract', 'package.json'));
}

function dirSizeMB(p) {
  let total = 0;
  for (const name of readdirSync(p)) {
    const s = statSync(join(p, name));
    total += s.isDirectory() ? 0 : s.size;
  }
  return (total / 1024 / 1024).toFixed(1);
}

console.log('Synced web/public/contract/ovraBid:');
console.log(`  keys/    ${readdirSync(join(dest, 'keys')).length} files (${dirSizeMB(join(dest, 'keys'))} MB)`);
console.log(`  zkir/    ${readdirSync(join(dest, 'zkir')).length} files (${dirSizeMB(join(dest, 'zkir'))} MB)`);
console.log(`  contract ${readdirSync(join(dest, 'contract')).length} files`);
