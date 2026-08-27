# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Before starting new work, read [`claude/handoff.md`](./claude/handoff.md).** It carries the most recent session's state, what shipped, and the shortlist for next steps. The full archaeology of the `eeholmes/gridlook-xl` fork lives in [`claude/comparison.md`](./claude/comparison.md).

## Project Overview

Gridlook is a browser-based WebGL viewer for cloud-hosted Zarr datasets and Icechunk repositories containing Earth system model (ESM) output on native grids. It is a Vue 3 + TypeScript + Vite single-page application that renders regular and unstructured grids directly in the browser using Three.js, without pre-tiling or server-side regridding.

## Commands

```sh
npm run dev            # Vite dev server on http://localhost:3000
npm run build          # vue-tsc type-check followed by Vite production build
npm run preview        # serve the production build on http://localhost:5050
npm run typecheck      # vue-tsc --noEmit (also runs in pre-commit hook)
npm run lint           # ESLint over src and tests
npm run lint-ci        # ESLint with --max-warnings 0 (CI parity)
npm run lint:fix       # ESLint with --fix
npm run test           # vitest run (single pass)
npm run test:watch     # vitest in watch mode
```

Run a single test file: `npx vitest run tests/unit/lib/data/gridTypeDetector.test.ts`
Filter by test name: `npx vitest run -t "detects healpix"`

Tests live in `tests/**/*.test.ts` and run in the `node` environment (see `vite.config.ts`).

Node `>=24.16.0` is required (see `package.json` engines). On this JupyterHub machine Node lives at `~/.local/opt/node-v24.20.0-linux-x64`, symlinked into `~/.local/bin`, which `~/.bashrc` prepends to `PATH`. The home directory persists across hubs, so a "new machine" almost never needs a reinstall — if `npm` appears missing, suspect the shell before reinstalling anything. Login shells (what the JupyterHub terminal spawns) read `~/.bash_profile`, not `~/.bashrc`, so a `~/.bash_profile` that sources `~/.bashrc` is in place to bridge that. Non-interactive tool shells may still miss it, in which case prepend `export PATH="$HOME/.local/opt/node-v24.20.0-linux-x64/bin:$PATH"` explicitly. Husky installs on `npm install`: `pre-commit` runs `lint-staged` (ESLint --fix + Prettier) then `npm run typecheck`; `commit-msg` runs Commitlint.

## Commit Conventions

Commits follow Conventional Commits and are validated by Commitlint. Reserve `feat` and `fix` for user-facing changes; use `refactor`, `chore`, `docs`, `test`, `style` otherwise. Allowed scopes: `ui`, `lib`, `config`, `deps`, `docs`, `assets`.

Releases on this fork are cut by hand. The inherited `Release Please` GitHub Action (`.github/workflows/release.yml`) is **disabled** here, so no CHANGELOG is generated automatically — do not re-enable it or try to repair its failures. The `Lint` workflow remains active and must pass.

## Architecture

### Layered directory structure with enforced boundaries

`eslint-plugin-boundaries` enforces the dependency graph in `eslint.config.js`. New files must fit these rules:

- `src/lib/**` — rendering, projection, layers, data access. **Keep self-contained**: may import only from `assets` and `utils`. No dependencies on `store`, `ui`, or `views`.
- `src/store/**` — Pinia stores and URL/presenter sync. May import from `lib` and `utils`.
- `src/ui/**` — Vue components (overlays, grid presentation, common widgets). May import from `store`, `lib`, `ui`, and `utils`.
- `src/views/**` — top-level view components. May import from `lib`, `store`, `ui`, `utils`.
- `src/utils/**` — **leaf**: may not import from any other layer.
- `src/router/**` — may import from `views` only.
- Root `src/*` files (e.g. `main.ts`, `App.vue`) may import from `lib`, `router`, `views`, `utils`, and other root files.

If you touch import paths across these areas, check `eslint.config.js` before diverging.

### Import alias

`@/` resolves to `src/` (Vite alias + tsconfig `paths`). Prefer `import Foo from "@/lib/Foo"` over relative paths that cross directories.

### Vue conventions

- All Vue components use `<script setup lang="ts">` (enforced by `vue/block-lang` and `vue/component-api-style`).
- Block order is `<script>` then `<template>` then `<style>`.
- Props must be typed and have defaults (`vue/require-default-prop`, `vue/require-prop-types`).
- Component names in templates use PascalCase (`vue/component-name-in-template-casing`).

### App entry and routing flow

