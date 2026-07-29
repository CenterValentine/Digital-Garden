/**
 * sync-showcase-figures.ts — the showcase "figure signal system".
 *
 * Contract (documented in docs/media/figures/FIGURES.md):
 *   - Figures are declared in the registry as `## Fig <id> — <title>` sections.
 *   - Markdown surfaces (README.md, docs/**) contain marker slots:
 *       <!-- fig:1-1 --> ... <!-- /fig:1-1 -->
 *   - Dropping a media file named `fig-<id>.<ext>` into docs/media/figures/
 *     and running `pnpm showcase:figures` embeds it inside every matching slot.
 *   - When no file exists, the slot renders a one-line "media pending" caption —
 *     never an empty or broken placeholder.
 *   - The registry's audit table + per-figure Status lines are rewritten on every
 *     run, so FIGURES.md is always a faithful audit of what exists on disk.
 *
 * Idempotent: re-running without changes rewrites nothing.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = process.cwd();
const FIG_DIR = path.join(ROOT, "docs", "media", "figures");
const REGISTRY_PATH = path.join(FIG_DIR, "FIGURES.md");

/** Inline-embeddable formats, in preference order when several exist. */
const INLINE_PRIORITY = [".gif", ".png", ".jpg", ".jpeg", ".webp", ".svg"];
/** Video formats (GitHub won't inline-play committed videos → rendered as links). */
const VIDEO_PRIORITY = [".mp4", ".webm", ".mov"];

const AUDIT_START = "<!-- figures-audit:start -->";
const AUDIT_END = "<!-- figures-audit:end -->";

interface FigureMedia {
  inline?: string; // file name of best inline asset
  video?: string; // file name of best video asset
}

interface FigureEntry {
  id: string;
  title: string;
  media: FigureMedia;
  placements: string[]; // repo-relative markdown paths containing this figure's marker
}

function fail(msg: string): never {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

function relFrom(fromFile: string, target: string): string {
  return toPosix(path.relative(path.dirname(fromFile), target));
}

// ── 1. Parse the registry ────────────────────────────────────────────────────
if (!fs.existsSync(REGISTRY_PATH)) {
  fail(`Registry not found: ${toPosix(path.relative(ROOT, REGISTRY_PATH))}`);
}
const registrySource = fs.readFileSync(REGISTRY_PATH, "utf8");

const HEADER_RE = /^## Fig ([a-z0-9]+(?:-[a-z0-9]+)*) — (.+)$/gim;
const figures = new Map<string, FigureEntry>();
for (const match of registrySource.matchAll(HEADER_RE)) {
  const id = match[1].toLowerCase();
  if (figures.has(id)) fail(`Duplicate registry entry for Fig ${id}`);
  figures.set(id, { id, title: match[2].trim(), media: {}, placements: [] });
}
if (figures.size === 0) fail("Registry contains no `## Fig <id> — <title>` sections.");

// ── 2. Scan the media folder ─────────────────────────────────────────────────
const orphanFiles: string[] = [];
const mediaByFigure = new Map<string, string[]>();
for (const name of fs.readdirSync(FIG_DIR)) {
  const parsed = /^fig-(.+)\.([a-z0-9]+)$/i.exec(name);
  if (!parsed) continue;
  const id = parsed[1].toLowerCase();
  if (!figures.has(id)) {
    orphanFiles.push(name);
    continue;
  }
  const list = mediaByFigure.get(id) ?? [];
  list.push(name);
  mediaByFigure.set(id, list);
}
for (const [id, files] of mediaByFigure) {
  const entry = figures.get(id);
  if (!entry) continue;
  const pick = (priority: string[]): string | undefined => {
    for (const ext of priority) {
      const hit = files.find((f) => f.toLowerCase().endsWith(ext));
      if (hit) return hit;
    }
    return undefined;
  };
  entry.media.inline = pick(INLINE_PRIORITY);
  entry.media.video = pick(VIDEO_PRIORITY);
}

// ── 3. Rewrite marker slots in showcase surfaces ─────────────────────────────
function collectMarkdownFiles(): string[] {
  const found: string[] = [];
  const readme = path.join(ROOT, "README.md");
  if (fs.existsSync(readme)) found.push(readme);
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(full);
      } else if (entry.name.endsWith(".md") && full !== REGISTRY_PATH) {
        found.push(full);
      }
    }
  };
  const docsDir = path.join(ROOT, "docs");
  if (fs.existsSync(docsDir)) walk(docsDir);
  return found;
}

