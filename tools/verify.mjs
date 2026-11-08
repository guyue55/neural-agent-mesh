/* Real-browser verification harness.
   Launches Chrome, checks WebGL/GLSL, captures phase screenshots,
   exercises interactions, and reports console/page errors. */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tools', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const report = { checks: [], consoleErrors: [], pageErrors: [], screenshots: [] };
const ok = (name, cond, detail = '') => {
  report.checks.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
};

const browser = await chromium.launch({
  executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  headless: true,
  args: [
    '--enable-webgl', '--enable-unsafe-swiftshader',
    '--use-gl=angle', '--use-angle=swiftshader',
    '--no-sandbox', '--disable-gpu-sandbox', '--hide-scrollbars', '--disable-dev-shm-usage',
  ],
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 960 }, deviceScaleFactor: 1,
});
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
page.on('pageerror', (e) => report.pageErrors.push(String(e.stack || e)));

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__MESH__ && window.__MESH__.frames > 3, null, { timeout: 60000 });

  const info = await page.evaluate(() => {
    const m = window.__MESH__;
    const gl = m.renderer.getContext();
    return {
      nodes: m.graph.nodes.length,
      edges: m.graph.edges.length,
      primary: m.graph.primary.length,
      secondary: m.graph.secondary.length,
      frames: m.frames,
      calls: m.renderer.info.render.calls,
      triangles: m.renderer.info.render.triangles,
      glVersion: gl.getParameter(gl.VERSION),
      glVendor: gl.getParameter(gl.VENDOR),
      canvas: [document.getElementById('gl').width, document.getElementById('gl').height],
      labels: document.querySelectorAll('.node-tag').length,
      roster: document.querySelectorAll('.agent-card').length,
      internalErrors: window.__MESH_ERRORS__.slice(),
      phase: m.wf.state.phase,
    };
  });
  report.info = info;
  console.log('\n--- SCENE INFO ---\n' + JSON.stringify(info, null, 2) + '\n');

  ok('21 graph nodes', info.nodes === 21, String(info.nodes));
  ok('474 handoff edges', info.edges === 474, String(info.edges));
  ok('WebGL context alive', !!info.glVersion, info.glVersion);
  ok('render calls > 0', info.calls > 0, String(info.calls));
  ok('21 DOM node labels', info.labels === 21, String(info.labels));
  ok('21 agent roster cards', info.roster === 21, String(info.roster));
  ok('canvas sized', info.canvas[0] > 500 && info.canvas[1] > 300, info.canvas.join('x'));
  ok('no internal boot errors', info.internalErrors.length === 0, JSON.stringify(info.internalErrors));

  const shot = async (name) => {
    const p = path.join(SHOTS, name + '.png');
    await page.screenshot({ path: p, animations: 'disabled' });
    const size = fs.statSync(p).size;
    report.screenshots.push({ name, path: p, bytes: size });
    console.log(`SHOT  ${name}  ${(size / 1024).toFixed(1)} KB`);
    return size;
  };

  // Force each stage explicitly: software-GL headless renders slowly, so
  // wall-clock stage timing is not a reliable harness driver.
  await page.waitForTimeout(1800);
  await page.evaluate(() => window.__MESH__.wf.setPhase('DRAFT'));
  await page.waitForTimeout(1100);
  const s1 = await shot('01-draft');
  ok('draft frame non-empty', s1 > 60000, s1 + ' bytes');

  await page.evaluate(() => window.__MESH__.wf.setPhase('BUILD'));
  // sample reveal instead of reading one instant: on a fast GPU the growth
  // may already be complete at 1.7s, on software GL it may still be at 0.
  const growth = [];
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(170);
    growth.push(await page.evaluate(() => Math.round(window.__MESH__.wf.state.revealProgress * 100)));
  }
  const s2 = await shot('02-build');
  ok('build frame non-empty', s2 > 60000, s2 + ' bytes');
  ok('synapses grow during BUILD', growth.some((v) => v > 0 && v < 100), growth.join(','));

  await page.evaluate(() => window.__MESH__.wf.setPhase('RUN'));
  await page.waitForTimeout(2200);
  const s3 = await shot('03-run');
  ok('run frame non-empty', s3 > 60000, s3 + ' bytes');

  await page.waitForTimeout(3200);
  const s4 = await shot('04-run-active');

  const overlaps = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.node-tag')];
    const boxes = els
      .filter((e) => parseFloat(getComputedStyle(e).opacity) > 0.1)
      .map((e) => e.querySelector('.nt-inner').getBoundingClientRect());
    let pairs = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const ow = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oh = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ow > 6 && oh > 6) pairs++;
      }
    }
    return { visible: boxes.length, overlappingPairs: pairs };
  });
  report.overlaps = overlaps;
  ok('node labels de-overlapped', overlaps.overlappingPairs <= 2, JSON.stringify(overlaps));

  const live = await page.evaluate(() => {
    const m = window.__MESH__;
    return {
      phase: m.wf.state.phase,
      cost: m.wf.state.cost,
      tokens: m.wf.state.tokens,
      handoffs: m.wf.state.handoffs,
      logs: document.querySelectorAll('.log-row').length,
      activePaths: m.wf.state.activePaths,
      reveal: Math.round(m.wf.state.revealProgress * 100),
      labelText: document.querySelector('.nt-pct')?.textContent,
      costText: document.getElementById('sb-cost')?.textContent,
    };
  });
  report.live = live;
  console.log('\n--- LIVE STATE ---\n' + JSON.stringify(live, null, 2) + '\n');
  ok('phase reached RUN', live.phase === 'RUN', live.phase);
  ok('cost ticking above $9', live.cost > 9.0, live.cost.toFixed(3));
  ok('handoffs firing', live.handoffs > 3, String(live.handoffs));
  ok('log stream populated', live.logs > 12, String(live.logs));
  ok('edges revealed', live.reveal === 100, live.reveal + '%');

  // interaction: inspector
  await page.evaluate(() => window.__MESH__.ui.selectNode(0));
  await page.waitForTimeout(350);
  const insVisible = await page.locator('#inspector').isVisible();
  ok('node inspector opens', insVisible);
  await shot('05-inspector');

  // interaction: human gate
  await page.evaluate(() => window.__MESH__.wf.openGate());
  await page.waitForTimeout(400);
  const gateVisible = await page.locator('#gate-modal').isVisible();
  ok('human gate modal opens', gateVisible);
  await shot('06-human-gate');
  await page.click('#gate-approve');
  await page.waitForTimeout(250);
  ok('human gate closes on approve', !(await page.locator('#gate-modal').isVisible()));

  // interaction: custom brief
  await page.fill('#brief-input', 'Verify the neural mesh end to end and ship a signed report.');
  await page.click('#btn-apply');
  await page.waitForTimeout(700);
  const brief = await page.evaluate(() => ({
    brief: window.__MESH__.wf.state.brief,
    phase: window.__MESH__.wf.state.phase,
    text: document.getElementById('brief-text').textContent,
  }));
  ok('custom brief applied', brief.brief.includes('ship a signed report'), brief.brief);
  ok('brief restarts pipeline', brief.phase === 'DRAFT' || brief.phase === 'BUILD', brief.phase);
  await shot('07-custom-brief');

  // interaction: stop / resume
  await page.click('#btn-stop');
  await page.waitForTimeout(200);
  const paused = await page.evaluate(() => window.__MESH__.wf.state.phase);
  ok('STOP pauses pipeline', paused === 'PAUSED', paused);
  await page.click('#btn-stop');
  await page.waitForTimeout(200);
  const resumed = await page.evaluate(() => window.__MESH__.wf.state.phase);
  ok('RESUME restarts pipeline', resumed !== 'PAUSED', resumed);

  // force straight to RUN for a dense-pulse hero shot
  await page.evaluate(() => window.__MESH__.wf.setPhase('RUN'));
  await page.waitForTimeout(2600);
  await shot('08-hero-run');

  // resize check
  await page.setViewportSize({ width: 1280, height: 800 });
  // wait for the ResizeObserver callback instead of a fixed sleep: software
  // GL can stall the main thread long enough to miss a 600ms window.
  await page.waitForFunction(() => {
    const c = document.getElementById('gl');
    return c.clientWidth > 0 &&
      Math.abs(window.__MESH__.scene.camera.aspect - c.clientWidth / c.clientHeight) < 0.02;
  }, null, { timeout: 25000, polling: 100 }).catch(() => {});
  await page.waitForTimeout(350);
  const resized = await page.evaluate(() => {
    const m = window.__MESH__;
    const c = document.getElementById('gl');
    return {
      canvas: [c.width, c.height],
      aspect: +m.scene.camera.aspect.toFixed(3),
      expected: +(c.clientWidth / c.clientHeight).toFixed(3),
    };
  });
  ok('resize updates camera', Math.abs(resized.aspect - resized.expected) < 0.02, JSON.stringify(resized));
  await shot('09-resized');

  const final = await page.evaluate(() => ({
    frames: window.__MESH__.frames,
    calls: window.__MESH__.renderer.info.render.calls,
    glErrors: window.__MESH_ERRORS__.slice(),
  }));
  report.final = final;
  ok('animation loop still running', final.frames > 25, String(final.frames));

  // cold-load check: the demo must run through BOOT -> DRAFT -> BUILD -> RUN
  // with no operator input at all.
  // Close the first tab: Chrome throttles requestAnimationFrame in background
  // tabs, and a waitForFunction that polls on rAF would be throttled too.
  await page.close();
  const auto = await context.newPage();
  await auto.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  let autoPhase = 'TIMEOUT';
  try {
    await auto.waitForFunction(() => window.__MESH__?.wf.state.phase === 'RUN', null,
      { timeout: 60000, polling: 100 });
    autoPhase = await auto.evaluate(() => window.__MESH__.wf.state.phase);
  } catch {}
  ok('cold load auto-runs pipeline to RUN', autoPhase === 'RUN', autoPhase);
  await auto.close();

  ok('no runtime JS errors', final.glErrors.length === 0, JSON.stringify(final.glErrors));
  ok('no console errors', report.consoleErrors.length === 0, JSON.stringify(report.consoleErrors.slice(0, 5)));
  ok('no page errors', report.pageErrors.length === 0, JSON.stringify(report.pageErrors.slice(0, 5)));
} catch (err) {
  ok('harness completed without exception', false, String(err && err.stack ? err.stack : err));
  report.fatal = String(err && err.stack ? err.stack : err);
  try { await page.screenshot({ path: path.join(SHOTS, '99-failure.png') }); } catch {}
} finally {
  await browser.close();
  fs.writeFileSync(path.join(SHOTS, 'report.json'), JSON.stringify(report, null, 2));
  const failed = report.checks.filter((c) => !c.pass);
  console.log(`\n=== ${report.checks.length - failed.length}/${report.checks.length} CHECKS PASSED ===`);
  if (failed.length) console.log('FAILED: ' + failed.map((c) => c.name).join(', '));
  process.exit(failed.length ? 1 : 0);
}
