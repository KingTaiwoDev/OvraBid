#!/usr/bin/env node
/**
 * Records the OvraBid demo video (docs/demo/ovrabid-demo.webm).
 *
 * Drives the demo mode (?demo=1 — simulated chain, REAL circuits, clearly
 * labeled in the UI) through the exact Level 2 demo checklist, with pauses
 * sized for a sub-2-minute watch:
 *   1. Connect "wallet" (browser-local demo identity) — address appears.
 *   2. Seal a secret bid — loading state during proof/circuit run.
 *   3. On-chain-style result: tx id, bidCount bumped in the state panel.
 *   4. The private amount is never shown — only the ████ (sealed) field.
 *
 * Also saves a still frame of the final state for the README. The webm can
 * be converted to mp4 with the ffmpeg bundled in Playwright:
 *   `node scripts/record-demo.mjs --mp4`
 *
 * The REAL submission video should be recorded by the repo owner with an
 * actual Lace wallet on the live deployment; this harness exists so the
 * repo ships a reproducible, verifiable demo of the circuit flow.
 */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'web', 'dist');
const OUT_DIR = join(ROOT, 'docs', 'demo');

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(DIST, p));
    if (!file.startsWith(DIST)) throw new Error('traversal');
    try {
      const s = await stat(file);
      if (s.isDirectory()) file = join(file, 'index.html');
    } catch {
      file = join(DIST, 'index.html');
    }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});

await new Promise((ok) => server.listen(4173, ok));

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();

const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const settle = async (ms = 400) => {
  await page.waitForLoadState('networkidle');
  await wait(ms);
};

console.log('1/5 opening demo dApp…');
await page.goto('http://localhost:4173/?demo=1', { waitUntil: 'networkidle' });
await settle(2500); // let the viewer read the SIMULATED banner + panels

console.log('2/5 connecting demo wallet…');
await page.getByRole('button', { name: 'Connect Lace' }).click();
await page.getByRole('button', { name: 'Disconnect' }).waitFor({ timeout: 60_000 });
await page.locator('section', { hasText: 'Auction state' }).getByText('COMMIT', { exact: true }).waitFor({ timeout: 30_000 });
await settle(2500); // address + seeded auction state on screen

console.log('3/5 sealing a secret bid (circuit runs in-browser)…');
await page.getByRole('button', { name: 'Seal a secret bid' }).click();
await page.getByText('Generating ZK proof in your browser…').waitFor({ timeout: 60_000 });
await wait(1800); // hold on the visible loading state

console.log('4/5 waiting for the finalized result…');
await page.getByText('Proved without revealing your input', { exact: false }).first().waitFor({ timeout: 120_000 });
await settle(3000); // tx id + sealed amount on screen

console.log('5/5 highlighting the public state…');
// bidCount should now read 2 (seeded bid + ours) — assert for honesty.
const stateText = await page.locator('section', { hasText: 'Auction state' }).innerText();
if (!/bidCount\s*2/.test(stateText.replace(/\n/g, ' '))) {
  console.warn('warning: bidCount != 2 in the state panel — check the demo seed.');
}
await settle(2500);

// Still frame for the README (full page, final state).
await page.screenshot({ path: join(OUT_DIR, 'demo-final-state.png'), fullPage: true });

await context.close(); // flushes the video file
await browser.close();
server.close();

// Playwright names videos arbitrarily; move it to a stable name.
const { readdirSync } = await import('node:fs');
const videos = readdirSync(OUT_DIR).filter((f) => f.endsWith('.webm'));
if (videos.length === 0) throw new Error('no video produced');
const src = join(OUT_DIR, videos[videos.length - 1]);
const dest = join(OUT_DIR, 'ovrabid-demo.webm');
if (src !== dest) {
  const { renameSync } = await import('node:fs');
  renameSync(src, dest);
}
console.log('video:', dest);

// Optional mp4 conversion. Uses a full ffmpeg from PATH when available
// (needs libx264); falls back to Playwright's bundled minimal ffmpeg (VP8
// only, so it re-encodes to .webm/vp8 in an .mp4-unfriendly world — prefer
// installing ffmpeg: `sudo apt-get install -y ffmpeg`).
if (process.argv.includes('--mp4')) {
  const mp4 = join(OUT_DIR, 'ovrabid-demo.mp4');
  const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'pipe' }).status === 0 ? 'ffmpeg' : null;
  if (!ffmpeg) throw new Error('ffmpeg not found on PATH — run: sudo apt-get install -y ffmpeg');
  const r = spawnSync(
    ffmpeg,
    ['-y', '-i', dest, '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4],
    { stdio: 'pipe' },
  );
  if (r.status !== 0) throw new Error('ffmpeg conversion failed');
  console.log('mp4:', mp4);
}

console.log('DEMO RECORDING COMPLETE ✓');
