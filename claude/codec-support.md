# Codec and format support — findings and plan (issue #5)

Branch: `feat/codec-support-research`. **No fixes implemented** — this is the
survey, the test harness, and the problem list, as issue #5 asked for.

Everything below was measured, not inferred: the numbers come from probing
`zarrita` 0.7.4 as it is installed here, and the byte fixtures come from Python
`numcodecs` 0.16.5 and `zarr` 3.3.0 on this machine.

---

## 1. Where codec support actually comes from

Three layers stack up, and only the third is ours:

| Layer                    | What it contributes                                                                                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `numcodecs.js` 0.3.2     | The compiled compressors: **blosc, lz4, zstd, gzip, zlib**. Nothing else. Its README says so.                                                                                                            |
| `zarrita` 0.7.4          | Wires those in, adds pure-JS `bytes`, `transpose`, `crc32c`, `vlen-utf8`, `json2`, `bitround`, `delta`, `shuffle`, `cast_value`, `scale_offset`, plus `sharding_indexed` (handled outside the registry). |
| `src/lib/data/codecs.ts` | Adds `fletcher32`, `gribscan.rawgrib`, `log_bins`, and `pcodec` (via `@eeholmes/zarrita-pcodec`).                                                                                                        |

`src/lib/data/codecs.ts` is **byte-identical to upstream's** — d70-t/gridlook
already carries the pcodec package Eli built for #180, so codec support is not
a fork divergence. Anything done here is a candidate for upstream directly.

**pcodec's WebAssembly is already lazy.** `registerPCodec` only stores a
`() => import("./PCodec.js")` thunk, so the 580 kB `pcodec.wasm` is fetched the
first time a pcodec chunk is decoded and never otherwise. That is the answer to
the objection in d70-t/gridlook#180, and it is now pinned by a test.

---

## 2. The test harness (this is the "how to test" answer)

Three new test files, 88 new assertions, no network, no fixtures on disk.

| File                                          | Covers                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `tests/unit/lib/data/codecSupport.test.ts`    | Decode of golden chunks per codec; the unregistered set; the registry inventory; zarr v3 stores written by zarr-python 3 |
| `tests/unit/lib/data/pcodecSupport.test.ts`   | pcodec end-to-end through zarrita, v2 and v3                                                                             |
| `tests/unit/lib/data/dataTypeSupport.test.ts` | What happens after decompression: dtypes, `castDataVarToFloat32`, float16 browser support                                |
| `tests/helpers/zarrStoreFixtures.ts`          | Builds in-memory v2/v3 stores; a `getRange`-capable store for sharding                                                   |

Three properties worth keeping:

- **Golden bytes come from the reference encoder.** Every chunk literal was
  produced by Python `numcodecs`/`zarr` (the recipe is in the file header), so a
  green test means gridlook agrees with what publishers actually write — not
  merely that our decoder round-trips against itself.
- **The gaps are asserted, not omitted.** A codec we cannot decode has a test
  saying so. When one gets registered, that test fails and someone has to update
  it deliberately. The suite is a support inventory, not just a regression net.
- **The registry inventory test catches zarrita upgrades.** If a `zarrita` bump
  adds or drops a codec, `codecSupport.test.ts` says which one, by name.

What this design deliberately does **not** do is hit real datasets. Network
tests would make CI flaky and would conflate codec bugs with CORS and host
outages — the failure mode that ate PR #8. Real URLs belong in the manual
checklist in §7 instead.

---

## 3. Problem list

Ordered by how likely a reader is to hit it.

### P1 — zarr v3 `numcodecs.*` codec names are unregistered (high)

zarr-python 3 writes codec names like `numcodecs.fixedscaleoffset` and
`numcodecs.quantize` straight into v3 `zarr.json`. zarrita registers only ten
`numcodecs.` aliases, so the rest fail. Verified against metadata actually
written by zarr 3.3.0.

The sharp edge: **`fixedscaleoffset` decodes under zarr v2 and fails under
v3.** zarrita translates it during v2→v3 metadata conversion but never puts the
name in the registry, so whether a dataset loads depends on which format it was
written in. Same data, same filter, different outcome.

Unregistered and reachable today: `fixedscaleoffset`, `quantize`, `astype`,
`packbits`, `crc32`, `crc32c`, `adler32`, `jenkins_lookup3`, `bz2`, `lzma`,
`zfpy`, `vlen-bytes`, `vlen-array`, `categorize`.

The useful split is by what a decoder would cost:

