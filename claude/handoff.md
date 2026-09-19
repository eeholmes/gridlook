# Handoff — 2026-09-16 (session 8)

Read this at the start of a new session. Cross-referenced by `CLAUDE.md`.

This file is an index of state, not a summary of past work. Anything with its
own document under `claude/` is a pointer, not a retelling.

## Status

- **`main`** is in sync with `origin/main` and the working tree is clean.
  Nothing is in progress. Session 8 finished the `d70-t/gridlook#210` review
  round (PR #22), merged 58 commits of `upstream/main` (PR #23), and deleted
  three spent branches.
- **`main` is 43 commits ahead of `upstream/main` and 0 behind**, as of
  `upstream/main@7b2c126` on 2026-09-16. Keep it that way: the fork is a
  staging area for work meant to go upstream, not a variant, so merging
  upstream is routine maintenance rather than an event.
- **The fork's whole delta is 36 files under `src/` and `tests/`**: 14
  fork-only files and 22 edits to upstream-owned files totalling about 194
  added lines, the largest being 37 lines in `src/ui/overlays/Controls.vue`.
  That number is the thing to keep small.
- **Open issues:** #1, #13 (shelved), #14, #15, #16, #17, #20, #21.
  **Closed:** #2, #4, #5, #7, #10, #12. **PRs #3, #6, #8, #9, #11, #18, #19,
  #22 and #23 are merged; none are open.**
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
  workaround. No issue has been filed for it. This hub has no Node 24; the build ran on
  Node 20.19.6.

### Upstream proposals — one merged, one waiting on us

Both branches are pushed to the fork only, branched from `upstream/main`, and
were opened as pull requests on `d70-t/gridlook`.

| Branch                             | Upstream PR          | State                                                                                                                                               |
| ---------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~`fix/colormap-swatch-base-url`~~ | `d70-t/gridlook#211` | **Merged upstream 2026-08-28**, and on `main` here via PR #11. The branch was deleted locally and on `origin` on 2026-09-16; nothing is left to do. |
| `fix/codec-error-messages`         | `d70-t/gridlook#210` | **Open. The requested changes are all pushed; waiting on the maintainers.**                                                                         |

**Both review rounds are done** — the renames (fork PR #19) and the float16
removal (fork PR #22) — so nothing on our side is outstanding. **Karinon has
not been told the change is pushed**; if the PR goes quiet, a one-line comment
is the next move, with `--repo d70-t/gridlook`.

Six files are **byte-identical** between that branch and `main`. Change one and
you must change the other, or the next `git merge upstream/main` conflicts.
`claude/codec-support.md` §6 lists them and explains why.

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

Eli's aim is to have his additions land in gridlook itself rather than to carry
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
