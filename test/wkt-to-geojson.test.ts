import { describe, expect, it } from "vitest";
import { wktToGeoJSON } from "../src/wkt-to-geojson.js";

describe("wktToGeoJSON", () => {
  it("parses points", () => {
    expect(wktToGeoJSON("POINT (30 10)")).toEqual({ type: "Point", coordinates: [30, 10] });
    expect(wktToGeoJSON("point(-1.5e2 +.5)")).toEqual({ type: "Point", coordinates: [-150, 0.5] });
    expect(wktToGeoJSON("POINT Z (1 2 3)")).toEqual({ type: "Point", coordinates: [1, 2, 3] });
    expect(wktToGeoJSON("POINT M (1 2 3)")).toEqual({ type: "Point", coordinates: [1, 2] });
    expect(wktToGeoJSON("POINT ZM (1 2 3 4)")).toEqual({ type: "Point", coordinates: [1, 2, 3] });
    expect(wktToGeoJSON("POINTZ (1 2 3)")).toEqual({ type: "Point", coordinates: [1, 2, 3] });
    expect(wktToGeoJSON("SRID=4326;POINTM(1 2 3)")).toEqual({ type: "Point", coordinates: [1, 2] });
    expect(wktToGeoJSON("pointzm (1 2 3 4)")).toEqual({ type: "Point", coordinates: [1, 2, 3] });
    expect(wktToGeoJSON("MULTIPOLYGONM (((0 0 9, 1 0 9, 1 1 9, 0 0 9)))")).toEqual(
      wktToGeoJSON("MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)))"),
    );
    expect(wktToGeoJSON("GEOMETRYCOLLECTIONM (POINTM (1 2 3))")).toEqual({
      type: "GeometryCollection",
      geometries: [{ type: "Point", coordinates: [1, 2] }],
    });
    expect(wktToGeoJSON("POINT (1 2 3 4)")).toEqual({ type: "Point", coordinates: [1, 2, 3] });
    expect(wktToGeoJSON("SRID=4326;POINT(1 2)")).toEqual({ type: "Point", coordinates: [1, 2] });
  });

  it("parses lines and polygons", () => {
    expect(wktToGeoJSON("LINESTRING (30 10, 10 30, 40 40)")).toEqual({
      type: "LineString",
      coordinates: [
        [30, 10],
        [10, 30],
        [40, 40],
      ],
    });
    expect(wktToGeoJSON("POLYGON ((0 0, 4 0, 4 4, 0 0), (1 1, 2 1, 2 2, 1 1))")).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 0],
        ],
        [
          [1, 1],
          [2, 1],
          [2, 2],
          [1, 1],
        ],
      ],
    });
  });

  it("parses multi-geometries", () => {
    const multiPoint = {
      type: "MultiPoint",
      coordinates: [
        [10, 40],
        [40, 30],
      ],
    };
    expect(wktToGeoJSON("MULTIPOINT ((10 40), (40 30))")).toEqual(multiPoint);
    expect(wktToGeoJSON("MULTIPOINT (10 40, 40 30)")).toEqual(multiPoint);
    expect(wktToGeoJSON("MULTILINESTRING ((1 1, 2 2), (3 3, 4 4))")).toEqual({
      type: "MultiLineString",
      coordinates: [
        [
          [1, 1],
          [2, 2],
        ],
        [
          [3, 3],
          [4, 4],
        ],
      ],
    });
    expect(wktToGeoJSON("MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)), ((5 5, 6 5, 6 6, 5 5)))")).toEqual({
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
        [
          [
            [5, 5],
            [6, 5],
            [6, 6],
            [5, 5],
          ],
        ],
      ],
    });
    expect(wktToGeoJSON("GEOMETRYCOLLECTION (POINT (4 6), LINESTRING (4 6, 7 10))")).toEqual({
      type: "GeometryCollection",
      geometries: [
        { type: "Point", coordinates: [4, 6] },
        {
          type: "LineString",
          coordinates: [
            [4, 6],
            [7, 10],
          ],
        },
      ],
    });
  });

  it("parses empty geometries", () => {
    expect(wktToGeoJSON("POINT EMPTY")).toEqual({ type: "Point", coordinates: [] });
    expect(wktToGeoJSON("POLYGON EMPTY")).toEqual({ type: "Polygon", coordinates: [] });
    expect(wktToGeoJSON("GEOMETRYCOLLECTION EMPTY")).toEqual({
      type: "GeometryCollection",
      geometries: [],
    });
  });

  it("throws on invalid input", () => {
    for (const wkt of [
      "",
      "CIRCLE (1 2)",
      "CIRCLEZ (1 2 3)",
      "POINTZ Z (1 2 3)",
      "POINTX (1 2)",
      "POINT",
      "POINT (1)",
      "POINT (1 2",
      "POINT (1 2, 3 4)",
      "POINT (1 2 3 4 5)",
      "POINT (1 x)",
      "POINT (1.2.3 4)",
      "POINT (1 2) extra",
      "LINESTRING (1 2,)",
    ]) {
      expect(() => wktToGeoJSON(wkt), wkt).toThrow(/Invalid WKT/);
    }
  });
});
