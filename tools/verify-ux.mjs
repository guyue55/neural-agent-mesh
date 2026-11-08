// UX / resilience regression suite: mobile layout, capability fallback,
// reduced motion, context loss and background-tab behaviour.
// Usage: BASE_URL=https://example.com/ node tools/verify-ux.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = fs.existsSync(MAC_CHROME) ? MAC_CHROME : undefined;

const results = [];
function ok(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail: String(detail) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--enable-webgl', '--enable-unsafe-swiftshader', '--use-gl=angle',
    '--use-angle=swiftshader', '--no-sandbox', '--disable-gpu-sandbox',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows'],
});

async function newPage(opts = {}) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.bringToFront();
  return { ctx, page };
}

const layoutProbe = () => {
  const box = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const s = getComputedStyle(el), b = el.getBoundingClientRect();
    return { display: s.display, w: Math.round(b.width), h: Math.round(b.height), visible: s.display !== 'none' && b.width > 0 && b.height > 0 };
  };
  const de = document.documentElement;
  const tags = [...document.querySelectorAll('.nt-inner')]
    .filter((e) => +(e.closest('.node-tag')?.style.opacity || 0) > 0.1)
    .map((e) => e.getBoundingClientRect());
  let overlaps = 0;
  for (let i = 0; i < tags.length; i++) {
    for (let j = i + 1; j < tags.length; j++) {
      const a = tags[i], b = tags[j];
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps++;
    }
  }
  return {
    viewport: [innerWidth, innerHeight],
    horizontalOverflow: de.scrollWidth > de.clientWidth + 2,
    left: box('left-panel'), stage: box('stage'), right: box('right-panel'),
    statusbar: box('statusbar'),
    visibleLabels: tags.length, overlaps,
    dpr: window.__MESH__?.renderer?.getPixelRatio() ?? null,
    phase: window.__MESH__?.wf?.state?.phase ?? null,
    frames: window.__MESH__?.frames ?? null,
    errors: window.__MESH_ERRORS__ || [],
  };
};

/* ---------- 1. desktop / tablet / mobile layout ---------- */
for (const [w, h, label] of [[1440, 900, 'desktop 1440x900'], [1024, 900, 'tablet 1024x900'], [900, 900, 'breakpoint 900x900'], [390, 844, 'mobile 390x844']]) {
  const { ctx, page } = await newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__MESH__ && window.__MESH__.frames > 3, null, { timeout: 60000 });
  await page.waitForTimeout(2200);
  const r = await page.evaluate(layoutProbe);
  const single = w <= 980;
  ok(`${label}: no horizontal overflow`, !r.horizontalOverflow, JSON.stringify(r.viewport));
  ok(`${label}: stage has usable height`, r.stage.h >= (single ? 400 : 600), r.stage.h + 'px');
  ok(`${label}: both side panels rendered`, r.left.visible && r.right.visible && r.left.h > 100 && r.right.h > 100,
    `left ${r.left.w}x${r.left.h} / right ${r.right.w}x${r.right.h}`);
  ok(`${label}: 21 labels, zero overlaps`, r.visibleLabels === 21 && r.overlaps === 0, `${r.visibleLabels} labels / ${r.overlaps} pairs`);
  ok(`${label}: no page errors`, errs.length === 0 && r.errors.length === 0, JSON.stringify([...errs, ...r.errors].slice(0, 2)));
  if (w === 390) {
    ok('mobile: DPR capped for performance', r.dpr !== null && r.dpr <= 1.25, 'DPR ' + r.dpr);
    ok('mobile: page scrolls instead of leaving blank space',
      await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 100),
      'scrollHeight ' + await page.evaluate(() => document.documentElement.scrollHeight));
    const chrome = await page.evaluate(() => {
      const sb = document.getElementById('statusbar').getBoundingClientRect();
      const cells = [...document.querySelectorAll('.sb-cell')].map((e) => {
        const r = e.getBoundingClientRect();
        const sp = e.querySelector('span')?.getBoundingClientRect();
        const bb = e.querySelector('b')?.getBoundingClientRect();
        return {
          display: getComputedStyle(e).display, w: Math.round(r.width),
          clash: !!(sp && bb && sp.right > bb.left && sp.left < bb.right),
        };
      });
      return {
        statusH: Math.round(sb.height), statusBottom: Math.round(sb.bottom), vh: innerHeight,
        hudTr: getComputedStyle(document.querySelector('.hud-tr')).display,
        cells,
      };
    });
    ok('mobile: status bar keeps full height and stays pinned',
      chrome.statusH >= 80 && Math.abs(chrome.statusBottom - chrome.vh) <= 4, `h=${chrome.statusH} bottom=${chrome.statusBottom}/${chrome.vh}`);
    ok('mobile: all 8 status cells readable, no text collisions',
      chrome.cells.length === 8 && chrome.cells.every((c) => c.display !== 'none' && c.w >= 150 && !c.clash),
      JSON.stringify(chrome.cells));
    ok('mobile: phase HUD hidden to avoid label collision', chrome.hudTr === 'none', chrome.hudTr);
  }
  await ctx.close();
}

/* ---------- 2. reduced motion ---------- */
{
  const { ctx, page } = await newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__MESH__ && window.__MESH__.frames > 3, null, { timeout: 60000 });
  const r = await page.evaluate(() => ({
    reduceMotion: window.__MESH__?.reduceMotion,
    motionScale: window.__MESH__?.scene?.motionScale,
    scanlines: getComputedStyle(document.getElementById('fx-scanlines')).display,
    pulse: getComputedStyle(document.querySelector('.pulse-dot')).animationName,
  }));
  ok('reduced motion: detected and shader clock slowed', r.reduceMotion === true && r.motionScale > 0 && r.motionScale < 0.3, JSON.stringify(r));
  ok('reduced motion: CSS decoration disabled', r.scanlines === 'none' && r.pulse === 'none', `scanlines=${r.scanlines} pulse=${r.pulse}`);
  await ctx.close();
}

