/* ============================================================
   main.js — application bootstrap & frame loop
   ============================================================ */
import { buildGraph } from './graph.js';
import { NeuralScene } from './scene3d.js';
import { Workflow } from './workflow.js';
import { UI } from './ui.js';
import { PHASE_META } from './config.js';

const errors = [];
window.__MESH_ERRORS__ = errors;
window.addEventListener('error', (e) => errors.push(String(e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => errors.push('PROMISE: ' + String(e.reason)));

const graph = buildGraph();
const stage = document.getElementById('stage');
const canvas = document.getElementById('gl');
const labels = document.getElementById('labels');
const bootStatus = document.getElementById('boot-status');
const bootOverlay = document.getElementById('boot-overlay');
const fallback = document.getElementById('gl-fallback');

const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

let ui = null;
let scene = null;
let wf = null;
let glLost = false;
const pendingLogs = [];

/** Visible, content-equivalent fallback instead of a blank canvas / "see console". */
function showFallback(title, copy, hint) {
  if (fallback) {
    const set = (sel, text) => { const el = fallback.querySelector(sel); if (el) el.textContent = text; };
    set('.gfb-title', title);
    set('.gfb-copy', copy);
    set('.gfb-hint', hint);
    fallback.hidden = false;
  }
  bootOverlay?.classList.add('gone');
  if (bootStatus) bootStatus.textContent = title;
}
document.getElementById('gfb-retry')?.addEventListener('click', () => location.reload());

const hooks = {
  onLog: (entry) => { if (ui) ui.appendLog(entry); else pendingLogs.push(entry); },
  onPhase: (p, meta, s) => ui?.onPhase(p, meta, s),
  onGate: (open, count, desc) => ui?.onGate(open, count, desc),
  onGateTick: (n) => ui?.onGateTick(n),
  onUpdate: (s) => ui?.update(s),
  onRestart: () => ui?.buildBatches(),
  onComplete: () => {},
};

try {
  bootStatus.textContent = 'BUILDING 21-NODE DAG / 474 CHANNELS';
  scene = new NeuralScene({ canvas, stage, labels, graph }).init();
  // Reduced-motion users still get a live pipeline, but the shader clock and
  // decorative rotation advance slowly instead of animating at full speed.
  scene.motionScale = reduceMotion ? 0.12 : 1;

  bootStatus.textContent = 'ATTACHING AGENT STATE MACHINE';
  wf = new Workflow(graph, hooks);

  bootStatus.textContent = 'MOUNTING TELEMETRY CONSOLE';
  ui = new UI({ graph, workflow: wf, scene }).init();
  ui.onPhase(wf.state.phase, PHASE_META[wf.state.phase], wf.state);
  pendingLogs.forEach((entry) => ui.appendLog(entry));
  pendingLogs.length = 0;

  window.__MESH__ = { scene, wf, ui, graph, renderer: scene.renderer, reduceMotion };

  const resize = () => scene.resize();
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

  // A lost GPU context must not leave a black canvas or a spinning loop that
  // throws every frame. Show a readable fallback; a reload rebuilds all GPU
  // resources deterministically (Three.js does not restore custom shaders).
  canvas.addEventListener('webglcontextlost', (ev) => {
    ev.preventDefault();
    glLost = true;
    showFallback(
      'GRAPHICS CONTEXT LOST',
      'The browser released the WebGL context, so the neural mesh stopped drawing. The pipeline console remains readable. Reload to rebuild the 3D scene.',
      'This usually happens after a GPU driver reset, a tab suspension, or low memory.',
    );
  });
  canvas.addEventListener('webglcontextrestored', () => location.reload());

  let last = performance.now();
  let frames = 0;
  const loop = (now) => {
    // wall-clock driven so low-FPS / software-GL environments still advance
    // the pipeline in real time instead of crawling.
    const dt = Math.min(0.5, Math.max(0.001, (now - last) / 1000));
    last = now;
    frames++;
    wf.tick(dt);
    window.__MESH__.frames = frames;

    // Skip GPU work while hidden or after context loss; the state machine
    // keeps running so returning to the tab shows the correct progress.
    if (document.hidden || glLost) { requestAnimationFrame(loop); return; }

    scene.syncFromState(wf.state);
    scene.update(dt, wf.state);
    scene.render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const bootSteps = [
    [380, 'COMPILING GLSL RIBBON SHADERS'],
    [820, 'ENABLING BLOOM + CRT POST PIPELINE'],
    [1220, 'NEURAL MESH ONLINE'],
  ];
  bootSteps.forEach(([ms, text]) => setTimeout(() => { bootStatus.textContent = text; }, ms));
  setTimeout(() => ui.bootDone(), 1550);
} catch (err) {
  const msg = String(err && err.message ? err.message : err);
  if (/webgl/i.test(msg)) {
    // Expected capability gap, not an application bug: degrade gracefully.
    console.warn('[mesh] WebGL unavailable — static fallback shown:', msg);
    showFallback(
      'WEBGL UNAVAILABLE',
      'This browser could not create a WebGL context, so the neural mesh cannot be drawn. The pipeline console beside this panel remains readable and the topology is summarised below.',
      'Try enabling hardware acceleration, updating your browser, or reloading the page.',
    );
  } else {
    errors.push('BOOT: ' + String(err && err.stack ? err.stack : err));
    console.error(err);
    showFallback(
      'INITIALIZATION FAILED',
      'The visualizer could not start. The pipeline topology is summarised below; reloading usually resolves transient failures.',
      'Check the browser console for the technical details if the problem persists.',
    );
  }
}
