import { defineConfig } from "vite";

// base: './' so the bundle works under /sloboda_utils/ on GH Pages
// AND when dist/index.html is opened directly via file://.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
  },
  server: {
    host: true,
  },
});
