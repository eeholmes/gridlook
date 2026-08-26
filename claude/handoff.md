# Handoff — 2026-08-26

Read this at the start of a new session. Cross-referenced by memory (`reference-handoff`) and by `CLAUDE.md`.

## Status

- **Branch `main`** is up to date with `origin/main`. PR #3 merged; the docs commit (this file + `CLAUDE.md` + `claude/comparison.md`) is the tip.
- **Issues:** #1 (archaeology plan) and #2 (extended catalog port) are both closed.
- **Working tree** is clean apart from anything you've touched since.

## What just shipped (PR #3)

Ported the extended catalog filter UI from `eeholmes/gridlook-xl`:

- Six filter dropdowns (format / access / layout / grid / convention / crs) via new `CatalogPanelExtended.vue`
- `CatalogPanel.vue` now delegates to Extended when a catalog has any extended field, else renders unchanged
- `TCatalogEntry` gained optional fields alongside existing `tag` (additive only)
- `DEFAULT_CATALOG` → `static/catalog-extended.json`; `DEFAULT_DATASET` hardcoded to the first entry of that catalog with a `Keep in sync` comment
- `vite.jupyter.config.ts` (fork-only) makes `npm run dev` work behind the JupyterHub proxy; guarded on `JUPYTERHUB_SERVICE_PREFIX` so it's a no-op elsewhere
- `.gitignore` gained `.ipynb_checkpoints/`

**Merge surface on upstream-owned files:** `src/utils/catalog.ts` +6, `src/ui/overlays/controls/CatalogPanel.vue` +15/-1, `src/views/HashGlobeView.vue` 3 lines, `package.json` 1 line, `.gitignore` +3.

## Immediate next candidates

From `claude/comparison.md`, the remaining **High** priority themes:

| #   | Theme                                          | comparison.md section | Rough scope                                                                                                                                                     |
| --- | ---------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Icechunk-js store backend                      | §1                    | New store type via `icechunk+…` URLs; upstream already has `src/lib/data/icechunkStore.ts` — comparison may collapse                                            |
| 2   | Nested-group / root-group handling             | §2                    | Deep-group Icechunk URLs, downsampled sibling groups; touches `ZarrDataManager` and `sourceIndexing`                                                            |
| 3   | Extra Zarr codecs (fletcher32, blosc2, pcodec) | §3                    | Upstream has `codecs.ts` and `fletcher32.ts` — check codec set, add missing decoders                                                                            |
| 4   | Zarr v3 metadata edge cases                    | §4                    | `_ARRAY_DIMENSIONS` fallback, object-style `data_type`, unconsolidated metadata                                                                                 |
| 10  | Load-time & interaction performance            | §10                   | **Subtle** — upstream has since moved to worker-based grid pipeline (`src/lib/grids/*.worker.ts`); some fork perf tricks may now be obsolete or need re-shaping |

Ask Eli which one first. Do **not** propose porting all of them — Eli chooses per-theme.

## Working principles (see memory too)

- Fork-only changes must minimize edits to upstream files. Prefer new files + tiny delegation shims. See memory `feedback-minimize-upstream-merge-surface`.
- This repo is a fork of `d70-t/gridlook`. Fork-only work does not target upstream. See memory `project-fork-of-d70t-gridlook`.
- Local dev is behind JupyterHub — dev URL uses `/proxy/absolute/3000/` (not `/proxy/3000/`). `npm run dev` handles this automatically. See memory `project-jupyterhub-environment`.
- Verify with `npm run lint && npm run typecheck && npm run test && npm run build` before every commit.
- Follow Conventional Commits. Only `feat`/`fix` produce changelog entries.
- Delegate broad research (multi-PR reads, cross-file audits) to Explore or general-purpose agents so the main context stays lean.

## Environment quirks worth remembering

- `strictPort: true` is set for dev — port 3000 conflicts fail loudly. Kill stray processes with `pkill -9 -f "vite --port"`.
- Do not launch background dev servers from tool calls. Vite processes started that way persist across turns and block subsequent runs.
- HMR through the proxy may or may not connect cleanly. Manual refresh works either way.

## How to resume

Start a new session and say either:

- **"read `claude/handoff.md` and tell me what's next"** — gets you a status summary + shortlist
- **"port theme #N from the comparison"** — where N is one of the High-priority items above (or any of the 12 themes in `claude/comparison.md`)
- **"look at something else in gridlook-xl"** — free-form investigation

Claude will already have this file's contents in context via memory + `CLAUDE.md` on session start.
