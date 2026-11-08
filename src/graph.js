/* ============================================================
   graph.js — deterministic 21-node / 474-edge DAG construction
   ============================================================ */
import * as THREE from 'three';
import { NODE_DEFS, PALETTE, TOTAL_EDGES, STATUS } from './config.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(0xC0DE2026);
const rand = (a, b) => a + (b - a) * rng();
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

export function cubicBezier(p0, p1, p2, p3, t, out) {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  out.set(
    a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    a * p0.z + b * p1.z + c * p2.z + d * p3.z
  );
  return out;
}

export function cubicTangent(p0, p1, p2, p3, t, out) {
  const u = 1 - t;
  out.set(
    3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
    3 * u * u * (p1.z - p0.z) + 6 * u * t * (p2.z - p1.z) + 3 * t * t * (p3.z - p2.z)
  );
  if (out.lengthSq() < 1e-8) out.set(1, 0, 0);
  return out.normalize();
}

function layoutNodes(defs) {
  const tiers = [];
  for (const d of defs) (tiers[d.tier] ||= []).push(d);

  return defs.map((def, index) => {
    const group = tiers[def.tier];
    const i = group.indexOf(def);
    const x = (def.tier - 2) * 5.65;
    let y = 0, z = 0;
    if (group.length > 1) {
      const R = 2.75 + def.tier * 0.66;
      const angle = (Math.PI * 2 * i) / group.length + def.tier * 0.46 - Math.PI / 2;
      y = R * Math.cos(angle);
      z = R * Math.sin(angle) * 0.68 + rand(-0.7, 0.7);
    } else {
      z = rand(-0.4, 0.4);
    }
    return {
      ...def,
      index,
      pos: new THREE.Vector3(x, y, z),
      basePos: new THREE.Vector3(x, y, z),
      status: STATUS.IDLE,
      progress: 0,
      energy: 0,
      handoffs: 0,
      task: 'AWAITING OBJECTIVE',
      phaseOffset: rand(0, Math.PI * 2),
    };
  });
}

function makeEdge(from, to, weight, kind, colorA, colorB) {
  const p0 = from.pos.clone();
  const p3 = to.pos.clone();
  const d = new THREE.Vector3().subVectors(p3, p0);
  const gap = Math.max(1, to.tier - from.tier);
  const perp = new THREE.Vector3(-d.y, d.x, 0);
  if (perp.lengthSq() < 1e-6) perp.set(0, 1, 0);
  perp.normalize();

  // duplicate handoff channels fan out so 474 distinct paths stay legible
  const channel = rand(-1, 1);
  const bow = channel * (1.05 + gap * 0.82) * (weight > 0.7 ? 0.72 : 1.0);
  const zb = rand(-1, 1) * (1.15 + gap * 0.62);
  const yb = rand(-0.65, 0.65);

  const p1 = p0.clone().addScaledVector(d, 0.30).addScaledVector(perp, bow * 0.80);
  const p2 = p0.clone().addScaledVector(d, 0.70).addScaledVector(perp, bow * 1.00);
  p1.z += zb;          p2.z += zb * 0.72;
  p1.y += yb;          p2.y -= yb * 0.55;

  // tier tint gives the mesh distinct colour bands: purple -> cyan -> blue -> green
  const TIER_TINT = [PALETTE.green, PALETTE.purple, PALETTE.cyan, PALETTE.blue, PALETTE.green];
  const tint = new THREE.Color(TIER_TINT[to.tier] || PALETTE.cyan);
  const color = colorA.clone().lerp(colorB, 0.45).lerp(tint, 0.38);
  if (kind === 'primary') color.multiplyScalar(1.30);
  else if (kind === 'secondary') color.multiplyScalar(0.95);
  else color.multiplyScalar(0.52);

  return {
    from: from.index,
    to: to.index,
    p0, p1, p2, p3,
    seed: rng(),
    weight,
    kind,
    tierGap: gap,
    color,
    energy: 0,
    reveal: 0,
    revealOrder: rng(),
  };
}

export function buildGraph() {
  const nodes = layoutNodes(NODE_DEFS);
  const tiers = [];
  for (const n of nodes) (tiers[n.tier] ||= []).push(n);
  const colorOf = (n) => new THREE.Color(PALETTE[n.color] ?? PALETTE.cyan);

  const edges = [];
  const add = (a, b, w, k) => edges.push(makeEdge(a, b, w, k, colorOf(a), colorOf(b)));

  // 1) Backbone: every node in tier t hands off to 2-4 nodes in tier t+1.
  for (let t = 0; t < tiers.length - 1; t++) {
    const src = tiers[t], dst = tiers[t + 1];
    for (const a of src) {
      const count = Math.min(dst.length, Math.max(2, Math.round(dst.length * 0.62)));
      const shuffled = [...dst].sort(() => rng() - 0.5);
      for (let i = 0; i < count; i++) add(a, shuffled[i], 1.0, 'primary');
    }
    // guarantee every downstream node has at least one inbound handoff
    for (const b of dst) {
      if (!edges.some((e) => e.to === b.index && nodes[e.from].tier === t)) {
        add(pick(src), b, 0.92, 'primary');
      }
    }
  }

  // 2) Skip-level supervision / feedback-free shortcuts (still strictly forward => acyclic).
  for (let i = 0; i < 118; i++) {
    const t = 0 + Math.floor(rng() * (tiers.length - 2));
    const ahead = t + 2 + Math.floor(rng() * Math.max(1, tiers.length - t - 2));
    if (!tiers[ahead]) continue;
    add(pick(tiers[t]), pick(tiers[ahead]), 0.46, 'secondary');
  }

  // 3) Parallel handoff channels over existing pairs -> dense "synapse" mesh up to 474.
  const backbone = edges.slice();
  let guard = 0;
  while (edges.length < TOTAL_EDGES && guard++ < TOTAL_EDGES * 12) {
    const base = pick(backbone);
    const a = nodes[base.from], b = nodes[base.to];
    add(a, b, 0.16 + rng() * 0.10, 'tertiary');
  }

  // revealOrder drives the BUILD-stage "synapse growth" animation.
  // After sorting, index === array position === GPU segment id (single source of truth).
  edges.sort((a, b) => a.revealOrder - b.revealOrder);
  edges.forEach((e, i) => { e.index = i; e.revealIndex = i; });

  const primary = edges.filter((e) => e.kind === 'primary');
  const secondary = edges.filter((e) => e.kind === 'secondary');

  return { nodes, edges, tiers, primary, secondary, total: edges.length };
}
