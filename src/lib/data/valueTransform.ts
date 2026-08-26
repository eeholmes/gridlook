/**
 * Optional element-wise transformations of variable data.
 *
 * A transform is applied once, in `decodeVariableDataAndGetBounds`, right after
 * CF decoding and before data bounds, histograms, textures and hover values are
 * derived from the array.  Everything downstream therefore works in transformed
 * space without needing to know a transform happened at all.
 *
 * `log10` is the first transform; the registry below is the place to add more.
 */

export const VALUE_TRANSFORMS = {
  LINEAR: "linear",
  LOG10: "log10",
} as const;

export type TValueTransform =
  (typeof VALUE_TRANSFORMS)[keyof typeof VALUE_TRANSFORMS];

export type TValueTransformOption = {
  value: TValueTransform;
  /** Shown in the transform dropdown. */
  label: string;
  /** Shown next to the colormap, e.g. "log10 scale". */
  scaleLabel: string;
};

export const VALUE_TRANSFORM_OPTIONS: readonly TValueTransformOption[] = [
  {
    value: VALUE_TRANSFORMS.LINEAR,
    label: "None (linear)",
    scaleLabel: "linear scale",
  },
  {
    value: VALUE_TRANSFORMS.LOG10,
    label: "log10",
    scaleLabel: "log10 scale",
  },
] as const;

export function isValueTransform(value: unknown): value is TValueTransform {
  return VALUE_TRANSFORM_OPTIONS.some((option) => option.value === value);
}

export function toValueTransform(
  value: unknown,
  fallback: TValueTransform = VALUE_TRANSFORMS.LINEAR
): TValueTransform {
  return isValueTransform(value) ? value : fallback;
}

/**
 * Transform a single value.  Values outside a transform's domain (zero and
 * negative values for log10) become NaN, which is how gridlook marks "no data"
 * everywhere else.
 */
export function transformValue(
  value: number,
  transform: TValueTransform
): number {
  if (transform === VALUE_TRANSFORMS.LOG10) {
    return Number.isFinite(value) && value > 0 ? Math.log10(value) : NaN;
  }
  return value;
}

/** Transform a decoded data array in place.  Linear is a no-op. */
export function applyValueTransformInPlace<
  T extends Float32Array<ArrayBufferLike>,
>(data: T, transform: TValueTransform): T {
  if (transform === VALUE_TRANSFORMS.LINEAR) {
    return data;
  }
  for (let i = 0; i < data.length; i++) {
    data[i] = transformValue(data[i], transform);
  }
  return data;
}

/** "Sea surface temperature" -> "log10(Sea surface temperature)". */
export function transformedLabel(
  label: string,
  transform: TValueTransform
): string {
  if (transform === VALUE_TRANSFORMS.LINEAR) {
    return label;
  }
  return `${transform}(${label})`;
}

/**
 * "K" -> "log10(K)".  Unitless variables (CF writes those as "1", gridlook
 * shows "-") stay as they are, since wrapping them adds nothing.
 */
export function transformedUnits(
  units: string,
  transform: TValueTransform
): string {
  if (transform === VALUE_TRANSFORMS.LINEAR || units === "1" || units === "-") {
    return units;
  }
  return `${transform}(${units})`;
}

export function valueTransformScaleLabel(transform: TValueTransform): string {
  const option = VALUE_TRANSFORM_OPTIONS.find(
    (candidate) => candidate.value === transform
  );
  return option?.scaleLabel ?? VALUE_TRANSFORM_OPTIONS[0].scaleLabel;
}

/**
 * The transform currently in effect.
 *
 * `src/lib` may not depend on the Pinia store (see the boundaries rules in
 * `eslint.config.js`), so the selected transform is pushed down here by
 * `useGridDataLoader` before every data load.  Callers that must stay in linear
 * space - vector components feeding the streamline layer, for example - pass
 * `VALUE_TRANSFORMS.LINEAR` explicitly instead of relying on this default.
 */
let activeValueTransform: TValueTransform = VALUE_TRANSFORMS.LINEAR;

export function setActiveValueTransform(transform: TValueTransform) {
  activeValueTransform = transform;
}

export function getActiveValueTransform(): TValueTransform {
  return activeValueTransform;
}
