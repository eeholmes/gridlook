import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type * as zarr from "zarrita";

import { loadGridAxes } from "@/lib/data/coordinateVariables.ts";
import { loadVectorComponents } from "@/lib/data/streamlineData.ts";
import {
  setActiveValueTransform,
  VALUE_TRANSFORMS,
} from "@/lib/data/valueTransform.ts";
import { ZarrDataManager } from "@/lib/data/ZarrDataManager.ts";
import { getGridVariableData } from "@/lib/grids/gridDataWorkerClient.ts";
import { ZARR_FORMAT, type TSources } from "@/lib/types/GlobeTypes.ts";
import {
  inspectVolumeSources,
  loadVolumeData,
} from "@/lib/volume/volumeData.ts";

// The fork's value transform is applied by default in
// decodeVariableDataAndGetBounds. Coordinates and vector components must stay
// linear, so these call sites pin it explicitly; a log10 here would silently
// move the grid, the streamlines or the volume shell.

vi.mock("@/lib/grids/gridDataWorkerClient.ts", () => ({
  getGridVariableData: vi.fn(),
}));

type TDataVar = zarr.Array<zarr.DataType, zarr.AsyncReadable>;

function dataVariable(shape: number[], attrs: zarr.Attributes = {}) {
  return { attrs, shape } as unknown as TDataVar;
}

function sources(names: string[]): TSources {
  const source = { store: "store.zarr", dataset: "" };
  return {
    ["zarr_format"]: ZARR_FORMAT.V3,
    levels: [
      {
        grid: source,
        time: source,
        datasources: Object.fromEntries(names.map((name) => [name, source])),
      },
    ],
  };
}

beforeEach(() => {
  vi.mocked(getGridVariableData).mockReset();
  setActiveValueTransform(VALUE_TRANSFORMS.LOG10);
});

afterEach(() => {
  setActiveValueTransform(VALUE_TRANSFORMS.LINEAR);
  vi.restoreAllMocks();
});

it("leaves projected x/y axes untouched", async () => {
  vi.spyOn(ZarrDataManager, "getVariableInfo").mockResolvedValue(
    dataVariable([3])
  );
  vi.spyOn(ZarrDataManager, "getVariableDataFromArray").mockResolvedValue({
    data: new Float64Array([10, 100, 1000]),
  } as never);

  const { x, y } = await loadGridAxes(sources(["t"]), "t", ["y", "x"]);

  expect(Array.from(x)).toEqual([10, 100, 1000]);
  expect(Array.from(y)).toEqual([10, 100, 1000]);
});

it("leaves streamline vector components untouched", async () => {
  const attrs = { units: "m s-1" };
  vi.spyOn(ZarrDataManager, "getDimensionNames").mockResolvedValue(["cell"]);
  vi.spyOn(ZarrDataManager, "getDatasetSource").mockImplementation(
    (allSources, variable) => allSources.levels[0].datasources[variable]
  );
  vi.mocked(getGridVariableData).mockImplementation(async ({ variable }) =>
    variable === "u" ? new Float64Array([-10, 100]) : new Float64Array([10, 0])
  );

  const components = await loadVectorComponents({
    pair: { u: "u", v: "v", kind: "u/v" },
    datasources: sources(["u", "v"]),
    getDataVar: vi.fn(async () => dataVariable([2], attrs)),
    currentDimensionNames: ["cell"],
    currentIndices: [null],
    spatialDimensionNames: ["cell"],
    expectedDataLength: 2,
  });

  expect(components).toMatchObject({
    uData: new Float32Array([-10, 100]),
    vData: new Float32Array([10, 0]),
  });
});

it("leaves volume heights and values untouched", async () => {
  const names = ["clw", "zg"];
  vi.spyOn(ZarrDataManager, "getVariableInfo").mockRejectedValue(
    new Error("No coordinate")
  );
  vi.spyOn(ZarrDataManager, "getDimensionNames").mockResolvedValue([
    "level_full",
    "cell",
  ]);
  vi.spyOn(
    ZarrDataManager,
    "getVariableInfoByDatasetSources"
  ).mockImplementation(async (_, name) =>
    name === "zg"
      ? dataVariable([2, 2], { ["standard_name"]: "height", units: "m" })
      : dataVariable([2, 2], { coordinates: "zg" })
  );
  vi.mocked(getGridVariableData).mockImplementation(async ({ variable }) =>
    variable === "zg"
      ? new Float64Array([1000, 1000, 0, 0])
      : new Float64Array([1, 10, 100, 1000])
  );
  const context = { dimensionNames: ["level_full", "cell"], indices: [] };
  const datasource = sources(names);

  const inspected = await inspectVolumeSources(datasource, ["clw"], context);
  const result = await loadVolumeData(datasource, inspected, context, vi.fn());

  expect(result.heights).toEqual(new Float32Array([1000, 1000, 0, 0]));
  expect(result.values).toEqual([new Float32Array([1, 10, 100, 1000])]);
});
