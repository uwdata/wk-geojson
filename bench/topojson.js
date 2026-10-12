/**
 * Minimal TopoJSON to GeoJSON conversion for quantized, delta-encoded
 * topologies with Polygon and MultiPolygon geometries.
 * @param {any} topology A parsed TopoJSON topology.
 * @param {string} name The name of the geometry collection to extract.
 * @returns A GeoJSON FeatureCollection.
 */
export function topoToGeoJSON(topology, name) {
  const [sx, sy] = topology.transform.scale;
  const [tx, ty] = topology.transform.translate;
  const arcs = topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => [(x += dx) * sx + tx, (y += dy) * sy + ty]);
  });

  // Join arcs into a ring; negative indices (~i) denote reversed arcs.
  const ring = (indices) => {
    const out = [];
    for (const i of indices) {
      const arc = i < 0 ? arcs[~i].toReversed() : arcs[i];
      out.push(...(out.length ? arc.slice(1) : arc)); // skip shared endpoints
    }
    return out;
  };
  const geometry = ({ type, arcs }) =>
    type === "Polygon"
      ? { type, coordinates: arcs.map(ring) }
      : { type, coordinates: arcs.map((polygon) => polygon.map(ring)) };

  return {
    type: "FeatureCollection",
    features: topology.objects[name].geometries.map((g) => ({
      type: "Feature",
      id: g.id,
      properties: g.properties ?? {},
      geometry: geometry(g),
    })),
  };
}
