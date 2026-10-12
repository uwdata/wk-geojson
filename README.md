# wk-geojson

Fast, dependency-free conversion between [GeoJSON](https://datatracker.ietf.org/doc/html/rfc7946) geometries and the OGC "well-known" geometry formats: **WKT** (well-known text) and **WKB** (well-known binary).

- Parses ISO WKT/WKB as well as PostGIS EWKT/EWKB (SRID prefixes, Z/M flags).
- Preserves Z coordinates. Drops M (measure) values and SRIDs, which GeoJSON can't represent.
- Supports all seven geometry types, including `EMPTY` geometries and nested `GeometryCollection`s.
- Written in TypeScript and ships with type definitions, ESM modules, and minified ESM and UMD browser bundles.

## Usage

```js
import { wktToGeoJSON, geoJSONToWKT, wkbToGeoJSON, geoJSONToWKB } from "wk-geojson";

const geom = wktToGeoJSON("POLYGON ((30 10, 40 40, 20 40, 10 20, 30 10))");
// { type: "Polygon", coordinates: [[[30, 10], [40, 40], [20, 40], [10, 20], [30, 10]]] }

const wkb = geoJSONToWKB(geom); // Uint8Array
wkbToGeoJSON(wkb); // round-trips to the same GeoJSON geometry
geoJSONToWKT(geom); // "POLYGON ((30 10, 40 40, 20 40, 10 20, 30 10))"
```

In the browser, the UMD bundle (`dist/wk-geojson.umd.min.js`) exposes these methods on the `wkGeojson` global.

## API

All methods work on GeoJSON *geometry* objects (`{ type, coordinates }` or `{ type: "GeometryCollection", geometries }`), not on `Feature` or `FeatureCollection` wrappers. The `Geometry` and `Position` TypeScript types are exported.

Empty geometries map to empty `coordinates` (or `geometries`) arrays, so `POINT EMPTY` becomes `{ type: "Point", coordinates: [] }`.

### wktToGeoJSON(input)

Parses a WKT string and returns a GeoJSON geometry.

- Keywords are case-insensitive, and whitespace is flexible.
- Accepts dimension tags written separately (`POINT Z (1 2 3)`) or as a suffix (`POINTZ (1 2 3)`), plus `M` and `ZM` variants.
- Accepts EWKT input. A leading `SRID=<code>;` prefix is ignored.
- Accepts `MULTIPOINT` members with or without inner parentheses: `MULTIPOINT (1 2, 3 4)` or `MULTIPOINT ((1 2), (3 4))`.
- Keeps Z values and drops M values. For an untagged position with three values, the third value is treated as Z.
- Throws an `Error` describing the expected and found tokens if the input is not valid WKT.

```js
wktToGeoJSON("SRID=4326;POINT ZM (1 2 3 4)");
// { type: "Point", coordinates: [1, 2, 3] }
```

### geoJSONToWKT(geometry)

Converts a GeoJSON geometry to a WKT string.

- Infers the dimension from the first position. If it has a Z value, the output gets a `Z` tag (for example `LINESTRING Z (...)`), and every position is written with three values.
- Drops position values beyond Z.
- Writes empty coordinate (or geometry) arrays as `EMPTY`.
- Throws an `Error` if the geometry type is not recognized.

```js
geoJSONToWKT({ type: "LineString", coordinates: [[0, 0, 1], [1, 1, 2]] });
// "LINESTRING Z (0 0 1, 1 1 2)"
```

### wkbToGeoJSON(input)

Parses WKB bytes (a `Uint8Array`) and returns a GeoJSON geometry.

- Supports both byte orders (big and little endian).
- Supports ISO WKB dimension type codes (1000+ for Z, 2000+ for M, 3000+ for ZM) and PostGIS EWKB flag bits for Z, M, and SRID.
- Keeps Z values and drops M values and SRIDs.
- Decodes empty points, which WKB encodes with NaN coordinates, to `coordinates: []`.
- Throws an `Error` with the byte offset if the input is truncated, has trailing bytes, or contains an invalid byte order, type code, or multi-geometry member.

```js
wkbToGeoJSON(bytes); // e.g., bytes from a database driver or a GeoParquet column
```

### geoJSONToWKB(geometry)

Converts a GeoJSON geometry to WKB bytes, returning a new `Uint8Array`.

- Writes little-endian byte order and ISO WKB type codes. Geometries with Z values use the 1000+ codes, with dimension inferred as in `geoJSONToWKT`.
- Drops position values beyond Z.
- Writes empty points with NaN coordinates.
- Throws an `Error` if the geometry type is not recognized.

```js
geoJSONToWKB({ type: "Point", coordinates: [1, 2] }); // Uint8Array(21)
```

## Development

This project uses [pnpm](https://pnpm.io/).

```sh
pnpm install
pnpm test       # run unit tests (vitest)
pnpm run lint   # check formatting (oxfmt) and lint (oxlint)
pnpm run build  # compile TypeScript and build browser bundles into dist/
pnpm run bench  # compare decoding from GeoJSON text, WKB, and WKT (US counties data)
pnpm run size   # report bundle sizes
```