| Codec                 | Decode is…                                                                                        | Plain JS?      |
| --------------------- | ------------------------------------------------------------------------------------------------- | -------------- |
| `quantize`            | a dtype cast — the lossy step is encode-only                                                      | trivial        |
| `astype`              | a dtype cast                                                                                      | trivial        |
| `fixedscaleoffset`    | `value / scale + offset`, then a cast; zarrita has both pieces but wires them only in its v2 path | yes, ~40 lines |
| `crc32`, `adler32`    | strip and verify 4 checksum bytes                                                                 | small          |
| `packbits`            | bit unpacking                                                                                     | small          |
| `bz2`, `lzma`, `zfpy` | a real decompressor                                                                               | **needs WASM** |

So most of the gap closes with plain JavaScript. Only the last row runs into
upstream's no-WASM position, and none of those three is common in ESM output.

### P2 — int64/uint64 variables throw an opaque TypeError (medium)

`castDataVarToFloat32` is `Float32Array.from(rawData)`, which refuses BigInt
outright. An `int64` data variable produces **"Cannot convert a BigInt value to
a number"** in a toast titled "Could not fetch data" — nothing names the data
type or the variable. A one-line BigInt branch would fix the conversion; the
question is whether to do that or to reject the variable with a clear message.

### P3 — string variables render as a silent blank (medium)

A `vlen-utf8` or fixed-width string variable decodes fine, then
`Float32Array.from(["a", "b"])` yields all-NaN. No error, no toast — an empty
globe and no explanation. Arguably worse than P2, because nothing at all tells
the reader what happened.

### P4 — `data_type` written as an object crashes (medium)

The zarr v3 spec allows `"data_type": {"name": ..., "configuration": ...}`,
which is how zarr-python writes extension types such as `numpy.datetime64`.
zarrita 0.7.4 assumes a string and calls `dataType.match(...)`, so the failure
is a bare `TypeError: dataType.match is not a function` — not even a zarrita
error, so `isZarritaError` cannot classify it and no message explains it. This
is an upstream zarrita bug and probably wants an issue at `manzt/zarrita.js`.
It overlaps handoff theme #4.

### P5 — float16 is unusable on older browsers, and fails at open (low–medium)

zarrita maps `float16` onto `globalThis.Float16Array`, which arrived in Chrome
135, Firefox 129 and Safari 26. On anything older the array cannot be **opened**
— so the variable never reaches the variable list at all, unlike a missing
codec, which lists fine and fails on plot. Worth knowing when triaging "the
variable isn't there" reports. On a current browser float16 works end to end.

### P6 — codec failures surface as "Could not fetch data" (medium)

Two separate weaknesses:

- An unregistered codec reaches the user as `Unknown codec: numcodecs.quantize`
  under the heading "Could not fetch data". Accurate, but it tells a scientist
  nothing about what to do, and "fetch" points them at the network — which is
  where the CORS investigation in issue #7 started from a similar message.
- When a **registered** codec throws, zarrita wraps it in a
  `CodecPipelineError` whose message is `Failed to decode chunk via codec "X"`
  and whose real reason lives on `.cause`. `getErrorMessage` in
  `src/utils/errorHandling.ts` never reads `.cause`, so the actual reason
  (checksum mismatch, truncated chunk, bad config) is dropped before it reaches
  the toast.

This is the same shape as the fix that shipped in PR #8, and the same
fork-friendly move: improve the message, add no data paths.

### P7 — `@eeholmes/zarrita-pcodec` is a `github:` dependency (low)

`package.json` pins `"github:eeholmes/zarrita-pcodec"` — no version, no
registry, and it builds from source on install (`prepare` runs `tsc` plus a
wasm copy). Upstream inherited this too. Publishing it to npm would make both
repos' installs reproducible. Not a gridlook code change at all.

### Not a problem, but worth recording

- **Sharding works**, in both backends. `sharding_indexed` needs a store with
  `getRange`; `zarr.FetchStore` and `icechunk-js`'s `IcechunkStore` both have
  one, and `ZarrDataManager` wraps them in `withRangeCoalescing`, which requires
  it as well. Confirmed against a shard written by zarr-python 3.3.0.
- **Big-endian dtypes, `fletcher32`, `blosc`, `zstd`, `lz4`, `gzip`, `zlib`,
  `shuffle`, `delta`, `bitround` and `pcodec` all decode correctly** against
  reference-encoder bytes.
