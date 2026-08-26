# `gridlook-xl` vs upstream `gridlook` — change survey

Repository archaeology for `eeholmes/gridlook-xl` (a months-old fork of `gridlook`) so Eli can pick which areas to compare against current upstream. The refactor here is **not** the target architecture — this document only reconstructs what Eli changed in the fork and why.

Scope reviewed: ~42 PRs on `eeholmes/gridlook-xl` (all merged PRs of substance, plus closed/WIP PRs that clarify intent). Trivial README-only PRs (#17, #25, #54, #57, #70, #77, #86) are noted but not analyzed. PR #4 and #34 are upstream/branch merges, not fork-specific work.

## Executive summary

The fork is dominated by **data-loading resilience** — most PRs unlock a specific dataset that failed to load in upstream at the time (RADKLIM, CHLA-Z, CMIP6 tos, CORDEX, GLAD, GeoZarr pyramids, Icechunk repos, float16, nested groups, v3 stores with quirks). Three cross-cutting themes emerge:

1. **Icechunk & Zarr breadth** — direct `icechunk-js` integration, nested-group URL handling, group-selection UI, additional codecs (fletcher32, blosc2, pcodec), and v3 metadata edge cases (unconsolidated, missing `dimension_names`, object-style `data_type`, `_ARRAY_DIMENSIONS` fallback).
2. **Grid classification expansions** — projected `x/y` grids, multiscale/pyramid GeoZarr, polar stereographic with auxiliary lat/lon, curvilinear seam wrapping, geostationary scan-angle scaling, URL/catalog CRS overrides.
3. **Rendering & performance** — Log10 display transform (WebGL-safe), mobile GPU texture clamping, float16 upload, subsampled geometry to eliminate a ~20 s stall, ordered reload transitions, parallelized network probes, initial-slice loads.

The fork also **rewrites the catalog schema** (`tag` → `format/access/layout/grid/convention/crs`) with a matching dashboard/filter overhaul.

Upstream has clearly moved in several of these areas (icechunk, fletcher32, codecs, catalog panel, grid-type detector, log bins already exist as files under `src/lib/data/` and `src/ui/overlays/controls/`), so overlap is expected — targeted comparison, not blind porting, is the point.

## Summary table

| #   | Change                                             | Problem solved                                                                                         | Main area                                                                          | PR(s)                                      | Suggested comparison priority |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------- |
| 1   | Icechunk-js store backend                          | Load Icechunk repos alongside Zarr                                                                     | `ZarrDataManager`, source indexing                                                 | #15                                        | High                          |
| 2   | Nested-group & root-group handling                 | Deep group URLs, root vs child groups, downsampled group coords                                        | `ZarrDataManager`, `VariableSelector.vue`                                          | #27, #29, #31, #63, #108, #111             | High                          |
| 3   | Extra Zarr codecs (fletcher32, blosc2, pcodec)     | CORDEX/CMIP fletcher32, Blosc2/pcodec-compressed Icechunk stores                                       | `codecs.ts`, WASM decoder                                                          | #93, #106, #113                            | High                          |
| 4   | Zarr v3 metadata edge cases                        | Unconsolidated meta, missing `dimension_names`, object-style `data_type`, `_ARRAY_DIMENSIONS` fallback | `sourceIndexing`, `ZarrDataManager`                                                | #9, #13, #81, #2 (WIP)                     | High                          |
| 5   | Multiscale/projected `x/y` GeoZarr + CRS overrides | rioxarray/ndpyramid pyramids, Web Mercator, URL/catalog CRS                                            | `gridTypeDetector`, `zarrUtils`, `VariableSelector.vue`                            | #44, #83 (draft)                           | Medium                        |
| 6   | Curvilinear detection & seam handling              | CMIP6 x/y curvilinear, RADKLIM, seam-crossing flat projections                                         | `gridTypeDetector`, curvilinear render                                             | #68, #94, #99 (closed)                     | Medium                        |
| 7   | Polar stereographic + geostationary                | RADKLIM aux coords, oval canvas, GOES/Himawari scan angles                                             | Polar/curvilinear render, `zarrUtils`                                              | #51, #101, #102, #48 (closed), #85 (draft) | Medium                        |
| 8   | Log10 colormap transform mode                      | Skewed data without preprocessing; WebGL NaN portability                                               | Colormap pipeline, projection shaders                                              | #11 (closed), #23, #46                     | Medium                        |
| 9   | Catalog schema + dashboard refactor                | Legacy `tag/store` → richer filter set; clean Copy URL                                                 | `CatalogPanel.vue`, `catalog.ts`, docs                                             | #7 (closed), #53, #58, #60, #89            | Medium                        |
| 10  | Load-time & interaction performance                | ~20 s CHLA stall, redundant network fan-out, hover cost                                                | `Regular.vue`, `gridTypeDetector`, `ZarrDataManager`, `useUrlSync`, `useGridScene` | #37 (closed), #65, #74, #76, #105 (closed) | High                          |
| 11  | Mobile GPU texture clamping                        | Zero-color globe on mobile for >4096 px grids                                                          | `Regular.vue`, `useGridScene`                                                      | #91                                        | Low                           |
| 12  | Float16 variable rendering                         | Float16 vars showed flat colour globe                                                                  | `castDataVarToFloat32` in var read path                                            | #19                                        | Low                           |

---

### 1. Icechunk-js store backend

**PR(s) / commits:** #15
**Problem addressed:** Gridlook could not open Icechunk repositories; users had to convert to plain Zarr first. Eli wanted to visualise Icechunk-hosted datasets directly.
**What I changed:** Added `icechunk-js` as a runtime dependency and taught `ZarrDataManager.createNewStore` to recognise an `icechunk+<url>` prefix and open via `IcechunkStore.open`. Regular Zarr URLs keep going through `zarrita.FetchStore` with existing caching/range coalescing. Source indexing also **auto-falls-back** to Icechunk on a bare repo URL when v2/v3 indexing fails, then normalises the store path back to `icechunk+…` so downstream reads use the right backend.
**Key code areas:** `src/lib/data/ZarrDataManager.ts`, `src/lib/data/sourceIndexing.ts` (fallback path), `docs/catalogs.md`, `docs/README.md`.
**Why it matters:** First-class Icechunk support; catalog entries can be `icechunk+…`, direct repo URLs, or plain Zarr.
**Dependencies / external APIs involved:** `icechunk-js`, `zarrita`.
**Likely overlap with later upstream work:** Very high — upstream has `src/lib/data/icechunkStore.ts` with a nearly identical `icechunk+` prefix scheme, `parseStorePath`, `createIcechunkStore`, and `.icechunk` suffix detection. Compare directly.
**Suggested priority for comparison:** High.

---

### 2. Nested-group & root-group Icechunk handling

**PR(s) / commits:** #27, #29 (closed), #31, #63, #108, #111 (plus supporting `groupPath` plumbing repeated across many later PRs)
**Problem addressed:** Icechunk URLs that embed a group path (e.g. `.../store/combined/AWI_PISM1/exp05`) either couldn't be opened, hung on `zarr.open` on intermediate groups, or picked coordinates from the wrong group. Downsampled sibling groups (`1/…`, `2/…`) borrowed group `0`'s lat/lon and rendered as flat red globes. The group-selector UI also mishandled the "root variables + subgroups" mixed case and showed a spurious `/` option when only root vars existed.
**What I changed:**

- New `ZarrDataManager.splitIcechunkStoreAndGroup(src)` walks the URL upward until `IcechunkStore.open` succeeds, returning `{storePath, groupPath, store}`.
- `collectVariablesFromNodeList` / `processNodeListedVariables` accept a `groupPath`, filter `listNodes()` under it, strip the prefix, and stamp `dataset: groupPath` on each datasource.
- `createIndex` propagates `groupPath` into `time.dataset` / `grid.dataset` so coordinate reads target the right group.
- `getDataset` returns the root group unconditionally for Icechunk (avoids hangs on intermediate group `zarr.open`); `getVariableInfo` composes the full var path.
- Coordinate resolver falls back to `dimensionNames` when `coordinates` names only a CRS var like `EPSG` (fixes downsampled groups).
- UI: group dropdown surfaces `/` only when root vars **and** subgroup vars coexist; otherwise hidden.
  **Key code areas:** `src/lib/data/ZarrDataManager.ts`, `src/lib/data/sourceIndexing.ts` (`collectVariablesFromNodeList`, `createIndex`, `indexFromIcechunkFallback`), `src/lib/data/zarrUtils.ts` (lat/lon resolution), `src/ui/overlays/controls/VariableSelector.vue`, `src/ui/grids/Regular.vue` (grouped-safe var-change refresh).
  **Why it matters:** Unlocks the whole class of grouped/pyramid Icechunk datasets (ISMIP6, IMERG downsampled groups, deep-nested experiment layouts).
  **Dependencies / external APIs involved:** `icechunk-js` (`IcechunkStore.open`, `listNodes`), `zarrita.open.v2/v3`.
  **Likely overlap with later upstream work:** Upstream `icechunkStore.ts` exists but is short — this fork's group handling looks deeper and lives in `ZarrDataManager` + `sourceIndexing`. Worth a focused comparison.
  **Suggested priority for comparison:** High.

---

### 3. Zarr codec compatibility (fletcher32, Blosc2, PCodec)

**PR(s) / commits:** #93, #106, #113 (draft)
**Problem addressed:** Stores that were index-openable failed at chunk read time because zarrita didn't have decoders for their codec ids: fletcher32 (CORDEX/CMIP), `blosc2`/`numcodecs.blosc2` (Icechunk), `numcodecs.pcodec` (Icechunk). #93 also fixed a separate bug where a v2 store probed successfully then got reopened with `open.v3()` and 404'd.
**What I changed:**

- Register `fletcher32` and `numcodecs.fletcher32` in zarrita's registry with a decoder that strips the 4-byte trailing checksum (good enough for read paths).
- Alias `blosc2` / `numcodecs.blosc2` to the existing Blosc decoder.
- Add an in-repo WASM pcodec decoder (Rust source under `tools/pcodec-wasm/`, generated `public/pcodec/pcodec.wasm`) and register `numcodecs.pcodec`; chunk decode validates output is a numeric typed array so codec failures surface as errors rather than silent `undefined`.
- Format-explicit probing: v2 → `zarr.open.v2`, v3 → `zarr.open.v3`, no silent promotion during fallback.
- Draft #113 removes the in-tree pcodec entirely in favour of `@eeholmes/zarrita-pcodec` (external package, git-SHA-pinned).
  **Key code areas:** codec registry setup (looks like today's upstream `src/lib/data/codecs.ts` and `fletcher32.ts` cover the same slot), chunk decode path in `ZarrDataManager`, `tools/pcodec-wasm/`.
  **Why it matters:** Real datasets stop failing on chunk read; format detection stops corrupting the follow-up open.
  **Dependencies / external APIs involved:** `zarrita` codec registry, `numcodecs` conventions, WASM (Rust) for pcodec, potentially `@eeholmes/zarrita-pcodec`.
  **Likely overlap with later upstream work:** High — upstream already has `src/lib/data/codecs.ts` and `src/lib/data/fletcher32.ts`. Compare codec set + decoder correctness.
  **Suggested priority for comparison:** High.

---

### 4. Zarr v3 metadata edge cases

**PR(s) / commits:** #2 (WIP, closed), #9, #13 (closed), #81 (closed)
**Problem addressed:** Several v3 stores stalled or refused to index because of metadata quirks: CHLA-Z was unconsolidated; some coordinate `data_type` fields were object-style (`numpy.datetime64`); Icechunk datasets migrated from v2 kept `_ARRAY_DIMENSIONS` in attrs and had no `dimension_names`, so all variables were hidden and grid detection got `"-"`.
**What I changed:**

- Unconsolidated fallback path so `.zmetadata`-less stores still index (#9).
- `ZarrDataManager.hasUnsupportedV3ObjectDataType` (memoised, in-flight-deduped) probes `<var>/zarr.json`; `enrichMetadata` skips those variables safely; runtime coordinate access returns index-based fallbacks for `time` and empty dim info for others; UI toasts via new `logWarning` (#13).
- `getEffectiveDimensionNames` prefers `variable.dimensionNames` then falls back to `attrs._ARRAY_DIMENSIONS`; `isValidVariable` no longer hides everything when dims are `undefined` (uses shape heuristic); guarded `Array.isArray` on lat/lon coordinate resolution (#81).
  **Key code areas:** `src/lib/data/sourceIndexing.ts` (`enrichMetadata`, `collectArrayEntry`, `isValidVariable`), `src/lib/data/ZarrDataManager.ts` (`hasUnsupportedV3ObjectDataType`, `getVariableMetadata`), `src/lib/data/zarrUtils.ts` (`resolveLatLonFromCoordinates`), `useGridDataAccess`, `useLog.ts`, `AvailableVariablesSection.vue`.
  **Why it matters:** Turns "spinner forever" states into rendered data or graceful degradation with a user-visible warning.
  **Dependencies / external APIs involved:** `zarrita` v2/v3 metadata layout, browser toast infra.
  **Likely overlap with later upstream work:** Upstream `sourceIndexing.ts` and `ZarrDataManager.ts` exist and may already handle some of this. Worth checking especially the `_ARRAY_DIMENSIONS` fallback.
  **Suggested priority for comparison:** High.

---

### 5. Multiscale / projected `x/y` GeoZarr + CRS overrides

**PR(s) / commits:** #44, #83 (draft)
**Problem addressed:** Datasets using projected `x`/`y` with a `spatial_ref` CRS scalar (rioxarray/ndpyramid, carbonplan GeoZarr) weren't detected as regular grids, and their multiscale pyramid wasn't navigable. Separately, projected datasets with missing embedded CRS metadata fell back to naive lat/lon rendering.
**What I changed:**

- **Grid detection:** `isXName`/`isYName` helpers; `checkXYGridFromDimensions` returns `REGULAR` when both `x` and `y` dims are present (but placed **after** data-based lat/lon detection so 2-D `lat/lon` still wins — see #68).
- **CRS discovery:** `findCRSVar` scans `coordinates` for a variable carrying `crs_wkt` / `grid_mapping_name` (rioxarray's `spatial_ref`), not only `grid_mapping`. `resolveVariableReference` walks up group hierarchy for sibling coord lookups.
- **Projected → geographic:** `webMercatorXToLon`, `webMercatorYToLat`, `isWebMercatorCRS`, `getXYCoordinatesAsLatLon` in `zarrUtils.ts`; regular renderer picks that path when dims look projected.
- **Pyramid navigation:** every level indexed with full group-prefixed paths (`0/climate`, `1/climate`, `0/20m/temp`); UI replaces per-level dropdowns with one combined "Group" dropdown; leaf name is used for the variable dropdown.
- **URL/catalog CRS override (#83, draft):** `::crs=EPSG:3031` etc. in hash URL and catalog entry `crs` field; resolution order is dataset → group-level → override; recognises polar EPSG codes (`3031/3413/3995`) and routes through curvilinear path.
  **Key code areas:** `src/lib/data/gridTypeDetector.ts`, `src/lib/data/ZarrDataManager.ts` (`findCRSVar`, `resolveVariableReference`), `src/lib/data/zarrUtils.ts`, `src/lib/data/sourceIndexing.ts` (pyramid indexing + coord hiding), `src/ui/grids/Regular.vue`, `src/ui/overlays/controls/VariableSelector.vue`.
  **Why it matters:** Unlocks carbonplan-style multi-level GeoZarr; allows catalog-level CRS assertion when dataset metadata is thin.
  **Dependencies / external APIs involved:** WKT parsing, EPSG:3857 math.
  **Likely overlap with later upstream work:** Upstream has its own `gridTypeDetector.ts` and (worker-based) grid pipelines — direct comparison needed.
  **Suggested priority for comparison:** Medium (this is a big surface but touches distinct grid types).

---

### 6. Curvilinear detection & seam handling

**PR(s) / commits:** #68, #94, #99 (closed)
**Problem addressed:** CMIP6 curvilinear datasets with `x/y` dims were misrouted through the regular-grid path once #44 added `x/y → REGULAR` detection. RADKLIM hourly had 2-D `lat(y,x)` / `lon(y,x)` that weren't being matched. And global curvilinear grids drew long triangles across the longitude seam in flat (Robinson etc.) projections.
**What I changed:**

- **Order-of-detection fix:** data-based lat/lon classification runs **first**; `x/y → REGULAR` is now a fallback only when 2-D lat/lon aren't present (#68). Data-driven detection returns `null` on failure instead of throwing.
- **Coordinate name matching:** helpers to compare dim lists and match 2-D coord arrays only when they share the data var's spatial dims (#99).
- **Seam wrapping:** curvilinear cell topology only closes the last column back to the first when the grid is effectively global (≥300° longitude coverage per row). Regional grids stay on an open path; hover uses the same logic (#94).
  **Key code areas:** `src/lib/data/gridTypeDetector.ts` (`determineGridTypeFromData`, `checkXYGridFromDimensions`), `src/lib/data/zarrUtils.ts` (lat/lon name resolution helpers), curvilinear geometry builder (`buildCurvilinearGeometry`, `isCurvilinearLongitudeGlobal`), hover sample generation.
  **Why it matters:** Real datasets (CMIP6 tos, RADKLIM RR) load; global curvilinear datasets stop tearing across the antimeridian in flat projections.
  **Dependencies / external APIs involved:** none external — internal grid classification and mesh topology.
  **Likely overlap with later upstream work:** Upstream has `curvilinearCalculations.ts` and a curvilinear worker — comparison worthwhile.
  **Suggested priority for comparison:** Medium.

---

### 7. Polar stereographic display + geostationary

**PR(s) / commits:** #48 (closed WIP), #51, #101, #102, #85 (draft)
**Problem addressed:** Polar-stereo datasets loaded but rendered oval on a square canvas, showed a transient error overlay before initialising, and — for RADKLIM — didn't use the dataset's own 2-D `lat/lon` auxiliaries. Users also needed to be able to toggle other grid options on for polar cases (#102). Geostationary sources (Himawari, GOES) had coordinates in **radians** but the inverse projection assumed PROJ metres, collapsing everything to the sub-satellite point (#85).
**What I changed:**

- Set `projectionMode = AZIMUTHAL_EQUIDISTANT` before awaiting `getPolarStereoCRSParams` so the error overlay doesn't flash; opaque overlay + square canvas with real `nx/ny` aspect from `computePolarStereoLatLon2D` (#51).
- Curvilinear render prefers dataset-provided `lat(y,x)`/`lon(y,x)` when polar-stereo CRS is present; only falls back to computed inverse-projection coords when auxiliaries are missing. Scales projected `x/y` by declared units (km vs m) before inverse conversion (#101).
- Small UI change so polar datasets don't hide alternative grid displays from the user (#102).
- **Geostationary (draft):** in `loadGeostatCoords`, check `x/y` `units` attribute; if it starts with `"rad"`, scale in-place by `perspective_point_height + semi_major_axis` (~42.2 M m) before `invGeostatPoint` (#85).
  **Key code areas:** polar curvilinear render path, `src/lib/data/zarrUtils.ts` (`loadGeostatCoords`, `computePolarStereoLatLon2D`), curvilinear renderer, projection mode wiring in Regular/Curvilinear grid components.
  **Why it matters:** RADKLIM, ISMIP6-style polar datasets and CF-compliant GOES/Himawari geostationary sources actually render.
  **Dependencies / external APIs involved:** PROJ-style geos parameters, CF conventions for `grid_mapping`.
  **Likely overlap with later upstream work:** Upstream may not have geostationary support — worth checking whether polar-stereo is present. Draft PRs (#85, and parts of #83) are unfinished, so evaluate as "attempted problem area" more than "shipped behaviour".
  **Suggested priority for comparison:** Medium.

---

### 8. Log10 colormap transform mode

**PR(s) / commits:** #11 (closed WIP), #23, #46
**Problem addressed:** Skewed distributions (e.g. precip, chlorophyll) were hard to visualise on a linear colormap; preprocessing source Zarr wasn't practical. Also, the existing shader used `sqrt(-1.0)` to generate NaN, which is non-portable in WebGL.
**What I changed:**

- Added `transformMode: "linear" | "log10"` store state and a Transform selector in the COLORMAP panel.
- `applyDisplayTransformToData` applied at display/histogram time (not source) across all grid renderers (Regular, GaussianReduced, Curvilinear, Irregular, IrregularDelaunay, Triangular, Healpix): finite `> 0` → `log10(v)`, else NaN.
- Watchers reload rendered/statistical values when transform mode changes.
- Replaced `sqrt(-1.0)` with `uintBitsToFloat(0x7FC00000u)` deterministic NaN in projection shaders.
- Variable subtitle in `VariableSelector.vue` and colormap heading in `Controls.vue` become transform-aware (`log10 tp`, `COLORMAP log10 scale`), and subtitle falls back to leaf var name when `long_name`/`standard_name` is missing.
  **Key code areas:** colormap/transform store state, `applyDisplayTransformToData` utility, per-grid-type `.vue` render paths, projection GLSL, `VariableSelector.vue`, `Controls.vue`.
  **Why it matters:** Wider dataset coverage for visualisation without touching source data.
  **Dependencies / external APIs involved:** WebGL2 (`uintBitsToFloat`), THREE.js shader materials.
  **Likely overlap with later upstream work:** Upstream `src/lib/data/logBins.ts` and `BoundsControls.vue` do some log math (histogram log bins), but a display transform mode may not be present. Worth a look.
  **Suggested priority for comparison:** Medium.

---

### 9. Catalog schema + dashboard refactor

**PR(s) / commits:** #7 (closed), #53, #58, #60, #89 (plus catalog-content-only #54, #77, #86)
**Problem addressed:** The legacy catalog schema (`tag`, `store`) was too coarse. Eli wanted richer filtering — data format, access mode, layout, grid kind, convention, CRS — and cleaner catalog entry UX (copy URL, tag styling). #7 additionally wanted `default_time` support and auto-discovery when `datasources` is omitted in index JSON. #89 was a small polish: clicking "Copy URL" was copying the full internal URL with `::` state params and `icechunk+` prefix instead of the clean data URL.
**What I changed:**

- `TCatalogEntry` (`src/utils/catalog.ts`) swapped `tag/store` for `format/access/layout/grid/convention/crs`; `convention` nullable.
- `CatalogPanel.vue`: filter model + dropdown UI in schema order; full-text search haystack includes new fields; per-entry Copy URL action with feedback state; entry tag row moved under title; entry URL text removed; catalog `cardClass` shared to Modal.
- Copy URL cleaning: split on `::` (drop appended state), strip `icechunk+` prefix.
- `docs/catalogs.md` updated to match.
- `TSources.default_time` added, `indexFromIndex` auto-discovers variables when `datasources` empty, `GlobeView.prepareDefaults` applies `default_time` unless URL param overrides.
  **Key code areas:** `src/utils/catalog.ts`, `src/ui/overlays/controls/CatalogPanel.vue`, `src/ui/common/Modal.vue`, `src/lib/data/sourceIndexing.ts` (`indexFromIndex`), `src/views/GlobeView.vue`, `docs/catalogs.md`.
  **Why it matters:** Better dataset discovery; cleaner shared URLs.
  **Dependencies / external APIs involved:** none external.
  **Likely overlap with later upstream work:** Upstream has `src/utils/catalog.ts` and `src/ui/overlays/controls/CatalogPanel.vue`, but at a glance still uses `tag` in `public/static/catalog.json`. Compare schemas.
  **Suggested priority for comparison:** Medium (this is UX-layer, less risky than data-layer changes).

---

### 10. Load-time & interaction performance

**PR(s) / commits:** #37 (closed backport WIP), #65, #74, #76, #105 (closed)
**Problem addressed:** CHLA (4320×8640) took ~20 s to load vs ~6 s reference. Slower than needed transitions between multilevel variables produced mixed old/new frames. Hover, scroll interaction, and URL sync fired excess work. Full-array initial fetches were unnecessary for 3D/4D variables.
**What I changed:**

- **Geometry subsampling (#76):** `subsampleCoords` in `Regular.vue` caps geometry vertex count at 512 per axis (linear interp); data texture keeps full resolution; UVs map back correctly. Result: ~245K vertex projections instead of 37.9M. `generateGridIndices` returns a pre-allocated `Uint32Array` wrapped in `THREE.BufferAttribute` rather than dynamic `Array.push`.
- **Parallelise metadata probes (#76):** `Promise.all` for `findCRSVar` coord scan, dimension detail fetch, lat/lon fetch. Grid-type detector short-circuits to `REGULAR` on plain `lat`/`lon` dims before invoking CRS detection (saves 4 network probes for the common case).
- **Ordered mesh transition (#74):** on datasource change, apply a shared loading material to regular-grid meshes, then build geometry, then fetch data. Add an in-canvas "Data loading…" overlay.
- **Shared grid callbacks + motion tracking (#65):** centralize regular-grid projection/colormap update triggers; `useGridScene` tracks scene motion so grid updates react during mouse/wheel; `useUrlSync` uses consolidated watcher maps and debounced URL updates.
- **Info panel + render throttle + zarr format hints + hover binary search (#37, closed):** intended to backport upstream perf work; adds `dtype/shape` to indexed metadata so info panel avoids per-variable fetches; `wheelActive` skip in redraw; format-hinted `zarr.open` for FetchStore paths; binary-search hover lookup for regular non-rotated grids (`gridHoverUtils.ts`).
- **Initial-slice loads (#105, closed):** `buildDimensionRangesAndIndices` seeds initial reads from displayed start of each dim only; sliders still trigger new-slice reads later.
  **Key code areas:** `src/ui/grids/Regular.vue` (geometry subsampling, ordered transitions), `src/lib/data/gridTypeDetector.ts`, `src/lib/data/ZarrDataManager.ts`, `src/lib/data/zarrUtils.ts`, `src/lib/data/sourceIndexing.ts` (indexed `dtype/shape`), `src/composables/useGridScene.ts`, `src/composables/useSharedGridLogic.ts`, `src/store/useUrlSync.ts`, `gridHoverUtils.ts`, `AvailableVariablesSection.vue`.
  **Why it matters:** Startup and interaction latency; noticeable difference on the "big grid" datasets that motivated the fork.
  **Dependencies / external APIs involved:** THREE.js `BufferAttribute`, browser `Promise.all`.
  **Likely overlap with later upstream work:** Upstream has extensive worker-based grid pipelines (`src/lib/grids/*.worker.ts`, `gridGeometryWorkerClient.ts`, etc.) that likely address the same problems differently — comparison here is subtle and important. #37 was **explicitly** an attempted backport from upstream `d70-t/gridlook chore/refactoring`, so upstream will have moved further.
  **Suggested priority for comparison:** High (upstream's worker architecture may make several of these fixes obsolete or need re-shaping).

---

### 11. Mobile GPU texture clamping

**PR(s) / commits:** #91
**Problem addressed:** CHLA-Z (4320×8640) renders correctly on desktop but shows a flat minimum-value colour on mobile because mobile GPUs cap `maxTextureSize` at 4096 px; oversize `THREE.DataTexture` silently produces an all-zero texture.
**What I changed:** `Regular.vue` now queries `renderer.capabilities.maxTextureSize` (fallback 4096) and nearest-neighbour downsamples the data (`downsampleDataTexture`) before texture upload when either dim exceeds the cap. NaNs preserved for the missing-data mask. UVs unchanged (still `[0,1]`). `useGridScene.getRenderer` promoted from internal-only; `useSharedGridLogic` threads it through.
**Key code areas:** `src/ui/grids/Regular.vue` (`downsampleDataTexture`, `getRegularData`), `src/composables/useGridScene.ts`, `src/composables/useSharedGridLogic.ts`.
**Why it matters:** Mobile Safari / Chrome show correct data instead of a flat globe on large grids.
**Dependencies / external APIs involved:** THREE.js `renderer.capabilities.maxTextureSize`.
**Likely overlap with later upstream work:** Probably not present upstream — narrow, targeted fix.
**Suggested priority for comparison:** Low.

---

### 12. Float16 variable rendering

**PR(s) / commits:** #19
**Problem addressed:** Variables with `data_type: "float16"` passed histogram and Data Picker but rendered as a single flat colour on the globe because the render path didn't convert their typed array before uploading as `THREE.FloatType`.
**What I changed:** `castDataVarToFloat32` now converts any Float32-compatible typed array (including float16-backed ones) to `Float32Array` before texture upload; the error branch reports the actual unsupported type.
**Key code areas:** variable read path (`castDataVarToFloat32`) in the shared grid data helpers.
**Why it matters:** Float16 stays available for rendering rather than being dropped.
**Dependencies / external APIs involved:** typed-array conversion; THREE.js `FloatType`.
**Likely overlap with later upstream work:** Upstream likely handles dtype conversion in its worker/decoder path — quick check that Float16 is in the accepted set.
**Suggested priority for comparison:** Low.

---

## Notes on scope

- PRs #4 and #34 are merges pulling upstream/gridlook-team changes into the fork; not fork work.
- Trivial content-only PRs (README/catalog title/URL edits): #17, #25, #54, #57, #70, #77, #86.
- Draft/WIP PRs (#83, #85, #113) capture attempted problem areas — worth treating as "here is what Eli was still working on" rather than shipped behaviour.
- Closed non-merged PRs (#2, #11, #13, #21, #29, #37, #48, #79, #81, #99, #105) either superseded by a merged PR (e.g. #2 → later Zarr work; #11 → #23; #29 → #27/#31) or explicitly abandoned. They still document intent and are grouped under the corresponding theme above.
- Upstream files with clear name overlap in `/home/jovyan/gridlook/src/lib/data/`: `ZarrDataManager.ts`, `sourceIndexing.ts`, `gridTypeDetector.ts`, `icechunkStore.ts`, `codecs.ts`, `fletcher32.ts`, `logBins.ts`. Upstream `src/ui/overlays/controls/` has `CatalogPanel.vue` and `VariableSelector.vue`. Only note these here — deep comparison is the follow-up work.
