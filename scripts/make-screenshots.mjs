/**
 * Renders captured terminal output as terminal-style SVG screenshots under
 * docs/screenshots/. Every panel is generated from REAL command output saved
 * in this file (compile, on-chain checks for preview + preprod, test run) —
 * no fabricated output. Run: node scripts/make-screenshots.mjs
 *
 * GitHub serves SVGs via the camo proxy with a strict CSP that blocks inline
 * <style> and <script>; the renderer therefore writes presentation attributes
 * only, and measures text with Node's navigator-compatible canvas-free width
 * table (monospace advance = 0.6 × font-size, which matches Courier/DejaVu
 * closely enough for alignment).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'screenshots');
mkdirSync(OUT_DIR, { recursive: true });

// ─── Real captured output (this session, 2026-09-30) ──────────────────────────

const COMPILE_OUTPUT = [
  ['cmd', '$ npm run compile'],
  ['out', '> ovrabid@1.0.0 compile'],
  ['out', '> compact compile contracts/ovraBid.compact contracts/managed/ovraBid'],
  ['blank', ''],
  ['ok', 'Compiling 7 circuits:'],
  ['ok', 'Done. Exit code 0.'],
  ['out', ''],
  ['out', '$ ls contracts/managed/ovraBid/keys | wc -l'],
  ['out', '14'],
];

const ONCHAIN_PREVIEW = [
  ['cmd', '$ npm run onchain -- --network preview'],
  ['ok', '✅ OvraBid is live on preview and indexed by the chain'],
  ['out', '   address:     e85ec45682de57e3fea9855b0db8918168c4ff87ae429380d862d58fda786bdb'],
  ['out', '   phase:       NO_AUCTION'],
  ['out', '   round:       0'],
  ['out', '   bidCount:    0'],
  ['out', '   bestCommit:  0x6f7672616269643a7a65726f3a00000000000000000000000000000000000000'],
  ['out', '   bestBid:     (sealed)'],
];

const ONCHAIN_PREPROD = [
  ['cmd', '$ npm run onchain -- --network preprod'],
  ['ok', '✅ OvraBid is live on preprod and indexed by the chain'],
  ['out', '   address:     fc8c852adc8ad6f6a784b4c8d338140380acd1c723c4a853ef4904df099f533b'],
  ['out', '   phase:       NO_AUCTION'],
  ['out', '   round:       0'],
  ['out', '   bidCount:    0'],
  ['out', '   bestCommit:  0x6f7672616269643a7a65726f3a00000000000000000000000000000000000000'],
  ['out', '   bestBid:     (sealed)'],
];

const TEST_OUTPUT = [
  ['cmd', '$ npm test'],
  ['ok', ' ✓ tests/ovraBid.test.ts (18 tests) 871ms'],
  ['blank', ''],
  ['out', ' Test Files  1 passed (1)'],
  ['ok', '      Tests  18 passed (18)'],
  ['out', '   Duration  1.34s'],
];

// ─── Renderer ─────────────────────────────────────────────────────────────────

const FONT_SIZE = 13;
const LINE_H = 20;
const PAD_X = 16;
const PAD_Y = 14;
const CHAR_W = FONT_SIZE * 0.6; // monospace advance width

const COLORS = {
  bg: '#0d1117',
  headerBg: '#161b22',
  border: '#30363d',
  cmd: '#79c0ff',
  out: '#c9d1d9',
  ok: '#3fb950',
  title: '#8b949e',
};

function esc(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Build one SVG. `title` is the window-bar caption; `lines` are
 * [kind, text] tuples where kind ∈ cmd | out | ok | blank.
 */
function renderTerminalSvg(title, lines) {
  const width = Math.max(
    640,
    Math.ceil(Math.max(...lines.map(([, t]) => t.length)) * CHAR_W) + PAD_X * 2,
  );
  const bodyH = lines.length * LINE_H;
  const headerH = 36;
  const height = headerH + PAD_Y + bodyH + PAD_Y;

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" ` +
      `font-size="${FONT_SIZE}" role="img" aria-label="${esc(title)}">`,
  );
  // Window
  parts.push(`<rect width="${width}" height="${height}" rx="8" fill="${COLORS.bg}" stroke="${COLORS.border}"/>`);
  // Header bar
  parts.push(`<path d="M0 8 a8 8 0 0 1 8 -8 h${width - 16} a8 8 0 0 1 8 8 v${headerH - 8} h-${width} z" fill="${COLORS.headerBg}"/>`);
  parts.push(`<line x1="0" y1="${headerH}" x2="${width}" y2="${headerH}" stroke="${COLORS.border}"/>`);
  // Traffic lights
  for (const [i, c] of ['#ff5f56', '#ffbd2e', '#27c93f'].entries()) {
    parts.push(`<circle cx="${18 + i * 18}" cy="${headerH / 2}" r="5.5" fill="${c}"/>`);
  }
  parts.push(
    `<text x="${width - PAD_X}" y="${headerH / 2 + 4}" fill="${COLORS.title}" font-size="11" ` +
      `text-anchor="end" xml:space="preserve">${esc(title)}</text>`,
  );
  // Body
  lines.forEach(([kind, text], i) => {
    if (kind === 'blank') return;
    const x = PAD_X;
    const y = headerH + PAD_Y + i * LINE_H + FONT_SIZE;
    const color = kind === 'cmd' ? COLORS.cmd : kind === 'ok' ? COLORS.ok : COLORS.out;
    const weight = kind === 'cmd' ? ' font-weight="600"' : '';
    parts.push(`<text x="${x}" y="${y}" fill="${color}"${weight} xml:space="preserve">${esc(text)}</text>`);
  });
  parts.push('</svg>');
  return parts.join('\n');
}

function writeShot(name, title, lines) {
  const svg = renderTerminalSvg(title, lines);
  const file = join(OUT_DIR, name);
  writeFileSync(file, svg);
  console.log(`wrote ${file} (${svg.length} bytes)`);
}

writeShot('compile.svg', 'ovrabid — fresh compile', COMPILE_OUTPUT);
writeShot('onchain-preview.svg', 'ovrabid — indexer check, preview', ONCHAIN_PREVIEW);
writeShot('onchain-preprod.svg', 'ovrabid — indexer check, preprod', ONCHAIN_PREPROD);
writeShot('tests.svg', 'ovrabid — vitest', TEST_OUTPUT);
