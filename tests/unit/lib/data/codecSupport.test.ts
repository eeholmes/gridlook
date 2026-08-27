import { describe, expect, it } from "vitest";
import { get, isZarritaError, open, registry } from "zarrita";

import "@/lib/data/codecs.ts";
import {
  base64Bytes,
  RangeReadableStore,
  shardingCodec,
  V3_BYTES_CODEC,
  v2ArrayMetadata,
  v2Store,
  v3ArrayMetadata,
  v3Store,
  type TV2ArrayOptions,
} from "../../../helpers/zarrStoreFixtures.ts";

/**
 * Characterisation tests for the codec surface gridlook actually has.
 *
 * These tests describe *current* behaviour, including the gaps. A test that
 * asserts an `UnknownCodecError` is not endorsing that error — it pins the gap
 * so that the day the codec is registered (here, or by a zarrita bump) the
 * suite fails loudly and this file has to be updated deliberately.
 *
 * Golden chunk bytes were produced with Python `numcodecs` 0.16.5:
 *
 *   import numcodecs as nc, numpy as np, base64
 *   data = np.array([1.0, 2.0, 3.0, 4.0], dtype="<f4")
 *   base64.b64encode(nc.Zstd(level=1).encode(data.tobytes()))
 *
 * so a passing decode means gridlook agrees with the reference encoder, not
 * merely with itself.
 */

/** The float32 payload [1, 2, 3, 4] that every golden chunk below encodes. */
const EXPECTED_VALUES = [1, 2, 3, 4];

async function decodeV2(options: TV2ArrayOptions, chunk: Uint8Array) {
  const store = v2Store(v2ArrayMetadata(options), chunk);
  return await get(await open.v2(store, { kind: "array" }));
}

function f4(compressor: unknown, filters: unknown[] = []): TV2ArrayOptions {
  return { compressor, dtype: "<f4", filters };
}

// --- Codecs that decode today -------------------------------------------

const WORKING_COMPRESSORS: [string, TV2ArrayOptions, string][] = [
  ["uncompressed", f4(null), "AACAPwAAAEAAAEBAAACAQA=="],
  [
    "numcodecs.zlib",
    f4({ id: "zlib", level: 1 }),
    "eAFjYGiwZ2BgcAAiIG5wAAAQgwJA",
  ],
  [
    "numcodecs.gzip",
    f4({ id: "gzip", level: 1 }),
    "H4sIAPmSkGoE/2NgaLBnYGBwACIgbnAAAFQUp4sQAAAA",
  ],
  [
    "numcodecs.zstd",
    f4({ id: "zstd", level: 1 }),
    "KLUv/SAQgQAAAACAPwAAAEAAAEBAAACAQA==",
  ],
  [
    "numcodecs.lz4",
    f4({ acceleration: 1, id: "lz4" }),
    "EAAAAPABAACAPwAAAEAAAEBAAACAQA==",
  ],
  [
    "numcodecs.blosc",
    f4({ clevel: 5, cname: "lz4", id: "blosc", shuffle: 1 }),
    "AgEzBBAAAAAQAAAAIAAAAAAAgD8AAABAAABAQAAAgEA=",
  ],
  [
    "numcodecs.fletcher32",
    f4({ id: "fletcher32" }),
    "AACAPwAAAEAAAEBAAACAQABB/cM=",
  ],
];

const WORKING_FILTERS: [string, TV2ArrayOptions, string][] = [
  [
    "numcodecs.shuffle",
    f4(null, [{ elementsize: 4, id: "shuffle" }]),
    "AAAAAAAAAACAAECAP0BAQA==",
  ],
  [
    "numcodecs.bitround",
    f4(null, [{ id: "bitround", keepbits: 5 }]),
    "AACAPwAAAEAAAEBAAACAQA==",
  ],
  [
    // Translated by zarrita into the v3 `scale_offset` + `cast_value` pair.
    "numcodecs.fixedscaleoffset",
    f4(null, [
      {
        astype: "<i4",
        dtype: "<f4",
        id: "fixedscaleoffset",
        offset: 0,
        scale: 10,
      },
    ]),
    "CgAAABQAAAAeAAAAKAAAAA==",
  ],
];

