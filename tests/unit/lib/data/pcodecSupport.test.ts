import { expect, it } from "vitest";
import { get, open } from "zarrita";

import "@/lib/data/codecs.ts";
import {
  base64Bytes,
  V3_BYTES_CODEC,
  v2ArrayMetadata,
  v2Store,
  v3ArrayMetadata,
  v3Store,
} from "../../../helpers/zarrStoreFixtures.ts";

/**
 * pcodec is the codec that prompted d70-t/gridlook#180. It is a numcodecs
 * compression codec (used by the Earthmover ERA5 Icechunk store) that
 * `numcodecs.js` does not implement, so it reaches gridlook through the
 * separate `@eeholmes/zarrita-pcodec` package, which lazily loads a
 * WebAssembly build only when a pcodec chunk is actually read.
 *
 * The chunk below is the reference fixture from that package
 * (`test/fixtures/pcodec-int32.bin`): 8 int32 values [3, 1, 4, 1, 5, 9, 2, 6].
 */

const PCODEC_INT32_CHUNK = "cGNvIQMAAwIEAQMHAAAAEAAIAAAAJAACA4RRAA==";
const EXPECTED = [3, 1, 4, 1, 5, 9, 2, 6];
const SHAPE = [8];

it("decodes a pcodec-compressed zarr v2 chunk", async () => {
  const store = v2Store(
    v2ArrayMetadata({
      compressor: { id: "pcodec" },
      dtype: "<i4",
      shape: SHAPE,
    }),
    base64Bytes(PCODEC_INT32_CHUNK)
  );

  const decoded = await get(await open.v2(store, { kind: "array" }));

  expect(Array.from(decoded.data as Int32Array)).toEqual(EXPECTED);
});

it("decodes a pcodec-compressed zarr v3 chunk", async () => {
  const store = v3Store(
    v3ArrayMetadata({
      codecs: [V3_BYTES_CODEC, { configuration: {}, name: "numcodecs.pcodec" }],
      dataType: "int32",
      shape: SHAPE,
    }),
    base64Bytes(PCODEC_INT32_CHUNK)
  );

  const decoded = await get(await open.v3(store, { kind: "array" }));

  expect(Array.from(decoded.data as Int32Array)).toEqual(EXPECTED);
});
