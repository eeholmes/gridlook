# Icechunk virtual chunks and CORS

Some Icechunk repositories do not store their array bytes at all. Instead the
repository records only metadata plus byte-range references — file, offset,
length — into the original NetCDF, HDF5 or GRIB files wherever they were first
published. These are **virtual chunks**, and they are what tools such as
[VirtualiZarr](https://github.com/zarr-developers/VirtualiZarr) produce.

Virtual chunks are cheap to publish, because no data is copied. The cost is that
reading them pulls bytes from a _second_ host, and Gridlook runs in a browser.

## Why a repository can index but not plot

Opening such a repository in Gridlook can look like a partial success:

- The variable list, dimensions, attributes and grid type all appear, because
  that metadata lives in the Icechunk repository itself.
- Coordinate variables often plot fine too. Writers commonly pass `time`,
  `latitude` and `longitude` as `loadable_variables`, which materialises them as
  ordinary chunks inside the repository.
- Every data variable fails, because only those chunks are virtual.

The browser must fetch a virtual chunk with a cross-origin range request, and it
will only hand the response to Gridlook if the host that serves the bytes
returns an `Access-Control-Allow-Origin` header. Many data archives serve the
bytes perfectly well to `curl`, `wget` or Python and send no CORS headers at
all. In that case the browser discards the response before Gridlook sees it, and
`fetch` rejects with an opaque `TypeError: Failed to fetch`.

Gridlook rewrites that rejection into a message naming the offending host, so
the toast tells you _which_ server refused rather than only that something did.

## Checking a host

Ask for a byte range and look for the CORS header. Send an `Origin`, because
some servers only add the header when one is present:

```sh
curl -sS -o /dev/null -D- -r 0-99 \
  -H "Origin: https://gridlook.pages.dev" \
  "https://example.org/path/to/file.nc" \
  | grep -iE "^HTTP|access-control-allow-origin"
```

A usable host answers `206 Partial Content` **and** an
`access-control-allow-origin` line. A `206` with no such line is the failure
case described above. Note that a plain `curl` without `-H "User-Agent: ..."`
can also hit user-agent filtering that a real browser never sees, so a `403`
here does not necessarily mean the browser would get one.

## Working around a host without CORS

- **Install a CORS-unblocking browser extension.** This is the quickest fix and
  the only one a reader can apply on their own. Such extensions inject
  `Access-Control-Allow-Origin` into responses, which is all that is missing —
  Gridlook sends only a `Range` header on virtual-chunk requests, and `Range` is
  CORS-safelisted, so no preflight is involved. Treat it as a per-session
  debugging tool: it weakens a browser security boundary for every site you
  visit while it is enabled.
- **Republish the repository with materialised chunks.** The durable fix. Write
  the data into the Icechunk repository rather than referencing it, so every
  chunk is served by the repository host. Object stores used for public data
  usually already send `Access-Control-Allow-Origin: *`.
- **Serve the referenced files from a CORS-enabled host.** Keeps the repository
  virtual and fixes it for every reader, but requires control over, or a mirror
  of, the source archive.

## Related

- [CORS and data hosting](../README.md#cors--hosting-notes) — the same
  requirement for ordinary Zarr stores.
