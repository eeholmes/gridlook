import { describe, expect, it } from "vitest";
import type * as zarr from "zarrita";

import { VALUE_TRANSFORMS } from "@/lib/data/valueTransform.ts";
import { decodeVariableDataAndGetBounds } from "@/lib/data/variableDecoding.ts";

function fakeDataVar(attrs: zarr.Attributes = {}) {
  return { attrs, fillValue: null } as unknown as zarr.Array<
    zarr.DataType,
    zarr.AsyncReadable
  >;
}

/* eslint-disable-next-line max-lines-per-function */
describe("decodeVariableDataAndGetBounds with a value transform", () => {
  it("reports bounds of the transformed values", () => {
    const data = new Float32Array([1, 10, 100]);
    const { min, max } = decodeVariableDataAndGetBounds(
      fakeDataVar(),
      data,
      NaN,
      NaN,
      VALUE_TRANSFORMS.LOG10
    );
    expect(min).toBeCloseTo(0);
    expect(max).toBeCloseTo(2);
    expect(Array.from(data).map((v) => Math.round(v))).toEqual([0, 1, 2]);
  });

  it("applies CF decoding before the transform", () => {
    // raw 2 -> scale_factor 50 -> 100 -> log10 -> 2
    const data = new Float32Array([2]);
    decodeVariableDataAndGetBounds(
      fakeDataVar({ ["scale_factor"]: 50 }),
      data,
      NaN,
      NaN,
      VALUE_TRANSFORMS.LOG10
    );
    expect(data[0]).toBeCloseTo(2);
  });

  it("drops the raw fill and missing sentinels once transformed", () => {
    // A fill value of 0 would otherwise collide with log10(1) === 0 downstream.
    const data = new Float32Array([1, 0, 4]);
    const bounds = decodeVariableDataAndGetBounds(
      fakeDataVar(),
      data,
      NaN,
      0,
      VALUE_TRANSFORMS.LOG10
    );
    expect(bounds.fillValue).toBeNaN();
    expect(bounds.missingValue).toBeNaN();
    expect(data[0]).toBe(0);
    expect(data[1]).toBeNaN();
  });

  it("keeps the sentinels when no transform is applied", () => {
    const data = new Float32Array([1, 2, 3]);
    const bounds = decodeVariableDataAndGetBounds(
      fakeDataVar(),
      data,
      NaN,
      -999,
      VALUE_TRANSFORMS.LINEAR
    );
    expect(bounds.fillValue).toBe(-999);
    expect(bounds.min).toBe(1);
    expect(bounds.max).toBe(3);
  });
});
