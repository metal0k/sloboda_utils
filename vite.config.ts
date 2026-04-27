import { defineConfig } from "vite";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

function git(cmd: string): string | null {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

const APP_VERSION =
  git("git describe --tags --dirty --always") ?? `v${pkg.version}+local`;
const BUILD_DATE =
  git("git log -1 --format=%cs") ?? new Date().toISOString().slice(0, 10);

export default defineConfig({
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_DATE__: JSON.stringify(BUILD_DATE),
  },
  build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
  server: { host: true },
});
