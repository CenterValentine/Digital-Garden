#!/usr/bin/env tsx
/**
 * Trace replay HTML renderer (Phase 6).
 *
 * Reads two JSONL files written by the dev-mode logger:
 *   .local/debug-payloads/<trace_id>.events.jsonl   — every LogEvent
 *   .local/debug-payloads/<trace_id>.jsonl          — every spanPayload body
 *
 * Builds a span tree from parent_span_id chains and emits a self-contained
 * HTML page (inline CSS + JS + data, no external deps) at:
 *   .local/debug-payloads/trace-<trace_id>.html
 *
 * Usage:
 *   pnpm trace:view                  # render latest trace
 *   pnpm trace:view <trace_id>       # render specific trace (full or prefix)
 *   pnpm trace:view --list           # list available traces, newest first
 *   pnpm trace:view --open           # also open the result in default browser
 */

import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { exec } from "node:child_process";

const DIR = resolve(process.cwd(), ".local/debug-payloads");

// ── types ────────────────────────────────────────────────────────────

type AttrValue = string | number | boolean;

interface LogEvent {
  trace_id: string;
  span_id?: string;
  parent_span_id?: string;
  ts: string;
  level: "debug" | "info" | "warn" | "error" | "fatal";
  layer: string;
  event: string;
  duration_ms?: number;
  status?: "ok" | "error" | "skipped";
  summary?: string;
  attrs?: Record<string, AttrValue>;
  payload_ref?: string;
  error?: { name: string; message: string; code?: string };
}

interface PayloadEntry {
  label: string;
  ts: string;
  payload: unknown;
}

type Node =
  | {
      kind: "span";
      layer: string;
      eventBase: string; // event with :started stripped
      ts: string;
      summary?: string;
      attrs: Record<string, AttrValue>;
      duration_ms?: number;
      status?: "ok" | "error" | "skipped";
      level: LogEvent["level"];
      payload_ref?: string;
      span_id: string;
      error?: LogEvent["error"];
      children: Node[];
    }
  | {
      kind: "event";
      layer: string;
      event: string;
      ts: string;
      summary?: string;
      attrs: Record<string, AttrValue>;
      duration_ms?: number;
      level: LogEvent["level"];
      payload_ref?: string;
      error?: LogEvent["error"];
    };

// ── CLI ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const wantList = args.includes("--list");
  const wantOpen = args.includes("--open");
  const positional = args.filter((a) => !a.startsWith("--"));
  const requestedId = positional[0];

  if (wantList) {
    await listTraces();
    return;
  }

  const traceId = await resolveTraceId(requestedId);
  if (!traceId) {
    process.stderr.write(
      "No traces found in .local/debug-payloads/. Run `pnpm dev`, hit a route, then try again.\n",
    );
    process.exit(1);
  }

  const events = await readJsonl<LogEvent>(
    resolve(DIR, `${traceId}.events.jsonl`),
  );
  if (events.length === 0) {
    process.stderr.write(
      `No events found for trace ${traceId}. Was it recorded with the new event-recorder?\n`,
    );
    process.exit(1);
  }

  const payloads = await readJsonl<PayloadEntry>(
    resolve(DIR, `${traceId}.jsonl`),
  ).catch(() => [] as PayloadEntry[]);
  const payloadMap = Object.fromEntries(payloads.map((p) => [p.label, p]));

  const tree = buildTree(events);
  const html = renderHtml({ traceId, events, tree, payloadMap });

  const outPath = resolve(DIR, `trace-${traceId}.html`);
  await fs.writeFile(outPath, html, "utf8");

  const fileUrl = `file://${outPath}`;
  process.stdout.write(`\nTrace viewer ready:\n  ${fileUrl}\n\n`);
  process.stdout.write(
    `  events: ${events.length}   payloads: ${payloads.length}   size: ${formatSize(html.length)}\n\n`,
  );

  if (wantOpen) {
    openInBrowser(outPath);
  }
}