`src/main.ts` mounts `App.vue`, which renders `HashGlobeView.vue`. That view parses the URL hash of the form `#<resource>::param1=value1::param2=value2` to extract the dataset URI and store-backed parameters, then hands off to `GlobeView.vue`, which chooses one of the grid-specific components under `src/ui/grids/` (`Regular`, `Curvilinear`, `Healpix`, `Triangular`, `GaussianReduced`, `Irregular`, `IrregularDelaunay`) based on detected grid type.

### Grid type detection

`src/lib/data/gridTypeDetector.ts` implements first-match-wins detection: triangular topology (`vertex_of_cell`) → CRS metadata (`grid_mapping_name`) → Zarr conventions (`dggs`) → dimension names → 1D/2D lat/lon coordinate shape → projected x/y fallback. See `docs/grid-types.md` for the full ruleset and rendering alternatives. `irregular_delaunay` has no auto-detection and is only reachable via the Grid Type selector.

### Grid rendering with web workers

Each grid family under `src/lib/grids/` follows a consistent pattern of three files: `*Calculations.ts` (pure logic), `*.worker.ts` (Web Worker entry), and `*WorkerClient.ts` + `*WorkerProtocol.ts` (typed message boundary). Heavy geometry work (curvilinear, triangular, irregular, Delaunay, Gaussian-reduced) runs off the main thread. When adding a new grid renderer, mirror this triplet.

### Data access

`src/lib/data/ZarrDataManager.ts` is the primary orchestrator for Zarr reads (via `zarrita`) and Icechunk reads (via `icechunk-js`). Custom codecs are registered in `src/lib/data/codecs.ts`, imported for side effects from `App.vue`. Live mode (`::live=true`) is implemented in `src/lib/data/liveTimestep.ts` and `src/store/useLiveTimestep.ts` and only works over plain HTTP Zarr, not Icechunk (see `docs/live-datasets.md`).

Icechunk repositories may hold _virtual_ chunks: the repository stores only byte-range references into the original NetCDF/HDF5 files, which stay on whichever host published them. Reading one is a cross-origin range request, and plenty of archives (`coastwatch.noaa.gov`, for one) serve those bytes happily to `curl` while sending no `Access-Control-Allow-Origin`, so the browser discards the response and `fetch` rejects with a bare `TypeError: Failed to fetch`. The tell is a dataset that indexes and lists its variables but fails on plot, often with the coordinates loading fine because they were written as `loadable_variables` and are therefore materialised. `src/lib/data/virtualChunkFetch.ts` rewrites that opaque rejection into a message naming the host; see `docs/icechunk-virtual-chunks.md`.

The reader-side workaround is a CORS-unblocking browser extension (gridlook does not proxy). **Warn about the toggle before anything else:** in extensions of the "Allow CORS" family the switch reading `ON` means _CORS blocking is on_ — it has to be clicked to `OFF` to actually permit cross-origin reads. This is backwards from what the label suggests and has already cost debugging time once. If a reader says the extension is installed and enabled yet the data still will not load, check the toggle direction and force a hard reload (a cached `206` without CORS headers replays from cache without the extension ever running) before investigating anything in gridlook.

### Value transforms

`src/lib/data/valueTransform.ts` holds the registry of element-wise data transforms (`linear`, `log10`). A transform is applied at exactly one point — `decodeVariableDataAndGetBounds` in `src/lib/data/variableDecoding.ts`, right after CF decoding — so data bounds, histograms, textures and hover values all derive from transformed data and the grid renderers need no changes. Because `src/lib` may not import the store, `useGridDataLoader` pushes the selected mode down via `setActiveValueTransform` before each load; it is read as a defaulted parameter, and callers that must stay linear (streamline vector components) pass `VALUE_TRANSFORMS.LINEAR` explicitly. Adding a transform means one registry entry plus its formula in `transformValue`.

### State

Pinia stores in `src/store/`:

- `store.ts` — main `useGlobeControlStore` (layers, colormaps, projections, hovered point, etc.).
- `paramStore.ts` — URL-backed parameters via `STORE_PARAM_MAPPING`.
- `useUrlSync.ts` — two-way sync between store and URL hash.
- `usePresenterSync.ts` — dual-window presenter/display mode.
- `useLiveTimestep.ts` — live-dataset long-polling.

### Shaders

GLSL lives under `src/lib/**/glsl/` and is loaded via `vite-plugin-glsl`. Colormap fragment shader definitions are in `src/lib/shaders/colormapShaders.ts`; if you change them, regenerate previews with `python3 scripts/generate_colormap_swatches.py` (requires Pillow).

## Style Notes

- ESLint rule `max-lines-per-function` warns at 50 lines (skip comments/blank lines). Prefer smaller functions.
- Prettier is the formatting baseline (JS, TS, Vue, JSON, Markdown).
- `curly` is enforced — always use braces on `if`/`else`/loops.
