import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "bin/keeping-mcp": "bin/keeping-mcp.ts",
  },
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  clean: true,
  dts: false,
  sourcemap: false,
  shims: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