async function resolveTraceId(requested?: string): Promise<string | null> {
  const traces = await listTraceFiles();
  if (traces.length === 0) return null;

  if (!requested) {
    // Newest by mtime
    return traces[0].id;
  }

  // Exact match
  const exact = traces.find((t) => t.id === requested);
  if (exact) return exact.id;

  // Prefix match (handy for short IDs like first 8 chars)
  const prefix = traces.find((t) => t.id.startsWith(requested));
  if (prefix) return prefix.id;

  process.stderr.write(
    `No trace matching "${requested}". Run --list to see available traces.\n`,
  );
  process.exit(1);
}

async function listTraceFiles(): Promise<{ id: string; mtimeMs: number }[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(DIR);
  } catch {
    return [];
  }

  const candidates = entries.filter((n) => n.endsWith(".events.jsonl"));
  const stats = await Promise.all(
    candidates.map(async (name) => {
      try {
        const stat = await fs.stat(resolve(DIR, name));
        return { id: name.replace(/\.events\.jsonl$/, ""), mtimeMs: stat.mtimeMs };
      } catch {
        return null;
      }
    }),
  );
  return stats
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

async function listTraces() {
  const traces = await listTraceFiles();
  if (traces.length === 0) {
    process.stdout.write("No traces recorded yet.\n");
    return;
  }
  process.stdout.write(`Available traces (newest first):\n\n`);
  for (const t of traces.slice(0, 20)) {
    const age = formatAge(Date.now() - t.mtimeMs);
    process.stdout.write(`  ${t.id}   (${age} ago)\n`);
  }
  if (traces.length > 20) {
    process.stdout.write(`\n  ... and ${traces.length - 20} more\n`);
  }
}

