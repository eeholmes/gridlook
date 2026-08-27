/**
 * Helpers for building in-memory Zarr stores in tests.
 *
 * Zarr metadata keys are snake_case, which the repository's `camelcase` ESLint
 * rule rejects. As in `tests/unit/lib/data/logBins.test.ts`, they are written
 * through a constant map of computed keys — collected here so no other test
 * file has to repeat the trick.
 */

const ZARR_KEY = {
  ATTRIBUTES: "attributes",
  CHUNK_GRID: "chunk_grid",
  CHUNK_KEY_ENCODING: "chunk_key_encoding",
  CHUNK_SHAPE: "chunk_shape",
  DATA_TYPE: "data_type",
  FILL_VALUE: "fill_value",
  INDEX_CODECS: "index_codecs",
  INDEX_LOCATION: "index_location",
  NODE_TYPE: "node_type",
  ZARR_FORMAT: "zarr_format",
} as const;

/** Decode a base64 chunk literal into the bytes a store would serve. */
export function base64Bytes(encoded: string) {
  return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
}

export type TV2ArrayOptions = {
  chunks?: number[];
  compressor?: unknown;
  dtype: string;
  filters?: unknown[];
  shape?: number[];
};

export function v2ArrayMetadata(options: TV2ArrayOptions) {
  const shape = options.shape ?? [4];
  return {
    chunks: options.chunks ?? shape,
    compressor: options.compressor ?? null,
    dtype: options.dtype,
    filters: options.filters ?? [],
    order: "C",
    shape,
    [ZARR_KEY.FILL_VALUE]: null,
    [ZARR_KEY.ZARR_FORMAT]: 2,
  };
}

export type TV3ArrayOptions = {
  chunkShape?: number[];
  codecs?: unknown[];
  dataType: unknown;
  shape?: number[];
};

export const V3_BYTES_CODEC = {
  configuration: { endian: "little" },
  name: "bytes",
};

export function v3ArrayMetadata(options: TV3ArrayOptions) {
  const shape = options.shape ?? [4];
  return {
    codecs: options.codecs ?? [V3_BYTES_CODEC],
    shape,
    [ZARR_KEY.ATTRIBUTES]: {},
    [ZARR_KEY.CHUNK_GRID]: {
      configuration: { [ZARR_KEY.CHUNK_SHAPE]: options.chunkShape ?? shape },
      name: "regular",
    },
    [ZARR_KEY.CHUNK_KEY_ENCODING]: { name: "default" },
    [ZARR_KEY.DATA_TYPE]: options.dataType,
    [ZARR_KEY.FILL_VALUE]: 0,
    [ZARR_KEY.NODE_TYPE]: "array",
    [ZARR_KEY.ZARR_FORMAT]: 3,
  };
}

/**
 * A `sharding_indexed` codec entry, as zarr-python 3 writes it. Its own
 * configuration keys are snake_case too, so it is built here rather than
 * inline in a test.
 */
export function shardingCodec(chunkShape: number[]) {
  return {
    configuration: {
      codecs: [V3_BYTES_CODEC],
      [ZARR_KEY.CHUNK_SHAPE]: chunkShape,
      [ZARR_KEY.INDEX_CODECS]: [V3_BYTES_CODEC, { name: "crc32c" }],
      [ZARR_KEY.INDEX_LOCATION]: "end",
    },
    name: "sharding_indexed",
  };
}

function encodeMetadata(metadata: unknown) {
  return new TextEncoder().encode(JSON.stringify(metadata));
}

/** A single-chunk zarr v2 array store, keyed the way zarrita expects. */
export function v2Store(metadata: unknown, chunk: Uint8Array) {
  return new Map([
    ["/.zarray", encodeMetadata(metadata)],
    ["/0", chunk],
  ]);
}

/** A single-chunk zarr v3 array store. */
export function v3Store(metadata: unknown, chunk: Uint8Array) {
  return new Map([
    ["/zarr.json", encodeMetadata(metadata)],
    ["/c/0", chunk],
  ]);
}

/**
 * A store that can serve byte ranges. `sharding_indexed` reads the shard index
 * before the inner chunk, so zarrita refuses to decode a shard from a store
 * without `getRange`. Both stores gridlook uses (`zarr.FetchStore` and
 * `icechunk-js`'s `IcechunkStore`) implement it, and `ZarrDataManager` wraps
 * them in `zarr.withRangeCoalescing`, which requires it too.
 */
export class RangeReadableStore {
  #entries: Map<string, Uint8Array>;

  constructor(entries: Map<string, Uint8Array>) {
    this.#entries = entries;
  }

  async get(key: string) {
    return this.#entries.get(key);
  }

  async getRange(
    key: string,
    range: { length?: number; offset?: number; suffixLength?: number }
  ) {
    const value = this.#entries.get(key);
    if (!value) {
      return undefined;
    }
    if (range.suffixLength !== undefined) {
      return value.subarray(value.length - range.suffixLength);
    }
    const offset = range.offset ?? 0;
    return value.subarray(offset, offset + (range.length ?? value.length));
  }
}
