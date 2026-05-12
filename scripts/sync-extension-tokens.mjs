/**
 * Extracts CSS custom properties from the app's design token files and writes
 * a consolidated tokens.css into the extension src/ directory. This file is
 * injected into the shadow DOM so the overlay can reference the same variables
 * as the main application without style leakage from the host page.
 */
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const sources = [
  path.join(root, "dist/variables.css"),
  path.join(root, "app/globals.css"),
];

const outFile = path.join(
  root,
  "extensions/browser-bookmarks/browser-extension/src/tokens.css"
);

// Extract all --custom-property declarations from a :root block
function extractRootVariables(css) {
  const vars = new Map();
  const rootPattern = /:root\s*\{([^}]+)\}/gs;
  let match;
  while ((match = rootPattern.exec(css)) !== null) {
    const block = match[1];
    const propPattern = /(-{2}[\w-]+)\s*:\s*([^;]+);/g;
    let prop;
    while ((prop = propPattern.exec(block)) !== null) {
      vars.set(prop[1].trim(), prop[2].trim());
    }
  }
  return vars;
}

const merged = new Map();
for (const src of sources) {
  if (!fs.existsSync(src)) continue;
  const css = fs.readFileSync(src, "utf8");
  const vars = extractRootVariables(css);
  for (const [key, value] of vars) {
    merged.set(key, value);
  }
}

if (merged.size === 0) {
  console.warn("sync-extension-tokens: no CSS variables found in source files.");
  process.exit(0);
}

const lines = [
  "/* Auto-generated — do not edit. Run: pnpm extension:tokens */",
  ":host {",
  ...[...merged.entries()].map(([k, v]) => `  ${k}: ${v};`),
  "}",
  "",
];

fs.writeFileSync(outFile, lines.join("\n"), "utf8");
console.log(`Synced ${merged.size} tokens → ${path.relative(root, outFile)}`);
