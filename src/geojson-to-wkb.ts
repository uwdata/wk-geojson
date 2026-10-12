import { dimension } from "./dimension.js";
import type { Geometry, Position } from "./types.js";

const CODES: Record<Geometry["type"], number> = {
  Point: 1,
  LineString: 2,
  Polygon: 3,
  MultiPoint: 4,
  MultiLineString: 5,
  MultiPolygon: 6,
  GeometryCollection: 7,
};

// Writer state. The output buffer is reused across calls (to avoid
// reallocating it for every geometry) unless it grows beyond MAX_RETAINED.
const INITIAL_SIZE = 1024;
const MAX_RETAINED = 1 << 20;
let buffer = new Uint8Array(INITIAL_SIZE);
let view = new DataView(buffer.buffer);
let pos = 0;
let dims = 2; // coordinates per position for the current geometry

// Ensure the buffer has room for n more bytes.
const reserve = (n: number) => {
  if (pos + n <= buffer.length) return;
  const grown = new Uint8Array(Math.max(2 * buffer.length, pos + n));
  grown.set(buffer);
  buffer = grown;
  view = new DataView(grown.buffer);
};
const uint32 = (v: number) => {
  reserve(4);
  view.setUint32(pos, v, true);
  pos += 4;
};

// Write a byte order marker (little endian) and an ISO WKB type code.
const header = (type: Geometry["type"]) => {
  reserve(5);
  buffer[pos] = 1;
  view.setUint32(pos + 1, CODES[type] + (dims === 3 ? 1000 : 0), true);
  pos += 5;
};

// A count-prefixed array of items.
const array = <T>(items: T[], write: (item: T) => void) => {
  uint32(items.length);
  for (const item of items) write(item);
};

// Write a position into space already reserved by the caller. Missing
// values are written as NaN (DataView converts undefined to NaN). Avoid
// `p[i] ?? NaN` here: it made this hot loop ~6x slower in V8.
const position = (p: Position) => {
  view.setFloat64(pos, p[0], true);
  view.setFloat64(pos + 8, p[1], true);
  if (dims === 3) view.setFloat64(pos + 16, p[2], true);
  pos += 8 * dims;
};
// An empty point is encoded with NaN coordinates.
const EMPTY_POINT = [NaN, NaN, NaN];
const point = (p: Position) => {
  reserve(8 * dims);
  position(p.length ? p : EMPTY_POINT);
};
const line = (positions: Position[]) => {
  const n = positions.length;
  reserve(4 + 8 * dims * n);
  uint32(n);
  for (let i = 0; i < n; ++i) position(positions[i]);
};
const polygon = (rings: Position[][]) => array(rings, line);

// Members of multi-geometries: full WKB geometries of a given type.
const member =
  <T>(type: Geometry["type"], write: (item: T) => void) =>
  (item: T) => {
    header(type);
    write(item);
  };
const pointMember = member("Point", point);
const lineMember = member("LineString", line);
const polygonMember = member("Polygon", polygon);

const geometry = (g: Geometry) => {
  if (!CODES[g.type]) throw new Error(`Invalid GeoJSON: unknown geometry type ${g.type}`);
  dims = dimension(g);
  header(g.type);
  switch (g.type) {
    case "Point":
      return point(g.coordinates);
    case "LineString":
      return line(g.coordinates);
    case "Polygon":
      return polygon(g.coordinates);
    case "MultiPoint":
      return array(g.coordinates, pointMember);
    case "MultiLineString":
      return array(g.coordinates, lineMember);
    case "MultiPolygon":
      return array(g.coordinates, polygonMember);
    case "GeometryCollection":
      return array(g.geometries, geometry);
  }
};

/**
 * Convert a GeoJSON geometry to WKB ("well-known binary") format.
 * Output uses little-endian byte order and ISO WKB type codes, with Z
 * geometries using the 1000+ codes. Position values beyond Z are dropped.
 * Empty points are written with NaN coordinates.
 * Throws an error if the geometry type is not recognized.
 * @param input A GeoJSON geometry object.
 * @returns The geometry in WKB binary format.
 */
export function geoJSONToWKB(input: Geometry): Uint8Array {
  pos = 0;
  try {
    geometry(input);
    return buffer.slice(0, pos);
  } finally {
    if (buffer.length > MAX_RETAINED) {
      buffer = new Uint8Array(INITIAL_SIZE);
      view = new DataView(buffer.buffer);
    }
  }
}