async function readJsonl<T>(path: string): Promise<T[]> {
  const raw = await fs.readFile(path, "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function openInBrowser(path: string) {
  const cmd =
    process.platform === "darwin"
      ? `open "${path}"`
      : process.platform === "win32"
        ? `start "" "${path}"`
        : `xdg-open "${path}"`;
  exec(cmd);
}

// ── tree construction ───────────────────────────────────────────────

function buildTree(events: LogEvent[]): Node[] {
  const roots: Node[] = [];
  const stack: Node[] = []; // active spans (top is innermost)
  const spanIndex = new Map<string, Extract<Node, { kind: "span" }>>();

  const isStarted = (e: LogEvent) => e.event.endsWith(":started");
  const isTerminal = (e: LogEvent) =>
    e.event.endsWith(":completed") || e.event.endsWith(":failed");

  for (const ev of events) {
    const parent = stack[stack.length - 1];
    const siblings =
      parent && parent.kind === "span" ? parent.children : roots;

    if (isStarted(ev) && ev.span_id) {
      const span: Extract<Node, { kind: "span" }> = {
        kind: "span",
        layer: ev.layer,
        eventBase: ev.event.replace(/:started$/, ""),
        ts: ev.ts,
        summary: ev.summary,
        attrs: ev.attrs ?? {},
        level: ev.level,
        span_id: ev.span_id,
        children: [],
      };
      siblings.push(span);
      spanIndex.set(ev.span_id, span);
      stack.push(span);
      continue;
    }

    if (isTerminal(ev) && ev.span_id) {
      const span = spanIndex.get(ev.span_id);
      if (span) {
        span.duration_ms = ev.duration_ms;
        span.status = ev.event.endsWith(":failed") ? "error" : "ok";
        span.payload_ref =
          ev.payload_ref ??
          (typeof ev.attrs?.payload_ref === "string"
            ? ev.attrs.payload_ref
            : undefined);
        // Merge terminal-event attrs and summary (often the final summary
        // is set on the terminal event, e.g. via span.summary(...) in span.ts)
        if (ev.attrs) span.attrs = { ...span.attrs, ...ev.attrs };
        if (ev.summary) span.summary = ev.summary;
        if (ev.error) span.error = ev.error;
        if (ev.level === "error" || ev.level === "fatal" || ev.level === "warn") {
          span.level = ev.level;
        }
      }
      // Pop only if the innermost active span matches.
      if (parent?.kind === "span" && parent.span_id === ev.span_id) {
        stack.pop();
      }
      continue;
    }

    // Leaf event (e.g., content:db:query, an info breadcrumb, an error).
    siblings.push({
      kind: "event",
      layer: ev.layer,
      event: ev.event,
      ts: ev.ts,
      summary: ev.summary,
      attrs: ev.attrs ?? {},
      duration_ms: ev.duration_ms,
      level: ev.level,
      payload_ref:
        ev.payload_ref ??
        (typeof ev.attrs?.payload_ref === "string"
          ? ev.attrs.payload_ref
          : undefined),
      error: ev.error,
    });
  }

  return roots;
}

// ── summary statistics ──────────────────────────────────────────────

function computeSummary(events: LogEvent[]) {
  const isTerminal = (e: LogEvent) =>
    e.event.endsWith(":completed") || e.event.endsWith(":failed");

  let totalMs = 0;
  let firstTs: string | undefined;
  let lastTs: string | undefined;
  const byLayer = new Map<string, { count: number; duration_ms: number }>();
  const byLevel = new Map<string, number>();

  for (const ev of events) {
    if (!firstTs || ev.ts < firstTs) firstTs = ev.ts;
    if (!lastTs || ev.ts > lastTs) lastTs = ev.ts;

    const layerStat = byLayer.get(ev.layer) ?? { count: 0, duration_ms: 0 };
    layerStat.count++;
    if (ev.duration_ms) layerStat.duration_ms += ev.duration_ms;
    byLayer.set(ev.layer, layerStat);

    byLevel.set(ev.level, (byLevel.get(ev.level) ?? 0) + 1);

    if (
      isTerminal(ev) &&
      ev.duration_ms &&
      ev.duration_ms > totalMs &&
      !ev.parent_span_id
    ) {
      totalMs = ev.duration_ms;
    }
  }

  // Fallback if no root-level terminal event recorded a duration
  if (totalMs === 0 && firstTs && lastTs) {
    totalMs = new Date(lastTs).getTime() - new Date(firstTs).getTime();
  }

  return {
    totalMs,
    firstTs,
    lastTs,
    byLayer: Array.from(byLayer.entries()).sort(
      (a, b) => b[1].duration_ms - a[1].duration_ms,
    ),
    byLevel,
  };
}

// ── HTML rendering ──────────────────────────────────────────────────

function renderHtml({
  traceId,
  events,
  tree,
  payloadMap,
}: {
  traceId: string;
  events: LogEvent[];
  tree: Node[];
  payloadMap: Record<string, PayloadEntry>;
}): string {
  const summary = computeSummary(events);
  const totalMs = summary.totalMs || 1; // avoid div/0

  // Find root-event summary for header (the route:request span)
  const rootSpan = tree.find((n) => n.kind === "span") as
    | Extract<Node, { kind: "span" }>
    | undefined;
  const headline =
    rootSpan?.summary ?? `${events[0]?.layer ?? "trace"} ${events.length} events`;

  const css = CSS;
  const js = JS;

  const treeHtml = renderNodes(tree, totalMs, 0);

  const layersJson = JSON.stringify(
    summary.byLayer.map(([layer, stat]) => ({
      layer,
      count: stat.count,
      duration_ms: stat.duration_ms,
      pct: Math.round((stat.duration_ms / totalMs) * 100),
    })),
  );

  const payloadsJson = JSON.stringify(payloadMap);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>trace:${shortId(traceId)} — ${escapeHtml(headline)}</title>
<style>${css}</style>
</head>
<body>
<header class="trace-header">
  <div class="trace-id">trace:<span class="mono">${escapeHtml(traceId)}</span></div>
  <h1>${escapeHtml(headline)}</h1>
  <div class="meta-row">
    <span class="meta-stat"><b>${summary.totalMs}ms</b> total</span>
    <span class="meta-stat"><b>${events.length}</b> events</span>
    <span class="meta-stat"><b>${summary.byLayer.length}</b> layers</span>
    <span class="meta-stat"><b>${Object.keys(payloadMap).length}</b> payloads</span>
    ${summary.firstTs ? `<span class="meta-stat ts">started ${escapeHtml(summary.firstTs)}</span>` : ""}
  </div>
  <div class="layer-chips" id="layer-chips"></div>
  <div class="controls">
    <input type="search" id="filter" placeholder="filter by event, summary, layer…" />
    <button type="button" id="expand-all">Expand all</button>
    <button type="button" id="collapse-all">Collapse all</button>
  </div>
</header>

<main class="tree">
${treeHtml}
</main>

<footer class="trace-footer">
  Generated by <code>scripts/render-trace.ts</code> — Phase 6 trace viewer.
  Click any row to expand attrs/payload. Numbers in headers are durations.
</footer>

<script>
window.__TRACE_PAYLOADS__ = ${payloadsJson};
window.__TRACE_LAYERS__ = ${layersJson};
${js}
</script>
</body>
</html>
`;
}

function renderNodes(nodes: Node[], totalMs: number, depth: number): string {
  return nodes
    .map((n) => renderNode(n, totalMs, depth))
    .join("\n");
}

function renderNode(node: Node, totalMs: number, depth: number): string {
  const duration = node.kind === "span" ? node.duration_ms : node.duration_ms;
  const pctOfTotal = duration ? Math.min(100, (duration / totalMs) * 100) : 0;
  const status =
    node.kind === "span" ? node.status ?? "ok" : node.level === "error" || node.level === "fatal" ? "error" : "ok";
  const marker = renderMarker(node);
  const eventLabel =
    node.kind === "span"
      ? `${node.eventBase}`
      : node.event;
  const layerBadge = `<span class="layer layer-${escapeHtml(node.layer)}">${escapeHtml(node.layer)}</span>`;
  const summaryHtml = node.summary
    ? `<span class="summary">${escapeHtml(node.summary)}</span>`
    : "";
  const durationHtml = duration != null
    ? `<span class="duration">${duration}ms</span>`
    : `<span class="duration empty">—</span>`;
  const bar = duration
    ? `<span class="bar" style="width:${pctOfTotal.toFixed(2)}%"></span>`
    : "";

  const payloadRef =
    node.kind === "span" ? node.payload_ref : node.payload_ref;
  const payloadLabel = payloadRef ? payloadRef.split("#")[1] : undefined;

  const attrsJson = JSON.stringify(node.attrs ?? {});
  const errorHtml = node.error
    ? `<div class="error-box">⚠ ${escapeHtml(node.error.name)}: ${escapeHtml(node.error.message)}</div>`
    : "";

  const childCount =
    node.kind === "span" ? node.children.length : 0;
  // Only mark expandable if clicking would reveal NEW content (attrs / payload
  // / error). Children render in a sibling .children div and are always
  // visible regardless of expand state — so they don't justify a toggle.
  const hasDetails =
    Object.keys(node.attrs ?? {}).length > 0 ||
    !!payloadLabel ||
    !!node.error;

  const row = `
    <div class="row ${node.kind} status-${status} layer-row-${escapeHtml(node.layer)} level-${node.level}"
         data-layer="${escapeHtml(node.layer)}"
         data-search="${escapeHtml(((node.kind === "span" ? node.eventBase : node.event) + " " + (node.summary ?? "") + " " + node.layer).toLowerCase())}"
         data-attrs='${escapeAttr(attrsJson)}'
         ${payloadLabel ? `data-payload-label="${escapeAttr(payloadLabel)}"` : ""}
         style="--depth:${depth}">
      <div class="row-head" ${hasDetails ? `data-toggle="1"` : ""}>
        <span class="marker">${marker}</span>
        ${layerBadge}
        <span class="event">${escapeHtml(eventLabel)}</span>
        ${summaryHtml}
        <span class="bar-track">${bar}</span>
        ${durationHtml}
        ${payloadLabel ? `<span class="payload-badge" title="payload available">📄 ${escapeHtml(payloadLabel)}</span>` : ""}
        ${childCount > 0 ? `<span class="child-count">${childCount}</span>` : ""}
      </div>
      ${hasDetails ? `<div class="row-details">${errorHtml}<div class="details-slot"></div></div>` : ""}
      ${node.kind === "span" && node.children.length > 0
        ? `<div class="children">${renderNodes(node.children, totalMs, depth + 1)}</div>`
        : ""}
    </div>`;
  return row;
}

function renderMarker(node: Node): string {
  if (node.kind === "span") {
    if (node.status === "error") return "✗";
    if (node.duration_ms != null) return "✓";
    return "⋯";
  }
  if (node.level === "error" || node.level === "fatal") return "✗";
  if (node.level === "warn") return "⚠";
  return "•";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  // Single-quoted attributes — escape ' and HTML metachars.
  return s
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;");
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function formatAge(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

// ── inline CSS + JS ─────────────────────────────────────────────────

const CSS = `
:root {
  --bg: #0f1115;
  --bg-elev: #161a22;
  --bg-row: #1b212c;
  --bg-row-hover: #232b39;
  --fg: #e6e9ef;
  --fg-dim: #8b95a7;
  --fg-faint: #5b6473;
  --border: #2a3142;
  --accent: #8ab4ff;
  --ok: #4ade80;
  --warn: #fbbf24;
  --err: #f87171;
  --layer-route: #818cf8;
  --layer-auth: #f472b6;
  --layer-content: #34d399;
  --layer-tree: #fbbf24;
  --layer-collab: #60a5fa;
  --layer-ai: #c084fc;
  --layer-storage: #fb923c;
  --layer-editor: #2dd4bf;
  --layer-export: #a78bfa;
  --layer-external: #06b6d4;
  --layer-browser_ext: #facc15;
  --layer-periodic: #f59e0b;
  --layer-admin: #ef4444;
  --layer-ui: #38bdf8;
  --layer-page: #38bdf8;
  --layer-store: #94a3b8;
  --layer-fetch: #06b6d4;
  --layer-error: #f87171;
}

* { box-sizing: border-box; }
html, body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1.5;
}

.mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; }

