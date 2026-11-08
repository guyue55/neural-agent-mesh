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

let ui = null;
let scene = null;
let wf = null;
const pendingLogs = [];

const hooks = {
  onLog: (entry) => { if (ui) ui.appendLog(entry); else pendingLogs.push(entry); },
  onPhase: (p, meta, s) => ui?.onPhase(p, meta, s),
  onGate: (open, count, desc) => ui?.onGate(open, count, desc),
  onGateTick: (n) => ui?.onGateTick(n),
  onUpdate: (s) => ui?.update(s),
  onRestart: () => ui?.buildBatches(),
  onComplete: () => {},
};

const bootStatus = document.getElementById('boot-status');

try {
  bootStatus.textContent = 'BUILDING 21-NODE DAG / 474 CHANNELS';
  scene = new NeuralScene({ canvas, stage, labels, graph }).init();

  bootStatus.textContent = 'ATTACHING AGENT STATE MACHINE';
  wf = new Workflow(graph, hooks);

  bootStatus.textContent = 'MOUNTING TELEMETRY CONSOLE';
  ui = new UI({ graph, workflow: wf, scene }).init();
  ui.onPhase(wf.state.phase, PHASE_META[wf.state.phase], wf.state);
  pendingLogs.forEach((entry) => ui.appendLog(entry));
  pendingLogs.length = 0;

  window.__MESH__ = { scene, wf, ui, graph, renderer: scene.renderer };

  const resize = () => scene.resize();
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

  let last = performance.now();
  let frames = 0;
  const loop = (now) => {
    // wall-clock driven so low-FPS / software-GL environments still advance
    // the pipeline in real time instead of crawling.
    const dt = Math.min(0.5, Math.max(0.001, (now - last) / 1000));
    last = now;
    frames++;
    wf.tick(dt);
    scene.syncFromState(wf.state);
    scene.update(dt, wf.state);
    scene.render();
    window.__MESH__.frames = frames;
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
  errors.push('BOOT: ' + String(err && err.stack ? err.stack : err));
  bootStatus.textContent = 'INITIALIZATION FAILED — SEE CONSOLE';
  console.error(err);
}
