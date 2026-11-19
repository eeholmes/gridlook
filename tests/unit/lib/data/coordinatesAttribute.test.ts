/* eslint-disable camelcase -- Zarr metadata uses snake_case keys. */
import { beforeEach, expect, it, vi } from "vitest";
import type * as zarr from "zarrita";

import { getLatLonData } from "@/lib/data/coordinateVariables.ts";
import { ZarrDataManager } from "@/lib/data/ZarrDataManager.ts";
import { ZARR_FORMAT, type TSources } from "@/lib/types/GlobeTypes.ts";

vi.mock("@/lib/data/ZarrDataManager.ts", () => ({
  ZarrDataManager: {
    getDimensionNames: vi.fn(),
    getVariableDataFromArray: vi.fn(),
    getVariableInfo: vi.fn(),
    resolveVariablePath: vi.fn((_variable: string, name: string) => name),
  },
}));

const latAttrs = { units: "degree_north" };
const lonAttrs = { units: "degree_east" };

// ROMS output: temp lives on rho points, but the psi (cell corner)
// coordinates, which have one point fewer in each direction, are listed first.
const sources: TSources = {
  zarr_format: ZARR_FORMAT.NETCDF,
  levels: [
    {
      grid: { store: "grid-store", dataset: "" },
      time: { store: "time-store", dataset: "" },
      datasources: {
        lat_psi: { attrs: latAttrs },
        lat_rho: { attrs: latAttrs },
        lon_psi: { attrs: lonAttrs },
        lon_rho: { attrs: lonAttrs },
      },
    },
  ],
} as unknown as TSources;

const datavar = {
  attrs: { coordinates: "lon_rho lat_rho s_rho ocean_time" },
  dimensionNames: ["time", "s_rho", "eta_rho", "xi_rho"],
} as unknown as zarr.Array<zarr.DataType, zarr.AsyncReadable>;

beforeEach(() => {
  vi.mocked(ZarrDataManager.getVariableInfo).mockImplementation(
    async (_source, name) =>
      ({
        name,
        attrs: {},
        dimensionNames: ["eta", "xi"],
      }) as unknown as Awaited<
        ReturnType<typeof ZarrDataManager.getVariableInfo>
      >
  );
  vi.mocked(ZarrDataManager.getVariableDataFromArray).mockImplementation(
    async () =>
      ({
        data: new Float32Array(4),
        shape: [2, 2],
        stride: [2, 1],
      }) as Awaited<ReturnType<typeof ZarrDataManager.getVariableDataFromArray>>
  );
});

it("uses the suffixed coordinates named by the coordinates attribute", async () => {
  await getLatLonData("temp", datavar, sources);

  const loaded = vi
    .mocked(ZarrDataManager.getVariableInfo)
    .mock.calls.map(([, name]) => name);
  expect(loaded).toContain("lat_rho");
  expect(loaded).toContain("lon_rho");
  expect(loaded).not.toContain("lat_psi");
  expect(loaded).not.toContain("lon_psi");
});