.trace-header {
  background: var(--bg-elev);
  border-bottom: 1px solid var(--border);
  padding: 20px 24px;
  position: sticky;
  top: 0;
  z-index: 10;
}
.trace-id {
  color: var(--fg-dim);
  font-size: 11px;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}
.trace-header h1 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
}
.meta-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  color: var(--fg-dim);
  font-size: 12px;
}
.meta-stat b { color: var(--fg); }
.meta-stat.ts { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11px; }

.layer-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.layer-chip {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  background: var(--bg-row);
  border: 1px solid var(--border);
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
.layer-chip .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.layer-chip.muted { opacity: 0.35; }
.layer-chip .pct { color: var(--fg-faint); font-size: 10px; }

.controls {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.controls input {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--fg);
  padding: 6px 10px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 12px;
}
.controls button {
  background: var(--bg-row);
  border: 1px solid var(--border);
  color: var(--fg);
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.controls button:hover { background: var(--bg-row-hover); }

.tree {
  padding: 16px 24px 80px;
  max-width: 1400px;
}

.row {
  margin-left: calc(var(--depth) * 18px);
  border-left: 2px solid var(--border);
  padding-left: 8px;
  margin-top: 2px;
}
.row.span { margin-top: 6px; }
.row[hidden] { display: none !important; }

.row-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-row);
  border-radius: 4px;
  cursor: default;
}
.row-head[data-toggle] { cursor: pointer; }
.row-head[data-toggle]:hover { background: var(--bg-row-hover); }

