# Handoff — 2026-08-30 (session 7)

Read this at the start of a new session. Cross-referenced by `CLAUDE.md`.

This file is an index of state, not a summary of past work. Anything with its
own document under `claude/` is a pointer, not a retelling.

## Status

- **`main`** is in sync with `origin/main`, working tree clean, and roughly 20
  commits ahead of `upstream/main` and 0 behind.
- **Issues:** #1, #2, #4, #5, #7 and #10 are closed. **PRs:** #3, #6, #8, #9
  and #11 merged. #13 is open but **shelved** — see below.

### Two branches proposed upstream — do not delete, do not merge into `main`

Both are pushed to the fork only, branched from `upstream/main`, and open as
pull requests on `d70-t/gridlook`. Each carries exactly the fix named in its
title and nothing else from this fork's 20-commit lead, so the maintainers can
take one without the other.

| Branch                         | Upstream PR          | Fork-side status                                               |
| ------------------------------ | -------------------- | -------------------------------------------------------------- |
| `fix/codec-error-messages`     | `d70-t/gridlook#210` | never merged here; the fix reached `main` separately via PR #9 |
| `fix/colormap-swatch-base-url` | `d70-t/gridlook#211` | the same fix is already on `main` via PR #11                   |

`fix/codec-error-messages` had one round of upstream review (Karinon,
2026-08-28): `explainDataError` became `explainCodecError`, and
`flattenErrorMessage` moved from `src/lib/data/codecErrors.ts` to
`src/utils/errorHandling.ts` with its tests. Both changes are on the branch and
were mirrored onto `main` by PR #19, so four files are now shared rather than
two. Left open on that PR: an offer to drop the float16 data-type case, which
only fires on browsers older than Chrome 135 / Firefox 129 / Safari 26 — if the
maintainers take it, `explainCodecError` covers nothing but codecs and the name
becomes exact.

The files each branch touches are **byte-identical** to the copies on `main`.
Change one and you must change the other, or the next `git merge upstream/main`
conflicts. For `fix/codec-error-messages` the details are in
`claude/codec-support.md` §6; for `fix/colormap-swatch-base-url` it is the two
one-line edits listed under "Colormap swatches" below.

Merging either upstream PR is safe: `main` already holds the identical change,
so the merge is a no-op on those lines.

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
(dynamical.org chunk geometry), #16 (ORCESTRA HEALPix z12) and #17 (categorical
default variables), all open.

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

Start a new session and say either:

- **"read `claude/handoff.md` and tell me what's next"**
- **"port theme #N from the comparison"** — where N is one of the 12 themes in
  `claude/comparison.md`
- **"pick up the codec work"** — the remaining tasks are listed in
  `claude/codec-support.md`
- **"look at something else in gridlook-xl"** — free-form investigation
