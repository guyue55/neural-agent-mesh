/* ============================================================
   ui.js — DOM console, telemetry, interactions
   ============================================================ */
import { HEX, STATUS_COLOR, TIER_LABEL } from './config.js';
import { fmtHMS as fmt } from './workflow.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export class UI {
  constructor({ graph, workflow, scene }) {
    this.graph = graph;
    this.wf = workflow;
    this.scene = scene;
    this.selected = -1;
    this.roster = [];
    this.batchEls = [];
    this._lastNum = 0;
    this._lastCard = 0;
    this._logCount = 0;
  }

  init() {
    this.logEl = $('log');
    this.buildRoster();
    this.buildBatches();
    this.bindEvents();
    this.scene.onPick = (i) => this.selectNode(i);
    this.update(this.wf.state, true);
    return this;
  }

  /* ---------------- construction ---------------- */
  buildRoster() {
    const list = $('agent-list');
    list.innerHTML = '';
    this.graph.nodes.forEach((n, i) => {
      const el = document.createElement('div');
      el.className = 'agent-card';
      el.dataset.index = String(i);
      el.style.setProperty('--accent', HEX[STATUS_COLOR[n.status]] || HEX.cyan);
      el.innerHTML = `
        <div class="ac-top"><span class="ac-id">${esc(n.id)} <em style="font-style:normal;opacity:.55">${esc(TIER_LABEL[n.tier].split(' ')[0])}</em></span><span class="ac-state">${n.status}</span></div>
        <div class="ac-name">${esc(n.name)}</div>
        <div class="ac-bar"><i></i></div>
        <div class="ac-role">${esc(n.role)}</div>`;
      el.addEventListener('click', () => this.selectNode(i));
      list.appendChild(el);
      this.roster.push({
        el,
        state: el.querySelector('.ac-state'),
        bar: el.querySelector('.ac-bar i'),
      });
    });
    $('roster-count').textContent = `${this.graph.nodes.length} NODES`;
    $('hud-nodes').textContent = String(this.graph.nodes.length);
    $('hud-edges').textContent = String(this.graph.edges.length);
  }

  buildBatches() {
    const list = $('batch-list');
    list.innerHTML = '';
    this.batchEls = this.wf.state.batches.map((b) => {
      const el = document.createElement('div');
      el.className = 'batch-row';
      el.innerHTML = `<div class="br-top"><span>${esc(b.label)}</span><b>0/${b.total}</b></div><div class="batch-bar"><i></i></div>`;
      list.appendChild(el);
      return { el, val: el.querySelector('b'), bar: el.querySelector('i') };
    });
  }

  /* ---------------- events ---------------- */
  bindEvents() {
    $('stage-buttons').addEventListener('click', (e) => {
      const btn = e.target.closest('.stage-btn');
      if (!btn) return;
      this.wf.setPhase(btn.dataset.action);
    });

    $('btn-apply').addEventListener('click', () => this.applyBrief());
    $('brief-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this.applyBrief(); }
    });
    $('btn-stop').addEventListener('click', () => this.wf.toggleStop());
    $('btn-restart').addEventListener('click', () => { this.wf.restart(); this.buildBatches(); });
    $('gate-approve').addEventListener('click', () => this.wf.closeGate(true));
    $('gate-reject').addEventListener('click', () => this.wf.closeGate(false));
    $('ins-close').addEventListener('click', () => this.selectNode(-1));

    window.addEventListener('keydown', (e) => {
      if (e.target && ['TEXTAREA', 'INPUT'].includes(e.target.tagName)) return;
      if (e.key === '1') this.wf.setPhase('DRAFT');
      else if (e.key === '2') this.wf.setPhase('BUILD');
      else if (e.key === '3') this.wf.setPhase('RUN');
      else if (e.key === ' ') { e.preventDefault(); this.wf.toggleStop(); }
      else if (e.key === 'r' || e.key === 'R') { this.wf.restart(); this.buildBatches(); }
      else if (e.key === 'Escape') this.selectNode(-1);
    });
  }

  applyBrief() {
    const ta = $('brief-input');
    const ok = this.wf.setBrief(ta.value);
    if (ok) {
      this.buildBatches();
      ta.value = '';
      ta.placeholder = 'Objective accepted. Paste another brief to re-run...';
    } else {
      ta.classList.add('shake');
      setTimeout(() => ta.classList.remove('shake'), 400);
      ta.focus();
    }
  }

  /* ---------------- log ---------------- */
  appendLog(entry) {
    const row = document.createElement('div');
    row.className = 'log-row';
    row.innerHTML =
      `<div class="lr-meta">` +
        `<span class="lr-time">${esc(entry.time)}</span>` +
        `<span class="lr-node">${esc(entry.node)}</span>` +
        `<span class="lr-level ${esc(entry.level)}">${esc(entry.level.toUpperCase())}</span>` +
      `</div>` +
      `<span class="lr-msg">${esc(entry.msg)}</span>`;
    this.logEl.appendChild(row);
    while (this.logEl.children.length > 200) this.logEl.removeChild(this.logEl.firstChild);
    this.logEl.scrollTop = this.logEl.scrollHeight;
    this._logCount++;
    $('log-lines').textContent = String(this._logCount).padStart(4, '0');
  }

  /* ---------------- phase / gate ---------------- */
  onPhase(phase, meta, state) {
    $('phase-badge-text').textContent = meta.text;
    $('phase-badge-sub').textContent = meta.sub;
    $('sb-state').textContent = meta.state;
    $('lm-status').textContent = meta.state;
    $('top-status').textContent = phase === 'PAUSED' ? 'SYSTEM HALTED' : (phase === 'COMPLETE' ? 'CYCLE COMPLETE' : 'SYSTEM LIVE');

    const order = ['DRAFT', 'BUILD', 'RUN'];
    const cur = order.indexOf(phase);
    document.querySelectorAll('.phase-step').forEach((el) => {
      const i = order.indexOf(el.dataset.phase);
      el.classList.toggle('active', el.dataset.phase === phase);
      el.classList.toggle('done', i >= 0 && i < cur);
    });
    document.querySelectorAll('.stage-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.action === phase);
    });
    $('btn-stop').textContent = phase === 'PAUSED' ? 'RESUME' : 'STOP';
    $('brief-text').textContent = state.brief;
    $('brief-tag').textContent = state.briefTag;
  }

  onGate(open, countdown, desc) {
    const modal = $('gate-modal');
    modal.hidden = !open;
    if (open) {
      $('gate-desc').textContent = desc;
      $('gate-countdown').textContent = String(countdown).padStart(2, '0');
    }
  }

  onGateTick(n) {
    $('gate-countdown').textContent = String(n).padStart(2, '0');
  }

  /* ---------------- inspector ---------------- */
  selectNode(index) {
    this.selected = index;
    this.scene.setSelected(index);
    this.roster.forEach((r, i) => r.el.classList.toggle('selected', i === index));
    const ins = $('inspector');
    if (index < 0) { ins.hidden = true; return; }
    ins.hidden = false;
    const n = this.graph.nodes[index];
    $('ins-id').textContent = n.id;
    $('ins-name').textContent = n.name;
    $('ins-role').textContent = n.role;
    this.refreshInspector();
  }

  refreshInspector() {
    if (this.selected < 0) return;
    const n = this.graph.nodes[this.selected];
    $('ins-state').textContent = n.status;
    $('ins-state').style.color = HEX[STATUS_COLOR[n.status]] || HEX.cyan;
    $('ins-progress').textContent = `${Math.round(n.progress)}%`;
    $('ins-tier').textContent = `L${n.tier}`;
    $('ins-handoffs').textContent = String(n.handoffs);
    $('ins-bar-fill').style.width = `${n.progress}%`;
    $('ins-task').textContent = `CURRENT: ${n.task}`;
  }

  /* ---------------- per-frame telemetry ---------------- */
  update(state, force = false) {
    const now = performance.now();
    if (!force && now - this._lastNum < 90) return;
    this._lastNum = now;

    const t = fmt(state.elapsed);
    $('clock').textContent = t;
    $('sb-runtime').textContent = t;
    $('lm-runtime').textContent = t;
    $('sb-cost').textContent = `$${state.cost.toFixed(2)}`;
    $('lm-cost').textContent = `$${state.cost.toFixed(2)}`;
    $('sb-tokens').textContent = `${(state.tokens / 1e6).toFixed(2)}M`;
    $('sb-workers').textContent = state.phase === 'RUN' ? '4 / 4' : (state.phase === 'PAUSED' ? '0 / 4' : '2 / 4');

    let done = 0, total = 0;
    state.batches.forEach((b, i) => {
      done += b.done; total += b.total;
      const e = this.batchEls[i];
      if (!e) return;
      e.val.textContent = `${b.done}/${b.total}`;
      e.bar.style.width = `${(b.done / b.total) * 100}%`;
    });
    $('sb-throughput').textContent = `${done}/${total}`;

    const cpu = Math.round(state.cpu), gpu = Math.round(state.gpu);
    $('sb-cpu').style.width = `${cpu}%`;
    $('sb-gpu').style.width = `${gpu}%`;
    $('sb-cpu-val').textContent = `${cpu}%`;
    $('sb-gpu-val').textContent = `${gpu}%`;

    $('hud-active').textContent = String(state.activePaths);
    $('hud-graph-bar').style.width = `${state.revealProgress * 100}%`;
    $('brief-tickets').textContent = `${String(state.completedTickets).padStart(2, '0')}/08 TICKETS`;

    if (force || now - this._lastCard > 200) {
      this._lastCard = now;
      this.graph.nodes.forEach((n, i) => {
        const r = this.roster[i];
        const key = STATUS_COLOR[n.status];
        if (r._state !== n.status) {
          r.state.textContent = n.status;
          r.el.style.setProperty('--accent', HEX[key] || HEX.cyan);
          r._state = n.status;
        }
        const p = Math.round(n.progress);
        if (r._pct !== p) { r.bar.style.width = `${p}%`; r._pct = p; }
      });
      this.refreshInspector();
    }
  }

  bootDone() {
    $('boot-overlay').classList.add('gone');
  }
}
