import { defineConfig, build } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve, dirname } from "path";
import { renameSync, existsSync, mkdirSync } from "fs";
import type { Plugin } from "vite";

/**
 * Custom Vite Plugin: Main Thread (code.js) Build
 */
function buildFigmaMainTokenPlugin(): Plugin {
  return {
    name: "build-figma-main",
    async closeBundle() {
      await build({
        configFile: false,
        build: {
          outDir: "dist",
          emptyOutDir: false,
          target: "es2017",
          minify: true,
          lib: {
            entry: resolve(__dirname, "src/plugin/code.ts"),
            formats: ["iife"],
            name: "FigmaPlugin",
            fileName: () => "code.js"
          },
          rollupOptions: {
            output: { exports: "none", extend: false }
          }
        }
      });

      // MOVE UI TO ROOT OF DIST
      // Vite preserves src/ui/index.html inside dist.
      // We want it to be dist/ui.html to match manifest.json accurately.
      const oldPath = resolve(__dirname, "dist/src/ui/index.html");
      const newPath = resolve(__dirname, "dist/ui.html");
      if (existsSync(oldPath)) {
        renameSync(oldPath, newPath);
      }
    }
  };
}

export default defineConfig({
  plugins: [
    viteSingleFile(),
    buildFigmaMainTokenPlugin()
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2017",
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      input: {
        ui: resolve(__dirname, "src/ui/index.html")
      }
    }
  }
});
