import { dimension } from "./dimension.js";
import type { Geometry, Position } from "./types.js";

const NAMES: Record<Geometry["type"], string> = {
  Point: "POINT",
  MultiPoint: "MULTIPOINT",
  LineString: "LINESTRING",
  MultiLineString: "MULTILINESTRING",
  Polygon: "POLYGON",
  MultiPolygon: "MULTIPOLYGON",
  GeometryCollection: "GEOMETRYCOLLECTION",
};

let dims = 2; // coordinates per position for the current geometry

// A parenthesized, comma-separated list of items, or EMPTY.
const list = <T>(items: T[], write: (item: T) => string) =>
  items.length ? `(${items.map(write).join(", ")})` : "EMPTY";

const position = (p: Position) => (p.length > dims ? p.slice(0, dims) : p).join(" ");
const point = (p: Position) => (p.length ? `(${position(p)})` : "EMPTY");
const line = (positions: Position[]) => list(positions, position);
const polygon = (rings: Position[][]) => list(rings, line);

/**
 * Convert a GeoJSON geometry to a WKT ("well-known text") string.
 * Geometries with Z coordinates are written with a Z tag (e.g., "POINT Z").
 * Position values beyond Z are dropped. Empty coordinate (or geometry)
 * arrays are written as EMPTY.
 * Throws an error if the geometry type is not recognized.
 * @param geometry A GeoJSON geometry object.
 * @returns The geometry in WKT string format.
 */
export function geoJSONToWKT(geometry: Geometry): string {
  const name = NAMES[geometry.type];
  if (!name) throw new Error(`Invalid GeoJSON: unknown geometry type ${geometry.type}`);
  dims = dimension(geometry);
  const prefix = dims === 3 ? `${name} Z ` : `${name} `;

  switch (geometry.type) {
    case "Point":
      return prefix + point(geometry.coordinates);
    case "MultiPoint":
      return prefix + list(geometry.coordinates, point);
    case "LineString":
      return prefix + line(geometry.coordinates);
    case "MultiLineString":
    case "Polygon":
      return prefix + polygon(geometry.coordinates);
    case "MultiPolygon":
      return prefix + list(geometry.coordinates, polygon);
    case "GeometryCollection":
      return prefix + list(geometry.geometries, geoJSONToWKT);
  }
}
