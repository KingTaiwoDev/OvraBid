#!/usr/bin/env node
/**
 * Browser smoke test for the built dApp (web/dist).
 *
 * Serves the production build locally and asserts the things that break in a
 * real browser but not in CI:
 *   1. The live app boots with no uncaught errors; no-wallet state renders.
 *   2. Demo mode (?demo=1) CONNECTS and runs the REAL compiled circuits
 *      in-page (seed: startAuction + one commitBid → COMMIT / bidCount 1).
 *      This proves the bundled contract module and the midnight runtime
 *      share a single runtime instance inside the app bundle.
 *   3. The static zkConfig assets are served (FetchZkConfigProvider needs
 *      them at connect time in live mode).
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../web/dist', import.meta.url));

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.prover': 'application/octet-stream',
  '.verifier': 'application/octet-stream',
  '.bzkir': 'application/octet-stream',
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
      file = join(DIST, 'index.html'); // SPA fallback
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
console.log('serving web/dist at http://localhost:4173');

const browser = await chromium.launch();
const failures = [];

// ---------- 1. Live mode: boot + no-wallet state ----------
{
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });

  const h1 = await page.textContent('h1');
  if (h1 !== 'OvraBid') failures.push(`live: h1 = ${JSON.stringify(h1)}`);

  const noWallet = await page.getByText('not detected', { exact: false }).count();
  if (noWallet === 0) failures.push('live: no-wallet message not rendered');
  if (errors.length) failures.push(`live: uncaught page errors: ${errors.join(' | ')}`);

  // zkConfig assets must be statically reachable (live mode fetches them).
  const prover = await page.request.get('http://localhost:4173/contract/ovraBid/keys/commitBid.prover');
  if (prover.status() !== 200) failures.push(`live: commitBid.prover HTTP ${prover.status()}`);

  await page.close();
  console.log('live-mode checks done');
}

// ---------- 2. Demo mode: REAL circuits running in-page ----------
{
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:4173/?demo=1', { waitUntil: 'networkidle' });

  const banner = await page.getByText('SIMULATED — demo recording mode', { exact: false }).count();
  if (banner === 0) failures.push('demo: SIMULATED banner missing');

  await page.getByRole('button', { name: 'Connect Lace' }).click();
  try {
    // The connected panel shows the wallet name + address + Disconnect (no
    // literal "connected" status text), so wait for the Disconnect button.
    await page.getByRole('button', { name: 'Disconnect' }).waitFor({ timeout: 60_000 });
  } catch {
    const errText = await page.locator('.err').allInnerTexts().catch(() => []);
    failures.push(`demo: connect failed ${JSON.stringify(errText)}`);
  }

  // Seeded chain: one startAuction + one commitBid from another participant.
  const state = page.locator('section', { hasText: 'Auction state' });
  try {
    await state.getByText('COMMIT', { exact: true }).waitFor({ timeout: 15_000 });
    const text = (await state.innerText()).replace(/\s+/g, ' ');
    if (!/bidCount\s*1\b/.test(text)) failures.push(`demo: expected bidCount 1, got: ${text}`);
  } catch {
    failures.push('demo: COMMIT phase not shown in the state panel');
  }

  // Run one more REAL circuit in-page: seal a second bid.
  await page.getByRole('button', { name: 'Seal a secret bid' }).click();
  try {
    await page
      .getByText('Proved without revealing your input', { exact: false })
      .first()
      .waitFor({ timeout: 120_000 });
    const text = (await state.innerText()).replace(/\s+/g, ' ');
    if (!/bidCount\s*2\b/.test(text)) failures.push(`demo: expected bidCount 2 after seal, got: ${text}`);
  } catch {
    failures.push('demo: circuit call did not finalize');
  }
  if (errors.length) failures.push(`demo: uncaught page errors: ${errors.join(' | ')}`);

  await page.close();
  console.log('demo-mode circuit checks done');
}

await browser.close();
server.close();

if (failures.length) {
  console.error('SMOKE TEST FAILED:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('BROWSER SMOKE TEST PASSED ✓');
