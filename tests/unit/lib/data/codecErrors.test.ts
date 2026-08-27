import { describe, expect, it } from "vitest";
import { get, open } from "zarrita";

import "@/lib/data/codecs.ts";
import {
  base64Bytes,
  v2ArrayMetadata,
  v2Store,
} from "../../../helpers/zarrStoreFixtures.ts";

import {
  explainDataError,
  flattenErrorMessage,
} from "@/lib/data/codecErrors.ts";

/**
 * Every error fed to `explainDataError` here is one zarrita actually threw,
 * not a hand-written stand-in, so the patterns stay tied to the real messages.
 *
 * Each case is checked twice: once as thrown, and once after the round trip
 * through `flattenErrorMessage` plus `new Error(...)` that the grid data
 * worker performs, which strips the error's class and fields.
 */

/** What `gridData.worker.ts` posts back and `gridDataWorkerClient.ts` rebuilds. */
function throughWorker(error: unknown) {
  return new Error(flattenErrorMessage(error));
}

async function readV2(compressor: unknown, chunk: Uint8Array) {
  const store = v2Store(v2ArrayMetadata({ compressor, dtype: "<f4" }), chunk);
  return await get(await open.v2(store, { kind: "array" }));
}

function caught(promise: Promise<unknown>) {
  return promise.then(
    () => undefined,
    (error: unknown) => error
  );
}

describe("an unregistered codec", () => {
  async function unknownCodecError() {
    return await caught(readV2({ id: "quantize" }, new Uint8Array(16)));
  }

  it("names the codec in the heading", async () => {
    const explanation = explainDataError(await unknownCodecError());
    expect(explanation?.heading).toBe("Unsupported codec: numcodecs.quantize");
  });

  it("says the network is not the problem", async () => {
    const explanation = explainDataError(await unknownCodecError());
    expect(explanation?.detail).toContain("numcodecs.quantize");
    expect(explanation?.detail).toContain("connection are fine");
  });

  it("is still recognised after the worker flattens it", async () => {
    const explanation = explainDataError(
      throughWorker(await unknownCodecError())
    );
    expect(explanation?.heading).toBe("Unsupported codec: numcodecs.quantize");
  });
});

describe("a registered codec that rejects the chunk", () => {
  // A fletcher32 chunk whose trailing checksum does not match its payload.
  const CORRUPT_FLETCHER32 = "AACAPwAAAEAAAEBAAACAQAAAAAA=";

  async function codecPipelineError() {
    return await caught(
      readV2({ id: "fletcher32" }, base64Bytes(CORRUPT_FLETCHER32))
    );
  }

  it("names the codec that failed", async () => {
    const explanation = explainDataError(await codecPipelineError());
    expect(explanation?.heading).toBe("Codec failed: numcodecs.fletcher32");
  });

  it("keeps the reason zarrita put on the cause", async () => {
    const explanation = explainDataError(await codecPipelineError());
    expect(explanation?.detail).toContain("checksum mismatch");
  });

  it("keeps the reason across the worker boundary", async () => {
    // Without `flattenErrorMessage` the cause is dropped by structured clone
    // and the reader is told only that some codec failed.
    const explanation = explainDataError(
      throughWorker(await codecPipelineError())
    );
    expect(explanation?.heading).toBe("Codec failed: numcodecs.fletcher32");
    expect(explanation?.detail).toContain("checksum mismatch");
  });
});

describe("a data type this browser cannot represent", () => {
  async function unsupportedDataTypeError() {
    const original = Reflect.get(globalThis, "Float16Array");
    Reflect.deleteProperty(globalThis, "Float16Array");
    try {
      const store = v2Store(
        v2ArrayMetadata({ dtype: "<f2" }),
        new Uint8Array(8)
      );
      return await caught(open.v2(store, { kind: "array" }));
    } finally {
      Reflect.set(globalThis, "Float16Array", original);
    }
  }

  it("names the data type and the browsers that support it", async () => {
    const explanation = explainDataError(await unsupportedDataTypeError());
    expect(explanation?.heading).toBe("Unsupported data type: float16");
    expect(explanation?.detail).toContain("Safari 26");
  });
});

describe("errors that are not codec problems", () => {
  const UNRELATED = [
    // The CORS message from PR #8 must keep its own wording.
    new Error("Failed to fetch chunk bytes from coastwatch.noaa.gov"),
    new TypeError("Failed to fetch"),
    new Error("Cannot convert a BigInt value to a number"),
    new Error("Not found: /some/path"),
    "a bare string",
    undefined,
  ];

  it.each(UNRELATED)("passes through %s", (error) => {
    expect(explainDataError(error)).toBeUndefined();
  });
});

describe("flattenErrorMessage", () => {
  it("returns the message when there is no cause", () => {
    expect(flattenErrorMessage(new Error("plain"))).toBe("plain");
  });

  it("appends the cause when there is one", () => {
    const error = new Error("outer", { cause: new Error("inner") });
    expect(flattenErrorMessage(error)).toBe("outer — inner");
  });

  it("stringifies a non-error", () => {
    expect(flattenErrorMessage("oops")).toBe("oops");
  });
});