describe("codecs that decode a reference numcodecs chunk", () => {
  it.each(WORKING_COMPRESSORS)("%s", async (_name, options, chunk) => {
    const decoded = await decodeV2(options, base64Bytes(chunk));
    expect(Array.from(decoded.data as Float32Array)).toEqual(EXPECTED_VALUES);
  });

  it.each(WORKING_FILTERS)("%s", async (_name, options, chunk) => {
    const decoded = await decodeV2(options, base64Bytes(chunk));
    expect(Array.from(decoded.data as Float32Array)).toEqual(EXPECTED_VALUES);
  });

  it("numcodecs.delta", async () => {
    const decoded = await decodeV2(
      { dtype: "<i4", filters: [{ dtype: "<i4", id: "delta" }] },
      base64Bytes("CgAAAAEAAAACAAAAAwAAAA==")
    );
    expect(Array.from(decoded.data as Int32Array)).toEqual([10, 11, 13, 16]);
  });
});

// --- Codecs gridlook cannot decode today ---------------------------------

/**
 * Every one of these exists in Python `numcodecs` and can therefore appear in
 * a published store. None is registered by zarrita 0.7.4 or by
 * `src/lib/data/codecs.ts`, so a dataset using one indexes fine and then fails
 * at the first chunk read.
 */
const UNSUPPORTED_COMPRESSORS: [string, unknown, string][] = [
  ["bz2", { id: "bz2", level: 1 }, "numcodecs.bz2"],
  ["lzma", { id: "lzma" }, "numcodecs.lzma"],
  ["zfpy", { id: "zfpy" }, "numcodecs.zfpy"],
  ["crc32", { id: "crc32" }, "numcodecs.crc32"],
  ["adler32", { id: "adler32" }, "numcodecs.adler32"],
  ["jenkins_lookup3", { id: "jenkins_lookup3" }, "numcodecs.jenkins_lookup3"],
];

/** numcodecs `astype`, whose own config keys are snake_case. */
const ASTYPE_FILTER = {
  id: "astype",
  ["decode_dtype"]: "<f4",
  ["encode_dtype"]: "<i4",
};

const UNSUPPORTED_FILTERS: [string, unknown, string][] = [
  [
    "quantize",
    { digits: 2, dtype: "<f4", id: "quantize" },
    "numcodecs.quantize",
  ],
  ["astype", ASTYPE_FILTER, "numcodecs.astype"],
  ["packbits", { id: "packbits" }, "numcodecs.packbits"],
  [
    "categorize",
    { dtype: "|O", id: "categorize", labels: ["a"] },
    "numcodecs.categorize",
  ],
  ["vlen-bytes", { id: "vlen-bytes" }, "numcodecs.vlen-bytes"],
  ["vlen-array", { dtype: "<i4", id: "vlen-array" }, "numcodecs.vlen-array"],
];

async function expectUnknownCodec(
  options: TV2ArrayOptions,
  expectedName: string
) {
  const error = await decodeV2(options, new Uint8Array(16)).catch(
    (caught: unknown) => caught
  );
  expect(isZarritaError(error, "UnknownCodecError")).toBe(true);
  expect((error as { codec: string }).codec).toBe(expectedName);
}

describe("codecs a published dataset can use but gridlook cannot decode", () => {
  it.each(UNSUPPORTED_COMPRESSORS)(
    "%s is unregistered",
    async (_label, compressor, expectedName) => {
      await expectUnknownCodec(f4(compressor), expectedName);
    }
  );

  it.each(UNSUPPORTED_FILTERS)(
    "%s is unregistered",
    async (_label, filter, expectedName) => {
      await expectUnknownCodec(f4(null, [filter]), expectedName);
    }
  );

  it("fails only on the first chunk read, never at open time", async () => {
    // Opening succeeds: shape, dtype and attributes are all readable, which is
    // why such a dataset lists its variables and only breaks on plot. That is
    // the same symptom shape as CORS-blocked Icechunk virtual chunks, so the
    // two are easy to confuse when triaging a report.
    const store = v2Store(
      v2ArrayMetadata(f4({ id: "zfpy" })),
      new Uint8Array(16)
    );

    const array = await open.v2(store, { kind: "array" });
    expect(array.shape).toEqual([4]);
  });
});

// --- The registry itself --------------------------------------------------

const REGISTERED = [
  // zarr v3 core codecs
  "bytes",
  "transpose",
  "crc32c",
  "gzip",
  "zlib",
  "zstd",
  "blosc",
  "lz4",
  "vlen-utf8",
  "json2",
  "bitround",
  "cast_value",
  "scale_offset",
  // numcodecs aliases zarrita ships for zarr v2 compatibility
  "numcodecs.blosc",
  "numcodecs.lz4",
  "numcodecs.zstd",
  "numcodecs.gzip",
  "numcodecs.zlib",
  "numcodecs.shuffle",
  "numcodecs.delta",
  "numcodecs.bitround",
  "numcodecs.vlen-utf8",
  "numcodecs.json2",
  // added by src/lib/data/codecs.ts
  "numcodecs.fletcher32",
  "numcodecs.gribscan.rawgrib",
  "numcodecs.log_bins",
  "pcodec",
  "numcodecs.pcodec",
];

