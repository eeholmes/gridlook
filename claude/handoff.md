# Handoff — 2026-09-16 (session 8)

Read this at the start of a new session. Cross-referenced by `CLAUDE.md`.

This file is an index of state, not a summary of past work. Anything with its
own document under `claude/` is a pointer, not a retelling.

## Status

- **`main`** is in sync with `origin/main` and the working tree is clean.
  Nothing is in progress: session 8 only cleaned up and re-indexed this file.
- **`main` is 35 commits ahead of `upstream/main` and 60 behind.** Upstream has
  moved fast since late August — read "Upstream has moved" below before
  starting anything that touches `src/lib/data/`.
- **Open issues:** #1, #13 (shelved), #14, #15, #16, #17, #20, #21.
  **Closed:** #2, #4, #5, #7, #10, #12. **PRs #3, #6, #8, #9, #11, #18 and #19
  are merged; none are open.**
- An empty `fix/all-nan-notice` branch was created for #17 in session 7 and
  never used; it was deleted in session 8. **No work has started on #17.**

### Upstream proposals — one merged, one waiting on us

Both branches are pushed to the fork only, branched from `upstream/main`, and
were opened as pull requests on `d70-t/gridlook`.

| Branch                         | Upstream PR          | State                                                                                                                                         |
| ------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `fix/colormap-swatch-base-url` | `d70-t/gridlook#211` | **Merged upstream 2026-08-28.** The fix is in `upstream/main`, and on `main` here via PR #11. The branch is now redundant and can be deleted. |
| `fix/codec-error-messages`     | `d70-t/gridlook#210` | **Open, changes requested — the ball is in our court.**                                                                                       |

**The one outstanding action on #210:** Karinon asked (2026-08-31) that the
float16 data-type case be dropped, on the grounds that it was speculative and
legacy browsers are not worth supporting; Eli agreed and said he would clean it
up. That has not been done. Removing it also makes `explainCodecError` exactly
accurate, since the file would then explain nothing but codecs. The edit has to
land on the branch **and** be mirrored onto `main` — see the byte-identical
rule below. The earlier review round (`explainDataError` → `explainCodecError`,
`flattenErrorMessage` moved to `src/utils/errorHandling.ts`) is already done, on
the branch and on `main` via PR #19.

The files each branch touches are **byte-identical** to the copies on `main` —
four of them since PR #19: `src/lib/data/codecErrors.ts`,
`src/utils/errorHandling.ts` and both their test files. Change one and you must
change the other, or the next `git merge upstream/main` conflicts. The details
are in `claude/codec-support.md` §6.

### Upstream has moved — 58 commits since 2026-08-28

The next merge from `upstream/main` is substantial, and one commit matters more
than the rest: **`9733566 chore(lib): moved codecs into separate package`**
deleted `src/lib/data/fletcher32.ts`, `gribscan.ts` and `logBins.ts` along with
their tests, leaving `codecs.ts` as a thin registration file. `CLAUDE.md` and
`claude/codec-support.md` both describe those files as living in
`src/lib/data/`, which is still true here but no longer true upstream — re-read
both after merging, and expect the fork's codec additions to need rehoming.

Other upstream work to know about before porting anything from `gridlook-xl`:
UGRID support, a HEALPix web worker (levels 13 and 20 now load), local Zarr and
local NetCDF loading, a distance scale, camera-zoom fixes, and `knip` in CI.

## Codec and data-type support

The whole subject — the survey of what decodes, the problem list, which
problems belong to gridlook vs zarrita vs numcodecs.js, the remaining tasks,
and the two-branch arrangement — is in
**[`claude/codec-support.md`](./codec-support.md)**. Read that if the work is
codec-related; there is nothing here that is not there.

Shipped in PR #9 (issue #5): the survey, its tests, and
`src/lib/data/codecErrors.ts`, which names the codec when a dataset cannot be
decoded. No decoders were added.

## Colormap swatches

Issue #10 (PR #11): the gradient thumbnails were requested from an absolute
`/static/colormaps/<name>.webp`, whose leading slash ignores the `base` the
app is built with. `vite.config.ts` sets `base: "./"`, so anywhere but the
domain root — GitHub Pages at `/gridlook/`, the JupyterHub proxy prefix in dev
— every swatch 404s silently. Both call sites now prefix
`import.meta.env.BASE_URL`.

**The rule this leaves behind:** files in `public/` are referenced from script
through `import.meta.env.BASE_URL`, never a leading slash.
`src/ui/overlays/controls/ColormapControls.vue` and
`src/ui/overlays/HoverReadout.vue` were the only two such paths in `src/`.

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
#17 was an omnibus and has since been split three ways, all three open and all
three about naming what happened instead of drawing a blank: **#17** all-NaN
(and string-valued) slices, **#20** picking a default variable that is neither
flag-valued nor string-valued, **#21** a constant `min == max` slice. #20
carries the key constraint — do not key off the `categorical_*` name; use the
CF `flag_values` / `flag_meanings` attributes already captured by
`sourceIndexing.ts`.

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

- **Node is already installed**; if `npm` looks missing, suspect the shell.
  `~/.local/opt/node-v24.20.0-linux-x64` persists across hubs. Tool shells may
  start without it on `PATH` — prepend
  `export PATH="$HOME/.local/opt/node-v24.20.0-linux-x64/bin:$PATH"`.
- **`gh` can default to the upstream repo.** Always pass
  `--repo eeholmes/gridlook`, especially for anything that writes. See
  `CLAUDE.md` under "Remotes, and always passing `--repo` to `gh`".
- **Python has `numpy`, `numcodecs` 0.16.5 and `zarr` 3.3.0.** Useful for
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

Nothing is in flight. The shortlist, most-ready first:

1. **Finish the `d70-t/gridlook#210` review round** — drop the float16 case
   from `src/lib/data/codecErrors.ts` on `fix/codec-error-messages`, mirror the
   identical edit onto `main`, push both. Small, already agreed with the
   maintainer, and it is the only thing blocking that PR.
2. **#17, then #20 and #21** — the "say what happened instead of drawing a
   blank" trio from the catalog audit. #17 establishes the notice mechanism the
   other two reuse, so it goes first.
3. **#14** — take the dataset title from the catalog when the store metadata
   has none.
4. **Merge `upstream/main`** — 60 commits behind; read "Upstream has moved"
   first.
5. **#15 and #16** — dataset-specific loading failures, both diagnosed in
   `claude/catalog-audit.md`.

Or start a new session and say one of:

- **"read `claude/handoff.md` and tell me what's next"**
- **"port theme #N from the comparison"** — where N is one of the 12 themes in
  `claude/comparison.md`
- **"pick up the codec work"** — the remaining tasks are listed in
  `claude/codec-support.md`
- **"look at something else in gridlook-xl"** — free-form investigation