- **An unregistered codec never fails at open time.** The dataset indexes, lists
  its variables, and dies on the first chunk read — indistinguishable at a
  glance from the CORS-blocked virtual chunks in `docs/icechunk-virtual-chunks.md`.
  Triage should check the codec list before the network.

---

## 4. Where each fix belongs

Three possible homes, and the choice is not really about preference — it is
about where the failing code lives and whether gridlook has a hook to reach it.

| Problem                                                   | Best home                     | Why                                                                                         |
| --------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| P1 — `quantize`, `astype`, `packbits`, `crc32`, `adler32` | **gridlook**                  | The registry is the sanctioned extension point, and we already use it three times           |
| P1 — `numcodecs.fixedscaleoffset` (v3 name)               | **zarrita** (gridlook viable) | zarrita already owns the mapping; duplicating it here means maintaining a second copy       |
| P1 — `bz2`, `lzma`, `zfpy`                                | **numcodecs.js**              | They need a real decompressor; this is the gap Eli named in d70-t/gridlook#180              |
| P2 — int64/uint64 variables                               | **gridlook**                  | zarrita is right to return `BigInt64Array`; the render pipeline decides what to do with it  |
| P3 — string variables                                     | **gridlook**                  | Same: the data is decoded correctly, the display layer swallows it                          |
| P4 — object-form `data_type`                              | **zarrita**                   | Crashes inside `open.v3` before gridlook sees anything, and there is no hook for data types |
| P5 — float16 without `Float16Array`                       | **zarrita**                   | Same reason; gridlook could only polyfill a global, which is worse                          |
| P6 — codec errors read as "Could not fetch data"          | **gridlook**                  | Purely presentation, at a boundary we own                                                   |
| P7 — `github:` pcodec dependency                          | neither                       | It is a release chore in the `zarrita-pcodec` repo                                          |

### Fix in gridlook — and the existing code to copy

Each of these has a working example in the repository already, which is the
main reason to prefer them: the shape is proven and upstream has accepted it.

