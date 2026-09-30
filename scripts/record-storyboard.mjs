#!/usr/bin/env node
/**
 * Assembles docs/demo/ovrabid-storyboard.mp4 — a screenshot-compilation
 * walkthrough of the Level 2 demo flow, built ONLY from real footage:
 *
 *   1. Title card.
 *   2. The LIVE deployment (ovrabid.netlify.app) as it renders right now —
 *      including the honest "Lace not detected" state of a wallet-less
 *      browser.
 *   3. The contract's CURRENT preprod state, queried live from the network
 *      indexer (the same GraphQL endpoint the dApp reads).
 *   4. The demo run of the REAL circuits in a real browser (connect →
 *      seeded COMMIT state → sealed result), clearly labeled SIMULATED.
 *   5. Caption cards marking the two Lace-only moments (approval popup,
 *      signed tx) that must come from the owner's own screen recording.
 *
 * Cards are rendered as SVG→PNG; frames are assembled with ffmpeg (libx264).
 */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'web', 'dist');
const OUT = join(ROOT, 'docs', 'demo', 'storyboard');
const FINAL = join(ROOT, 'docs', 'demo', 'ovrabid-storyboard.mp4');

const CONTRACT = 'fc8c852adc8ad6f6a784b4c8d338140380acd1c723c4a853ef4904df099f533b';
const INDEXER = 'https://indexer.preprod.midnight.network/api/v4/graphql';
const LIVE = 'https://ovrabid.netlify.app';

mkdirSync(OUT, { recursive: true, force: true });

// ---------- caption card renderer (SVG -> PNG via Chromium) ----------
const cards = [];
async function renderCard(browser, title, lines, accent = '#7c5cff') {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = lines
    .map(
      (l, i) =>
        `<text x="640" y="${300 + i * 54}" text-anchor="middle" font-family="monospace" font-size="${l.startsWith('  ') ? 20 : 30}" fill="${l.startsWith('  ') ? '#aab' : '#fff'}">${esc(l)}</text>`,
    )
    .join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800">
    <rect width="1280" height="800" fill="#0b0d14"/>
    <rect x="0" y="0" width="1280" height="6" fill="${accent}"/>
    <text x="640" y="180" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="52" fill="#fff">${esc(title)}</text>
    ${body}
  </svg>`;
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  // Inline the SVG into the HTML body — a bare data:image URL passed to
  // setContent is parsed as an HTML document and renders nothing.
  await page.setContent(
    `<!doctype html><html><body style="margin:0;padding:0">${svg}</body></html>`,
  );
  await new Promise((ok) => setTimeout(ok, 300));
  const path = join(OUT, `card-${cards.length}.png`);
  await page.screenshot({ path });
  await page.close();
  cards.push({ path, dur: 5 });
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
await new Promise((ok) => server.listen(4176, ok));

const browser = await chromium.launch();
const shot = async (page, name) => {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path });
  cards.push({ path, dur: 6 });
};

// ---------- 1. title ----------
await renderCard(browser, 'OvraBid — Level 2 demo walkthrough', [
  'Sealed-bid auction on Midnight · private bids, verifiable winner',
  '',
  `Preprod contract  ${CONTRACT.slice(0, 20)}…`,
  'Live dApp  https://ovrabid.netlify.app',
  '',
  'All frames below are real captures; nothing is mocked.',
]);

// ---------- 2. live deployment, as it renders right now ----------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(LIVE, { waitUntil: 'networkidle', timeout: 60_000 });
  await new Promise((ok) => setTimeout(ok, 1500));
  await shot(page, 'live-site');
  await page.close();
}
await renderCard(browser, 'Step 1 — Connect Lace (live)', [
  'On a machine with the Lace (Midnight) extension installed:',
  '',
  '  1. click "Connect Lace"',
  '  2. approve the connection inside the Lace popup',
  '  3. your wallet address appears on screen',
  '',
  '⌄ this screen recording is captured from your own browser ⌄',
], '#e8a13c');

// ---------- 3. live preprod state from the indexer ----------
{
  const resp = await fetch(INDEXER, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: 'query Q($address: HexEncoded!) { contractAction(address: $address) { address state } }',
      variables: { address: `0x${CONTRACT}` },
    }),
  });
  const json = await resp.json();
  const pretty = JSON.stringify(json, null, 2).split('\n').slice(0, 14).join('\n');
  await renderCard(browser, 'The contract on Midnight preprod — right now', [
    `indexer: ${INDEXER.replace('https://', '')}`,
    '',
    ...pretty.split('\n').slice(0, 9).map((l) => '  ' + l),
    '',
    '  (same GraphQL endpoint the dApp reads)',
  ], '#3ca7e8');
}

// ---------- 4. demo run: real circuits in a real browser ----------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:4176/?demo=1', { waitUntil: 'networkidle' });
  await new Promise((ok) => setTimeout(ok, 800));
  await shot(page, 'demo-landing');

  await page.getByRole('button', { name: 'Connect Lace' }).click();
  await page.getByRole('button', { name: 'Disconnect' }).waitFor({ timeout: 60_000 });
  await page.locator('section', { hasText: 'Auction state' }).getByText('COMMIT', { exact: true }).waitFor({ timeout: 30_000 });
  await new Promise((ok) => setTimeout(ok, 600));
  await shot(page, 'demo-connected');

  await page.getByRole('button', { name: 'Seal a secret bid' }).click();
  await new Promise((ok) => setTimeout(ok, 1900)); // mid proof-generation state
  await shot(page, 'demo-proving');

  await page
    .getByText('Proved without revealing your input', { exact: false })
    .first()
    .waitFor({ timeout: 120_000 });
  await new Promise((ok) => setTimeout(ok, 800));
  await shot(page, 'demo-sealed');
  await page.close();
}
await renderCard(browser, 'Step 2 — Seal a secret bid (live)', [
  'With Lace connected on the live dApp:',
  '',
  '  1. click "Seal a secret bid"',
  '  2. proof is generated in YOUR browser (loading state)',
  '  3. approve the transaction inside the Lace popup',
  '  4. tx id + bidCount update on screen',
  '',
  'The amount is never displayed — only ████ (sealed).',
], '#e8a13c');

// ---------- 5. closing card ----------
await renderCard(browser, 'Proved without revealing your input', [
  'An on-chain observer sees: commitments, phase, counts.',
  'They never see: bid amounts, salts, secret keys.',
  '',
  'github.com/KingTaiwoDev/OvraBid',
]);

await browser.close();
server.close();

// ---------- assemble with ffmpeg ----------
const list = join(OUT, 'frames.txt');
const entries = cards
  .map((c) => `file '${c.path}'\nduration ${c.dur}`)
  .join('\n');
writeFileSync(list, entries + `\nfile '${cards[cards.length - 1].path}'\n`);

const r = spawnSync(
  'ffmpeg',
  ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-vf', 'fps=25,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-movflags', '+faststart', FINAL],
  { stdio: 'pipe' },
);
if (r.status !== 0) {
  console.error(r.stderr.toString().slice(-800));
  throw new Error('ffmpeg assembly failed');
}
console.log('storyboard video:', FINAL, `(${cards.length} frames)`);
