/* ============================================================
   config.js — static domain model & design tokens
   ============================================================ */

export const PALETTE = {
  bg:       0x04070d,
  green:    0x39ff9e,
  cyan:     0x29d8f2,
  purple:   0xa274ff,
  orange:   0xffb454,
  red:      0xff5f78,
  blue:     0x5b8dff,
  white:    0xdff2ff,
};

export const HEX = {
  green:  '#39ff9e',
  cyan:   '#29d8f2',
  purple: '#a274ff',
  orange: '#ffb454',
  red:    '#ff5f78',
  blue:   '#5b8dff',
};

export const STATUS = {
  IDLE:     'IDLE',
  QUEUED:   'QUEUED',
  RUNNING:  'RUNNING',
  REVIEW:   'REVIEW',
  GATE:     'GATE',
  DONE:     'DONE',
};

export const STATUS_COLOR = {
  IDLE:    'cyan',
  QUEUED:  'cyan',
  RUNNING: 'green',
  REVIEW:  'orange',
  GATE:    'orange',
  DONE:    'purple',
};

/* 21 nodes over 5 tiers — 1 / 2 / 4 / 6 / 8.
   Tier 2 is the "4 online workers" seen in the demo. */
export const NODE_DEFS = [
  { id: 'CC-00', name: 'CHIEF COORDINATOR', role: 'OBJECTIVE DECOMPOSITION', tier: 0, kind: 'core',       color: 'green'  },

  { id: 'PM-01', name: 'PROJECT MANAGER',   role: 'TICKETING & REVIEW',      tier: 1, kind: 'pm',         color: 'purple' },
  { id: 'HG-02', name: 'HUMAN GATE',        role: 'APPROVAL CHECKPOINT',     tier: 1, kind: 'gate',       color: 'orange' },

  { id: 'RS-03', name: 'RESEARCHER',        role: 'SOURCE ACQUISITION',      tier: 2, kind: 'worker',     color: 'cyan'   },
  { id: 'WR-04', name: 'WRITER / SCRIPTER', role: 'CONTENT SYNTHESIS',       tier: 2, kind: 'worker',     color: 'cyan'   },
  { id: 'CD-05', name: 'CODE WORKER',       role: 'IMPLEMENTATION',          tier: 2, kind: 'worker',     color: 'cyan'   },
  { id: 'QA-06', name: 'QA / TEST',         role: 'VERIFICATION',            tier: 2, kind: 'worker',     color: 'cyan'   },

  { id: 'SR-07', name: 'SOURCE SCANNER',    role: 'CRAWL WORKER',            tier: 3, kind: 'specialist', color: 'blue'   },
  { id: 'FT-08', name: 'FACT CHECKER',      role: 'CROSS-VERIFY',            tier: 3, kind: 'specialist', color: 'blue'   },
  { id: 'RV-09', name: 'PEER REVIEW',       role: 'ADVERSARIAL CHECK',       tier: 3, kind: 'specialist', color: 'blue'   },
  { id: 'AN-10', name: 'DATA ANALYST',      role: 'METRICS & COST',          tier: 3, kind: 'specialist', color: 'blue'   },
  { id: 'IM-11', name: 'ASSET RENDERER',    role: 'MULTIMODAL OUTPUT',       tier: 3, kind: 'specialist', color: 'blue'   },
  { id: 'MG-12', name: 'MERGE / BUILD',     role: 'INTEGRATION',             tier: 3, kind: 'specialist', color: 'blue'   },

  { id: 'TK-13', name: 'BRIEF SPLIT',       role: 'TICKET 01',               tier: 4, kind: 'leaf',       color: 'purple' },
  { id: 'TK-14', name: 'WEB CRAWL',         role: 'TICKET 02',               tier: 4, kind: 'leaf',       color: 'purple' },
  { id: 'TK-15', name: 'CITATION GRAPH',    role: 'TICKET 03',               tier: 4, kind: 'leaf',       color: 'purple' },
  { id: 'TK-16', name: 'DRAFT A',           role: 'TICKET 04',               tier: 4, kind: 'leaf',       color: 'purple' },
  { id: 'TK-17', name: 'DRAFT B',           role: 'TICKET 05',               tier: 4, kind: 'leaf',       color: 'purple' },
  { id: 'TK-18', name: 'UNIT TEST',         role: 'TICKET 06',               tier: 4, kind: 'leaf',       color: 'purple' },
  { id: 'TK-19', name: 'REGRESSION',        role: 'TICKET 07',               tier: 4, kind: 'leaf',       color: 'purple' },
  { id: 'TK-20', name: 'FINAL DELIVERY',    role: 'TICKET 08',               tier: 4, kind: 'delivery',   color: 'green'  },
];

export const TIER_LABEL = ['L0 · ORCHESTRATE', 'L1 · PLAN & GATE', 'L2 · WORKERS (4 ONLINE)', 'L3 · SPECIALISTS', 'L4 · TICKETS'];

export const TOTAL_NODES = NODE_DEFS.length;   // 21
export const TOTAL_EDGES = 474;

export const DEFAULT_BRIEF = 'Ship a verified multi-agent research-to-delivery pipeline with human approval gates.';

export const BATCH_DEFS = [
  { id: 'OCR',  label: 'OCR INGEST',      total: 310 },
  { id: 'TEST', label: 'REGRESSION',      total: 192 },
  { id: 'SRC',  label: 'SOURCE VERIFY',   total: 128 },
  { id: 'OUT',  label: 'DELIVERABLES',    total: 64  },
];

export const PHASES = ['BOOT', 'DRAFT', 'BUILD', 'RUN', 'PAUSED', 'COMPLETE'];

export const PHASE_META = {
  BOOT:     { text: 'INITIALIZING',      sub: 'BOOTING NEURAL MESH',        state: 'STANDBY'  },
  DRAFT:    { text: 'DRAFT · PHASE 01',  sub: 'CC-00 DECOMPOSING OBJECTIVE', state: 'DRAFTING' },
  BUILD:    { text: 'BUILD · PHASE 02',  sub: 'PM-01 WIRING 474 HANDOFFS',   state: 'BUILDING' },
  RUN:      { text: 'RUN PIPELINE',      sub: '4 WORKERS · AUTONOMOUS LOOP', state: 'RUNNING'  },
  PAUSED:   { text: 'PAUSED',            sub: 'PIPELINE HALTED BY OPERATOR', state: 'HALTED'   },
  COMPLETE: { text: 'COMPLETE',          sub: 'ALL TICKETS VERIFIED',        state: 'COMPLETE' },
};

/* Human-readable task strings used by the simulator */
export const TASKS = [
  'parsing objective into acceptance criteria',
  'allocating ticket budget across workstreams',
  'resolving dependency graph for handoff order',
  'crawling primary sources with rate limiting',
  'cross-checking claims against 3 independent sources',
  'drafting section from verified evidence pack',
  'generating implementation patch for ticket',
  'running unit suite against staged build',
  'scoring draft against review rubric',
  'merging artifacts into release candidate',
  'verifying citation graph for orphan nodes',
  'estimating token spend for remaining queue',
  'compiling regression report for QA gate',
  'packaging deliverables for final sign-off',
];

export const TICKET_NAMES = [
  'BRIEF SPLIT', 'WEB CRAWL', 'CITATION GRAPH', 'DRAFT A',
  'DRAFT B', 'UNIT TEST', 'REGRESSION', 'FINAL DELIVERY',
];
