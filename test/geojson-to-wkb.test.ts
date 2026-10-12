import { describe, expect, it } from "vitest";
import { geoJSONToWKB } from "../src/geojson-to-wkb.js";
import type { Geometry } from "../src/types.js";
import { wkbToGeoJSON } from "../src/wkb-to-geojson.js";
import { wktToGeoJSON } from "../src/wkt-to-geojson.js";

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const CASES = [
  "POINT (30 10)",
  "POINT Z (1 2 3)",
  "POINT EMPTY",
  "LINESTRING (30 10, 10 30, 40 40)",
  "LINESTRING EMPTY",
  "POLYGON ((0 0, 4 0, 4 4, 0 0), (1 1, 2 1, 2 2, 1 1))",
  "POLYGON Z ((0 0 1, 4 0 2, 4 4 3, 0 0 1))",
  "MULTIPOINT ((10 40), (40 30))",
  "MULTIPOINT Z ((10 40 1), (40 30 2))",
  "MULTILINESTRING ((1 1, 2 2), (3 3, 4 4))",
  "MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)), ((5 5, 6 5, 6 6, 5 5)))",
  "GEOMETRYCOLLECTION (POINT (4 6), LINESTRING (4 6, 7 10))",
  "GEOMETRYCOLLECTION Z (POINT Z (4 6 8), MULTIPOINT Z ((1 2 3)))",
  "GEOMETRYCOLLECTION EMPTY",
];

describe("geoJSONToWKB", () => {
  it("writes little-endian ISO WKB", () => {
    expect(toHex(geoJSONToWKB({ type: "Point", coordinates: [1, 2] }))).toBe(
      "0101000000000000000000f03f0000000000000040",
    );
    expect(toHex(geoJSONToWKB({ type: "Point", coordinates: [1, 2, 3] })).slice(0, 10)).toBe(
      "01e9030000",
    );
  });

  it("round trips with wkbToGeoJSON", () => {
    for (const wkt of CASES) {
      const geojson = wktToGeoJSON(wkt);
      expect(wkbToGeoJSON(geoJSONToWKB(geojson)), wkt).toEqual(geojson);
    }
  });

  it("grows its buffer for large geometries", () => {
    const coordinates = Array.from({ length: 100000 }, (_, i) => [i, -i]);
    const bytes = geoJSONToWKB({ type: "LineString", coordinates });
    expect(bytes.length).toBe(9 + 16 * coordinates.length);
    expect(wkbToGeoJSON(bytes)).toEqual({ type: "LineString", coordinates });
    // later output is unaffected by the earlier, larger geometry
    expect(toHex(geoJSONToWKB({ type: "Point", coordinates: [1, 2] }))).toBe(
      "0101000000000000000000f03f0000000000000040",
    );
  });

  it("writes missing Z values as NaN", () => {
    const bytes = geoJSONToWKB({
      type: "LineString",
      coordinates: [
        [1, 2, 3],
        [4, 5],
      ],
    });
    expect(wkbToGeoJSON(bytes)).toEqual({
      type: "LineString",
      coordinates: [
        [1, 2, 3],
        [4, 5, NaN],
      ],
    });
  });

  it("returns independent copies", () => {
    const a = geoJSONToWKB({ type: "Point", coordinates: [1, 2] });
    geoJSONToWKB({ type: "Point", coordinates: [3, 4] });
    expect(wkbToGeoJSON(a)).toEqual({ type: "Point", coordinates: [1, 2] });
  });

  it("throws on unknown geometry types", () => {
    expect(() => geoJSONToWKB({ type: "Circle" } as unknown as Geometry)).toThrow(
      /Invalid GeoJSON/,
    );
  });
});
