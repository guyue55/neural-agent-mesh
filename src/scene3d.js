/* ============================================================
   scene3d.js — Three.js neural mesh renderer
   ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as S from './shaders.js';
import { PALETTE, HEX, STATUS_COLOR } from './config.js';
import { cubicBezier, cubicTangent } from './graph.js';

const SEG = 22;                       // samples per bezier edge
const VERTS_PER_EDGE = (SEG + 1) * 2;
const ADD = THREE.AdditiveBlending;

const RADIUS = {
  core: 0.56, pm: 0.48, gate: 0.46, worker: 0.43,
  specialist: 0.33, leaf: 0.29, delivery: 0.50,
};

export class NeuralScene {
  constructor({ canvas, stage, labels, graph }) {
    this.canvas = canvas;
    this.stage = stage;
    this.labelsEl = labels;
    this.graph = graph;
    this.time = 0;
    this.pixelScale = 800;
    this.selected = -1;
    this.hovered = -1;
    this.labelEls = [];
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._tmpV = new THREE.Vector3();
    this._tmpV2 = new THREE.Vector3();
    this._tmpP = new THREE.Vector3();
    this._tmpT = new THREE.Vector3();
    this._lastEnergy = new Float32Array(graph.edges.length);
    this._lastReveal = new Float32Array(graph.edges.length);
    this._lastNodeColor = new Array(graph.nodes.length).fill('');
    this.onPick = null;
  }

  init() {
    const w = Math.max(1, this.stage.clientWidth);
    const h = Math.max(1, this.stage.clientHeight);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(PALETTE.bg, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.scene = new THREE.Scene();

    this.baseFov = 47;
    this.designAspect = 1.1;
    this.camera = new THREE.PerspectiveCamera(this.baseFov, w / h, 0.1, 240);
    this.camera.position.set(0, 2.1, 27.5);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.enablePan = false;
    this.controls.minDistance = 15;
    this.controls.maxDistance = 54;
    this.controls.minPolarAngle = 0.55;
    this.controls.maxPolarAngle = 2.45;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.75;
    this.controls.target.set(0, 0, 0);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.buildGrid();
    this.buildStars();
    this.buildTierRings();
    this.buildEdges();
    this.buildNodes();
    this.buildHalos();
    this.buildPulses();
    this.buildPost(w, h);
    this.buildLabels();
    this.bindPointer();

    this.resize();
    return this;
  }

  /* ---------------- background ---------------- */
  buildGrid() {
    const geo = new THREE.PlaneGeometry(64, 46, 1, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: S.GRID_VERT,
      fragmentShader: S.GRID_FRAG,
      transparent: true,
      blending: ADD,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -7.4;
    mesh.renderOrder = -3;
    this.scene.add(mesh);
    this.gridMat = mat;
  }

  buildStars() {
    const N = 520;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const phase = new Float32Array(N);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 76;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 44;
      pos[i * 3 + 2] = -6 - Math.random() * 34;
      c.setHSL(0.53 + Math.random() * 0.12, 0.55, 0.42 + Math.random() * 0.36);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      size[i] = 0.018 + Math.random() * 0.055;
      phase[i] = Math.random() * 6.283;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelScale: { value: 800 } },
      vertexShader: S.STAR_VERT,
      fragmentShader: S.STAR_FRAG,
      transparent: true,
      blending: ADD,
      depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = -2;
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.starMat = mat;
  }

  buildTierRings() {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x1c6b88, transparent: true, opacity: 0.09,
      blending: ADD, depthWrite: false,
    });
    for (let t = 0; t < 5; t++) {
      const geo = new THREE.TorusGeometry(5.25 + t * 0.42, 0.009, 4, 96);
      const ring = new THREE.Mesh(geo, mat);
      ring.position.x = (t - 2) * 5.65;
      ring.rotation.y = Math.PI / 2;
      ring.renderOrder = -1;
      this.root.add(ring);
    }
  }

  /* ---------------- 474 glowing wave ribbons ---------------- */
  buildEdges() {
    const edges = this.graph.edges;
    const count = edges.length;
    const total = count * VERTS_PER_EDGE;

    const position = new Float32Array(total * 3);
    const tangent  = new Float32Array(total * 3);
    const color    = new Float32Array(total * 3);
    const side     = new Float32Array(total);
    const progress = new Float32Array(total);
    const seed     = new Float32Array(total);
    const weight   = new Float32Array(total);
    this.edgeEnergy = new Float32Array(total);
    this.edgeReveal = new Float32Array(total);

    const idxCount = count * SEG * 6;
    const indices = total > 65535 ? new Uint32Array(idxCount) : new Uint16Array(idxCount);

    const P = this._tmpP, T = this._tmpT;
    let vi = 0, ii = 0;

    edges.forEach((e, ei) => {
      const base = ei * VERTS_PER_EDGE;
      for (let s = 0; s <= SEG; s++) {
        const t = s / SEG;
        cubicBezier(e.p0, e.p1, e.p2, e.p3, t, P);
        cubicTangent(e.p0, e.p1, e.p2, e.p3, t, T);
        for (let k = 0; k < 2; k++) {
          const o3 = vi * 3;
          position[o3] = P.x; position[o3 + 1] = P.y; position[o3 + 2] = P.z;
          tangent[o3]  = T.x; tangent[o3 + 1]  = T.y; tangent[o3 + 2]  = T.z;
          color[o3]    = e.color.r; color[o3 + 1] = e.color.g; color[o3 + 2] = e.color.b;
          side[vi] = k === 0 ? -1 : 1;
          progress[vi] = t;
          seed[vi] = e.seed;
          weight[vi] = e.weight;
          vi++;
        }
      }
      for (let s = 0; s < SEG; s++) {
        const a = base + s * 2;
        indices[ii++] = a;     indices[ii++] = a + 1; indices[ii++] = a + 2;
        indices[ii++] = a + 2; indices[ii++] = a + 1; indices[ii++] = a + 3;
      }
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geo.setAttribute('aTangent', new THREE.BufferAttribute(tangent, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    geo.setAttribute('aProgress', new THREE.BufferAttribute(progress, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aWeight', new THREE.BufferAttribute(weight, 1));
    this.energyAttr = new THREE.BufferAttribute(this.edgeEnergy, 1);
    this.revealAttr = new THREE.BufferAttribute(this.edgeReveal, 1);
    this.energyAttr.setUsage(THREE.DynamicDrawUsage);
    this.revealAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aEnergy', this.energyAttr);
    geo.setAttribute('aReveal', this.revealAttr);
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeBoundingSphere();

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:    { value: 0 },
        uWaveAmp: { value: 0.17 },
      },
      vertexShader: S.EDGE_VERT,
      fragmentShader: S.EDGE_FRAG,
      transparent: true,
      blending: ADD,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.edgeMat = mat;
    this.edgeMesh = new THREE.Mesh(geo, mat);
    this.edgeMesh.frustumCulled = false;
    this.edgeMesh.renderOrder = 0;
    this.root.add(this.edgeMesh);
  }

  /* ---------------- 21 agent nodes ---------------- */
  buildNodes() {
    this.nodeGroups = [];
    this.coreMats = [];
    this.ringMats = [];
    this.pickMeshes = [];
    const coreGeo = new THREE.IcosahedronGeometry(1, 2);
    const ringGeo = new THREE.TorusGeometry(1, 0.018, 6, 72);

    this.graph.nodes.forEach((n) => {
      const r = RADIUS[n.kind] || 0.32;
      const col = new THREE.Color(PALETTE[n.color] || PALETTE.cyan);
      const g = new THREE.Group();
      g.position.copy(n.pos);

      const coreMat = new THREE.ShaderMaterial({
        uniforms: {
          uColor:  { value: col.clone() },
          uTime:   { value: 0 },
          uEnergy: { value: 0 },
          uSeed:   { value: n.phaseOffset },
        },
        vertexShader: S.NODE_VERT,
        fragmentShader: S.NODE_FRAG,
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.scale.setScalar(r);
      core.userData.nodeIndex = n.index;
      core.renderOrder = 1;
      g.add(core);
      this.pickMeshes.push(core);

      const ringMat = new THREE.MeshBasicMaterial({
        color: col.clone(), transparent: true, opacity: 0.46,
        blending: ADD, depthWrite: false,
      });
      const ring1 = new THREE.Mesh(ringGeo, ringMat);
      ring1.scale.setScalar(r * 1.75);
      ring1.rotation.x = Math.PI / 2.4;
      ring1.renderOrder = 2;
      g.add(ring1);

      const ring2 = new THREE.Mesh(ringGeo, ringMat);
      ring2.scale.setScalar(r * 1.98);
      ring2.rotation.y = Math.PI / 3;
      ring2.rotation.x = -Math.PI / 5;
      ring2.renderOrder = 2;
      g.add(ring2);

      // orbiting synapse dot
      const dotMat = new THREE.MeshBasicMaterial({
        color: col.clone(), transparent: true, opacity: 0.95, blending: ADD, depthWrite: false,
      });
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), dotMat);
      dot.position.set(r * 1.98, 0, 0);
      dot.renderOrder = 3;
      g.add(dot);

      g.userData = { ring1, ring2, dot, r, phase: n.phaseOffset };
      this.root.add(g);
      this.nodeGroups.push(g);
      this.coreMats.push(coreMat);
      this.ringMats.push(ringMat);
    });
  }

  buildHalos() {
    const N = this.graph.nodes.length;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const size = new Float32Array(N);
    this.haloEnergy = new Float32Array(N);
    this.haloColorArr = col;
    this.graph.nodes.forEach((n, i) => {
      pos[i * 3] = n.pos.x; pos[i * 3 + 1] = n.pos.y; pos[i * 3 + 2] = n.pos.z;
      const c = new THREE.Color(PALETTE[n.color] || PALETTE.cyan);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      size[i] = 0.82 + (RADIUS[n.kind] || 0.32) * 1.05;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.haloEnergyAttr = new THREE.BufferAttribute(this.haloEnergy, 1);
    this.haloEnergyAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aEnergy', this.haloEnergyAttr);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelScale: { value: 800 },
        uRunLevel: { value: 0 },
      },
      vertexShader: S.HALO_VERT,
      fragmentShader: S.HALO_FRAG,
      transparent: true,
      blending: ADD,
      depthWrite: false,
      depthTest: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = 4;
    pts.frustumCulled = false;
    this.root.add(pts);
    this.haloMat = mat;
    this.haloGeo = geo;
  }

  /* ---------------- GPU handoff pulses ---------------- */
  buildPulses() {
    const edges = this.graph.primary.concat(this.graph.secondary);
    const perEdge = 3;
    const N = edges.length * perEdge;
    const dummy = new Float32Array(N * 3);
    const p0 = new Float32Array(N * 3), p1 = new Float32Array(N * 3);
    const p2 = new Float32Array(N * 3), p3 = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const off = new Float32Array(N), spd = new Float32Array(N);
    const seed = new Float32Array(N);
    this.pulseEnergy = new Float32Array(N);
    this.pulseEdgeIdx = new Int32Array(N);

    let k = 0;
    edges.forEach((e) => {
      for (let j = 0; j < perEdge; j++, k++) {
        const o = k * 3;
        dummy[o] = e.p0.x; dummy[o + 1] = e.p0.y; dummy[o + 2] = e.p0.z;
        p0[o] = e.p0.x; p0[o + 1] = e.p0.y; p0[o + 2] = e.p0.z;
        p1[o] = e.p1.x; p1[o + 1] = e.p1.y; p1[o + 2] = e.p1.z;
        p2[o] = e.p2.x; p2[o + 1] = e.p2.y; p2[o + 2] = e.p2.z;
        p3[o] = e.p3.x; p3[o + 1] = e.p3.y; p3[o + 2] = e.p3.z;
        col[o] = e.color.r; col[o + 1] = e.color.g; col[o + 2] = e.color.b;
        off[k] = j / perEdge + Math.random() * 0.08;
        spd[k] = 0.20 + Math.random() * 0.16;
        seed[k] = Math.random();
        this.pulseEdgeIdx[k] = e.index;
      }
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(dummy, 3));
    geo.setAttribute('aP0', new THREE.BufferAttribute(p0, 3));
    geo.setAttribute('aP1', new THREE.BufferAttribute(p1, 3));
    geo.setAttribute('aP2', new THREE.BufferAttribute(p2, 3));
    geo.setAttribute('aP3', new THREE.BufferAttribute(p3, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aOffset', new THREE.BufferAttribute(off, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.pulseEnergyAttr = new THREE.BufferAttribute(this.pulseEnergy, 1);
    this.pulseEnergyAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aEnergy', this.pulseEnergyAttr);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelScale: { value: 800 },
        uGlobal: { value: 1 },
      },
      vertexShader: S.PULSE_VERT,
      fragmentShader: S.PULSE_FRAG,
      transparent: true,
      blending: ADD,
      depthWrite: false,
      depthTest: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = 5;
    pts.frustumCulled = false;
    this.root.add(pts);
    this.pulseMat = mat;
  }

  /* ---------------- post processing ---------------- */
  buildPost(w, h) {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.52, 0.34, 0.52);
    this.composer.addPass(this.bloom);
    this.crt = new ShaderPass(S.CRT_SHADER);
    this.crt.uniforms.uResolution.value = [w, h];
    this.composer.addPass(this.crt);
    this.composer.addPass(new OutputPass());
  }

  /* ---------------- DOM labels ---------------- */
  buildLabels() {
    this.labelsEl.innerHTML = '';
    this.graph.nodes.forEach((n) => {
      const el = document.createElement('div');
      const compact = n.tier >= 3;
      el.className = 'node-tag' + (compact ? ' compact' : '');
      el.style.setProperty('--tag-color', HEX[STATUS_COLOR[n.status]] || HEX.cyan);
      el.innerHTML = `
        <div class="nt-inner">
          <div class="nt-head"><span class="nt-id">${n.id}</span><span class="nt-pct">0%</span></div>
          <div class="nt-name">${n.name}</div>
          <div class="nt-bar"><i></i></div>
          <div class="nt-state">${n.status}</div>
        </div>
        <div class="nt-stem"></div>`;
      this.labelsEl.appendChild(el);
      this.labelEls.push({
        el,
        pct: el.querySelector('.nt-pct'),
        bar: el.querySelector('.nt-bar i'),
        state: el.querySelector('.nt-state'),
        w: compact ? 90 : 108,
        h: compact ? 32 : 44,
        dy: undefined,
      });
    });
    // Use the real rendered box: the estimated 108x44 / 90x32 can be a few
    // px short, which is enough to leave one residual overlap at some aspect ratios.
    for (const L of this.labelEls) {
      const inner = L.el.querySelector('.nt-inner');
      if (inner) {
        L.w = Math.max(L.w, inner.offsetWidth + 2);
        L.h = Math.max(L.h, inner.offsetHeight + 2);
      }
    }
  }

  bindPointer() {
    this.canvas.addEventListener('pointermove', (ev) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects(this.pickMeshes, false)[0];
      const idx = hit ? hit.object.userData.nodeIndex : -1;
      this.hovered = idx;
      this.canvas.style.cursor = idx >= 0 ? 'pointer' : 'grab';
    });
    this.canvas.addEventListener('pointerdown', (ev) => {
      this._downX = ev.clientX; this._downY = ev.clientY;
    });
    this.canvas.addEventListener('pointerup', (ev) => {
      if (Math.abs(ev.clientX - this._downX) > 5 || Math.abs(ev.clientY - this._downY) > 5) return;
      if (this.hovered >= 0 && this.onPick) this.onPick(this.hovered);
    });
  }

  setSelected(index) {
    this.selected = index;
    this.labelEls.forEach((l, i) => l.el.classList.toggle('active', i === index));
  }

  /* ---------------- per-frame sync ---------------- */
  syncFromState(state) {
    // edges: only upload changed segments
    let eDirty = false, rDirty = false;
    const edges = this.graph.edges;
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const en = e.energy, rv = e.reveal;
      if (en !== this._lastEnergy[i] || rv !== this._lastReveal[i]) {
        const base = i * VERTS_PER_EDGE;
        for (let v = 0; v < VERTS_PER_EDGE; v++) {
          this.edgeEnergy[base + v] = en;
          this.edgeReveal[base + v] = rv;
        }
        this._lastEnergy[i] = en;
        this._lastReveal[i] = rv;
        eDirty = true; rDirty = true;
      }
    }
    if (eDirty) this.energyAttr.needsUpdate = true;
    if (rDirty) this.revealAttr.needsUpdate = true;

    // node colours + energy
    const nodes = this.graph.nodes;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const key = STATUS_COLOR[n.status];
      if (this._lastNodeColor[i] !== key) {
        const c = new THREE.Color(PALETTE[key] || PALETTE.cyan);
        this.coreMats[i].uniforms.uColor.value.copy(c);
        this.ringMats[i].color.copy(c);
        const c3 = this.haloColorArr;
        c3[i * 3] = c.r; c3[i * 3 + 1] = c.g; c3[i * 3 + 2] = c.b;
        this.haloGeo.attributes.aColor.needsUpdate = true;
        this.labelEls[i].el.style.setProperty('--tag-color', HEX[key] || HEX.cyan);
        this._lastNodeColor[i] = key;
      }
      this.coreMats[i].uniforms.uEnergy.value = n.energy;
      this.haloEnergy[i] = n.energy;
      const L = this.labelEls[i];
      const pct = Math.round(n.progress);
      if (L._pct !== pct) { L.pct.textContent = pct + '%'; L.bar.style.width = pct + '%'; L._pct = pct; }
      if (L._state !== n.status) { L.state.textContent = n.status; L._state = n.status; }
    }
    this.haloEnergyAttr.needsUpdate = true;

    for (let k = 0; k < this.pulseEnergy.length; k++) {
      this.pulseEnergy[k] = edges[this.pulseEdgeIdx[k]].energy;
    }
    this.pulseEnergyAttr.needsUpdate = true;
  }

  update(dt, state) {
    this.time += dt;
    const t = this.time;

    this.controls.update();

    // subtle living motion of the whole mesh
    this.root.rotation.y = Math.sin(t * 0.16) * 0.105;
    this.root.rotation.x = Math.sin(t * 0.12) * 0.026;

    // node breathing / ring spin
    this.graph.nodes.forEach((n, i) => {
      const g = this.nodeGroups[i];
      const u = g.userData;
      g.position.y = n.pos.y + Math.sin(t * 0.85 + u.phase) * 0.085;
      g.position.x = n.pos.x + Math.cos(t * 0.62 + u.phase) * 0.045;
      u.ring1.rotation.z += dt * (0.45 + n.energy * 1.4);
      u.ring1.rotation.x += dt * 0.12;
      u.ring2.rotation.z -= dt * (0.28 + n.energy * 0.8);
      u.ring2.rotation.y += dt * 0.18;
      const a = t * 1.25 + u.phase;
      u.dot.position.set(Math.cos(a) * u.r * 1.98, Math.sin(a) * u.r * 1.98, Math.sin(a * 0.7) * 0.35);
      const s = 1 + n.energy * 0.16 + Math.sin(t * 2.4 + u.phase) * 0.025;
      this.pickMeshes[i].scale.setScalar(u.r * s);
      this.coreMats[i].uniforms.uTime.value = t;
    });

    this.edgeMat.uniforms.uTime.value = t;
    this.edgeMat.uniforms.uWaveAmp.value = 0.11 + (state.phase === 'RUN' ? 0.055 : 0.012);
    this.haloMat.uniforms.uTime.value = t;
    this.haloMat.uniforms.uRunLevel.value = state.phase === 'RUN' ? 1 : 0.2;
    this.pulseMat.uniforms.uTime.value = t;
    this.pulseMat.uniforms.uGlobal.value = state.phase === 'RUN' ? 1 : (state.phase === 'BUILD' ? 0.45 : 0.12);
    this.starMat.uniforms.uTime.value = t;
    this.gridMat.uniforms.uTime.value = t;
    this.crt.uniforms.uTime.value = t;
    this.bloom.strength = 0.50 + (state.phase === 'RUN' ? 0.10 : 0) + Math.sin(t * 0.7) * 0.025;

    this.root.updateMatrixWorld(true);
    this.projectLabels();
  }

  projectLabels() {
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    const camPos = this.camera.position;
    const items = [];

    for (let i = 0; i < this.nodeGroups.length; i++) {
      const L = this.labelEls[i];
      this._tmpV.setFromMatrixPosition(this.nodeGroups[i].matrixWorld);
      const dist = camPos.distanceTo(this._tmpV);
      this._tmpV2.copy(this._tmpV).project(this.camera);
      const behind = this._tmpV2.z > 1 || this._tmpV2.z < -1;
      const x = (this._tmpV2.x * 0.5 + 0.5) * w;
      const y = (-this._tmpV2.y * 0.5 + 0.5) * h;
      const visible = !behind && x > -70 && x < w + 70 && y > -30 && y < h + 30;
      // keep the whole card inside the stage instead of letting it clip at the edge
      const halfW = L.w * 0.5 + 6;
      items.push({
        i, x: Math.max(halfW, Math.min(w - halfW, x)), y, visible, w: L.w, h: L.h,
        opacity: visible ? Math.max(0.34, Math.min(1, 40 / dist)) : 0,
      });
    }

    // 2-D greedy de-overlap: try vertical then horizontal displacement and
    // always take a collision-free slot. The old version fell back to the raw
    // projected position when all vertical slots were taken, leaving 1 pair
    // overlapping on narrower canvases; here there is always a best candidate.
    items.sort((a, b) => a.y - b.y);
    const placed = [];
    const dyList = [0, -23, 23, -46, 46, -69, 69, -92, 92, -115, 115, -138, 138,
      -161, 161, -184, 184, -207, 207, -230, 230, -253, 253, -276, 276];
    const dxList = [0, -32, 32, -64, 64, -96, 96];
    for (const it of items) {
      if (!it.visible) continue;
      let best = null, bestCost = Infinity, clean = false;
      for (const dy of dyList) {
        if (clean) break;
        const cy = it.y - 30 + dy;
        if (cy < 12 || cy > h - 14) continue;
        for (const dx of dxList) {
          const cx = Math.max(it.w * 0.5 + 6, Math.min(w - it.w * 0.5 - 6, it.x + dx));
          let overlap = 0;
          for (const p of placed) {
            const ox = (p.w + it.w) * 0.5 + 6 - Math.abs(p.x - cx);
            const oy = (p.h + it.h) * 0.5 + 5 - Math.abs(p.y - cy);
            if (ox > 0 && oy > 0) overlap += 2000 + ox * oy;
          }
          const cost = Math.abs(dy) * 0.28 + Math.abs(dx) * 0.55 + overlap;
          if (cost < bestCost) { bestCost = cost; best = { x: cx, y: cy }; }
          if (overlap === 0) { clean = true; break; }
        }
      }
      if (!clean) {
        // Very narrow stages: no local slot is free, so scan the whole stage
        // and take the nearest collision-free slot to the projected position.
        let fallback = null, fbDist = Infinity;
        for (let cy = 14; cy <= h - 14; cy += 14) {
          for (let cx = it.w * 0.5 + 6; cx <= w - it.w * 0.5 - 6; cx += 20) {
            const clash = placed.some((p) =>
              Math.abs(p.x - cx) < (p.w + it.w) * 0.5 + 6 &&
              Math.abs(p.y - cy) < (p.h + it.h) * 0.5 + 5
            );
            if (clash) continue;
            const d = (cx - it.x) ** 2 + (cy - (it.y - 30)) ** 2;
            if (d < fbDist) { fbDist = d; fallback = { x: cx, y: cy }; }
          }
        }
        if (fallback) { best = fallback; clean = true; }
      }
      it.nx = best ? best.x : it.x;
      it.ny = best ? best.y : it.y - 30;
      placed.push({ x: it.nx, y: it.ny, w: it.w, h: it.h });
    }

    for (const it of items) {
      const L = this.labelEls[it.i];
      if (!it.visible) { L.el.style.opacity = '0'; continue; }
      // snap: smoothing the offset re-introduces a 1-2 frame overlap while nodes drift
      L.dy = it.ny;
      const stem = Math.max(4, Math.min(170, it.y - L.dy - 22));
      L.el.style.setProperty('--stem-h', stem.toFixed(0) + 'px');
      L.el.style.opacity = String(it.opacity);
      L.el.style.transform = `translate3d(${it.nx.toFixed(1)}px, ${L.dy.toFixed(1)}px, 0)`;
    }
  }

  render() {
    this.composer.render();
  }

  resize() {
    const w = Math.max(1, this.stage.clientWidth);
    const h = Math.max(1, this.stage.clientHeight);
    this.camera.aspect = w / h;
    // Lock the HORIZONTAL field of view to the design value: on narrow/tall
    // stages a fixed vertical fov would crop the outermost agent nodes.
    const half = Math.tan((this.baseFov * Math.PI / 180) / 2) * this.designAspect / this.camera.aspect;
    const fov = 2 * Math.atan(half) * 180 / Math.PI;
    this.camera.fov = Math.min(88, Math.max(30, fov));
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.crt.uniforms.uResolution.value = [w, h];
    this.pixelScale = h / (2 * Math.tan((this.camera.fov * Math.PI / 180) / 2));
    this.starMat.uniforms.uPixelScale.value = this.pixelScale;
    this.haloMat.uniforms.uPixelScale.value = this.pixelScale;
    this.pulseMat.uniforms.uPixelScale.value = this.pixelScale;
    this.projectLabels();
  }
}