function escapeAttr(text: string): string {
  return text.replace(/"/g, "&quot;");
}

function renderSlot(id: string, filePath: string): string {
  const entry = figures.get(id);
  const registryRef = relFrom(filePath, REGISTRY_PATH);
  if (!entry) {
    return `<sub>📷 <b>Fig ${id}</b> — unregistered figure · <a href="${registryRef}">add it to the registry</a></sub>`;
  }
  const { inline, video } = entry.media;
  const videoRef = video ? relFrom(filePath, path.join(FIG_DIR, video)) : undefined;
  if (inline) {
    const inlineRef = relFrom(filePath, path.join(FIG_DIR, inline));
    const videoSuffix = videoRef ? ` · <a href="${videoRef}">▶ video</a>` : "";
    return [
      `<p align="center">`,
      `  <img src="${inlineRef}" alt="Fig ${id} — ${escapeAttr(entry.title)}" width="850" />`,
      `  <br /><sub><b>Fig ${id}</b> — ${entry.title}${videoSuffix}</sub>`,
      `</p>`,
    ].join("\n");
  }
  if (videoRef) {
    return `<p align="center"><sub><b>Fig ${id}</b> — ${entry.title} · <a href="${videoRef}">▶ watch video</a></sub></p>`;
  }
  return `<sub>📷 <b>Fig ${id}</b> · <i>${entry.title}</i> — <a href="${registryRef}">media pending</a></sub>`;
}

const MARKER_RE = /<!-- fig:([a-z0-9-]+) -->[\s\S]*?<!-- \/fig:\1 -->/gi;
const unregisteredMarkers = new Set<string>();
let filesRewritten = 0;

for (const filePath of collectMarkdownFiles()) {
  const source = fs.readFileSync(filePath, "utf8");
  const relPath = toPosix(path.relative(ROOT, filePath));
  const next = source.replace(MARKER_RE, (_full, rawId: string) => {
    const id = rawId.toLowerCase();
    const entry = figures.get(id);
    if (entry) {
      if (!entry.placements.includes(relPath)) entry.placements.push(relPath);
    } else {
      unregisteredMarkers.add(`${id} (${relPath})`);
    }
    return `<!-- fig:${id} -->\n${renderSlot(id, filePath)}\n<!-- /fig:${id} -->`;
  });
  if (next !== source) {
    fs.writeFileSync(filePath, next);
    filesRewritten += 1;
  }
}

// ── 4. Rewrite the registry: audit table + per-figure Status lines ──────────
const sorted = [...figures.values()].sort((a, b) =>
  a.id.localeCompare(b.id, undefined, { numeric: true })
);

const auditRows = sorted.map((f) => {
  const files = [f.media.inline, f.media.video].filter(Boolean) as string[];
  const status = files.length > 0 ? "✅" : "⬜";
  const fileCell = files.length > 0 ? files.map((n) => `\`${n}\``).join(" + ") : "—";
  const placementCell = f.placements.length > 0 ? f.placements.join(", ") : "⚠ not placed";
  return `| ${f.id} | ${f.title} | ${status} | ${fileCell} | ${placementCell} |`;
});
const auditTable = [
  "| Fig | Title | Status | Media file | Appears in |",
  "|---|---|---|---|---|",
  ...auditRows,
].join("\n");

let registryNext = registrySource;
const auditStart = registryNext.indexOf(AUDIT_START);
const auditEnd = registryNext.indexOf(AUDIT_END);
if (auditStart === -1 || auditEnd === -1 || auditEnd < auditStart) {
  fail(`Registry is missing the ${AUDIT_START} / ${AUDIT_END} markers.`);
}
registryNext =
  registryNext.slice(0, auditStart + AUDIT_START.length) +
  "\n" +
  auditTable +
  "\n" +
  registryNext.slice(auditEnd);

for (const f of sorted) {
  const files = [f.media.inline, f.media.video].filter(Boolean) as string[];
  const statusLine =
    files.length > 0
      ? `- **Status:** ✅ present — ${files.map((n) => `\`${n}\``).join(" + ")}`
      : `- **Status:** ⬜ awaiting media`;
  // Replace the first Status line inside this figure's section only.
  const sectionRe = new RegExp(
    `(## Fig ${f.id} — [^\\n]+\\n(?:(?!## Fig )[\\s\\S])*?)- \\*\\*Status:\\*\\*[^\\n]*`,
    "i"
  );
  registryNext = registryNext.replace(sectionRe, `$1${statusLine}`);
}

if (registryNext !== registrySource) {
  fs.writeFileSync(REGISTRY_PATH, registryNext);
  filesRewritten += 1;
}

// ── 5. Report ────────────────────────────────────────────────────────────────
const present = sorted.filter((f) => f.media.inline || f.media.video);
const unplaced = sorted.filter((f) => f.placements.length === 0);
console.log(
  `Figures: ${sorted.length} registered · ${present.length} with media · ${
    sorted.length - present.length
  } awaiting media · ${filesRewritten} file(s) rewritten`
);
if (unplaced.length > 0) {
  console.warn(`⚠ Registered but not placed in any surface: ${unplaced.map((f) => f.id).join(", ")}`);
}
if (orphanFiles.length > 0) {
  console.warn(`⚠ Media files with no registry entry: ${orphanFiles.join(", ")}`);
}
if (unregisteredMarkers.size > 0) {
  console.warn(`⚠ Markers with no registry entry: ${[...unregisteredMarkers].join("; ")}`);
}
