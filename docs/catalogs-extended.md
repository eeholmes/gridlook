# Extended Catalog Format (fork-only)

This is a superset of the format described in [`catalogs.md`](catalogs.md), used only in this fork so that catalog entries can carry richer metadata for filtering. The default catalog at `public/static/catalog.json` still uses the plain format; the extended UI only activates when a loaded catalog contains any of the extended fields.

## Extra dataset fields

Each entry in `datasets` may also include:

- `format` — e.g. `Zarr v2`, `Zarr v3`, `Icechunk`
- `access` — e.g. `direct`, `icechunk`
- `layout` — e.g. `simple`, `grouped`, `multiscale`
- `grid` — e.g. `regular`, `curvilinear`, `healpix`, `triangular`, `irregular`, `gaussian_reduced`
- `convention` — e.g. `GeoZarr`, or `null`
- `crs` — e.g. `EPSG:4326`, `EPSG:3031`
- `tag` — a short status word, shared with the plain catalog format; `broken` is
  rendered as a red pill so entries that no longer load stand out

All fields are optional. Any subset can be populated per entry.

## Behavior

When the loaded catalog contains at least one entry with any extended field, `CatalogPanel.vue` delegates rendering to `CatalogPanelExtended.vue`, which:

- shows a filter dropdown for each field that has at least one value in the dataset,
- renders per-entry tag pills for the populated fields, including `tag`,
- offers a per-entry Copy URL button that strips `::…` state suffixes and the `icechunk+` prefix.

When no entry has any extended field, the existing panel is rendered unchanged.

## Example

```json
{
  "type": "gridlook_catalog",
  "title": "Extended Catalog",
  "datasets": [
    {
      "title": "ICON Daily Mean",
      "url": "https://example.org/icon/daily_mean.zarr",
      "format": "Zarr v3",
      "access": "direct",
      "layout": "grouped",
      "grid": "healpix",
      "convention": null,
      "crs": "EPSG:4326"
    }
  ]
}
```

## Test catalog

A working extended catalog is shipped at `public/static/catalog-extended.json`. Load it via the "Open dataset" dialog (paste `static/catalog-extended.json`).
