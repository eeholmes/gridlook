import type { FetchClient } from "icechunk-js";

import { getErrorMessage } from "@/utils/errorHandling.ts";

/**
 * Icechunk repositories may store *virtual* chunks: the repository holds only
 * the metadata and byte-range references, while the array bytes stay in the
 * original files on whichever host published them. Reading such a chunk is a
 * cross-origin range request, which a browser only completes if that host
 * returns CORS headers. Plenty of archives serve the bytes happily to `curl`
 * yet send no `Access-Control-Allow-Origin`, so the browser discards the
 * response before any code sees it and `fetch` rejects with a bare
 * `TypeError: Failed to fetch` that names neither the host nor the cause.
 *
 * The client below leaves the request itself untouched — icechunk-js still
 * builds the `Range` header and handles redirects — and only rewrites that
 * opaque rejection into a message that says which host refused and what a
 * reader can do about it.
 */
const VIRTUAL_CHUNK_DOC = "docs/icechunk-virtual-chunks.md";

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function isCrossOrigin(url: string) {
  const origin = globalThis.location?.origin;
  if (!origin) {
    // Outside a browser there is no origin to compare against, and no CORS.
    return false;
  }
  try {
    return new URL(url, origin).origin !== origin;
  } catch {
    return false;
  }
}

function isAbort(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

export function describeVirtualChunkFetchFailure(url: string, cause: unknown) {
  const host = hostOf(url);
  const detail = getErrorMessage(cause);
  if (!isCrossOrigin(url)) {
    return `Could not read Icechunk virtual chunks from ${host}: ${detail}`;
  }
  return (
    `Icechunk virtual chunks live on ${host}, and the browser blocked the ` +
    `request — usually because that host sends no CORS headers. A ` +
    `CORS-unblocking browser extension works around it; see ` +
    `${VIRTUAL_CHUNK_DOC}. (${detail})`
  );
}

class VirtualChunkFetchClient implements FetchClient {
  async fetch(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (cause) {
      if (isAbort(cause)) {
        throw cause;
      }
      throw new Error(describeVirtualChunkFetchFailure(url, cause), { cause });
    }
  }
}

/**
 * A single shared instance: icechunk-js keys its in-flight request cache on the
 * identity of the client, so handing out a fresh object per store would defeat
 * that cache.
 */
export const virtualChunkFetchClient: FetchClient =
  new VirtualChunkFetchClient();
