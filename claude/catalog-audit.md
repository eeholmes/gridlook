# Catalog audit — `public/static/catalog-extended.json`

Record of the sweep behind issue #12: every catalog entry was opened in a real
browser running the dev server, and the results were used to reorder the file,
tag what no longer works, and add five new datasets.

## How the entries were tested

Two passes, because each catches what the other misses.

**Pass 1 — the library path, in Node.** A throwaway Vitest file called the
app's own `indexFromZarr` / `indexFromIndex` on every catalog URL exactly as
`GlobeView.updateSrc` does, then opened the default variable and read its first
chunk. This is fast and gives a precise error string, but it cannot see CORS:
Node does not enforce it, and Node's default `User-Agent` is blocked by some
archives (`coastwatch.noaa.gov` answers a browser with `206` and answers Node
with `403`), so its verdicts skew optimistic in one direction and pessimistic
in the other.

**Pass 2 — the whole app, in headless Chromium.** Playwright drove
`npm run dev`, navigating to `#<catalog url>` for each entry and waiting until
the colormap's **Data** bounds row showed two real numbers, which only happens
after the app has fetched, decoded and bounded actual values. Console errors,
toast text (captured with a `MutationObserver`, since toasts self-dismiss), and
failed requests were recorded, plus a screenshot. This is the verdict that
counts: 47 of the original 70 entries reached rendered data.

The browser pass found failures the Node pass could not, the ERA5 single-level
ARCO store being the clearest: it reads fine from Node, but
`gcp-public-data-arco-era5` returns no `Access-Control-Allow-Origin`, so no
browser can read it. The neighbouring `cmip6` bucket does send the header,
which is why the other Google-hosted entries are unaffected.

**The headless caveat.** That browser had software WebGL (SwiftShader) and four
cores. A renderer that runs out of memory there might survive on a real GPU, so
a tab crash was not treated as proof that an entry is broken. Only entries with
a diagnosable, reproducible cause were tagged.

## What was changed

`tag` is an existing field of the catalog format that `CatalogPanelExtended.vue`
did not render; it now shows as a pill, red when the value is `broken`, and is
included in the search haystack, so typing "broken" filters to exactly those
entries.

**Eleven entries were tagged `broken`, given a `BROKEN - ` title prefix and
moved to the end of the file:**

| Entry                      | Why it fails                                                    |
| -------------------------- | --------------------------------------------------------------- |
| NASA MUR SST               | the 17999 × 36000 grid exhausts the tab                         |
| WCRP Hackathon ICON        | `s3.eu-dkrz-1.dkrz.cloud` does not answer, over IPv4 or IPv6    |
| ISMIP6 Antarctic (root)    | over three minutes just to index                                |
| ISMIP6 AWI_PISM1 exp05     | virtual chunks on `s3.amazonaws.com` are CORS-blocked           |
| AOML 2012 demo             | grid-type detection throws on a missing field                   |
| ERA5 single-level ARCO     | `gcp-public-data-arco-era5` sends no CORS headers               |
| CarbonPlan polar subset    | its CRS attribute `EPSG:3031` is not valid JSON                 |
| Sentinel-2 L2A T37TBG      | the store is gone (404)                                         |
| SILAM dust `data.zarr`     | chunks use `numcodecs.blosc2`, which gridlook cannot decode     |
| ERA5-Land-DKRZ hourly      | renamed upstream; the renamed store crashes the tab (see below) |
| ICON-EPOC 1990 ocean daily | no matching grid type found                                     |

The ERA5-Land entry is the one URL correction in the batch. The old id 404s
because eerie.cloud renamed the dataset from
`era5-land-dkrz.surface_analysis_hourly` to
`era5-dkrz.land_surface_analysis_hourly`. The URL was updated so the entry
points somewhere real, but the renamed store is a 6.6-million-point irregular
grid that crashed the renderer even with a five-minute budget, so it is tagged
broken rather than presented as working. Every other eerie.cloud id in the
catalog was checked against the live dataset list and is still valid.

**Five datasets were added.** GlobColour and GOBAI-O2 were verified rendering
end to end. The three NOAA CoastWatch Ocean Heat Content stores index and list
their variables but cannot plot without help: they are virtual Icechunk stores
whose bytes live on `coastwatch.noaa.gov`, which serves them to `curl` and
sends no CORS headers, so they carry a `CORS - ` title prefix and a
`needs CORS extension` tag. See
[`docs/icechunk-virtual-chunks.md`](../docs/icechunk-virtual-chunks.md); the
error message gridlook shows names the host correctly, which is that
diagnostic doing its job.

Source Cooperative URLs follow `icechunk+https://data.source.coop/<account>/<repo>/<path>`
— the browsing URL at `source.coop/...` is not the data URL. These repositories
use the newer Icechunk layout with a `repo` file rather than `refs/`, and the
bundled `icechunk-js` reads them without trouble.

## The eleven Eli tested on real hardware

The first pass left ten entries undecided because a software-WebGL crash on four
cores is not evidence about a real machine. Eli tested them in his own browser
and the verdicts below are his; the measurements that follow are what those
verdicts prompted.

Now also tagged `broken` and moved to the end: **NOAA MRMS**, **NOAA HRRR**,
**ECMWF IFS Ensemble 15-day**, all three **NOAA GEFS** entries, and both
**ORCESTRA HEALPix** entries. **NOAA GFS** and **ECMWF AIFS Single** work once
pointed at a real variable, so both carry `::varname=temperature_2m`. **ECMWF
AIFS Ensemble** loads eventually and took the `Slow - ` prefix. **NEMO Daily
Surface Salinity** is fine, only a little slow.

Three GitHub issues came out of it, split by measured cause:

- **[#15](https://github.com/eeholmes/gridlook/issues/15)** — the six
  dynamical.org entries. Not the store, not CORS, and not the default variable:
  all six still fail with a real variable. Their chunks are long in time and
  small in x/y, so one 2-D map costs 6–63 GB of downloads. The two comparable
  datasets that _do_ work need 0.4 GB and 13 GB, which is the whole argument.
- **[#16](https://github.com/eeholmes/gridlook/issues/16)** — the two ORCESTRA
  HEALPix zoom-12 stores, 9,371,648 cells each, 12.8 GB and 280 GB per map.
  Filed separately because the cell count is a second cost on top of the
  transfer, and Eli's `sea` renders / `ua` does not split points at it.
- **[#17](https://github.com/eeholmes/gridlook/issues/17)** — the default
  variable on the dynamical.org stores is a `categorical_*` field that samples
  100% NaN (GEFS analysis, MRMS) or constant zero (GFS). The globe comes up
  empty with no message, which is why these looked broken before #15 was
  measured. A scan confirmed none of the 47 entries that render default to a
  categorical variable, so nothing is passing for the wrong reason.

Two entries still carrying a `Mild Error - ` prefix — ICON-EPOC 1990 atmosphere
and IFS-FESOM2-SR — rendered cleanly in this sweep. The prefix was left alone
because it is not clear what the original mild error was.
