/**
 * OCR accuracy harness — `pnpm ocr:accuracy [--dir <folder>] [--show]`.
 * Guide: docs/notes-feature/guides/editor/OCR-PIPELINE.md ("Measuring").
 *
 * Runs the SHIPPED engine (lib/features/ocr/local-engine.ts, bundled with
 * esbuild) in headless Chromium against a set of images and prints the
 * character error rate of each (Levenshtein distance on whitespace-normalised
 * text, divided by the truth's length). Use it before and after any change to
 * the pipeline's thresholds or steps — the numbers in the guide came from it.
 *
 * Images:
 *  - built in: synthetic cases rendered in the page (paragraph light/dark,
 *    terminal output, a three-column table, Spanish with and without the
 *    Spanish pack) — no files, nothing personal committed;
 *  - --dir <folder>: every `name.png|jpg` with a `name.txt` beside it holding
 *    the true text. Keep real screenshots OUT of the repo; point --dir at a
 *    local folder.
 *
 * Measurement only — not a CI gate: it needs Chromium (`pnpm exec playwright
 * install chromium`) and the network for language packs. Assets in public/ocr
 * must exist (`pnpm ocr:assets`).
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const esbuild = require("esbuild");
const { chromium } = require("@playwright/test");

const args = process.argv.slice(2);
const dirArg = args.includes("--dir") ? args[args.indexOf("--dir") + 1] : null;
const show = args.includes("--show");

const PARA =
  "Revenue grew by twelve percent over the prior quarter, driven by strong demand in the enterprise segment and a steady rise in renewals. The team expects growth to continue into next year.";
const TERMINAL_MS = [135, 128, 133, 144, 153, 135];
const TABLE = [
  ["Name", "Role", "Status"],
  ["Ada Lovelace", "Lead Engineer", "Active since 2021"],
  ["Grace Hopper", "Compiler Team", "On leave"],
  ["Alan Turing", "Research", "Active since 2019"],
  ["Katherine Johnson", "Flight Analysis", "Contractor"],
];
const SPANISH = "El niño comió una manzana y después bebió café con azúcar. Mañana iremos a la montaña con la señora Muñoz.";

const BUILT_IN = [
  { id: "paragraph (light)", synth: "para-light", truth: PARA },
  { id: "paragraph (dark)", synth: "para-dark", truth: PARA },
  { id: "terminal", synth: "terminal", truth: TERMINAL_MS.map((n) => `Compiled in ${n}ms`).join(" ") },
  { id: "3-column table", synth: "table", truth: TABLE.map((r) => r.join(" ")).join(" ") },
  { id: "spanish, English only", synth: "spanish", truth: SPANISH, langs: [] },
  { id: "spanish, + Spanish pack", synth: "spanish", truth: SPANISH, langs: ["spa"] },
];

function cases() {
  const out = [...BUILT_IN];
  if (dirArg) {
    for (const f of fs.readdirSync(dirArg).sort()) {
      if (!/\.(png|jpe?g)$/i.test(f)) continue;
      const truthFile = path.join(dirArg, f.replace(/\.[^.]+$/, ".txt"));
      if (!fs.existsSync(truthFile)) continue;
      out.push({ id: f, file: path.join(dirArg, f), truth: fs.readFileSync(truthFile, "utf8") });
    }
  }
  return out;
}

const PAGE_SCRIPT = `
  import { localOcrEngine } from "./lib/features/ocr/local-engine";
  import { useSettingsStore } from "./state/settings-store";
  const W = (w, h) => { const c = new OffscreenCanvas(w, h); return [c, c.getContext("2d")]; };
  const synth = {
    async "para-light"() { return para(false); },
    async "para-dark"() { return para(true); },
    async terminal() {
      const [c, g] = W(406, 284); g.fillStyle = "#111111"; g.fillRect(0, 0, 406, 284);
      g.font = "26px Menlo, Monaco, monospace";
      ${JSON.stringify(TERMINAL_MS)}.forEach((n, i) => { const y = 34 + i * 34;
        g.fillStyle = "#3fb950"; g.fillText("\\u2713", 34, y); g.fillStyle = "#e6e6e6"; g.fillText("Compiled in " + n + "ms", 68, y); });
      return c.convertToBlob({ type: "image/png" });
    },
    async table() {
      const rows = ${JSON.stringify(TABLE)}; const [c, g] = W(720, 60 + rows.length * 40);
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
      rows.forEach((r, i) => { const y = 40 + i * 40;
        g.font = (i === 0 ? "bold " : "") + "18px -apple-system, Helvetica, Arial, sans-serif"; g.fillStyle = "#1a1a1a";
        r.forEach((cell, j) => g.fillText(cell, 24 + j * 230, y));
        g.fillStyle = "#d0d0d0"; g.fillRect(16, y + 12, 688, 1); });
      return c.convertToBlob({ type: "image/png" });
    },
    async spanish() {
      const [c, g] = W(820, 110); g.fillStyle = "#ffffff"; g.fillRect(0, 0, 820, 110); g.fillStyle = "#111111";
      g.font = "22px -apple-system, Helvetica, Arial, sans-serif";
      g.fillText("El niño comió una manzana y después bebió café con azúcar.", 20, 45);
      g.fillText("Mañana iremos a la montaña con la señora Muñoz.", 20, 85);
      return c.convertToBlob({ type: "image/png" });
    },
  };
  async function para(dark) {
    const [c, g] = W(760, 170); g.fillStyle = dark ? "#1f2733" : "#ffffff"; g.fillRect(0, 0, 760, 170);
    g.fillStyle = dark ? "#d6dde6" : "#1a1a1a"; g.font = "17px -apple-system, Helvetica, Arial, sans-serif";
    let line = "", y = 36;
    for (const w of ${JSON.stringify(PARA)}.split(" ")) { const t = line ? line + " " + w : w;
      if (g.measureText(t).width > 700) { g.fillText(line, 24, y); y += 26; line = w; } else line = t; }
    g.fillText(line, 24, y); return c.convertToBlob({ type: "image/png" });
  }
  window.read = async ({ synthId, url, langs }) => {
    useSettingsStore.setState((s) => ({ editor: { ...s.editor, ocrLanguages: langs ?? [] } }));
    const blob = synthId ? await synth[synthId]() : await (await fetch(url)).blob();
    const r = await localOcrEngine.recognize(blob);
    return { text: r.text, confidence: Math.round(r.confidence), layout: r.layout };
  };
  window.ready = true;
`;

function levenshtein(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
const norm = (s) => s.replace(/\s+/g, " ").trim();

async function main() {
  if (!fs.existsSync(path.join(root, "public/ocr/worker.min.js"))) {
    console.error("public/ocr is missing — run `pnpm ocr:assets` first.");
    process.exit(1);
  }
  const bundle = await esbuild.build({
    stdin: { contents: PAGE_SCRIPT, resolveDir: root, loader: "ts" },
    bundle: true, write: false, format: "esm", platform: "browser", logLevel: "silent",
  });
  const js = bundle.outputFiles[0].text;
  const list = cases();
  const files = new Map(list.filter((c) => c.file).map((c, i) => [`/img/${i}${path.extname(c.file)}`, c.file]));
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end('<!doctype html><script type="module" src="/t.js"></script>');
    }
    if (u.pathname === "/t.js") {
      res.writeHead(200, { "content-type": "application/javascript" });
      return res.end(js);
    }
    const file = u.pathname.startsWith("/ocr/") ? path.join(root, "public", u.pathname) : files.get(u.pathname);
    if (!file || !fs.existsSync(file)) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { "content-type": u.pathname.startsWith("/ocr/") ? "application/javascript" : "image/png" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });

  const urls = new Map([...files.entries()].map(([u, f]) => [f, u]));
  let total = 0;
  console.log(`${"case".padEnd(28)} ${"error".padStart(6)} ${"conf".padStart(5)}  layout`);
  for (const c of list) {
    const r = await page.evaluate((input) => window.read(input), {
      synthId: c.synth ?? null,
      url: c.file ? urls.get(c.file) : null,
      langs: c.langs ?? [],
    });
    const error = levenshtein(norm(r.text), norm(c.truth)) / Math.max(1, norm(c.truth).length);
    total += error;
    console.log(`${c.id.padEnd(28)} ${((error * 100).toFixed(0) + "%").padStart(6)} ${String(r.confidence).padStart(5)}  ${r.layout}`);
    if (show) console.log("    " + JSON.stringify(r.text.trim()));
  }
  console.log(`${"MEAN".padEnd(28)} ${((total / list.length) * 100).toFixed(1).padStart(5)}%`);
  await browser.close();
  server.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
