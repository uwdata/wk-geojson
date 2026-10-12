import type { Geometry, Position } from "./types.js";

const TYPES: Record<number, Geometry["type"]> = {
  1: "Point",
  2: "LineString",
  3: "Polygon",
  4: "MultiPoint",
  5: "MultiLineString",
  6: "MultiPolygon",
  7: "GeometryCollection",
};

// EWKB (PostGIS) flags stored in the high bits of the type code.
const EWKB_Z = 0x80000000;
const EWKB_M = 0x40000000;
const EWKB_SRID = 0x20000000;

// Parser state, (re)set by each wkbToGeoJSON call. Keeping the parser
// functions at module scope avoids allocating closures on every call.
const EMPTY = new Uint8Array();
const EMPTY_VIEW: DataView = new DataView(EMPTY.buffer);
let bytes: Uint8Array = EMPTY;
let view = EMPTY_VIEW;
let pos = 0;
let littleEndian = false;
let hasZ = false;
let stride = 16; // bytes per position

const fail = (message: string): never => {
  throw new Error(`Invalid WKB: ${message} at byte ${pos}`);
};
const need = (n: number) => {
  if (pos + n > bytes.length) fail("unexpected end of input");
};
const uint32 = () => {
  need(4);
  const v = view.getUint32(pos, littleEndian);
  pos += 4;
  return v;
};
const float64 = (offset: number) => view.getFloat64(pos + offset, littleEndian);

// A count-prefixed array of items.
const array = <T>(item: () => T): T[] => {
  const n = uint32();
  if (n > bytes.length - pos) fail(`invalid count ${n}`); // guard huge allocations
  // Preallocating is faster than push(); Array.from({ length: n }) is much slower.
  // oxlint-disable-next-line unicorn/no-new-array
  const items = new Array<T>(n);
  for (let i = 0; i < n; ++i) items[i] = item();
  return items;
};

const position = (): Position => {
  need(stride);
  const p = hasZ ? [float64(0), float64(8), float64(16)] : [float64(0), float64(8)];
  pos += stride; // also skips any M value, as GeoJSON has no measures
  return p;
};

// An empty point is encoded with NaN coordinates.
const point = (): Position => {
  const p = position();
  return Number.isNaN(p[0]) ? [] : p;
};
const line = () => array(position);
const polygon = () => array(line);

// Read a geometry header (byte order and type code), returning the type.
const header = (): Geometry["type"] => {
  need(1);
  const order = bytes[pos];
  if (order > 1) fail(`invalid byte order ${order}`);
  littleEndian = order === 1;
  pos += 1;

  const code = uint32();
  const iso = code & 0x0fffffff; // type code without EWKB flags
  const dim = Math.floor(iso / 1000); // ISO: 0 = XY, 1 = XYZ, 2 = XYM, 3 = XYZM
  hasZ = (code & EWKB_Z) !== 0 || dim === 1 || dim === 3;
  const hasM = (code & EWKB_M) !== 0 || dim === 2 || dim === 3;
  stride = 8 * (2 + Number(hasZ) + Number(hasM));
  if (code & EWKB_SRID) uint32();
  return (dim <= 3 && TYPES[iso % 1000]) || fail(`unknown geometry type ${code}`);
};

// Members of multi-geometries: full WKB geometries of a given type.
const member =
  <T>(type: Geometry["type"], read: () => T) =>
  () => {
    if (header() !== type) fail(`expected a ${type} member`);
    return read();
  };
const pointMember = member("Point", point);
const lineMember = member("LineString", line);
const polygonMember = member("Polygon", polygon);

const geometry = (): Geometry => {
  const type = header();
  switch (type) {
    case "Point":
      return { type, coordinates: point() };
    case "LineString":
      return { type, coordinates: line() };
    case "Polygon":
      return { type, coordinates: polygon() };
    case "MultiPoint":
      return { type, coordinates: array(pointMember) };
    case "MultiLineString":
      return { type, coordinates: array(lineMember) };
    case "MultiPolygon":
      return { type, coordinates: array(polygonMember) };
    case "GeometryCollection":
      return { type, geometries: array(geometry) };
  }
};

/**
 * Convert WKB ("well-known binary") geometry data to GeoJSON format.
 * Supports both ISO WKB (Z/M/ZM type codes 1000+, 2000+, 3000+) and PostGIS
 * EWKB (Z/M/SRID flag bits), with either byte order. Z coordinates are
 * preserved; M (measure) values and SRIDs are dropped. Empty geometries map
 * to empty coordinate (or geometry) arrays.
 * Throws an error if the input is not valid WKB data.
 * @param input Geometry data in the WKB binary format.
 * @returns Parsed GeoJSON data
 */
export function wkbToGeoJSON(input: Uint8Array): Geometry {
  bytes = input;
  view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  pos = 0;
  try {
    const result = geometry();
    if (pos < bytes.length) fail("unexpected trailing bytes");
    return result;
  } finally {
    bytes = EMPTY; // don't retain a reference to the input
    view = EMPTY_VIEW;
  }
}