.marker {
  width: 14px;
  text-align: center;
  color: var(--fg-dim);
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
}
.status-error > .row-head .marker { color: var(--err); }
.status-ok.span > .row-head .marker { color: var(--ok); }
.level-warn > .row-head .marker { color: var(--warn); }

.event {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 12px;
  color: var(--fg);
  white-space: nowrap;
}
.row.event .event { color: var(--fg-dim); font-size: 11.5px; }

.summary {
  color: var(--fg-dim);
  font-size: 12px;
  margin-left: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}

.bar-track {
  flex: 1;
  height: 4px;
  background: rgba(255,255,255,0.04);
  border-radius: 2px;
  position: relative;
  overflow: hidden;
  min-width: 60px;
}
.bar {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
}
.row.span > .row-head .bar { background: var(--accent); }
.row.event > .row-head .bar { background: var(--fg-faint); }
.status-error > .row-head .bar { background: var(--err); }

.duration {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 11px;
  color: var(--fg-dim);
  min-width: 50px;
  text-align: right;
}
.duration.empty { color: var(--fg-faint); }

.payload-badge {
  font-size: 10.5px;
  background: rgba(138, 180, 255, 0.12);
  color: var(--accent);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
}

.child-count {
  font-size: 10px;
  color: var(--fg-faint);
  background: rgba(255,255,255,0.04);
  padding: 1px 6px;
  border-radius: 8px;
  min-width: 18px;
  text-align: center;
}