/**
 * Codec names that zarr-python 3 writes into **v3** metadata via its
 * `numcodecs.zarr3` wrappers. `numcodecs.fixedscaleoffset` is the sharp one:
 * it decodes under zarr v2 (translated during v2→v3 metadata conversion) but
 * not under v3, where the name has to be in the registry.
 */
const UNREGISTERED = [
  "numcodecs.fixedscaleoffset",
  "numcodecs.quantize",
  "numcodecs.astype",
  "numcodecs.packbits",
  "numcodecs.bz2",
  "numcodecs.lzma",
  "numcodecs.zfpy",
  "numcodecs.crc32",
  "numcodecs.crc32c",
  "numcodecs.adler32",
  "numcodecs.jenkins_lookup3",
  "numcodecs.vlen-bytes",
  "numcodecs.vlen-array",
  "numcodecs.categorize",
];

describe("codec registry after importing src/lib/data/codecs.ts", () => {
  it.each(REGISTERED)("resolves %s", async (name) => {
    const factory = registry.get(name);
    expect(factory, `${name} is not registered`).toBeDefined();
    // Factories are either the codec class or a thunk returning a promise.
    await expect(Promise.resolve(factory!())).resolves.toBeTruthy();
  });

  it.each(UNREGISTERED)("does not resolve %s", (name) => {
    expect(registry.has(name)).toBe(false);
  });

  it("registers pcodec lazily so its WebAssembly stays out of the bundle", () => {
    // `registerPCodec` only stores a `() => import(...)` thunk; the ~580 kB
    // pcodec.wasm is fetched the first time a pcodec chunk is decoded. This is
    // what makes the dependency acceptable to upstream (d70-t/gridlook#180).
    expect(registry.get("numcodecs.pcodec")).toBeTypeOf("function");
  });
});

// --- zarr v3 metadata written by zarr-python 3 ---------------------------

/** Written by zarr-python 3.3.0 with `shards=(4,)` and no compressor. */
const SHARD_CHUNK = "AACAPwAAAEAAAEBAAACAQAAAAAAAAAAAEAAAAAAAAABekwbG";

function shardEntries() {
  return v3Store(
    v3ArrayMetadata({ codecs: [shardingCodec([4])], dataType: "float32" }),
    base64Bytes(SHARD_CHUNK)
  );
}

/** Written by zarr-python 3.3.0 with the `numcodecs.zarr3` codec wrappers. */
const NUMCODECS_V3_CODECS = [
  {
    configuration: { astype: "<i4", dtype: "<f4", offset: 0, scale: 10 },
    name: "numcodecs.fixedscaleoffset",
  },
  V3_BYTES_CODEC,
  { configuration: { level: 1 }, name: "numcodecs.zstd" },
];

const NUMCODECS_V3_CHUNK = "KLUv/SAQgQAACgAAABQAAAAeAAAAKAAAAA==";

describe("zarr v3 stores written by zarr-python 3", () => {
  it("decodes a sharded array when the store supports getRange", async () => {
    const store = new RangeReadableStore(shardEntries());
    const decoded = await get(await open.v3(store as never, { kind: "array" }));
    expect(Array.from(decoded.data as Float32Array)).toEqual(EXPECTED_VALUES);
  });

  it("refuses a sharded array when the store cannot serve ranges", async () => {
    const error = await open
      .v3(shardEntries(), { kind: "array" })
      .then((array) => get(array))
      .catch((caught: unknown) => caught);

    expect(isZarritaError(error, "UnsupportedError")).toBe(true);
    expect((error as Error).message).toContain("getRange");
  });

  it("cannot decode the numcodecs.zarr3 codec names it does not alias", async () => {
    // The same fixedscaleoffset filter decodes fine under zarr v2, where
    // zarrita translates it during v2→v3 metadata conversion. Under v3 the
    // name has to be in the registry, and it is not — so whether a dataset
    // loads depends on which zarr format it was written in.
    const store = v3Store(
      v3ArrayMetadata({ codecs: NUMCODECS_V3_CODECS, dataType: "float32" }),
      base64Bytes(NUMCODECS_V3_CHUNK)
    );
    const error = await open
      .v3(store, { kind: "array" })
      .then((array) => get(array))
      .catch((caught: unknown) => caught);

    expect(isZarritaError(error, "UnknownCodecError")).toBe(true);
    expect((error as { codec: string }).codec).toBe(
      "numcodecs.fixedscaleoffset"
    );
  });
});
