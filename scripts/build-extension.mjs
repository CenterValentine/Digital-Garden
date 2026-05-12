import * as esbuild from "esbuild";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const extRoot = path.join(root, "extensions/browser-bookmarks/browser-extension");
const srcDir = path.join(extRoot, "src");
const outDir = path.join(extRoot, "dist");

const isDev = process.argv.includes("--dev");

fs.mkdirSync(outDir, { recursive: true });

const sharedOptions = {
  bundle: true,
  sourcemap: isDev ? "inline" : false,
  minify: !isDev,
  target: ["chrome120"],
  logLevel: "info",
};

await Promise.all([
  // Service worker — true ES module (manifest declares "type": "module")
  esbuild.build({
    ...sharedOptions,
    format: "esm",
    entryPoints: [path.join(srcDir, "background/index.js")],
    outfile: path.join(outDir, "background.js"),
  }),

  // Popup — IIFE (runs in popup page, not a real module context)
  esbuild.build({
    ...sharedOptions,
    format: "iife",
    entryPoints: [path.join(srcDir, "popup/index.js")],
    outfile: path.join(outDir, "popup.js"),
  }),

  // Overlay content script — IIFE (content scripts share scope, must not leak top-level vars)
  esbuild.build({
    ...sharedOptions,
    format: "iife",
    entryPoints: [path.join(srcDir, "overlay/index.js")],
    outfile: path.join(outDir, "overlay.js"),
  }),

  // Page bridge — IIFE, no bundling (no external imports, same scope isolation requirement)
  esbuild.build({
    ...sharedOptions,
    format: "iife",
    bundle: false,
    entryPoints: [path.join(srcDir, "page-bridge.js")],
    outfile: path.join(outDir, "page-bridge.js"),
  }),
]);

console.log("Extension built →", outDir);