.layer {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 10.5px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(255,255,255,0.05);
  color: var(--fg-dim);
  border-left: 2px solid var(--fg-faint);
}
.layer-route { color: var(--layer-route); border-left-color: var(--layer-route); }
.layer-auth { color: var(--layer-auth); border-left-color: var(--layer-auth); }
.layer-content { color: var(--layer-content); border-left-color: var(--layer-content); }
.layer-tree { color: var(--layer-tree); border-left-color: var(--layer-tree); }
.layer-collab { color: var(--layer-collab); border-left-color: var(--layer-collab); }
.layer-ai { color: var(--layer-ai); border-left-color: var(--layer-ai); }
.layer-storage { color: var(--layer-storage); border-left-color: var(--layer-storage); }
.layer-editor { color: var(--layer-editor); border-left-color: var(--layer-editor); }
.layer-export { color: var(--layer-export); border-left-color: var(--layer-export); }
.layer-external { color: var(--layer-external); border-left-color: var(--layer-external); }
.layer-ui { color: var(--layer-ui); border-left-color: var(--layer-ui); }
.layer-page { color: var(--layer-page); border-left-color: var(--layer-page); }
.layer-store { color: var(--layer-store); border-left-color: var(--layer-store); }
.layer-fetch { color: var(--layer-fetch); border-left-color: var(--layer-fetch); }

.row-details {
  display: none;
  padding: 8px 12px;
  margin-top: 4px;
  background: var(--bg-elev);
  border-radius: 4px;
  border: 1px solid var(--border);
}
.row.expanded > .row-details { display: block; }

.error-box {
  color: var(--err);
  background: rgba(248, 113, 113, 0.08);
  border: 1px solid rgba(248, 113, 113, 0.3);
  padding: 6px 10px;
  border-radius: 3px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 11.5px;
  margin-bottom: 8px;
}

.kv-list {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 14px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 11.5px;
}
.kv-key { color: var(--fg-dim); }
.kv-val { color: var(--fg); word-break: break-all; }

