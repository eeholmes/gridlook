import { afterEach, describe, expect, it, vi } from "vitest";

import {
  describeVirtualChunkFetchFailure,
  virtualChunkFetchClient,
} from "@/lib/data/virtualChunkFetch.ts";

const CHUNK_URL =
  "https://coastwatch.noaa.gov/pub/socd2/coastwatch/ocean_heat/na14/2025/ohc_na14QG3_2025_085.nc";

function withOrigin(origin: string | undefined) {
  if (origin === undefined) {
    vi.stubGlobal("location", undefined);
    return;
  }
  vi.stubGlobal("location", { origin });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("describeVirtualChunkFetchFailure", () => {
  it("names the host and the CORS workaround for a cross-origin chunk", () => {
    withOrigin("https://example.org");
    const message = describeVirtualChunkFetchFailure(
      CHUNK_URL,
      new TypeError("Failed to fetch")
    );
    expect(message).toContain("coastwatch.noaa.gov");
    expect(message).toContain("CORS");
    expect(message).toContain("docs/icechunk-virtual-chunks.md");
    expect(message).toContain("Failed to fetch");
  });

  it("does not blame CORS when the chunk is same-origin", () => {
    withOrigin("https://coastwatch.noaa.gov");
    const message = describeVirtualChunkFetchFailure(
      CHUNK_URL,
      new TypeError("Failed to fetch")
    );
    expect(message).toContain("coastwatch.noaa.gov");
    expect(message).not.toContain("CORS");
  });

  it("does not blame CORS outside a browser", () => {
    withOrigin(undefined);
    const message = describeVirtualChunkFetchFailure(
      CHUNK_URL,
      new TypeError("Failed to fetch")
    );
    expect(message).not.toContain("CORS");
  });

  it("falls back to the raw url when it cannot be parsed", () => {
    withOrigin("https://example.org");
    const message = describeVirtualChunkFetchFailure(
      "not a url",
      new TypeError("Failed to fetch")
    );
    expect(message).toContain("not a url");
  });
});

describe("virtualChunkFetchClient", () => {
  it("passes successful responses through untouched", async () => {
    const response = new Response("ok", { status: 206 });
    const fetchSpy = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchSpy);

    const init = { headers: { Range: "bytes=0-99" } };
    await expect(virtualChunkFetchClient.fetch(CHUNK_URL, init)).resolves.toBe(
      response
    );
    expect(fetchSpy).toHaveBeenCalledWith(CHUNK_URL, init);
  });

  it("passes error responses through rather than rewriting them", async () => {
    const response = new Response("nope", { status: 403 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(virtualChunkFetchClient.fetch(CHUNK_URL)).resolves.toBe(
      response
    );
  });

  it("rewrites an opaque network rejection into a diagnosis", async () => {
    withOrigin("https://example.org");
    const cause = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(cause));

    await expect(
      virtualChunkFetchClient.fetch(CHUNK_URL)
    ).rejects.toMatchObject({
      message: expect.stringContaining("coastwatch.noaa.gov"),
      cause,
    });
  });

  it("lets an aborted request through unchanged", async () => {
    const abort = new DOMException("aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));

    await expect(virtualChunkFetchClient.fetch(CHUNK_URL)).rejects.toBe(abort);
  });
});
