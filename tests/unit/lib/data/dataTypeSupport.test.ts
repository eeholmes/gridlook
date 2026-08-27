import { afterEach, describe, expect, it } from "vitest";
import { get, isZarritaError, open } from "zarrita";

import "@/lib/data/codecs.ts";
import {
  v2ArrayMetadata,
  v2Store,
  v3ArrayMetadata,
  v3Store,
} from "../../../helpers/zarrStoreFixtures.ts";

import { castDataVarToFloat32 } from "@/lib/data/variableDecoding.ts";

/**
 * The other half of "codec support": once a chunk has been decompressed it
 * still has to survive the trip into a Float32 texture. `castDataVarToFloat32`
 * is the single funnel every grid renderer goes through, so its behaviour per
 * data type is what decides whether a dataset plots, plots wrongly, or throws.
 *
 * As in `codecSupport.test.ts`, these tests pin current behaviour — including
 * the two cases that are plainly wrong today (int64 throws, strings become
 * silent NaN) — so a future fix has to update them on purpose.
 */

type TGlobalWithFloat16 = typeof globalThis & {
  Float16Array?: new (values: number[]) => ArrayLike<number>;
};

const FLOAT32_BYTES = new Uint8Array(
  new Float32Array([1, 2, 3, 4]).buffer.slice(0)
);

function typedStore(dtype: string, chunk: Uint8Array) {
  return v2Store(v2ArrayMetadata({ dtype }), chunk);
}

describe("zarr data types zarrita hands to gridlook", () => {
  it("decodes float32 to Float32Array", async () => {
    const array = await open.v2(typedStore("<f4", FLOAT32_BYTES), {
      kind: "array",
    });
    expect((await get(array)).data).toBeInstanceOf(Float32Array);
  });

  it("decodes big-endian float32", async () => {
    const bigEndian = new Uint8Array(FLOAT32_BYTES).reverse();
    const array = await open.v2(typedStore(">f4", bigEndian), {
      kind: "array",
    });
    const decoded = await get(array);
    expect(Array.from(decoded.data as Float32Array)).toEqual([4, 3, 2, 1]);
  });

  it("decodes float16 to a Float16Array", async () => {
    const array = await open.v2(typedStore("<f2", new Uint8Array(8)), {
      kind: "array",
    });
    const decoded = await get(array);
    expect(decoded.data.constructor.name).toBe("Float16Array");
  });

  it("decodes int64 to a BigInt64Array", async () => {
    const array = await open.v2(typedStore("<i8", new Uint8Array(32)), {
      kind: "array",
    });
    expect((await get(array)).data).toBeInstanceOf(BigInt64Array);
  });
});

describe("float16 on browsers without Float16Array", () => {
  const globalWithFloat16 = globalThis as TGlobalWithFloat16;
  const original = globalWithFloat16.Float16Array;

  afterEach(() => {
    globalWithFloat16.Float16Array = original;
  });

  it("fails at open time, not at read time", async () => {
    // zarrita maps the float16 data type straight onto
    // `globalThis.Float16Array`, which only landed in Chrome 135, Firefox 129
    // and Safari 26. On anything older the variable cannot even be opened, so
    // it never reaches the variable list — a different symptom from a missing
    // codec, which lists fine and fails on plot.
    Reflect.deleteProperty(globalThis, "Float16Array");
    const error = await open
      .v2(typedStore("<f2", new Uint8Array(8)), { kind: "array" })
      .catch((caught: unknown) => caught);

    expect(isZarritaError(error, "InvalidMetadataError")).toBe(true);
    expect((error as Error).message).toContain("float16");
  });
});

describe("zarr v3 data types written as objects", () => {
  function objectTypedStore(dataType: unknown) {
    return v3Store(v3ArrayMetadata({ dataType }), FLOAT32_BYTES);
  }

  it("throws a bare TypeError rather than a zarrita error", async () => {
    // The zarr v3 spec allows `data_type` to be an object with `name` and
    // `configuration`, which is how zarr-python writes extension types such as
    // `numpy.datetime64`. zarrita 0.7.4 assumes a string and calls
    // `dataType.match(...)`, so the failure is an unclassifiable TypeError
    // that no `isZarritaError` check can catch and no message explains.
    const dataType = { configuration: { unit: "s" }, name: "numpy.datetime64" };
    const error = await open
      .v3(objectTypedStore(dataType), { kind: "array" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TypeError);
    expect(isZarritaError(error)).toBe(false);
  });

  it("throws the same TypeError even for a plain wrapped core type", async () => {
    const error = await open
      .v3(objectTypedStore({ name: "float32" }), { kind: "array" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TypeError);
  });
});

describe("castDataVarToFloat32", () => {
  const CONVERTIBLE: [string, ArrayLike<number>, number[]][] = [
    ["Float32Array", new Float32Array([1.5, 2.5]), [1.5, 2.5]],
    ["Float64Array", new Float64Array([1.5, 2.5]), [1.5, 2.5]],
    ["Int16Array", new Int16Array([1, 2]), [1, 2]],
    ["Int32Array", new Int32Array([1, 2]), [1, 2]],
    ["Uint8Array", new Uint8Array([1, 2]), [1, 2]],
  ];

  it.each(CONVERTIBLE)("converts %s", (_label, input, expected) => {
    expect(Array.from(castDataVarToFloat32(input as never))).toEqual(expected);
  });

  it("converts float16 data once Float16Array exists", () => {
    const Float16 = (globalThis as TGlobalWithFloat16).Float16Array!;
    const converted = castDataVarToFloat32(new Float16([1.5, 2.5]) as never);
    expect(Array.from(converted)).toEqual([1.5, 2.5]);
  });

  const BIGINT_ARRAYS: [string, ArrayLike<bigint>][] = [
    ["BigInt64Array", new BigInt64Array([1n, 2n])],
    ["BigUint64Array", new BigUint64Array([1n, 2n])],
  ];

  it.each(BIGINT_ARRAYS)("throws on %s", (_label, input) => {
    // int64/uint64 data variables are rare but legal, and `Float32Array.from`
    // refuses BigInt outright. The user sees "Cannot convert a BigInt value to
    // a number", which says nothing about data types or the variable involved.
    expect(() => castDataVarToFloat32(input as never)).toThrow(TypeError);
  });

  it("silently turns string data into NaN", () => {
    // vlen-utf8 arrays decode successfully and then become an all-NaN texture:
    // no error, no toast, just an empty plot.
    const converted = castDataVarToFloat32(["a", "b"] as never);
    expect(Array.from(converted)).toEqual([NaN, NaN]);
  });
});