.payload-block {
  margin-top: 10px;
  border-top: 1px dashed var(--border);
  padding-top: 8px;
}
.payload-block h4 {
  margin: 0 0 6px;
  font-size: 11px;
  color: var(--fg-dim);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.payload-block pre {
  margin: 0;
  padding: 10px;
  background: var(--bg);
  border-radius: 3px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 11px;
  line-height: 1.45;
  color: var(--fg);
  overflow: auto;
  max-height: 400px;
}

.trace-footer {
  padding: 12px 24px;
  border-top: 1px solid var(--border);
  color: var(--fg-faint);
  font-size: 11px;
  background: var(--bg-elev);
}
.trace-footer code {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  background: var(--bg-row);
  padding: 1px 4px;
  border-radius: 2px;
}
`;

const JS = `
(function() {
  const layers = window.__TRACE_LAYERS__ || [];
  const payloads = window.__TRACE_PAYLOADS__ || {};

  // ── layer chips ────────────────────────────────────────────────
  const chipsRoot = document.getElementById("layer-chips");
  const layerVar = (l) => "var(--layer-" + l + ")";
  const layerStates = {};
  for (const l of layers) layerStates[l.layer] = true;

  for (const l of layers) {
    const chip = document.createElement("span");
    chip.className = "layer-chip";
    chip.dataset.layer = l.layer;
    chip.innerHTML = '<span class="dot" style="background:' + layerVar(l.layer) + '"></span>' +
      l.layer + ' <span class="pct">' + l.count + ' · ' + l.duration_ms + 'ms (' + l.pct + '%)</span>';
    chip.addEventListener("click", () => {
      layerStates[l.layer] = !layerStates[l.layer];
      chip.classList.toggle("muted", !layerStates[l.layer]);
      applyFilters();
    });
    chipsRoot.appendChild(chip);
  }

  // ── filter ─────────────────────────────────────────────────────
  const filterInput = document.getElementById("filter");
  filterInput.addEventListener("input", applyFilters);

  function applyFilters() {
    const q = filterInput.value.trim().toLowerCase();
    const rows = document.querySelectorAll(".row");
    for (const row of rows) {
      const layer = row.dataset.layer;
      const search = row.dataset.search || "";
      const layerOk = layerStates[layer] !== false;
      const searchOk = q.length === 0 || search.indexOf(q) !== -1;
      row.hidden = !(layerOk && searchOk);
    }
  }

  // ── expand/collapse ────────────────────────────────────────────
  document.body.addEventListener("click", (e) => {
    const head = e.target.closest(".row-head[data-toggle]");
    if (!head) return;
    const row = head.parentElement;
    const willExpand = !row.classList.contains("expanded");
    row.classList.toggle("expanded");
    if (willExpand) renderDetails(row);
  });

  document.getElementById("expand-all").addEventListener("click", () => {
    document.querySelectorAll(".row-head[data-toggle]").forEach((h) => {
      const row = h.parentElement;
      if (!row.classList.contains("expanded")) {
        row.classList.add("expanded");
        renderDetails(row);
      }
    });
  });

  document.getElementById("collapse-all").addEventListener("click", () => {
    document.querySelectorAll(".row.expanded").forEach((r) => r.classList.remove("expanded"));
  });

  // ── details renderer (lazy) ────────────────────────────────────
  function renderDetails(row) {
    const slot = row.querySelector(":scope > .row-details > .details-slot");
    if (!slot || slot.dataset.rendered === "1") return;
    slot.dataset.rendered = "1";

    let attrs = {};
    try { attrs = JSON.parse(row.dataset.attrs || "{}"); } catch {}

    const kvHtml = Object.keys(attrs).length === 0
      ? '<div style="color: var(--fg-faint); font-size: 11px;">(no attrs)</div>'
      : '<div class="kv-list">' +
        Object.entries(attrs)
          .map(([k, v]) => '<span class="kv-key">' + esc(k) + '</span><span class="kv-val">' + esc(String(v)) + '</span>')
          .join('') +
        '</div>';
    let html = kvHtml;

    const payloadLabel = row.dataset.payloadLabel;
    if (payloadLabel && payloads[payloadLabel]) {
      const p = payloads[payloadLabel];
      html += '<div class="payload-block">' +
        '<h4>payload · ' + esc(payloadLabel) + '</h4>' +
        '<pre>' + esc(JSON.stringify(p.payload, null, 2)) + '</pre>' +
        '</div>';
    }
    slot.innerHTML = html;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
})();
`;

// ── entry ────────────────────────────────────────────────────────────

main().catch((err) => {
  process.stderr.write(`render-trace failed: ${err.stack || err.message || err}\n`);
  process.exit(1);
});
