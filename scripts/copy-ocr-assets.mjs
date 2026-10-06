/**
 * copy-ocr-assets.mjs
 *
 * Copies the executable half of tesseract.js (the worker script and the LSTM
 * WASM cores) from node_modules into `public/ocr/`, so the browser loads them
 * from this origin instead of jsdelivr.
 *
 * Why self-host (OCR-PASTE-PLAN.md D4): the side-panel embed page carries
 * `script-src 'self'` and is the trust-gated bridge to `chrome.debugger`, so
 * third-party executable code must never run there, and a Worker cannot carry
 * Subresource Integrity. Copying from node_modules also pins the worker and
 * core to exactly the installed library version — they cannot drift apart.
 *
 * Only the three LSTM-only cores are copied (the engine always runs OEM
 * LSTM_ONLY). Each `.wasm.js` embeds its WASM inline, so the sibling `.wasm`
 * files are not needed. The browser downloads ONE of the three, chosen by
 * tesseract.js via feature detection (relaxed SIMD → SIMD → plain).
 *
 * The language pack (data, not code) stays on the CDN — see local-engine.ts.
 *
 * Plain Node, zero dependencies: it runs from `postinstall`, where dev
 * tooling such as tsx may not be installed. Output is gitignored.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "public", "ocr");

const tesseractDir = dirname(require.resolve("tesseract.js/package.json"));
// tesseract.js-core is a transitive dependency; under pnpm it is only
// resolvable from tesseract.js's own directory.
const coreDir = dirname(
  require.resolve("tesseract.js-core/package.json", { paths: [tesseractDir] }),
);

const files = [
  [join(tesseractDir, "dist", "worker.min.js"), "worker.min.js"],
  ...["relaxedsimd-lstm", "simd-lstm", "lstm"].map((variant) => {
    const name = `tesseract-core-${variant}.wasm.js`;
    return [join(coreDir, name), name];
  }),
];

mkdirSync(dest, { recursive: true });
let copied = 0;
for (const [from, name] of files) {
  if (!existsSync(from)) {
    console.error(`copy-ocr-assets: missing ${from} — is tesseract.js installed?`);
    process.exit(1);
  }
  const to = join(dest, name);
  const src = statSync(from);
  if (existsSync(to)) {
    const out = statSync(to);
    if (out.size === src.size && out.mtimeMs >= src.mtimeMs) continue;
  }
  copyFileSync(from, to);
  copied++;
}
if (copied > 0) console.log(`copy-ocr-assets: ${copied} file(s) → public/ocr`);
