# Handoff — 2026-08-27 (session 5)

Read this at the start of a new session. Cross-referenced by `CLAUDE.md`.

This file is an index of state, not a summary of past work. Anything with its
own document under `claude/` is a pointer, not a retelling.

## Status

- **`main`** is in sync with `origin/main`, working tree clean, and roughly 20
  commits ahead of `upstream/main` and 0 behind.
- **Issues:** #1, #2, #4, #5 and #7 are closed. **PRs:** #3, #6, #8 and #9 merged.
- **Branch `fix/codec-error-messages`** is pushed to the fork but deliberately
  **not** merged into `main`. It is a proposed pull request to
  `d70-t/gridlook`, waiting for Eli to open it on GitHub. **Do not delete it,
  and do not merge it into `main`** — see `claude/codec-support.md` §6 for why
  its files must stay byte-identical to the copies on `main`.

## Codec and data-type support

The whole subject — the survey of what decodes, the problem list, which
problems belong to gridlook vs zarrita vs numcodecs.js, the remaining tasks,
and the two-branch arrangement — is in
**[`claude/codec-support.md`](./codec-support.md)**. Read that if the work is
codec-related; there is nothing here that is not there.

Shipped in PR #9 (issue #5): the survey, its tests, and
`src/lib/data/codecErrors.ts`, which names the codec when a dataset cannot be
decoded. No decoders were added.

## Other reference documents

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
  twelve merged changed `tests/`.
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
