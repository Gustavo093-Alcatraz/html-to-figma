import { defineConfig, build } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve } from "path";
import type { Plugin } from "vite";

/**
 * Custom Vite plugin: builds the Figma main thread (code.ts) as a
 * self-contained IIFE after the UI HTML build finishes.
 *
 * Why a second pass? Vite can't mix HTML entries (ES module output)
 * with IIFE lib entries in one build — this plugin triggers a
 * programmatic second build that produces dist/code.js.
 */
function buildCodePlugin(): Plugin {
  return {
    name: "build-figma-code",
    async closeBundle() {
      await build({
        configFile: false,
        build: {
          outDir: "dist",
          emptyOutDir: false,   // never wipe ui.html
          lib: {
            entry:   resolve(__dirname, "src/plugin/code.ts"),
            name:    "code",
            formats: ["iife"],
            fileName: () => "code.js",
          },
          rollupOptions: {
            external: [],
            output: { exports: "none" },
          },
        },
      });
    },
  };
}

/**
 * Main Vite config — builds the plugin UI iframe.
 *
 * viteSingleFile() inlines all JS and CSS directly into ui.html so the
 * file is completely self-contained. This is REQUIRED for Figma plugin
 * iframes — they run in a sandboxed context with no access to external
 * files, so all resources must be embedded.
 */
export default defineConfig({
  plugins: [
    viteSingleFile(),   // ← inlines JS + CSS into the HTML
    buildCodePlugin(),
  ],

  build: {
    outDir:      "dist",
    emptyOutDir: true,

    // Inline small chunks (viteSingleFile handles the rest)
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,

    rollupOptions: {
      input: {
        // Produces dist/src/ui/index.html with EVERYTHING inlined
        ui: resolve(__dirname, "src/ui/index.html"),
      },
    },
  },
});
