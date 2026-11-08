/* ============================================================
   shaders.js — GLSL for the neural mesh
   All ribbons / pulses / halos / stars are drawn with custom
   additive materials; the whole 474-edge graph is ONE draw call.
   ============================================================ */

/* ---------- glowing wave ribbons (edges) ---------- */
export const EDGE_VERT = /* glsl */`
attribute vec3  aTangent;
attribute vec3  aColor;
attribute float aSide;
attribute float aProgress;
attribute float aSeed;
attribute float aWeight;
attribute float aEnergy;
attribute float aReveal;

uniform float uTime;
uniform float uWaveAmp;

varying float vProgress;
varying float vSeed;
varying float vWeight;
varying float vEnergy;
varying float vReveal;
varying float vSide;
varying vec3  vColor;

void main() {
  vec3 p = position;
  float ph  = uTime * 1.05 + aSeed * 6.2831853;
  float env = sin(aProgress * 3.14159265);
  float amp = uWaveAmp * env * (0.30 + aWeight * 0.70);
  p.y += sin(aProgress * 11.0 + ph) * amp;
  p.z += cos(aProgress * 9.0 + ph * 0.83) * amp * 0.72;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 tv = normalize((modelViewMatrix * vec4(aTangent, 0.0)).xyz);
  vec3 side = cross(tv, vec3(0.0, 0.0, 1.0));
  float sl = length(side);
  side = sl > 0.0001 ? side / sl : vec3(1.0, 0.0, 0.0);

  float w = 0.009 + aWeight * 0.032 + aEnergy * 0.052;
  mv.xyz += side * aSide * w;

  gl_Position = projectionMatrix * mv;

  vProgress = aProgress;
  vSeed     = aSeed;
  vWeight   = aWeight;
  vEnergy   = aEnergy;
  vReveal   = aReveal;
  vSide     = aSide;
  vColor    = aColor;
}
`;

export const EDGE_FRAG = /* glsl */`
uniform float uTime;

varying float vProgress;
varying float vSeed;
varying float vWeight;
varying float vEnergy;
varying float vReveal;
varying float vSide;
varying vec3  vColor;

void main() {
  float edgeFade = smoothstep(0.0, 0.075, vProgress) * (1.0 - smoothstep(0.90, 1.0, vProgress));

  float dash = sin(vProgress * 42.0 - uTime * 3.2 + vSeed * 6.2831853);
  float flow = smoothstep(0.30, 0.98, dash);

  float hp = sin(vProgress * 6.2831853 - uTime * 2.15 + vSeed * 12.5663706);
  float pulse = pow(max(0.0, hp), 26.0) * vEnergy;

  // weight separates 53 bright backbone paths from 300+ faint synapse channels
  float base = 0.010 + vWeight * 0.085;
  float intensity = base + flow * (0.055 + vWeight * 0.15) + pulse * 1.50 + vEnergy * 0.88;
  intensity *= edgeFade * vReveal;

  float soft = 1.0 - pow(abs(vSide), 1.8);
  intensity *= soft;

  vec3 col = vColor * (0.62 + intensity * 1.65)
           + vec3(0.62, 0.90, 1.0) * pulse * 0.55
           + vec3(1.0) * pulse * 0.20;

  float alpha = clamp(intensity * 1.15, 0.0, 1.0);
  if (alpha < 0.0025) discard;
  gl_FragColor = vec4(col, alpha);
}
`;

/* ---------- node core (fresnel shell) ---------- */
export const NODE_VERT = /* glsl */`
uniform float uTime;
uniform float uEnergy;
uniform float uSeed;
varying vec3 vNormalV;
varying vec3 vViewV;
varying vec3 vLocal;

void main() {
  vec3 p = position;
  p += normal * (0.028 * sin(uTime * 2.2 + position.y * 7.0 + uSeed) * (0.35 + uEnergy));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewV   = normalize(-mv.xyz);
  vLocal   = position;
  gl_Position = projectionMatrix * mv;
}
`;

export const NODE_FRAG = /* glsl */`
uniform vec3  uColor;
uniform float uTime;
uniform float uEnergy;
uniform float uSeed;
varying vec3 vNormalV;
varying vec3 vViewV;
varying vec3 vLocal;

void main() {
  float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(vViewV))), 2.1);
  float pulse = 0.84 + 0.16 * sin(uTime * 2.8 + uSeed);
  float veins = 0.10 * sin(vLocal.y * 15.0 + uTime * 1.6 + uSeed) * sin(vLocal.x * 13.0 - uTime);
  float core = 0.26 + fres * 1.95 + uEnergy * 1.05 + veins;
  vec3 c = uColor * core * pulse;
  c += uColor * pow(1.0 - fres, 3.0) * 0.42;
  c += vec3(0.48, 0.74, 0.96) * pow(fres, 4.0) * 0.82;
  c += uColor * uEnergy * 0.42;
  gl_FragColor = vec4(c, 1.0);
}
`;

