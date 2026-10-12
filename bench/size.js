// Report the size of the browser bundles in dist/, raw and compressed.
// Run with `pnpm size` (which builds the bundles first).
import { readdirSync, readFileSync } from "node:fs";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const DIST = new URL("../dist/", import.meta.url);
const kb = (bytes) => `${(bytes / 1024).toFixed(2)} KB`.padStart(10);

console.log(
  "Bundle".padEnd(28),
  "Minified".padStart(10),
  "Gzip".padStart(10),
  "Brotli".padStart(10),
);
for (const file of readdirSync(DIST).filter((f) => f.endsWith(".min.js"))) {
  const code = readFileSync(new URL(file, DIST));
  const gzip = gzipSync(code, { level: 9 }).length;
  const brotli = brotliCompressSync(code, {
    params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY },
  }).length;
  console.log(file.padEnd(28), kb(code.length), kb(gzip), kb(brotli));
}
