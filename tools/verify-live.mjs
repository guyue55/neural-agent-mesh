// Real-browser verification of the PUBLISHED (online) build, not just localhost.
// Usage: node tools/verify-live.mjs <url>
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.argv[2];
if (!URL) { console.error('usage: node tools/verify-live.mjs <url>'); process.exit(2); }

// Prefer the local system Chrome on macOS; otherwise use Playwright's own
// Chromium (Linux / CI runners).
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = fs.existsSync(MAC_CHROME) ? MAC_CHROME : undefined;
const errors = [];
const badResponses = [];
const failedRequests = [];

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--enable-webgl', '--enable-unsafe-swiftshader', '--use-gl=angle',
    '--use-angle=swiftshader', '--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e)));
page.on('requestfailed', (r) => failedRequests.push(r.url() + ' :: ' + r.failure()?.errorText));
page.on('response', (r) => { if (r.status() >= 400) badResponses.push(r.status() + ' ' + r.url()); });

const resp = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__MESH__ && window.__MESH__.frames > 8, { timeout: 60000 });
// let the unattended pipeline advance through DRAFT -> BUILD -> RUN
await page.waitForTimeout(14000);

const state = await page.evaluate(() => {
  const m = window.__MESH__;
  const boxes = [...document.querySelectorAll('.nt-inner')]
    .filter((e) => +(e.closest('.node-tag')?.style.opacity || 0) > 0.1)
    .map((e) => e.getBoundingClientRect());
  let overlappingPairs = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlappingPairs++;
    }
  }
  return {
    title: document.title,
    phase: m.wf?.state?.phase,
    nodes: m.graph?.nodes?.length,
    edges: m.graph?.edges?.length,
    labels: document.querySelectorAll('.node-tag').length,
    roster: document.querySelectorAll('.agent-card').length,
    frames: m.frames,
    canvas: [document.getElementById('gl').width, document.getElementById('gl').height],
    glVersion: m.renderer?.getContext()?.getParameter(0x1F02),
    cost: m.wf?.state?.cost,
    costText: document.getElementById('sb-cost')?.textContent,
    handoffs: m.wf?.state?.handoffs,
    reveal: Math.round((m.wf?.state?.revealProgress || 0) * 100),
    logs: document.querySelectorAll('.log-row').length,
    visibleLabels: boxes.length,
    overlappingPairs,
    internalErrors: window.__MESH_ERRORS__ || [],
  };
});

await page.screenshot({ path: 'tools/shots/10-live-online.png' });
await browser.close();

const checks = [
  ['HTTP 200', resp.status() === 200, String(resp.status())],
  ['title correct', /NEURAL AGENT MESH/.test(state.title), state.title],
  ['21 graph nodes', state.nodes === 21, String(state.nodes)],
  ['474 handoff edges', state.edges === 474, String(state.edges)],
  ['21 node labels', state.labels === 21, String(state.labels)],
  ['21 roster cards', state.roster === 21, String(state.roster)],
  ['canvas rendered', state.canvas[0] > 400 && state.canvas[1] > 300, JSON.stringify(state.canvas)],
  ['animation frames advancing', state.frames > 8, String(state.frames)],
  ['cold load auto-runs to RUN', state.phase === 'RUN', String(state.phase)],
  ['cost ticking above $9', state.cost > 9.0, String(state.cost)],
  ['cost rendered in status bar', /^\$\d+\.\d{2}$/.test(state.costText || ''), String(state.costText)],
  ['handoffs firing', state.handoffs > 3, String(state.handoffs)],
  ['all 474 edges revealed', state.reveal === 100, state.reveal + '%'],
  ['log stream populated', state.logs > 12, String(state.logs)],
  ['node labels de-overlapped', state.overlappingPairs === 0, JSON.stringify({ visible: state.visibleLabels, pairs: state.overlappingPairs })],
  ['no internal boot errors', state.internalErrors.length === 0, JSON.stringify(state.internalErrors)],
  ['no HTTP >= 400', badResponses.length === 0, JSON.stringify(badResponses)],
  ['no failed requests', failedRequests.length === 0, JSON.stringify(failedRequests)],
  ['no console/page errors', errors.length === 0, JSON.stringify(errors)],
];

let pass = 0;
for (const [name, ok, detail] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} :: ${detail}`);
  if (ok) pass++;
}
console.log(`\n=== LIVE ${pass}/${checks.length} CHECKS PASSED ===`);
console.log('STATE:', JSON.stringify(state, null, 2));
if (pass !== checks.length) process.exit(1);