/* ---------- node halo (points) ---------- */
export const HALO_VERT = /* glsl */`
attribute float aSize;
attribute float aEnergy;
attribute vec3  aColor;
uniform float uTime;
uniform float uPixelScale;
uniform float uRunLevel;
varying vec3  vColor;
varying float vEnergy;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float breathe = 0.88 + 0.12 * sin(uTime * 2.0 + position.x * 1.7);
  float s = aSize * (0.80 + aEnergy * 0.70 + uRunLevel * 0.16) * breathe;
  gl_PointSize = clamp(s * uPixelScale / max(1.0, -mv.z), 1.0, 220.0);
  gl_Position = projectionMatrix * mv;
  vColor = aColor;
  vEnergy = aEnergy;
}
`;

export const HALO_FRAG = /* glsl */`
varying vec3  vColor;
varying float vEnergy;
void main() {
  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
  if (d > 1.0) discard;
  float ring = exp(-pow((d - 0.30) * 4.6, 2.0)) * 0.30;
  float glow = pow(max(0.0, 1.0 - d), 3.6);
  float a = (glow * 0.30 + ring) * (0.30 + vEnergy * 0.58);
  gl_FragColor = vec4(vColor * (0.95 + vEnergy * 1.55), a);
}
`;

/* ---------- handoff pulses travelling along bezier edges (GPU) ---------- */
export const PULSE_VERT = /* glsl */`
attribute vec3  aP0;
attribute vec3  aP1;
attribute vec3  aP2;
attribute vec3  aP3;
attribute vec3  aColor;
attribute float aOffset;
attribute float aSpeed;
attribute float aEnergy;
attribute float aSeed;

uniform float uTime;
uniform float uPixelScale;
uniform float uGlobal;

varying vec3  vColor;
varying float vEnergy;

vec3 bezier(float t) {
  float u = 1.0 - t;
  return u*u*u*aP0 + 3.0*u*u*t*aP1 + 3.0*u*t*t*aP2 + t*t*t*aP3;
}

void main() {
  float t = fract(uTime * aSpeed + aOffset);
  vec3 p = bezier(t);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float e = aEnergy * uGlobal;
  gl_PointSize = clamp((0.045 + e * 0.20) * uPixelScale / max(1.0, -mv.z), 1.0, 40.0);
  gl_Position = projectionMatrix * mv;
  vColor = aColor;
  vEnergy = e;
}
`;

export const PULSE_FRAG = /* glsl */`
varying vec3  vColor;
varying float vEnergy;
void main() {
  if (vEnergy < 0.015) discard;
  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
  if (d > 1.0) discard;
  float core = pow(max(0.0, 1.0 - d), 2.6);
  float a = core * (0.30 + vEnergy * 0.85);
  gl_FragColor = vec4(vColor * (1.0 + vEnergy * 1.4) + vec3(0.25) * core, a);
}
`;

/* ---------- background star dust ---------- */
export const STAR_VERT = /* glsl */`
attribute float aSize;
attribute float aPhase;
attribute vec3  aColor;
uniform float uTime;
uniform float uPixelScale;
varying vec3  vColor;
varying float vAlpha;
void main() {
  vec3 p = position;
  p.y += sin(uTime * 0.22 + aPhase) * 0.45;
  p.x += cos(uTime * 0.16 + aPhase * 1.7) * 0.35;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(aSize * uPixelScale / max(1.0, -mv.z), 0.6, 6.0);
  gl_Position = projectionMatrix * mv;
  vColor = aColor;
  vAlpha = 0.15 + 0.16 * sin(uTime * 0.9 + aPhase * 3.0);
}
`;

export const STAR_FRAG = /* glsl */`
varying vec3  vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
  if (d > 1.0) discard;
  float a = pow(max(0.0, 1.0 - d), 2.0) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}
`;

/* ---------- horizon grid plane ---------- */
export const GRID_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const GRID_FRAG = /* glsl */`
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 g = abs(fract(vUv * vec2(44.0, 30.0)) - 0.5);
  float l = smoothstep(0.455, 0.5, max(g.x, g.y));
  float d = distance(vUv, vec2(0.5));
  float fall = 1.0 - smoothstep(0.12, 0.52, d);
  float sweep = 0.55 + 0.45 * sin(vUv.x * 12.0 - uTime * 0.55);
  vec3 col = mix(vec3(0.025, 0.11, 0.17), vec3(0.05, 0.24, 0.30), sweep);
  gl_FragColor = vec4(col * l, l * fall * 0.13);
}
`;

/* ---------- CRT / chromatic-aberration post pass ---------- */
export const CRT_SHADER = {
  uniforms: {
    tDiffuse:   { value: null },
    uTime:      { value: 0 },
    uResolution:{ value: [1280, 800] },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      float ca = 0.0022 * dot(d, d) * 3.0;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + d * ca).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - d * ca).b;
      float scan = 0.982 + 0.018 * sin(vUv.y * uResolution.y * 1.35 + uTime * 1.1);
      c *= scan;
      c *= 1.0 - dot(d, d) * 0.62;
      float n = fract(sin(dot(vUv * uResolution + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      c += (n - 0.5) * 0.012;
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};
