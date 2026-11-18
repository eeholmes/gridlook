import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

import { parseCatalog } from "@/utils/catalog.ts";

// The fork's default catalog carries its metadata as upstream `tags`, which
// upstream's CatalogPanel turns into one filter per key. A field left at the
// top level of an entry would be dropped by parseCatalog without a word.
it("parses the fork's default catalog into tags for every field", () => {
  const raw = JSON.parse(
    readFileSync("public/static/catalog-extended.json", "utf8")
  );
  const catalog = parseCatalog(raw);

  expect(catalog?.datasets).toHaveLength(raw.datasets.length);
  const keys = new Set(catalog!.datasets.flatMap((d) => Object.keys(d.tags!)));
  expect([...keys].sort()).toEqual(
    ["access", "convention", "crs", "format", "grid", "layout", "tag"].sort()
  );
  for (const entry of raw.datasets) {
    expect(Object.keys(entry).sort()).toEqual(["tags", "title", "url"]);
  }
});
