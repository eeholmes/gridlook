import { describe, expect, it } from "vitest";

import {
  applyValueTransformInPlace,
  getActiveValueTransform,
  isValueTransform,
  setActiveValueTransform,
  toValueTransform,
  transformValue,
  transformedLabel,
  transformedUnits,
  VALUE_TRANSFORMS,
  valueTransformScaleLabel,
} from "@/lib/data/valueTransform.ts";

describe("transformValue", () => {
  it("passes values through unchanged for the linear transform", () => {
    for (const value of [-5, 0, 1, 1000, NaN]) {
      expect(transformValue(value, VALUE_TRANSFORMS.LINEAR)).toBe(value);
    }
  });

  it("takes the base-10 logarithm of positive values", () => {
    expect(transformValue(1, VALUE_TRANSFORMS.LOG10)).toBe(0);
    expect(transformValue(100, VALUE_TRANSFORMS.LOG10)).toBeCloseTo(2);
    expect(transformValue(0.001, VALUE_TRANSFORMS.LOG10)).toBeCloseTo(-3);
  });

  it("maps values outside the log10 domain to NaN", () => {
    for (const value of [0, -1, -1.6375e30, NaN, Infinity, -Infinity]) {
      expect(transformValue(value, VALUE_TRANSFORMS.LOG10)).toBeNaN();
    }
  });
});

describe("applyValueTransformInPlace", () => {
  it("leaves the array untouched for the linear transform", () => {
    const data = new Float32Array([1, 2, 3]);
    const result = applyValueTransformInPlace(data, VALUE_TRANSFORMS.LINEAR);
    expect(result).toBe(data);
    expect(Array.from(data)).toEqual([1, 2, 3]);
  });

  it("transforms in place and returns the same array", () => {
    const data = new Float32Array([1, 10, 0, -4]);
    const result = applyValueTransformInPlace(data, VALUE_TRANSFORMS.LOG10);
    expect(result).toBe(data);
    expect(data[0]).toBeCloseTo(0);
    expect(data[1]).toBeCloseTo(1);
    expect(data[2]).toBeNaN();
    expect(data[3]).toBeNaN();
  });
});

describe("transform identifiers", () => {
  it("recognises known transforms", () => {
    expect(isValueTransform("log10")).toBe(true);
    expect(isValueTransform("linear")).toBe(true);
    expect(isValueTransform("ln")).toBe(false);
    expect(isValueTransform(undefined)).toBe(false);
  });

  it("falls back to linear for unknown values", () => {
    expect(toValueTransform("log10")).toBe(VALUE_TRANSFORMS.LOG10);
    expect(toValueTransform("nonsense")).toBe(VALUE_TRANSFORMS.LINEAR);
    expect(toValueTransform(undefined, VALUE_TRANSFORMS.LOG10)).toBe(
      VALUE_TRANSFORMS.LOG10
    );
  });
});

describe("display labels", () => {
  it("wraps labels and units when a transform is active", () => {
    expect(
      transformedLabel("Sea surface temperature", VALUE_TRANSFORMS.LOG10)
    ).toBe("log10(Sea surface temperature)");
    expect(transformedUnits("K", VALUE_TRANSFORMS.LOG10)).toBe("log10(K)");
  });

  it("leaves labels, units and unitless markers alone when linear", () => {
    expect(transformedLabel("chlorophyll", VALUE_TRANSFORMS.LINEAR)).toBe(
      "chlorophyll"
    );
    expect(transformedUnits("K", VALUE_TRANSFORMS.LINEAR)).toBe("K");
    expect(transformedUnits("1", VALUE_TRANSFORMS.LOG10)).toBe("1");
    expect(transformedUnits("-", VALUE_TRANSFORMS.LOG10)).toBe("-");
  });

  it("names the scale shown next to the colormap", () => {
    expect(valueTransformScaleLabel(VALUE_TRANSFORMS.LINEAR)).toBe(
      "linear scale"
    );
    expect(valueTransformScaleLabel(VALUE_TRANSFORMS.LOG10)).toBe(
      "log10 scale"
    );
  });
});

describe("active transform", () => {
  it("defaults to linear and round-trips what was set", () => {
    expect(getActiveValueTransform()).toBe(VALUE_TRANSFORMS.LINEAR);
    setActiveValueTransform(VALUE_TRANSFORMS.LOG10);
    expect(getActiveValueTransform()).toBe(VALUE_TRANSFORMS.LOG10);
    setActiveValueTransform(VALUE_TRANSFORMS.LINEAR);
    expect(getActiveValueTransform()).toBe(VALUE_TRANSFORMS.LINEAR);
  });
});
