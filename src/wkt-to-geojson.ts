import type { Geometry, Position } from "./types.js";

const TYPES: Record<string, Geometry["type"]> = {
  POINT: "Point",
  MULTIPOINT: "MultiPoint",
  LINESTRING: "LineString",
  MULTILINESTRING: "MultiLineString",
  POLYGON: "Polygon",
  MULTIPOLYGON: "MultiPolygon",
  GEOMETRYCOLLECTION: "GeometryCollection",
};

// Character code tests: A-Z or a-z; 0-9, "+", "-", ".", "E", or "e".
const isLetter = (c: number) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
const isNumeric = (c: number) =>
  (c >= 48 && c <= 57) || c === 43 || c === 45 || c === 46 || c === 69 || c === 101;

// Parser state, (re)set by each wktToGeoJSON call. Keeping the parser
// functions at module scope avoids allocating closures on every call.
let wkt = "";
let pos = 0;
let token = ""; // the current token, or "" at end of input
let value = NaN; // the current token's numeric value, if any
let dropM = false;

// Lexer: read the next word, number, or single character into `token`.
const scan = () => {
  while (wkt.charCodeAt(pos) <= 32) pos++; // skip whitespace
  const start = pos;
  const c = wkt.charCodeAt(pos);
  value = NaN;
  if (isLetter(c)) {
    while (isLetter(wkt.charCodeAt(++pos)));
    token = wkt.slice(start, pos).toUpperCase();
  } else if (isNumeric(c)) {
    while (isNumeric(wkt.charCodeAt(++pos)));
    token = wkt.slice(start, pos);
    value = Number(token);
  } else {
    token = wkt.charAt(pos++);
  }
};

const atNumber = () => !Number.isNaN(value);
const next = () => {
  const t = token;
  scan();
  return t;
};
const fail = (expected: string): never => {
  throw new Error(`Invalid WKT: expected ${expected}, found "${token || "end of input"}"`);
};
const accept = (t: string) => (token === t ? (scan(), true) : false);
const expect = (t: string) => {
  if (!accept(t)) fail(`"${t}"`);
};

// A parenthesized, comma-separated list of items, or EMPTY.
const list = <T>(item: () => T): T[] => {
  if (accept("EMPTY")) return [];
  expect("(");
  const items = [item()];
  while (accept(",")) items.push(item());
  expect(")");
  return items;
};

const coordinate = () => {
  if (!atNumber()) fail("a coordinate");
  const v = value;
  scan();
  return v;
};

// A position: X Y, X Y Z, X Y M, or X Y Z M. M values are dropped.
const position = (): Position => {
  const x = coordinate();
  const y = coordinate();
  if (!atNumber()) return [x, y];
  const z = coordinate();
  if (atNumber()) coordinate();
  else if (dropM) return [x, y];
  return [x, y, z];
};

const point = (): Position => {
  const [p = [], ...rest] = list(position);
  if (rest.length) fail('")"');
  return p;
};

const ring = () => list(position);
const polygon = () => list(ring);
// MultiPoint inner parentheses are optional: (1 2, 3 4) or ((1 2), (3 4))
const multiPoint = () => (atNumber() ? position() : point());

const geometry = (): Geometry => {
  // The dimension may also be a keyword suffix (e.g., POINTM), as in PostGIS EWKT.
  // No type name ends in Z or M, so check for a suffix only if the lookup fails.
  const suffix = TYPES[token] ? null : /^([A-Z]+?)(ZM|Z|M)$/.exec(token);
  const type = TYPES[suffix ? suffix[1] : token] ?? fail("a geometry type");
  scan();
  const dim = suffix ? suffix[2] : ["Z", "M", "ZM"].includes(token) ? next() : "";
  dropM = dim.endsWith("M");

  switch (type) {
    case "Point":
      return { type, coordinates: point() };
    case "MultiPoint":
      return { type, coordinates: list(multiPoint) };
    case "LineString":
      return { type, coordinates: list(position) };
    case "MultiLineString":
    case "Polygon":
      return { type, coordinates: list(ring) };
    case "MultiPolygon":
      return { type, coordinates: list(polygon) };
    case "GeometryCollection":
      return { type, geometries: list(geometry) };
  }
};

/**
 * Convert a WKT ("well-known text") geometry string to GeoJSON format.
 * Also accepts EWKT input with a leading "SRID=<code>;" prefix, which is
 * ignored. Z coordinates are preserved; M (measure) values are dropped.
 * Empty geometries map to empty coordinate (or geometry) arrays.
 * Throws an error if the input is not a valid WKT string.
 * @param input Geometry data in the WKT string format.
 * @returns Parsed GeoJSON data
 */
export function wktToGeoJSON(input: string): Geometry {
  wkt = input;
  pos = /^\s*SRID=\d+\s*;/i.exec(input)?.[0].length ?? 0;
  try {
    scan();
    const result = geometry();
    if (token) fail("end of input");
    return result;
  } finally {
    wkt = token = ""; // don't retain a reference to the input
  }
}
