# The fork's default catalog (fork-only)

This fork opens `public/static/catalog-extended.json` by default (`DEFAULT_CATALOG` in `src/views/HashGlobeView.vue`) instead of upstream's `public/static/catalog.json`. It is a plain catalog in the format of [`catalogs.md`](catalogs.md). Its metadata lives in upstream's `tags`, so upstream's catalog panel gives it one filter dropdown per key, plus sort-by-tag. The fork has no catalog UI of its own.

Until the v1.8.1 upstream merge, these fields sat at the top level of each entry and were rendered by a fork-only `CatalogPanelExtended.vue`. Upstream's `tags` covers the same need, so the fields moved into `tags` and the component was removed (eeholmes/gridlook#28).

## Tag keys

Every entry has `format`, `access`, `layout`, `grid` and `crs`. `convention` and `tag` appear only where they apply.

- `format`: `Zarr v2` or `Zarr v3`
- `access`: `direct` or `icechunk`
- `layout`: `simple`, `grouped` or `multiscale`
- `grid`: e.g. `regular`, `curvilinear`, `healpix`, `triangular`, `irregular`, `polar_stereographic`
- `convention`: `GeoZarr`. Omitted when the store follows no convention, because tag values must be strings.
- `crs`: e.g. `EPSG:4326`, `EPSG:3031`
- `tag`: a status word, `broken` or `needs CORS extension`. This is the legacy single `tag`, moved under `tags` because `parseCatalog` ignores a top-level `tag` once `tags` is present.

## Example

```json
{
  "title": "ICON Daily Mean",
  "url": "https://example.org/icon/daily_mean.zarr",
  "tags": {
    "format": "Zarr v3",
    "access": "direct",
    "layout": "grouped",
    "grid": "healpix",
    "crs": "EPSG:4326"
  }
}
```

`tests/unit/utils/catalogExtended.test.ts` checks that every entry parses with its fields as tags.
