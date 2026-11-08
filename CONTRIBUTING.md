# Contributing

Thanks for taking the time to contribute. This is a small, dependency-light visual front end, so the bar is: **keep it buildless, offline-capable and verifiable in a real browser**.

## Getting set up

```bash
git clone https://github.com/guyue55/neural-agent-mesh.git
cd neural-agent-mesh
npm ci
npm start
```

Open <http://127.0.0.1:4173/>. Changes to `src/`, `styles.css` and `index.html` are picked up on reload — there is no bundler or watcher.

## Before opening a pull request

1. Run `npm run verify` (31 real-browser checks) and `npm run verify:viewports` (7 viewport sizes). Both must be green.
2. Run `node --check` on every `.js` / `.mjs` file you touched.
3. If you changed rendering, attach a screenshot from `tools/shots/` showing the result.
4. Keep the demo working **without a network connection**: do not introduce CDN imports. Three.js is vendored under `vendor/three/`.
5. If you add an addon under `vendor/three/addons/`, add it and its transitive imports only — no blanket copying of `examples/jsm`.

## Code notes

- `src/workflow.js` owns all simulated state. `src/scene3d.js` and `src/ui.js` only read from it. Keep that boundary: adapters for real agent runtimes should live in the workflow layer.
- Geometry is merged into single draw calls on purpose. Prefer extending existing attributes/shaders over adding per-edge meshes.
- Label placement is in `NeuralScene.projectLabels()`. It is verified at 7 viewport sizes; any change must keep 0 overlapping / 0 clipped labels.
- Timing is driven by wall-clock `dt` in `src/main.js`, not frame count, so software WebGL still advances the pipeline in real time.

## Commit style

Short imperative subject, optional body explaining *why*. One logical change per commit.

## Reporting bugs

Use the bug report template and include: OS, browser + version, viewport size, whether WebGL2 is available, console output, and a screenshot. Rendering bugs are much easier to reproduce with those five items.

## Code of Conduct

By participating you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).
