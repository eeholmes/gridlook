# Handoff — 2026-11-18 (sessions 10 and 11)

Read this at the start of a new session. Cross-referenced by `CLAUDE.md`.

This file is an index of state, not a summary of past work. Anything with its
own document under `claude/` is a pointer, not a retelling.

## Status

- **The v1.8.1 upstream merge is written and waiting on Eli's review
  (session 11).** Four PRs, one per issue. #34 is the merge itself (#27). It
  targets `main`. **#35** (#28, catalog fields → `tags`), **#36** (#29, the
  volume field stays linear) and **#37** (#30, docs) are each stacked on
  #34's branch `chore/merge-upstream-v1.8.1`. **Merge #34 first.** GitHub
  then retargets the other three to `main`. Each PR body says what was and
  was not tested. None was opened in a browser. Lint, typecheck, `npm run knip`,
  the tests and the build pass on all four, and CI is green on #34.
- **Until #34 merges, `main` (`dcb5e55`) is 158 commits behind
  `upstream/main`** (`58de946`, v1.8.1). Keep the gap small: the fork is a
  staging area for work meant to go upstream, not a variant, so merging
  upstream is routine maintenance rather than an event.
- **Things the merge settled that a later session would trip on.** The new
  linear call sites, and why volumes are among them, are in `CLAUDE.md` under
  Value transforms. `CatalogPanelExtended.vue` is gone: the fork's default
  catalog now uses upstream `tags` (`docs/catalogs-extended.md`).
  `vite.jupyter.config.ts` is still needed (`CLAUDE.md`, Commands).
  - **Not done:** the derived vector magnitude is computed from linear
    components and is never log10'd, so it is shown linear, with linear
    units, even when log10 is selected. #34 explains this, and no issue
    exists for it.
- **After #34 the fork's delta is 31 files under `src/` and `tests/`** (11
  fork-only, 20 edits to upstream files). Before it was 36 (14 and 22). #35
  removes the fork's edits to `CatalogPanel.vue` and `catalog.ts` entirely.
  That number is the thing to keep small.
- **Open issues:** #1, #13 (shelved), #14, #15, #16, #17, #20, #21, #25
  (deck-gl, never triaged), #27–#30 (until their PRs merge). **Open PRs:**
  #33 (this handoff) and #34–#37.
- An empty `fix/all-nan-notice` branch was created for #17 in session 7 and
  never used; it was deleted in session 8. **No work has started on #17.**

- **Downstream, as of 2026-09-19: six published viewers are builds of this `main`**
  (`b3c42b1`), made by `publish_viewer.py` in `ocean-icechunks/icechunks` (gobai-o2,
  noaa-ohc, oa-indicators, noaa-oisst) and `ocean-icechunks/hycom` (hycom, and its scratch
  copy). Two things those sessions learned that concern this repo. **This clone had been
  98 commits behind `origin/main` on the hub where they were built** — it is per machine —
  so the first round of viewers shipped without the log10 transform, the swatch fix and the
  CORS notice; the publishers now fetch and refuse a stale checkout. And
  **`DEFAULT_DATASET` in `HashGlobeView.vue` is hard-coded** to the OGS demo store, so a
  published viewer opened without a `#…` fragment shows that instead of its own catalog's
  first entry; the publishers work around it by injecting a default hash into the built
  `index.html`. Taking the default from the first catalog entry would retire the
  workaround. No issue has been filed for it. Those builds ran on Node 20.19.6, on a hub
  without Node 24.

### Upstream proposals — both merged

Both branches are pushed to the fork only, branched from `upstream/main`, and
were opened as pull requests on `d70-t/gridlook`.

| Branch                             | Upstream PR          | State                                                                                                                                               |
| ---------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~`fix/colormap-swatch-base-url`~~ | `d70-t/gridlook#211` | **Merged upstream 2026-08-28**, and on `main` here via PR #11. The branch was deleted locally and on `origin` on 2026-09-16; nothing is left to do. |
| `fix/codec-error-messages`         | `d70-t/gridlook#210` | **Merged upstream 2026-09-17.** Its files on `upstream/main` are identical to the fork's (checked 2026-11-18), so they merge cleanly in #27.        |

The **byte-identical rule** is retired in #37: those files are upstream-owned now.

### Reviews we gave upstream

