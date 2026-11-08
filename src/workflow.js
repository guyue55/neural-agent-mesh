/* ============================================================
   workflow.js — multi-agent pipeline state machine & simulator
   CC (decompose) -> PM (ticket + review) -> 4 Workers (execute)
   -> specialists -> tickets, with handoff + QA + human gate.
   ============================================================ */
import {
  STATUS, DEFAULT_BRIEF, BATCH_DEFS, TASKS, TICKET_NAMES, PHASE_META,
} from './config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + (b - a) * Math.random();
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function fmtHMS(sec) {
  const s = Math.max(0, Math.floor(sec));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
function fmtStamp(sec) {
  const ms = Math.floor((sec % 1) * 1000);
  return `${fmtHMS(sec)}.${String(ms).padStart(3, '0')}`;
}

export class Workflow {
  constructor(graph, hooks = {}) {
    this.graph = graph;
    this.hooks = hooks;
    this.startWall = Date.now();
    this.reset(true);
  }

  /* -------------------------------------------------- state */
  reset(hard = false) {
    const { nodes, edges } = this.graph;
    for (const n of nodes) {
      n.status = STATUS.IDLE;
      n.progress = 0;
      n.energy = 0;
      n.handoffs = 0;
      n.task = 'AWAITING OBJECTIVE';
    }
    for (const e of edges) { e.energy = 0; e.reveal = 0; }

    this.state = {
      phase: hard ? 'BOOT' : 'DRAFT',
      prevPhase: 'RUN',
      elapsed: 0,
      phaseTime: 0,
      cost: 9.00,
      tokens: 0,
      cpu: 14,
      gpu: 22,
      brief: hard ? DEFAULT_BRIEF : (this.state?.brief || DEFAULT_BRIEF),
      briefTag: `#OBJ-${String((this.state?.cycle || 0) + 1).padStart(3, '0')}`,
      cycle: (this.state?.cycle || 0) + 1,
      logLines: hard ? 0 : (this.state?.logLines || 0),
      activePaths: 0,
      handoffs: 0,
      completedTickets: 0,
      gateOpen: false,
      gateCountdown: 8,
      nextGateAt: 17,
      revealProgress: 0,
      batches: BATCH_DEFS.map((b, i) => ({
        ...b, done: i < 3 ? b.total : Math.floor(b.total * 0.42), round: 1,
      })),
    };

    this._acc = 0;
    this._logAcc = 0;
    this._gateAcc = 0;
    this._ticketAcc = 0;
    this._completeAcc = 0;
    this._draftLogAcc = 0;
    this._buildLogAcc = 0;
    this._syncAcc = 0;
    this._handoffCursor = 0;

    if (hard) {
      this.log('SYS-00', 'info', 'neural mesh online · 21 nodes / 474 handoff channels');
      this.log('SYS-00', 'info', 'loading agent roster: CC / PM / 4 WORKERS / QA');
    } else {
      this.log('SYS-00', 'info', `pipeline restarted · cycle ${this.state.cycle} · state flushed`);
    }
    this.emitPhase();
  }

  setBrief(text) {
    const clean = String(text || '').trim();
    if (!clean) return false;
    this.state.brief = clean;
    this.state.briefTag = `#OBJ-${String(this.state.cycle + 1).padStart(3, '0')}`;
    this.log('CC-00', 'info', 'new objective received from operator:');
    this.log('CALL', 'assign', `"${clean.slice(0, 92)}${clean.length > 92 ? '...' : ''}"`);
    this.restart();
    return true;
  }

  emitPhase() {
    this.state.phaseTime = 0;
    this.hooks.onPhase?.(this.state.phase, PHASE_META[this.state.phase], this.state);
  }

  setPhase(phase) {
    if (!['DRAFT', 'BUILD', 'RUN'].includes(phase)) return;
    const s = this.state;
    if (s.gateOpen) this.closeGate(true);
    s.phase = phase;
    s.gateOpen = false;
    if (phase === 'DRAFT') {
      for (const e of this.graph.edges) { e.reveal = 0; e.energy = 0; }
      s.revealProgress = 0;
      this.log('CC-00', 'info', 'stage 01 · re-drafting objective decomposition');
    } else if (phase === 'BUILD') {
      this.log('PM-01', 'assign', 'stage 02 · rebuilding 474 handoff channels');
    } else {
      for (const e of this.graph.edges) e.reveal = 1;
      s.revealProgress = 1;
      this.log('PM-01', 'assign', `stage 03 · pipeline live · ${TICKET_NAMES.length} tickets dispatched`);
    }
    this.emitPhase();
  }

  toggleStop() {
    const s = this.state;
    if (s.phase === 'PAUSED') {
      s.phase = s.prevPhase || 'RUN';
      this.log('SYS-00', 'pass', 'operator resumed pipeline · workers re-attached');
      this.emitPhase();
    } else if (s.phase !== 'BOOT' && s.phase !== 'COMPLETE') {
      s.prevPhase = s.phase;
      s.phase = 'PAUSED';
      this.log('SYS-00', 'warn', 'STOP issued · pipeline halted, state preserved');
      this.emitPhase();
    }
  }

  restart() {
    this.reset(false);
    this.hooks.onRestart?.(this.state);
  }

  openGate() {
    const s = this.state;
    s.gateOpen = true;
    s.gateCountdown = 8;
    const hg = this.graph.nodes.find((n) => n.id === 'HG-02');
    if (hg) { hg.status = STATUS.GATE; hg.energy = 1; hg.task = 'AWAITING HUMAN SIGN-OFF'; }
    this.log('HG-02', 'gate', 'human gate opened · QA-06 requests approval on batch 192/192');
    this.hooks.onGate?.(true, s.gateCountdown, 'QA-06 requests sign-off on batch 192/192 before final handoff.');
  }

  closeGate(approved) {
    const s = this.state;
    if (!s.gateOpen) return;
    s.gateOpen = false;
    const hg = this.graph.nodes.find((n) => n.id === 'HG-02');
    if (hg) { hg.status = approved ? STATUS.DONE : STATUS.REVIEW; hg.progress = 100; hg.task = approved ? 'APPROVED · RELEASE UNBLOCKED' : 'REJECTED · REQUEUED'; }
    if (approved) {
      this.log('HG-02', 'pass', 'human gate APPROVED · release candidate cleared for merge');
    } else {
      this.log('HG-02', 'warn', 'human gate REJECTED · ticket requeued to PM-01');
    }
    s.nextGateAt = s.elapsed + 19;
    this.hooks.onGate?.(false, 0, '');
  }

  log(node, level, msg) {
    this.state.logLines++;
    this.hooks.onLog?.({
      time: fmtStamp(this.state.elapsed),
      node, level, msg,
    });
  }

  /* -------------------------------------------------- simulation */
  fireHandoff() {
    const { edges, primary, secondary, nodes } = this.graph;
    const s = this.state;
    const pool = Math.random() < 0.76 ? primary : secondary.concat(primary);
    const e = pick(pool);
    if (!e) return;

    e.energy = 1;
    // light up sibling channels on the same pair for a synaptic burst
    let burst = 0;
    for (const other of edges) {
      if (other !== e && other.from === e.from && other.to === e.to && Math.random() < 0.45) {
        other.energy = Math.max(other.energy, 0.62);
        if (++burst >= 5) break;
      }
    }

    const a = nodes[e.from], b = nodes[e.to];
    a.energy = 1;
    b.energy = 1;
    a.handoffs++; b.handoffs++;
    s.handoffs++;

    const task = pick(TASKS);
    b.task = task;
    if (b.tier === 4) {
      b.progress = clamp(b.progress + rand(9, 20), 0, 100);
      if (b.progress >= 100 && b.status !== STATUS.DONE) {
        b.status = STATUS.DONE;
        s.completedTickets++;
        this.log(b.id, 'pass', `ticket ${b.role} verified & closed · ${s.completedTickets}/8 delivered`);
      } else if (b.progress > 55) {
        b.status = STATUS.REVIEW;
      } else {
        b.status = STATUS.RUNNING;
      }
    } else {
      b.progress = clamp(b.progress + rand(2.5, 7), 0, 100);
      if (b.status === STATUS.IDLE || b.status === STATUS.QUEUED) b.status = STATUS.RUNNING;
    }
    if (a.status === STATUS.IDLE) a.status = STATUS.RUNNING;

    const frames = pick(['310/310', '192/192', '128/128']);
    this.log(b.id, 'handoff', `${a.id} -> ${b.id} · ${task} · ${frames} verified`);

    s.cost += rand(0.008, 0.045);
    s.tokens += rand(620, 2450);
    const open = s.batches.find((x) => x.done < x.total);
    if (open) {
      open.done = Math.min(open.total, open.done + Math.round(rand(1, 4)));
    } else {
      const last = s.batches[s.batches.length - 1];
      last.done = 0;
      last.round++;
      last.label = `DELIVERABLES R${String(last.round).padStart(2, '0')}`;
      this.log('QA-06', 'pass', `batch sealed · 310/310 · 192/192 · new batch R${last.round} opened`);
    }
  }

  /* A whole-mesh synchronous firing — the "neuron" moment where every
     backbone path lights up at once before the next handoff wave. */
  syncBurst() {
    const { primary, nodes } = this.graph;
    for (const e of primary) e.energy = Math.max(e.energy, 0.55 + Math.random() * 0.42);
    for (const n of nodes) n.energy = Math.max(n.energy, 0.48);
    this.log('SYS-00', 'info', `sync pulse · ${primary.length} backbone paths fired · 4 workers coherent`);
  }

  tick(dt) {
    dt = clamp(dt, 0, 0.5);
    const s = this.state;
    const { nodes, edges } = this.graph;

    // energy decay (visual) — continues even when paused so the mesh settles
    const decay = Math.exp(-dt * 1.6);
    let active = 0;
    for (const e of edges) {
      if (e.energy > 0.001) { e.energy *= decay; if (e.energy < 0.004) e.energy = 0; }
      if (e.energy > 0.08) active++;
    }
    for (const n of nodes) {
      if (n.energy > 0.001) { n.energy *= decay; if (n.energy < 0.004) n.energy = 0; }
    }
    s.activePaths = active;

    if (s.phase === 'PAUSED' || s.phase === 'BOOT') {
      if (s.phase === 'BOOT') {
        s.phaseTime += dt;
        if (s.phaseTime > 1.55) { s.phase = 'DRAFT'; this.emitPhase(); }
      }
      this.updateMetrics(dt, false);
      this.hooks.onUpdate?.(s);
      return;
    }

    s.elapsed += dt;
    s.phaseTime += dt;
    this.updateMetrics(dt, s.phase === 'RUN');

    if (s.phase === 'DRAFT') this.tickDraft(dt);
    else if (s.phase === 'BUILD') this.tickBuild(dt);
    else if (s.phase === 'RUN') this.tickRun(dt);
    else if (s.phase === 'COMPLETE') this.tickComplete(dt);

    if (s.gateOpen) {
      s.gateCountdown -= dt;
      this.hooks.onGateTick?.(Math.max(0, Math.ceil(s.gateCountdown)));
      if (s.gateCountdown <= 0) this.closeGate(true);
    }

    this.hooks.onUpdate?.(s);
  }

  updateMetrics(dt, running) {
    const s = this.state;
    if (running) {
      s.cost += dt * 0.038;
      s.tokens += dt * 18500;
    }
    const t = s.elapsed;
    const targetCpu = running ? 68 : 24;
    const targetGpu = running ? 79 : 34;
    s.cpu += (targetCpu + Math.sin(t * 1.7) * 9 + Math.sin(t * 0.53) * 5 - s.cpu) * Math.min(1, dt * 1.8);
    s.gpu += (targetGpu + Math.sin(t * 2.1 + 1) * 7 - s.gpu) * Math.min(1, dt * 1.8);
    s.cpu = clamp(s.cpu, 4, 98);
    s.gpu = clamp(s.gpu, 6, 99);
  }

  tickDraft(dt) {
    const s = this.state;
    const cc = this.graph.nodes[0];
    cc.status = STATUS.RUNNING;
    cc.progress = clamp((s.phaseTime / 3.2) * 100, 0, 100);
    cc.energy = 0.55 + Math.sin(s.elapsed * 4) * 0.25;
    cc.task = 'DECOMPOSING OBJECTIVE INTO ACCEPTANCE CRITERIA';

    this._draftLogAcc += dt;
    if (this._draftLogAcc > 0.72) {
      this._draftLogAcc = 0;
      const lines = [
        'brief parsed · 4 workstreams identified',
        'acceptance criteria bound to ticket contract',
        'human gate policy: require sign-off before merge',
        'budget ceiling set · cost telemetry attached',
        'dependency graph resolved · 474 channels queued',
      ];
      this.log('CC-00', 'info', lines[Math.min(lines.length - 1, Math.floor(s.phaseTime / 0.72))]);
    }

    if (s.phaseTime >= 3.2) {
      cc.status = STATUS.DONE;
      cc.progress = 100;
      this.log('CC-00', 'pass', `objective decomposed · 8 tickets handed to PM-01`);
      s.phase = 'BUILD';
      this.emitPhase();
    }
  }

  tickBuild(dt) {
    const s = this.state;
    const { edges, nodes } = this.graph;
    const p = clamp(s.phaseTime / 3.8, 0, 1);
    s.revealProgress = p;
    const revealCount = Math.floor(p * edges.length);
    for (let i = 0; i < revealCount; i++) {
      if (edges[i].reveal < 1) edges[i].reveal = clamp(edges[i].reveal + dt * 5.5, 0, 1);
    }

    const pm = nodes.find((n) => n.id === 'PM-01');
    const hg = nodes.find((n) => n.id === 'HG-02');
    pm.status = STATUS.RUNNING;
    pm.progress = clamp(p * 100, 0, 100);
    pm.energy = 0.7;
    pm.task = 'SPLITTING TICKETS & WIRING HANDOFFS';
    hg.status = STATUS.QUEUED;
    hg.progress = clamp(p * 62, 0, 62);
    hg.task = 'ARMED · WILL BLOCK BEFORE MERGE';

    this._buildLogAcc += dt;
    if (this._buildLogAcc > 0.52) {
      this._buildLogAcc = 0;
      const i = Math.floor(revealCount / 40) % 6;
      const lines = [
        `wiring handoff channels · ${String(revealCount).padStart(3, '0')}/474`,
        'assigning RS-03 WR-04 CD-05 QA-06 as online workers',
        'binding verification contract to every ticket',
        'registering human gate HG-02 on merge path',
        'validating DAG · 0 cycles detected',
        'parallel channels attached · fan-out 4 workers',
      ];
      this.log('PM-01', 'assign', lines[i]);
    }

    if (s.phaseTime >= 3.8) {
      for (const e of edges) e.reveal = 1;
      pm.status = STATUS.DONE;
      pm.progress = 100;
      this.log('PM-01', 'pass', 'build complete · 474/474 channels live · 4 workers online');
      s.phase = 'RUN';
      this.emitPhase();
    }
  }

  tickRun(dt) {
    const s = this.state;
    const { nodes } = this.graph;
    const workers = nodes.filter((n) => n.tier === 2);
    for (const w of workers) {
      if (w.status !== STATUS.DONE && w.status !== STATUS.REVIEW) w.status = STATUS.RUNNING;
      w.progress = clamp(w.progress + dt * rand(0.4, 1.6), 0, 99);
    }

    this._acc += dt;
    if (!s.gateOpen && this._acc > 0.42) {
      this._acc = 0;
      this.fireHandoff();
    }

    this._syncAcc += dt;
    if (this._syncAcc > 4.6) {
      this._syncAcc = 0;
      this.syncBurst();
    }

    this._logAcc += dt;
    if (this._logAcc > 2.35) {
      this._logAcc = 0;
      const flavour = [
        ['QA-06', 'pass', 'cross-verification passed · 0 unsupported claims'],
        ['AN-10', 'cost', `token spend +${Math.round(rand(900, 2600))} · session $${s.cost.toFixed(2)}`],
        ['RV-09', 'gate', 'adversarial review · weak claims dropped before merge'],
        ['SR-07', 'info', 'crawl worker ingested 42 new documents'],
        ['FT-08', 'pass', 'source verified against 3 independent references'],
        ['QA-06', 'warn', 'coordination loop detected -> re-routed to PM-01'],
        ['MG-12', 'info', 'release candidate staged · awaiting final ticket'],
      ];
      const l = pick(flavour);
      this.log(l[0], l[1], l[2]);
    }

    this._ticketAcc += dt;
    if (this._ticketAcc > 2.1) {
      this._ticketAcc = 0;
      const leaves = nodes.filter((n) => n.tier === 4 && n.status !== STATUS.DONE);
      if (leaves.length) {
        const n = pick(leaves);
        n.progress = clamp(n.progress + rand(4, 11), 0, 100);
        n.energy = 0.8;
        if (n.progress >= 100) {
          n.status = STATUS.DONE;
          s.completedTickets++;
          this.log(n.id, 'pass', `ticket ${n.role} verified & closed · ${s.completedTickets}/8 delivered`);
        }
      }
    }

    if (!s.gateOpen && s.elapsed > s.nextGateAt) this.openGate();
    if (s.completedTickets >= 8) {
      s.phase = 'COMPLETE';
      for (const n of nodes) { n.status = STATUS.DONE; n.progress = 100; }
      this.log('SYS-00', 'pass', `PIPELINE COMPLETE · 8/8 tickets · ${s.handoffs} handoffs · $${s.cost.toFixed(2)}`);
      this.emitPhase();
      this.hooks.onComplete?.(s);
    }
  }

  tickComplete(dt) {
    this._completeAcc += dt;
    const s = this.state;
    if (this._completeAcc > 5.5) {
      this._completeAcc = 0;
      this.log('SYS-00', 'info', 'autonomous loop engaged · restarting next cycle');
      this.restart();
    }
  }
}

export { fmtHMS };
