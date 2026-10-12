// Compare decoding the same geometries from GeoJSON text (JSON.parse), WKB,
// and WKT. Run with `pnpm bench`. Each variant is timed in a separate child
// process, so that garbage collection from one does not skew another.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { geoJSONToWKB, geoJSONToWKT, wkbToGeoJSON, wktToGeoJSON } from "../dist/index.js";
import { topoToGeoJSON } from "./topojson.js";

const DATA = new URL("../data/us-counties-10m.json", import.meta.url);
const RUNS = 3; // child processes per variant
const WARMUP = 20;
const REPS = 100;

const text = JSON.stringify(topoToGeoJSON(JSON.parse(readFileSync(DATA, "utf8")), "counties"));
const geometries = JSON.parse(text).features.map((f) => f.geometry);

// name: [description, input, decode]
const VARIANTS = {
  "json-file": ["JSON.parse, whole FeatureCollection", text, (s) => JSON.parse(s)],
  "json-array": [
    "JSON.parse, one geometry array",
    JSON.stringify(geometries),
    (s) => JSON.parse(s),
  ],
  "json-each": [
    "JSON.parse, per-geometry strings",
    geometries.map((g) => JSON.stringify(g)),
    (a) => a.map((s) => JSON.parse(s)),
  ],
  "wkb-each": [
    "wkbToGeoJSON, per-geometry buffers",
    geometries.map(geoJSONToWKB),
    (a) => a.map(wkbToGeoJSON),
  ],
  "wkt-each": [
    "wktToGeoJSON, per-geometry strings",
    geometries.map(geoJSONToWKT),
    (a) => a.map(wktToGeoJSON),
  ],
};

const size = (input) =>
  typeof input === "string" ? input.length : input.reduce((sum, item) => sum + item.length, 0);

const variant = process.argv[2];
if (variant) {
  // Child process: time one variant and print the median in milliseconds.
  const [, input, decode] = VARIANTS[variant];
  for (let i = 0; i < WARMUP; ++i) decode(input);
  const times = [];
  for (let i = 0; i < REPS; ++i) {
    const t = performance.now();
    decode(input);
    times.push(performance.now() - t);
  }
  console.log(times.sort((a, b) => a - b)[REPS >> 1]);
} else {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const name of ["wkb-each", "wkt-each"]) {
    const [, input, decode] = VARIANTS[name];
    if (!same(decode(input), geometries)) throw new Error(`${name} does not round trip`);
  }

  let positions = 0;
  const count = (c) => (typeof c[0] === "number" ? ++positions : c.forEach(count));
  geometries.forEach((g) => count(g.coordinates));
  console.log(`us-counties: ${geometries.length} geometries, ${positions} positions\n`);

  const baseline = { name: "json-array", ms: 0 };
  const rows = Object.entries(VARIANTS).map(([name, [description, input]]) => {
    const runs = Array.from({ length: RUNS }, () =>
      Number(execFileSync(process.execPath, [import.meta.filename, name], { encoding: "utf8" })),
    );
    const ms = Math.min(...runs);
    if (name === baseline.name) baseline.ms = ms;
    return { name, description, kb: size(input) / 1024, ms };
  });

  console.log("Decoder".padEnd(38), "Size".padStart(9), "Median".padStart(10), "vs. JSON");
  for (const { name, description, kb, ms } of rows) {
    const ratio = baseline.ms / ms;
    const relative =
      name === baseline.name
        ? "baseline"
        : ratio >= 1
          ? `${ratio.toFixed(1)}x faster`
          : `${(1 / ratio).toFixed(1)}x slower`;
    console.log(
      description.padEnd(38),
      `${kb.toFixed(0)} KB`.padStart(9),
      `${ms.toFixed(2)} ms`.padStart(10),
      relative,
    );
  }
  console.log(`\nMedian of ${REPS} runs per process; best of ${RUNS} processes.`);
  console.log(`"vs. JSON" compares against ${VARIANTS[baseline.name][0]}.`);
}