- **`d70-t/gridlook#235`** (espg, multiscale level switching + level-of-detail
  loading). Session 9 tested whether it breaks non-pyramid groups and
  [commented](https://github.com/d70-t/gridlook/pull/235#issuecomment-6158473037).
  Verdict: stores without a `multiscales` attribute index exactly as before
  (all `grouped` catalog entries, Icechunk group paths, JSON index). Two
  issues raised: the six ndpyramid web-mercator pyramids in our catalog get
  levels but no resolution, so zoom never switches level; and a `multiscales`
  group drops its own arrays and any non-level sibling groups. Eli confirmed
  both in a browser. EOPF Sentinel-2 was left out of the comment on purpose.
  Method: the catalog-audit Node pass, indexing each URL on the PR and on its
  base and diffing the results.

### The 2026-09-16 upstream merge (PR #23)

`main` holds `upstream/main@7b2c126`. What it changed underfoot is written up
where it belongs — `CLAUDE.md` for the codecs now living in the `codecita`
package, the HEALPix worker, and the second value-transform application point
that worker forced; `claude/codec-support.md` §1 for the codec detail. Two
things that are not code:

- **`knip` runs in CI**, so an unused export fails the build. Verify with
  `npm run lint-ci && npm run typecheck && npx knip && npm run test && npm run build`.
- **Unverified in a browser:** a HEALPix dataset with `log10` on, and hover
  values. The suite passes (303 tests); nothing has touched real data.

### Candidates to propose upstream

Eli's aim is to have her additions land in gridlook itself rather than to carry
them. In rough order of how upstreamable they look: the `log10` value
transform, the virtual-chunk CORS diagnostic, and the extended catalog UI —
that last one being the biggest and most opinionated.

## Codec and data-type support

The whole subject — the survey of what decodes, the problem list, which
problems belong to gridlook vs zarrita vs numcodecs.js, the remaining tasks,
and the two-branch arrangement — is in
**[`claude/codec-support.md`](./codec-support.md)**. Read that if the work is
codec-related; there is nothing here that is not there.

Shipped in PR #9 (issue #5): the survey, its tests, and
`src/lib/data/codecErrors.ts`, which names the codec when a dataset cannot be
decoded. No decoders were added.

## NASA Earthdata Icechunk stores (issue #13, shelved)

The three `fish-pace/pace-oci/inregion/*` stores on source.coop will not load
in a browser. The full diagnosis and Eli's plan are in the **comment on
[issue #13](https://github.com/eeholmes/gridlook/issues/13#issuecomment-5465930284)**;
there is no separate document and nothing here repeats it.

The one-line version: the stores' only virtual chunk container is
`s3://ob-cumulus-prod-public/`, and neither that bucket nor NASA's HTTPS (TEA)
endpoint sends CORS headers, so no credential can unblock a browser. Adding an
`Authorization` header would make it worse, because the custom header forces a
preflight that TEA answers with `405`.

**Shelved pending two things outside this repo**: `earthaccess` work that lets
the stores be rebuilt with HTTPS (`access='indirect'`) references, and a CORS
conversation with OB.DAAC. Do not start the gridlook-side token input until the
first of those lands — it is a small change to
`src/lib/data/virtualChunkFetch.ts`, which icechunk-js already documents as the
hook for auth headers.

## Test dataset catalog

The audit behind issue #12 — how every entry in
`public/static/catalog-extended.json` was tested in a real browser, which
nineteen are tagged `broken`, and the five datasets added — is in
**[`claude/catalog-audit.md`](./catalog-audit.md)**. It produced issues #15
(dynamical.org chunk geometry), #16 (ORCESTRA HEALPix z12) and #17, all open.
#17 was an omnibus, since split into **#17** (all-NaN and string slices),
**#20** (default variable) and **#21** (constant slice) — three faces of the
same principle, name what happened instead of drawing a blank. The issues carry
the measurements and constraints; do not restate them here.

**2026-11-18 recheck (PR #32):** every entry was opened from Node on the same
code path gridlook uses — zarrita and icechunk-js from `node_modules`, walking
up an Icechunk URL to the repo root, and falling back to the JSON index that
the eerie `/stac` items use. A plain `curl` probe of metadata files reports
false failures for all three, so do not use one. 74 of 75 opened; 11
`ocean-icechunks` entries were added. The probe script was scratch and is
gone; the PR body describes it well enough to rebuild.

## Other reference documents

- **[`claude/catalog-audit.md`](./catalog-audit.md)** — as above.
- **[`claude/comparison.md`](./comparison.md)** — the archaeology of the
  `eeholmes/gridlook-xl` fork, as 12 numbered themes. Themes #2 (nested-group
  handling), #4 (Zarr v3 metadata edge cases) and #10 (load-time performance)
  are the ones still open. Ask Eli which; do not propose porting all of them.
- **[`claude/codec-support.md`](./codec-support.md)** — as above.

## Working principles

- **Diagnosis ships before the fix.** When a failure is opaque, build the
  message that names the specific culprit first, and let Eli decide separately
  whether the fix is worth the merge surface. A generic "could not load"
  destroys the evidence needed to report a problem upstream.
- Fork-only changes must minimize edits to upstream files. Prefer new files and
  tiny delegation shims, and prefer GitHub-side settings over editing inherited
  config.
- **Anything proposed upstream needs tests.** Upstream's `lint.yml` runs
  `npm run test` on every push and PR, and every substantive PR among the last
  twelve merged changed `tests/`. The exception is a change with no testable
  seam — `d70-t/gridlook#211` edits two string literals inside `.vue` files,
  and the suite runs in `node` with no DOM.
- Verify with `npm run lint-ci && npm run typecheck && npm run test && npm run build`
  before every commit.
- Follow Conventional Commits (Commitlint enforces them). No changelog is
  generated — Release Please is off and stays off.
- Delegate broad research (multi-PR reads, cross-file audits) to Explore or
  general-purpose agents so the main context stays lean.

## Environment notes

- **Node 24 lives in the home directory, and a hub can have a different
  home.** On 2026-11-18 `~/.local/opt/node-v24.20.0-linux-x64` was missing on
  this hub (home on NFS `/prod/eeholmes`) and was reinstalled from the
  nodejs.org tarball (checksum verified), linked into `~/.local/bin`. The image
  itself ships only conda Node 22 and apt Node 18 — see
  `nmfs-opensci/py-rocket-base#321`. Login shells get `~/.local/bin` from
  `~/.profile`; there is no `~/.bash_profile`, whatever `CLAUDE.md` says (fixed
  in #30). Tool shells may still start without it — prepend
  `export PATH="$HOME/.local/opt/node-v24.20.0-linux-x64/bin:$PATH"`.
- **`gh` can default to the upstream repo.** Always pass
  `--repo eeholmes/gridlook`, especially for anything that writes. See
  `CLAUDE.md` under "Remotes, and always passing `--repo` to `gh`".
- **Python has `numpy`, `numcodecs`, `zarr` 3.4.2 and `icechunk` 2.3.1**
  (`icechunk.http_storage(url)` opens a source.coop repo). Useful for
  generating reference bytes and metadata fixtures for tests rather than
  hand-rolling them.
- Local dev is behind JupyterHub — the dev URL uses `/proxy/absolute/3000/`.
  `npm run dev` handles this via `vite.jupyter.config.ts`.
- `strictPort: true` for dev — kill strays with `pkill -9 -f "vite --port"`.
- Do not launch background dev servers from tool calls; they persist across
  turns and block later runs.
- Remote branch deletion and repo-settings writes via `gh api` are blocked by
  the permission classifier — hand those to Eli. (`gh pr merge --delete-branch`
  does work.)

## How to resume

**In flight:** PRs #34–#37, the upstream merge, waiting on Eli's review and
go-ahead to merge. #34 goes first. The shortlist after that, most-ready first:

1. **#17, then #20 and #21** — the "say what happened instead of drawing a
   blank" trio from the catalog audit. #17 establishes the notice mechanism the
   other two reuse, so it goes first.
2. **#14** — take the dataset title from the catalog when the store metadata
   has none.
3. **#15 and #16** — dataset-specific loading failures, both diagnosed in
   `claude/catalog-audit.md`.

Or start a new session and say one of:

- **"read `claude/handoff.md` and tell me what's next"**
- **"port theme #N from the comparison"** — where N is one of the 12 themes in
  `claude/comparison.md`
- **"pick up the codec work"** — the remaining tasks are listed in
  `claude/codec-support.md`
- **"look at something else in gridlook-xl"** — free-form investigation
