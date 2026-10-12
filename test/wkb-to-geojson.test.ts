import { describe, expect, it } from "vitest";
import { wkbToGeoJSON } from "../src/wkb-to-geojson.js";
import { wktToGeoJSON } from "../src/wkt-to-geojson.js";

/** Minimal WKB writer for building test inputs. */
class Writer {
  bytes: number[] = [];
  constructor(readonly littleEndian = true) {}
  u32(v: number) {
    const b = new DataView(new ArrayBuffer(4));
    b.setUint32(0, v, this.littleEndian);
    this.bytes.push(...new Uint8Array(b.buffer));
    return this;
  }
  f64(...values: number[]) {
    for (const v of values) {
      const b = new DataView(new ArrayBuffer(8));
      b.setFloat64(0, v, this.littleEndian);
      this.bytes.push(...new Uint8Array(b.buffer));
    }
    return this;
  }
  header(type: number) {
    this.bytes.push(this.littleEndian ? 1 : 0);
    return this.u32(type);
  }
  done() {
    return new Uint8Array(this.bytes);
  }
}

const hex = (s: string) => Uint8Array.from(s.match(/../g)!, (b) => parseInt(b, 16));
const w = (littleEndian?: boolean) => new Writer(littleEndian);

describe("wkbToGeoJSON", () => {
  it("parses points", () => {
    const point = { type: "Point", coordinates: [1, 2] };
    expect(wkbToGeoJSON(hex("0101000000000000000000F03F0000000000000040"))).toEqual(point);
    expect(wkbToGeoJSON(w(false).header(1).f64(1, 2).done())).toEqual(point);
    // ISO and EWKB dimension variants
    expect(wkbToGeoJSON(w().header(1001).f64(1, 2, 3).done())).toEqual(
      wktToGeoJSON("POINT Z (1 2 3)"),
    );
    expect(wkbToGeoJSON(w().header(2001).f64(1, 2, 3).done())).toEqual(point);
    expect(wkbToGeoJSON(w().header(3001).f64(1, 2, 3, 4).done())).toEqual(
      wktToGeoJSON("POINT Z (1 2 3)"),
    );
    expect(wkbToGeoJSON(w().header(0x80000001).f64(1, 2, 3).done())).toEqual(
      wktToGeoJSON("POINT Z (1 2 3)"),
    );
    expect(wkbToGeoJSON(w().header(0x40000001).f64(1, 2, 3).done())).toEqual(point);
    expect(wkbToGeoJSON(w().header(0x20000001).u32(4326).f64(1, 2).done())).toEqual(point);
  });

  it("parses lines and polygons", () => {
    expect(wkbToGeoJSON(w().header(2).u32(2).f64(30, 10, 10, 30).done())).toEqual(
      wktToGeoJSON("LINESTRING (30 10, 10 30)"),
    );
    const polygon = w(false).header(3).u32(2);
    polygon.u32(4).f64(0, 0, 4, 0, 4, 4, 0, 0);
    polygon.u32(4).f64(1, 1, 2, 1, 2, 2, 1, 1);
    expect(wkbToGeoJSON(polygon.done())).toEqual(
      wktToGeoJSON("POLYGON ((0 0, 4 0, 4 4, 0 0), (1 1, 2 1, 2 2, 1 1))"),
    );
  });

  it("parses multi-geometries", () => {
    // members may use a different byte order than their parent
    const multiPoint = w().header(4).u32(2).header(1).f64(10, 40);
    multiPoint.bytes.push(...w(false).header(1).f64(40, 30).bytes);
    expect(wkbToGeoJSON(multiPoint.done())).toEqual(wktToGeoJSON("MULTIPOINT (10 40, 40 30)"));

    const multiLine = w().header(5).u32(2);
    multiLine.header(2).u32(2).f64(1, 1, 2, 2);
    multiLine.header(2).u32(2).f64(3, 3, 4, 4);
    expect(wkbToGeoJSON(multiLine.done())).toEqual(
      wktToGeoJSON("MULTILINESTRING ((1 1, 2 2), (3 3, 4 4))"),
    );

    const multiPolygon = w().header(6).u32(2);
    multiPolygon.header(3).u32(1).u32(4).f64(0, 0, 1, 0, 1, 1, 0, 0);
    multiPolygon.header(3).u32(1).u32(4).f64(5, 5, 6, 5, 6, 6, 5, 5);
    expect(wkbToGeoJSON(multiPolygon.done())).toEqual(
      wktToGeoJSON("MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)), ((5 5, 6 5, 6 6, 5 5)))"),
    );

    const collection = w().header(7).u32(2);
    collection.header(1).f64(4, 6);
    collection.header(2).u32(2).f64(4, 6, 7, 10);
    expect(wkbToGeoJSON(collection.done())).toEqual(
      wktToGeoJSON("GEOMETRYCOLLECTION (POINT (4 6), LINESTRING (4 6, 7 10))"),
    );
  });

  it("parses empty geometries", () => {
    expect(wkbToGeoJSON(w().header(1).f64(NaN, NaN).done())).toEqual(wktToGeoJSON("POINT EMPTY"));
    expect(wkbToGeoJSON(w().header(3).u32(0).done())).toEqual(wktToGeoJSON("POLYGON EMPTY"));
    expect(wkbToGeoJSON(w().header(7).u32(0).done())).toEqual(
      wktToGeoJSON("GEOMETRYCOLLECTION EMPTY"),
    );
  });

  it("throws on invalid input", () => {
    const point = w().header(1).f64(1, 2).done();
    for (const bytes of [
      new Uint8Array(),
      point.subarray(0, 12), // truncated
      Uint8Array.of(...point, 0), // trailing bytes
      Uint8Array.of(2, ...point.subarray(1)), // bad byte order
      w().header(8).done(), // unknown type
      w().header(4001).f64(1, 2).done(), // unknown dimension
      w().header(2).u32(0xffffffff).done(), // huge count
      w().header(4).u32(1).header(2).u32(0).done(), // wrong member type
    ]) {
      expect(() => wkbToGeoJSON(bytes)).toThrow(/Invalid WKB/);
    }
  });

  it("parses correctly after a failed parse", () => {
    expect(() => wkbToGeoJSON(w().header(1001).f64(1).done())).toThrow(/Invalid WKB/);
    expect(wkbToGeoJSON(w(false).header(1).f64(1, 2).done())).toEqual({
      type: "Point",
      coordinates: [1, 2],
    });
  });

  it("respects the byte offset of a subarray view", () => {
    const point = w().header(1).f64(1, 2).done();
    const padded = Uint8Array.of(9, 9, 9, ...point);
    expect(wkbToGeoJSON(padded.subarray(3))).toEqual({ type: "Point", coordinates: [1, 2] });
  });
});
