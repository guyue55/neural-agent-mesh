# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
