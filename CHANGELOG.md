# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-11-09

### Added

- Responsive single-column layout below 980 px: both side panels stay visible, the status bar stays pinned and the page scrolls instead of hiding content.
- Readable, content-equivalent fallback for a missing WebGL context and for `webglcontextlost` (topology summary + reload action).
- `prefers-reduced-motion` support: shader clock slowed to 12 %, CSS decoration and CRT scanlines disabled.
- Background-tab handling: GPU rendering is skipped while `document.hidden`; pipeline state remains consistent.
- Adaptive DPR cap (1.25 on small stages, 1.75 elsewhere), re-applied on resize.
- Document metadata: description, Open Graph image, theme colour, strict `Referrer-Policy`, SVG favicon and a `noscript` note.
- `tools/verify-ux.mjs`: 35 real-browser checks covering layout, resilience and accessibility; wired into `npm run verify:ux`, `verify:all` and CI.

### Fixed

- Mobile layout: the old `max-width: 780px` rule hid both side panels with `display: none` while the grid still reserved their rows, leaving a 190 px canvas above ~600 px of blank space.
- Narrow-screen phase badge overlapping node labels; status bar collapsing to 16 px and losing its sticky position.
- WebGL initialization failure previously showed only "INITIALIZATION FAILED — SEE CONSOLE" over a black canvas.

### Changed

- Pinned `three` and `playwright` to exact versions (removed caret ranges).
- Documented deliberate non-goals: WebGPU / TSL migration cost, GitHub Pages security-header limitation, and connecting a real agent backend via OpenTelemetry GenAI conventions.

## [1.0.0] - 2026-11-09

### Added

- Initial public release of the Three.js multi-agent neural mesh visualizer.
- 21-node layered DAG with 474 strictly acyclic handoff channels.
- Single-draw-call GPU ribbon with GLSL sine-wave distortion, flowing dashes and pulse heads.
- Bloom + CRT post-processing, node Fresnel shells, orbit rings, starfield and Bézier handoff pulses.
- Three-panel console: phase controls, 21 agent cards, log terminal, throughput, cost telemetry, brief input, STOP / RESTART and a human approval gate.
- Unattended state machine that runs BOOT → DRAFT → BUILD → RUN and loops.
- Screen-space label de-overlap with real-size measurement, 2-D collision resolution and nearest-free-slot fallback.
- Aspect-ratio-aware camera that keeps the horizontal field of view constant, so no node is cropped on narrow viewports.
- Vendored Three.js r180 with only the 11 addon modules actually used; fully offline, no build step.
- Three Playwright verification suites: `verify` (31 checks), `verify:viewports` (7 viewports), `verify:live` (19 checks).
- GitHub Pages deployment from `main`, CI workflow, issue / PR templates and standard community files.