/* ---------- 3. WebGL unavailable -> readable fallback ---------- */
{
  const { ctx, page } = await newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (String(type).startsWith('webgl') || type === 'experimental-webgl') return null;
      return orig.call(this, type, ...rest);
    };
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const f = document.getElementById('gl-fallback');
    return {
      mesh: !!window.__MESH__,
      hidden: f?.hidden,
      visible: f ? getComputedStyle(f).display !== 'none' : false,
      text: f?.innerText || '',
      bootGone: document.getElementById('boot-overlay')?.classList.contains('gone'),
      internalErrors: window.__MESH_ERRORS__ || [],
      panels: [!!document.getElementById('left-panel'), !!document.getElementById('right-panel')],
    };
  });
  ok('no WebGL: static fallback is visible', r.mesh === false && r.hidden === false && r.visible === true && r.bootGone === true, JSON.stringify({ mesh: r.mesh, hidden: r.hidden, visible: r.visible }));
  ok('no WebGL: fallback gives content-equivalent summary', /21/.test(r.text) && /474/.test(r.text) && /CC/.test(r.text), r.text.replace(/\n/g, ' | ').slice(0, 160));
  ok('no WebGL: no unhandled errors, panels still present', errs.length === 0 && r.internalErrors.length === 0 && r.panels.every(Boolean), JSON.stringify([...errs, ...r.internalErrors].slice(0, 2)));
  await ctx.close();
}

/* ---------- 4. context loss + background visibility ---------- */
{
  const { ctx, page } = await newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__MESH__ && window.__MESH__.frames > 5, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.__renderCount = 0;
    const s = window.__MESH__.scene;
    const orig = s.render.bind(s);
    s.render = () => { window.__renderCount++; return orig(); };
  });
  // Simulate a hidden tab: the pipeline should advance but GPU draws stop.
  const before = await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    return { frames: window.__MESH__.frames, elapsed: window.__MESH__.wf.state.elapsed, renders: window.__renderCount };
  });
  await page.waitForTimeout(1800);
  const hidden = await page.evaluate(() => ({ frames: window.__MESH__.frames, elapsed: window.__MESH__.wf.state.elapsed, renders: window.__renderCount }));
  ok('hidden tab: GPU rendering paused', hidden.renders - before.renders <= 1, `${hidden.renders - before.renders} renders while hidden`);
  // Browsers throttle/pause rAF in hidden tabs, so we only require the state
  // to stay consistent (no NaN / no backwards jump), not to keep advancing.
  ok('hidden tab: pipeline state stays consistent',
    Number.isFinite(hidden.elapsed) && hidden.elapsed >= before.elapsed && hidden.frames >= before.frames,
    `elapsed ${before.elapsed.toFixed(2)} -> ${hidden.elapsed.toFixed(2)}s, frames ${before.frames} -> ${hidden.frames}`);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  // Software-rendered CI runners may take several seconds per frame, so wait
  // for the condition instead of assuming a fixed sleep is enough.
  try {
    await page.waitForFunction((n) => window.__renderCount > n, hidden.renders, { timeout: 20000 });
  } catch { /* report the actual count below */ }
  const resumed = await page.evaluate(() => window.__renderCount);
  ok('visible tab: rendering resumes', resumed > hidden.renders, `${hidden.renders} -> ${resumed} renders`);

  const lostMethod = await page.evaluate(() => {
    const gl = document.getElementById('gl');
    const ext = gl.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
    else gl.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    return ext ? 'extension' : 'synthetic';
  });
  // webglcontextlost is dispatched asynchronously by the browser.
  await page.waitForTimeout(1200);
  const lost = await page.evaluate(() => {
    const f = document.getElementById('gl-fallback');
    return { visible: !f.hidden, title: f.querySelector('.gfb-title')?.textContent };
  });
  ok('context lost: readable fallback shown', lost.visible && /CONTEXT LOST/i.test(lost.title || ''), JSON.stringify({ ...lost, method: lostMethod }));
  await ctx.close();
}

/* ---------- 5. document metadata ---------- */
{
  const { ctx, page } = await newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const m = await page.evaluate(() => ({
    description: document.querySelector('meta[name="description"]')?.content || '',
    ogImage: document.querySelector('meta[property="og:image"]')?.content || '',
    theme: document.querySelector('meta[name="theme-color"]')?.content || '',
    referrer: document.querySelector('meta[name="referrer"]')?.content || '',
    icon: document.querySelector('link[rel="icon"]')?.href || '',
    noscript: !!document.querySelector('noscript'),
  }));
  ok('metadata: description / OG / theme / referrer', m.description.length > 40 && m.ogImage.includes('screenshot') && m.theme === '#04070d' && m.referrer.includes('strict-origin'), JSON.stringify(m).slice(0, 200));
  ok('metadata: real favicon + noscript note', m.icon.startsWith('data:image/svg+xml') && m.noscript, m.icon.slice(0, 42));
  await ctx.close();
}

await browser.close();
const passed = results.filter((r) => r.pass).length;
console.log(`\n=== UX ${passed}/${results.length} CHECKS PASSED ===`);
try {
  fs.mkdirSync('tools/shots', { recursive: true });
  fs.writeFileSync('tools/shots/ux-report.json', JSON.stringify({ base: BASE, passed, total: results.length, results }, null, 2));
} catch { /* report is best-effort */ }
if (passed !== results.length) process.exit(1);
