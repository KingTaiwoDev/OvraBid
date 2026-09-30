#!/usr/bin/env node
/**
 * Assembles docs/demo/ovrabid-level3.mp4 — the Level 3 one-minute demo:
 *   1. Title card
 *   2. Full dApp flow (demo mode — real circuits in a real browser):
 *      connect → COMMIT state → proof-generation spinner → sealed result
 *   3. Real `npm test` output (18 passing) rendered as a terminal frame
 *   4. The real GitHub README with the green CI badge
 *   5. Closing card
 * All frames are genuine captures; assembled with ffmpeg (libx264).
 */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'web', 'dist');
const OUT = join(ROOT, 'docs', 'demo', 'level3');
const FINAL = join(ROOT, 'docs', 'demo', 'ovrabid-level3.mp4');
const TEST_OUT = '/tmp/test-output.txt';

mkdirSync(OUT, { recursive: true, force: true });

const shots = [];
const add = (path, dur) => shots.push({ path, dur });

// ---------- caption card helper ----------
async function card(browser, name, title, lines, accent = '#7c5cff') {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = lines
    .map((l, i) => {
      const mono = l.startsWith('  ');
      return `<text x="640" y="${290 + i * 50}" text-anchor="middle" font-family="${mono ? 'monospace' : 'sans-serif'}" font-size="${mono ? 22 : 32}" fill="${mono ? '#aab' : '#fff'}">${esc(l)}</text>`;
    })
    .join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800">
    <rect width="1280" height="800" fill="#0b0d14"/>
    <rect x="0" y="0" width="1280" height="6" fill="${accent}"/>
    <text x="640" y="180" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="54" fill="#fff">${esc(title)}</text>
    ${body}
  </svg>`;
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.setContent(`<!doctype html><html><body style="margin:0">${svg}</body></html>`);
  await new Promise((ok) => setTimeout(ok, 250));
  const p = join(OUT, `${name}.png`);
  await page.screenshot({ path: p });
  await page.close();
  add(p, 4);
}

// ---------- static server for the built dApp ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(DIST, p));
    try { const s = await stat(file); if (s.isDirectory()) file = join(file, 'index.html'); } catch { file = join(DIST, 'index.html'); }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((ok) => server.listen(4177, ok));

const browser = await chromium.launch();

// ---------- 1. title ----------
await card(browser, 'card-title', 'OvraBid — Level 3 demo', [
  'Sealed-bid auction on Midnight',
  '',
  '  1 · full dApp flow — connect, seal, sealed result',
  '  2 · npm test — 18 circuit tests passing',
  '  3 · README with the green CI badge',
  '',
  '  every frame is a real capture',
]);

// ---------- 2. dApp flow (real circuits, demo mode) ----------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:4177/?demo=1', { waitUntil: 'networkidle' });
  await new Promise((ok) => setTimeout(ok, 700));
  let p = join(OUT, 'flow-landing.png');
  await page.screenshot({ path: p });
  add(p, 5);

  await page.getByRole('button', { name: 'Connect Lace' }).click();
  await page.getByRole('button', { name: 'Disconnect' }).waitFor({ timeout: 60_000 });
  await page.locator('section', { hasText: 'Auction state' }).getByText('COMMIT', { exact: true }).waitFor({ timeout: 30_000 });
  await new Promise((ok) => setTimeout(ok, 500));
  p = join(OUT, 'flow-connected.png');
  await page.screenshot({ path: p });
  add(p, 5);

  await page.getByRole('button', { name: 'Seal a secret bid' }).click();
  await new Promise((ok) => setTimeout(ok, 2100)); // spinner + stage text visible
  p = join(OUT, 'flow-proving.png');
  await page.screenshot({ path: p });
  add(p, 5);

  await page.getByText('Proved without revealing your input', { exact: false }).first().waitFor({ timeout: 120_000 });
  await new Promise((ok) => setTimeout(ok, 700));
  p = join(OUT, 'flow-sealed.png');
  await page.screenshot({ path: p });
  add(p, 6);
  await page.close();
}

// ---------- 3. real test output as a terminal frame ----------
{
  const text = readFileSync(TEST_OUT, 'utf8').split('\n').filter((l) => !l.includes('Sourcemap')).join('\n');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!doctype html><html><body style="margin:0;background:#0d1117">
    <div style="padding:28px 36px">
      <div style="color:#8b949e;font-family:sans-serif;font-size:26px;margin-bottom:18px">npm test — in-process circuit suite</div>
      <pre style="color:#3fb950;font-family:monospace;font-size:21px;line-height:1.5;margin:0;white-space:pre-wrap">${esc(text.trim())}</pre>
    </div>
  </body></html>`;
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.setContent(html);
  await new Promise((ok) => setTimeout(ok, 300));
  const p = join(OUT, 'tests.png');
  await page.screenshot({ path: p });
  await page.close();
  add(p, 8);
}

// ---------- 4. real GitHub README with the CI badge ----------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('https://github.com/KingTaiwoDev/OvraBid', { waitUntil: 'networkidle', timeout: 90_000 });
  await new Promise((ok) => setTimeout(ok, 2500)); // let the badge img settle
  const p = join(OUT, 'readme-badge.png');
  await page.screenshot({ path: p });
  await page.close();
  add(p, 6);
}

// ---------- 5. closing card ----------
await card(browser, 'card-close', 'Proved without revealing your input', [
  'github.com/KingTaiwoDev/OvraBid',
  'ovrabid.netlify.app',
  '',
  '  preprod contract fc8c852a…f533b',
], '#3fb950');

await browser.close();
server.close();

// ---------- assemble ----------
const list = join(OUT, 'frames.txt');
writeFileSync(list, shots.map((s) => `file '${s.path}'\nduration ${s.dur}`).join('\n') + `\nfile '${shots[shots.length - 1].path}'\n`);
const r = spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-vf', 'fps=25,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-movflags', '+faststart', FINAL], { stdio: 'pipe' });
if (r.status !== 0) {
  console.error(r.stderr.toString().slice(-600));
  throw new Error('ffmpeg assembly failed');
}
console.log('video:', FINAL, `(${shots.length} frames)`);
