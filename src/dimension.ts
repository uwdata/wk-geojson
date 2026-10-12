import type { Geometry } from "./types.js";

/**
 * Return the coordinate dimension of a geometry: 3 if its first position has
 * a Z value, otherwise 2. A collection takes the dimension of its first member.
 */
export function dimension(geometry: Geometry): 2 | 3 {
  if (geometry.type === "GeometryCollection") {
    const [first] = geometry.geometries;
    return first ? dimension(first) : 2;
  }
  let c: unknown[] = geometry.coordinates;
  while (Array.isArray(c[0])) c = c[0];
  return c.length > 2 ? 3 : 2;
}