**Adding a codec (P1's plain-JS rows).** `src/lib/data/fletcher32.ts` is the
template — a class with `kind`, `fromConfig`, `decode` and a stub `encode` that
throws, registered with one `registry.set` line in `codecs.ts`. `logBins.ts` and
`gribscan.ts` are the same pattern at larger sizes. Nothing about this touches
zarrita: `registry` is public API, and zarrita issue #310 was closed precisely
to make this the supported path. `quantize` and `astype` are almost free here
because their decode is a dtype cast — the lossy work happens on encode, which
we never do. `crc32` and `adler32` are `fletcher32.ts` with a different
checksum.

**Converting decoded arrays (P2, P3).** `src/lib/data/variableDecoding.ts` is
the single funnel, and gridlook has already solved this exact conversion once:
`toNumber` in `src/lib/data/timeHandling.ts` handles `bigint` and `string`
for time coordinates, and `dimensionData.ts` carries a
`number | bigint | string` coordinate type with explicit `UnicodeStringArray` /
`ByteStringArray` branches. So the codebase already knows these arrays exist —
it is only `castDataVarToFloat32` that assumes everything is a number. That
makes P2/P3 a consistency fix rather than a new capability, which is a much
easier argument to make upstream.

**Improving the message (P6).** `src/lib/data/virtualChunkFetch.ts` from PR #8
is the model: leave the behaviour completely untouched, catch the opaque error
at the boundary, and rewrite it into something that names the cause. A codec
equivalent would turn `UnknownCodecError` into a message naming the codec and
pointing at re-encoding or a codec extension, and would unwrap
`CodecPipelineError.cause` so checksum and truncation failures stop being
swallowed by `getErrorMessage` in `src/utils/errorHandling.ts`.

**If a WASM-only codec ever matters**, the precedent is `zarrita-pcodec`: a
separate optional package, registered lazily in `codecs.ts`, so the WebAssembly
never enters the bundle unless a dataset needs it. Do not vendor a decompressor
into `src/lib`.

### File upstream instead

**P4 — object-form `data_type` → issue, and the PR is small.** This is the
clearest upstream case. `zarrita` 0.7.4 assumes `data_type` is a string and
calls `dataType.match(...)` inside its metadata parser, so the failure happens
during `open.v3` before any gridlook code runs. There is no registry or hook to
intercept it — the only workaround would be rewriting the metadata JSON before
handing it to zarrita, which is exactly the kind of speculative parallel code
path worth avoiding. Two details make this an easy report: the zarr v3 spec
explicitly allows the object form, and it currently crashes even for
`{"name": "float32"}`, a plain core type with no extension semantics at all. A
`TypeError` rather than an `InvalidMetadataError` is itself a bug, since
zarrita's own docs promise `isZarritaError` covers what it throws.

**P1's `numcodecs.fixedscaleoffset` → issue, though we could patch locally.**
Worth being precise about why this is not a one-line alias. zarrita represents
the filter as two v3 codecs, `scale_offset` (array→array, dtype-preserving)
followed by `cast_value`, and wires them up only inside `v2ToV3ArrayMetadata`.
A registry entry for the single `numcodecs.fixedscaleoffset` name would have to
do the divide-then-cast itself, so it is a ~40-line codec here rather than an
alias — a second copy of a mapping zarrita already maintains. The better report
is the asymmetry itself: **the same filter decodes under zarr v2 and fails
under v3**, which is a self-evident inconsistency in zarrita rather than a
feature request, and one fix there covers every zarrita consumer. The same
argument extends to the other `numcodecs.zarr3` wrapper names, since
zarr-python now writes them by default.

**P5 — float16 → mention it, expect a "browsers have caught up" answer.**
zarrita maps `float16` onto `globalThis.Float16Array` with no fallback, so on
an older browser the array cannot be opened at all. It could fall back to a
manual half-float decode — zarrita already handles the analogous case in
`codecs/json-scalar.js`, where a missing `DataView.prototype.getFloat16` raises
a clean `UnsupportedError` rather than crashing. Gridlook's only alternative
would be polyfilling a global, which is worse than documenting the browser
requirement. Low priority: the baseline is Chrome 135 / Firefox 129 / Safari 26,
and it works end to end above that.

**P1's `bz2`, `lzma`, `zfpy` → `manzt/numcodecs.js`, not zarrita.** These need
real decompressors, and numcodecs.js is where the other compiled compressors
live. This is the gap Eli already identified in d70-t/gridlook#180: nine
compression codecs in the Python suite, five implemented in JavaScript. Filing
there is more useful than filing against zarrita, which only wires up whatever
numcodecs.js provides.

---

## 5. Options, if we decide to act

Not implemented. Roughly ascending in cost, with merge surface against upstream:

1. **Better error text for codec failures** (P6). A new file in `src/lib/data/`
   that turns an `UnknownCodecError` into a message naming the codec and saying
   the dataset needs re-encoding or a codec extension, plus unwrapping
   `CodecPipelineError.cause`. Merge surface: a few lines at the catch site.
   This is exactly the PR #8 pattern.
2. **Register the trivial v3 codecs** (P1, top two rows). `quantize` and
   `astype` as small pure-JS codecs in new files, with
   `codecs.ts` gaining one `registry.set` line each. Plain JS, no WASM, and
   directly upstreamable — it is the same shape as the existing `fletcher32.ts`.
3. **Handle int64 and string variables explicitly** (P2, P3). Either convert
   BigInt properly and reject strings with a clear message, or reject both
   clearly. Touches `castDataVarToFloat32`, which upstream owns — a few lines.
4. **Checksum codecs** (`crc32`, `adler32`) — small, but no known ESM dataset
   here needs them yet. Probably not worth the diff until one shows up.
5. **File the zarrita issues** — object-form `data_type` (P4) first, since it is
   an outright crash on spec-legal metadata, then the v2/v3 asymmetry for
   `numcodecs.fixedscaleoffset` (P1). No gridlook change in either case; see §4
   for why neither has a good local workaround.
6. **File the numcodecs.js gap** for `bz2`, `lzma` and `zfpy` (P1, last row) —
   the point Eli already made in d70-t/gridlook#180, in the repo that can act
   on it.
7. **Publish `zarrita-pcodec` to npm** (P7). Outside this repo.

The one thing that clearly should **not** happen is pulling `bz2`, `lzma` or
`zfpy` into gridlook as WebAssembly. If any of those ever matters, the pcodec
precedent applies: a separate optional package, lazily loaded.

---

## 6. Packaging the error-message change as an upstream PR

Upstream's testing philosophy is not ambiguous, so this is settled rather than
a judgement call:

- `.github/workflows/lint.yml` runs `lint-ci`, `typecheck`, **`npm run test`**
  and `build` on every push and pull request. Tests gate the merge.
- Upstream carries 20 test files, and they are not limited to pure geometry —
  `tests/unit/ui/grids/composables/useGridDataLoader.test.ts` and
  `tests/unit/utils/toast.test.ts` cover exactly the composable-and-toast layer
  this change touches.
- Of the last twelve merged PRs, every substantive one changed `tests/`. The
  four that did not are two Release Please release commits, a `docs:` PR and a
  rebase.

So the PR should include tests. Two refinements worth making first:

**Send only `codecErrors.test.ts`.** The survey tests from §2
(`codecSupport`, `dataTypeSupport`, `pcodecSupport`) assert _gaps_ — they
encode a list of problems the maintainers have not yet agreed are problems, and
dropping that into a PR about error messages invites a scope argument. They
belong in the fork, or attached as evidence to an issue. The error-message PR
should test only what it adds.

**Inline the fixtures and the PR touches no config at all.**
`codecErrors.test.ts` uses `base64Bytes`, `v2ArrayMetadata` and `v2Store` from
`tests/helpers/zarrStoreFixtures.ts`, and that shared helper is the only reason
this branch edits `eslint.config.js` (§8). Upstream's own
`tests/unit/lib/data/logBins.test.ts` already builds a synthetic v2 store
inline as a `Map`, with the same computed-key trick for snake_case metadata
names — so inlining is both about 25 lines and a closer match to house style.
That removes the `tests/helpers/` directory and the `boundaries/ignore` line
from the PR, leaving it as one new source file, one new test file, and 13 lines
across two files upstream owns.

### The two branches, and why merging back is safe

They are **not** the same branch, and they must not be:

- `feat/codec-support-research` — branched from this fork's `main`, which sits
  14 commits ahead of upstream. It carries the fix, the survey tests, the
  fixture helper, the `eslint.config.js` line and this document. This is what
  merges into the fork's `main`.
- `fix/codec-error-messages` — branched from **`upstream/main`**, carrying only
  four files: `codecErrors.ts`, its test, and the two edited files. Basing it
  on the fork's `main` instead would have dragged all 14 fork-only commits into
  the pull request.

The thing that makes a later `git merge upstream/main` safe is not the branch
structure but the **file contents**: all four files are byte-identical between
the two branches (same git blob hashes). When upstream merges the PR, upstream
and the fork end up holding the same bytes, so git's three-way merge sees the
same change on both sides and takes it once.

This was verified rather than assumed, by simulating both outcomes on scratch
branches: upstream merge-commits the PR, and upstream squash-merges it (which
severs the shared ancestry). Both merge cleanly into a fork `main` that already
has the task branch, and in both cases the merge changes nothing in the working
tree — the fork already had that content. The fork-only files survive untouched.

Two things would break that guarantee, and both are worth watching for:

- **Editing one copy and not the other.** If a change is made to
  `codecErrors.ts` or its test on one branch, make the identical change on the
  other, or the next upstream merge conflicts.
- **Maintainers revising the code during review.** If they rename something or
  reword a message, upstream's copy diverges and the merge will conflict on
  exactly those files. That is normal and the resolution is simply to take
  upstream's version — but the fork's copy should then be reset to match rather
  than merged by hand, so the two stay identical for next time.

The `eslint.config.js` line and `tests/helpers/` stay fork-only. They are not
in the PR, so upstream never touches them; the only way they conflict is if
upstream independently edits `boundaries/ignore`, which would be a one-line
resolution.

One thing that needs no attention: upstream's `useGridDataLoader.test.ts`
asserts `logError` was called with `"Could not fetch data"`. Because the
explanation is applied inside `useLog` rather than at the call sites, that
assertion is untouched and still passes — which is a point in favour of the
hook location if a reviewer asks.

---

## 7. Manual checklist for real datasets

Deliberately not in CI. Run by hand when touching this area:

| Dataset                                                                     | Exercises                      |
| --------------------------------------------------------------------------- | ------------------------------ |
| Earthmover ERA5 Icechunk (`earthmover-icechunk-era5`, `single/spatial/blh`) | pcodec, Icechunk               |
| `eerie.cloud.dkrz.de` CORDEX-CMIP6 ICON-CLM (`clt`)                         | fletcher32, CMIP7-era encoding |
| Any gribscan-derived store                                                  | `gribscan.rawgrib`             |

If one of these fails, check the codec list in the array metadata **before**
suspecting the network — §3's last bullet explains why the two look alike.

---

## 8. Note on the one file this branch touches that upstream owns

`eslint.config.js`, one line: `"tests/**"` added to `boundaries/ignore`, so the
shared fixture helper under `tests/helpers/` does not trip
`boundaries/no-unknown-files`. The existing ignore list already covers
`**/*.test.ts`; this extends it to non-test files in the same tree. Everything
else on this branch is new files.
