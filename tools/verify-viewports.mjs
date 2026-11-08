// Verify node-label placement across many viewport sizes on the LOCAL build.
// Usage: node tools/verify-viewports.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = fs.existsSync(MAC_CHROME) ? MAC_CHROME : undefined;
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/';
const VIEWPORTS = [
  [1440, 900], [1280, 800], [1600, 1000], [1366, 768],
  [1920, 1080], [1100, 760], [1024, 900],
];

const browser = await chromium.launch({
  executablePath: CHROME, headless: true,
  args: ['--enable-webgl', '--enable-unsafe-swiftshader', '--use-gl=angle',
    '--use-angle=swiftshader', '--no-sandbox', '--disable-gpu-sandbox'],
});
let failed = 0;

for (const [width, height] of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__MESH__ && window.__MESH__.frames > 12, { timeout: 60000 });
  await page.waitForTimeout(1600);

  const r = await page.evaluate(() => {
    const stage = document.getElementById('stage').getBoundingClientRect();
    const boxes = [...document.querySelectorAll('.nt-inner')]
      .filter((e) => +(e.closest('.node-tag')?.style.opacity || 0) > 0.1)
      .map((e) => e.getBoundingClientRect());
    let pairs = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) pairs++;
      }
    }
    const clipped = boxes.filter((b) =>
      b.left < stage.left - 1 || b.right > stage.right + 1 ||
      b.top < stage.top - 1 || b.bottom > stage.bottom + 1
    ).length;
    return { visible: boxes.length, pairs, clipped, stage: [Math.round(stage.width), Math.round(stage.height)] };
  });
  const ok = r.pairs === 0 && r.clipped === 0 && errors.length === 0 && r.visible === 21;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${width}x${height} :: stage ${r.stage.join('x')} labels ${r.visible} overlapping ${r.pairs} clipped ${r.clipped} errors ${errors.length}`);
  if (errors.length) console.log('      ', errors.slice(0, 2));
  await page.close();
}
await browser.close();
console.log(`\n=== VIEWPORTS ${VIEWPORTS.length - failed}/${VIEWPORTS.length} PASSED ===`);
if (failed) process.exit(1);
