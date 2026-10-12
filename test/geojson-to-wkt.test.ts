import { describe, expect, it } from "vitest";
import { geoJSONToWKT } from "../src/geojson-to-wkt.js";
import type { Geometry } from "../src/types.js";
import { wktToGeoJSON } from "../src/wkt-to-geojson.js";

// Canonical WKT strings, as written by geoJSONToWKT.
const CASES = [
  "POINT (30 10)",
  "POINT Z (1 2 3)",
  "POINT (-150 0.5)",
  "POINT EMPTY",
  "LINESTRING (30 10, 10 30, 40 40)",
  "LINESTRING EMPTY",
  "POLYGON ((0 0, 4 0, 4 4, 0 0), (1 1, 2 1, 2 2, 1 1))",
  "POLYGON EMPTY",
  "MULTIPOINT ((10 40), (40 30))",
  "MULTIPOINT Z ((10 40 1), (40 30 2))",
  "MULTILINESTRING ((1 1, 2 2), (3 3, 4 4))",
  "MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)), ((5 5, 6 5, 6 6, 5 5)))",
  "GEOMETRYCOLLECTION (POINT (4 6), LINESTRING (4 6, 7 10))",
  "GEOMETRYCOLLECTION Z (POINT Z (4 6 8))",
  "GEOMETRYCOLLECTION EMPTY",
];

describe("geoJSONToWKT", () => {
  it("round trips with wktToGeoJSON", () => {
    for (const wkt of CASES) expect(geoJSONToWKT(wktToGeoJSON(wkt))).toBe(wkt);
  });

  it("writes numbers losslessly", () => {
    const coordinates = [0.1 + 0.2, -1e-7, 1e21, 123456.789];
    const wkt = geoJSONToWKT({
      type: "LineString",
      coordinates: [coordinates.slice(0, 2), coordinates.slice(2)],
    });
    expect(wktToGeoJSON(wkt)).toEqual({
      type: "LineString",
      coordinates: [coordinates.slice(0, 2), coordinates.slice(2)],
    });
  });

  it("drops position values beyond Z", () => {
    expect(geoJSONToWKT({ type: "Point", coordinates: [1, 2, 3, 4] })).toBe("POINT Z (1 2 3)");
  });

  it("throws on unknown geometry types", () => {
    expect(() => geoJSONToWKT({ type: "Circle" } as unknown as Geometry)).toThrow(
      /Invalid GeoJSON/,
    );
  });
});
