import { defineConfig } from "rolldown";
import pkg from "./package.json" with { type: "json" };

// Browser bundles, alongside the per-module tsc output in dist/.
// File names (and the UMD global, in camelCase) follow the package name.
const name = pkg.name;

export default defineConfig({
  input: "src/index.ts",
  output: [
    { file: `dist/${name}.min.js`, format: "esm", minify: true },
    { file: `dist/${name}.umd.min.js`, format: "umd", name: "wkgeojson", minify: true },
  ],
});
