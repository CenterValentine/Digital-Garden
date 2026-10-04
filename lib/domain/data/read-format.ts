/**
 * Read formatting for AI database reads (AI-BULK-ROW-READING-PLAN §4).
 *
 * PURE — no Prisma, no React. One formatter shared by `query_database`
 * (labelled lines and header-once TSV), `describe_database` (column
 * profiles, samples), the CSV export (`cellDisplayValue`), the context fold
 * (`parseReadHeader`) and the `data:read:check` gate, so "the AI sees what
 * the export sees" is one code path.
 *
 * Measured motivation (plan §2b, Career Evidence Library, 2026-09-14):
 * UUID row ids were 49% of a query result; mirrored backlink columns
 * rendered every link twice; unclipped long text cost the page; JSON cost
 * +40–65% over header-once TSV. Every rule here traces to one of those.
 */

import { cellToText, deriveRowTitle } from "./cells";
import { estimateTokens } from "@/lib/domain/ai-context/tokens";
import type { DataColumn, DataColumnType, DataRow } from "./types";

// ── Handles ─────────────────────────────────────────────────────────────

/** An 8-hex UUID prefix: ~5 tokens against ~22 for the full id. */
export const HANDLE_LENGTH = 8;

export function rowHandle(id: string): string {
  return id.slice(0, HANDLE_LENGTH);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIX_RE = /^[0-9a-f]{8,}$/i;

export type ParsedRowRef =
  | { kind: "uuid"; id: string }
  | { kind: "prefix"; prefix: string }
  | { kind: "invalid"; reason: string };

/** A row reference the model may pass: a full UUID, or an 8+ hex handle. */
export function parseRowRef(ref: string): ParsedRowRef {
  const trimmed = ref.trim().replace(/^\[|\]$/g, "");
  if (UUID_RE.test(trimmed)) return { kind: "uuid", id: trimmed.toLowerCase() };
  if (PREFIX_RE.test(trimmed)) return { kind: "prefix", prefix: trimmed.toLowerCase() };
  return {
    kind: "invalid",
    reason: `"${ref}" is not a row id — pass the [handle] shown at the start of a query_database line, or the full row id.`,
  };
}

export type RowRefMatch =
  | { id: string }
  | { ambiguous: string[] }
  | { missing: true }
  | { invalid: string };

/** Resolve one reference against a table's live ids (pure: ids supplied). */
export function matchRowRef(ref: string, liveIds: Iterable<string>): RowRefMatch {
  const parsed = parseRowRef(ref);
  if (parsed.kind === "invalid") return { invalid: parsed.reason };
  const matches: string[] = [];
  for (const id of liveIds) {
    if (parsed.kind === "uuid" ? id === parsed.id : id.startsWith(parsed.prefix)) {
      matches.push(id);
    }
  }
  if (matches.length === 1) return { id: matches[0] };
  if (matches.length > 1) return { ambiguous: matches };
  return { missing: true };
}

// ── Cell display ────────────────────────────────────────────────────────

/**
 * Display text for one cell, resolved through the hydrated read-model:
 * relations/contentLinks/files as linked titles, person as display name,
 * lookup/rollup as computed values, everything else via cellToText.
 * Moved here from server/export.ts (re-exported there) so the export and
 * the AI tool cannot drift apart. POST /api/flashcards/from-data uses it
 * too.
 */
export function cellDisplayValue(row: DataRow, column: DataColumn): string {
  switch (column.type) {
    case "relation":
      return (row.links?.[column.id] ?? [])
        .map((l) => (l.restricted ? "" : l.title))
        .filter(Boolean)
        .join("; ");
    case "contentLink":
    case "file":
      return (row.contentRefs?.[column.id] ?? [])
        .map((r) => (r.restricted ? "" : r.title))
        .filter(Boolean)
        .join("; ");
    case "person": {
      const ref = row.personRefs?.[column.id];
      return ref && !ref.restricted ? ref.name : "";
    }
    case "lookup":
    case "rollup": {
      const v = row.derived?.[column.id];
      return v === undefined ? "" : String(v);
    }
    default:
      return cellToText(column, row.data[column.key]);
  }
}

export type RelationMode = "titles" | "handles" | "counts";

export interface RenderOptions {
  relations: RelationMode;
  /** Clip non-relation cells at this many chars (null = never). */
  clipChars: number | null;
  /** Column ids exempt from clipping (named explicitly by the model). */
  fullColumns?: ReadonlySet<string>;
  /** Linked rows shown as titles before "+N more". Default 3; the index tier uses 1. */
  maxLinkedTitles?: number;
  /** Chars per linked title before "…". Default 60. */
  linkedTitleClip?: number;
}

const LINKED_TITLE_CLIP = 60;
const ELLIPSIS = "…";

export function clipText(text: string, max: number | null): string {
  if (max === null || text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)) + ELLIPSIS;
}

/** One cell as the model reads it. */
export function renderCell(row: DataRow, column: DataColumn, opts: RenderOptions): string {
  if (column.type === "relation") {
    const links = (row.links?.[column.id] ?? []).filter((l) => !l.restricted);
    if (links.length === 0) return "";
    if (opts.relations === "counts") return `${links.length} linked`;
    if (opts.relations === "handles") return links.map((l) => rowHandle(l.rowId)).join(",");
    const max = opts.maxLinkedTitles ?? 3;
    const titleClip = opts.linkedTitleClip ?? LINKED_TITLE_CLIP;
    const shown = links
      .slice(0, max)
      .map((l) => `${clipText(l.title, titleClip)} [${rowHandle(l.rowId)}]`);
    const more = links.length > max ? ` +${links.length - max} more` : "";
    return shown.join("; ") + more;
  }
  const text = cellDisplayValue(row, column);
  if (opts.fullColumns?.has(column.id)) return text;
  return clipText(text, opts.clipChars);
}

// ── Column selection ────────────────────────────────────────────────────

export function isBacklink(column: DataColumn): boolean {
  return column.type === "relation" && column.config.isBacklink === true;
}

/** Cell types that fit: short, structured, cheap. Never long text. */
export const INDEX_TIER_TYPES: ReadonlySet<DataColumnType> = new Set<DataColumnType>([
  "select",
  "status",
  "checkbox",
  "number",
  "autoNumber",
  "date",
  "createdAt",
  "updatedAt",
  "url",
  "email",
  "phone",
  "person",
  "lookup",
  "rollup",
]);

/** Types excluded from `"all"` (they carry ids, not words, or are derived-empty). */
const NEVER_BULK_TYPES: ReadonlySet<DataColumnType> = new Set<DataColumnType>([
  "file",
  "contentLink",
  "formula",
]);

/**
 * The index tier: primary, every INDEX_TIER_TYPES column, the first
 * non-primary text column, and every relation — mirrored halves INCLUDED
 * (prod smoke 2026-09-15: a child table sees its parent only through the
 * mirrored half when the pair was drawn from the parent's side; dropping
 * backlinks blanked every claim's experience). The doubling cost the
 * measurements flagged is a whole-graph concern, answered by
 * `relations: "counts"` here and by `expand` (PR 2), not by hiding a
 * column. No long text, no files.
 */
export function indexTierColumns(columns: DataColumn[]): DataColumn[] {
  const live = columns.filter((c) => !c.deletedAt);
  const out: DataColumn[] = [];
  const primary = live.find((c) => c.isPrimary) ?? live[0];
  if (primary) out.push(primary);
  let firstText: DataColumn | null = null;
  for (const c of live) {
    if (c === primary) continue;
    if (INDEX_TIER_TYPES.has(c.type)) out.push(c);
    else if (c.type === "text" && !firstText) firstText = c;
    else if (c.type === "relation") out.push(c);
  }
  if (firstText) out.splice(1, 0, firstText);
  return out;
}

/** `"all"`: every live column that carries words (no files/contentLinks/formulas), in position order. */
export function allBulkColumns(columns: DataColumn[]): DataColumn[] {
  return columns.filter((c) => !c.deletedAt && !NEVER_BULK_TYPES.has(c.type));
}

// ── Row formats ─────────────────────────────────────────────────────────

/** Above this many rows the result switches to header-once TSV. */
export const LABELLED_MAX_ROWS = 20;

export type RowFormatMode = "labelled" | "tsv";

export interface FormatRowsInput {
  rows: DataRow[];
  /** Columns to render, primary included or not (it is always the line's title). */
  columns: DataColumn[];
  /** The table's live columns (for the title). */
  live: DataColumn[];
  render: RenderOptions;
  mode?: "auto" | RowFormatMode;
  /** Extra text appended to each line (PR part B: the row digest). Keyed by row id. */
  suffixByRow?: ReadonlyMap<string, string>;
}

export interface FormatRowsResult {
  text: string;
  mode: RowFormatMode;
  rows: number;
  columns: number;
  tokens: number;
  /** Per-column token contribution, largest first — for the over-budget footer. */
  columnTokens: Array<{ name: string; tokens: number }>;
}

function tsvEscape(s: string): string {
  return s.replace(/\t/g, " ").replace(/\r?\n/g, "⏎");
}

function primaryOf(live: DataColumn[]): DataColumn | undefined {
  return live.find((c) => c.isPrimary && !c.deletedAt) ?? live.find((c) => !c.deletedAt);
}

/** One result, one format decision, one token estimate. */
export function formatRows(input: FormatRowsInput): FormatRowsResult {
  const primary = primaryOf(input.live);
  const cols = input.columns.filter((c) => c.id !== primary?.id);
  const mode: RowFormatMode =
    input.mode && input.mode !== "auto"
      ? input.mode
      : input.rows.length > LABELLED_MAX_ROWS
        ? "tsv"
        : "labelled";

  const perColumn = new Map<string, number>();
  const bump = (c: DataColumn, text: string) =>
    perColumn.set(c.name, (perColumn.get(c.name) ?? 0) + text.length);

  const lines: string[] = [];
  if (mode === "labelled") {
    for (const row of input.rows) {
      const title = deriveRowTitle(input.live, row.data);
      const rest = cols
        .map((c) => {
          const text = renderCell(row, c, input.render);
          if (!text) return null;
          bump(c, text);
          return `${c.name}: ${text}`;
        })
        .filter(Boolean)
        .join(" · ");
      const suffix = input.suffixByRow?.get(row.id);
      lines.push(
        `- [${rowHandle(row.id)}] ${title}${rest ? ` · ${rest}` : ""}${suffix ? ` · ≈ ${suffix}` : ""}`
      );
    }
  } else {
    const header = ["id", primary?.name ?? "Title", ...cols.map((c) => c.name)];
    if (input.suffixByRow) header.push("AI digest");
    lines.push(header.join("\t"));
    for (const row of input.rows) {
      const cells = [
        rowHandle(row.id),
        tsvEscape(deriveRowTitle(input.live, row.data)),
        ...cols.map((c) => {
          const text = tsvEscape(renderCell(row, c, input.render));
          bump(c, text);
          return text;
        }),
      ];
      if (input.suffixByRow) cells.push(tsvEscape(input.suffixByRow.get(row.id) ?? ""));
      lines.push(cells.join("\t"));
    }
  }
  const text = lines.join("\n");
  const columnTokens = [...perColumn.entries()]
    .map(([name, chars]) => ({ name, tokens: estimateTokens(" ".repeat(chars)) }))
    .sort((a, b) => b.tokens - a.tokens);
  return {
    text,
    mode,
    rows: input.rows.length,
    columns: cols.length + 1,
    tokens: estimateTokens(text),
    columnTokens,
  };
}

// ── Group-by ────────────────────────────────────────────────────────────

export const GROUPABLE_TYPES: ReadonlySet<DataColumnType> = new Set<DataColumnType>([
  "select",
  "status",
  "checkbox",
  "multiSelect",
  "relation",
  "person",
]);

/** `Evidence strength — Documented 8 · Partially documented 45 · (empty) 0 — 99 rows.` */
export function groupCountsLine(rows: DataRow[], column: DataColumn): string {
  const counts = new Map<string, number>();
  let empty = 0;
  for (const row of rows) {
    let values: string[];
    if (column.type === "relation") {
      values = (row.links?.[column.id] ?? []).filter((l) => !l.restricted).map((l) => l.title);
    } else if (column.type === "multiSelect") {
      values = cellDisplayValue(row, column).split(", ").filter(Boolean);
    } else {
      const v = cellDisplayValue(row, column);
      values = v ? [v] : [];
    }
    // Count each ROW once per distinct value: a cell that opted into
    // duplicates (config.allowDuplicates) would otherwise report one row as
    // two under the same heading.
    values = [...new Set(values)];
    if (values.length === 0) {
      empty++;
      continue;
    }
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const parts = ordered.map(([label, n]) => `${label} ${n}`);
  parts.push(`(empty) ${empty}`);
  return `${column.name} — ${parts.join(" · ")} — ${rows.length} row${rows.length === 1 ? "" : "s"}.`;
}

// ── Column profiles (describe_database) ─────────────────────────────────

export interface ColumnProfile {
  name: string;
  type: DataColumnType;
  filled: number;
  total: number;
  /** text-likes, lookup/rollup: average chars per filled cell */
  avgChars?: number;
  /** text-likes and relations-as-titles: tokens to read the column across the table */
  tokens?: number;
  /** select/status/multiSelect/checkbox: label → count */
  counts?: Array<[string, number]>;
  /** number / date: min and max as display text */
  min?: string;
  max?: string;
  /** relation: average links per linked row */
  avgLinks?: number;
}

const TEXTUAL_TYPES: ReadonlySet<DataColumnType> = new Set<DataColumnType>([
  "text",
  "longText",
  "url",
  "email",
  "phone",
  "lookup",
  "rollup",
]);
const CATEGORICAL_TYPES: ReadonlySet<DataColumnType> = new Set<DataColumnType>([
  "select",
  "status",
  "multiSelect",
  "checkbox",
]);
const RANGE_TYPES: ReadonlySet<DataColumnType> = new Set<DataColumnType>([
  "number",
  "autoNumber",
  "date",
  "createdAt",
  "updatedAt",
]);

export function columnProfile(rows: DataRow[], column: DataColumn): ColumnProfile {
  const p: ColumnProfile = { name: column.name, type: column.type, filled: 0, total: rows.length };
  if (column.type === "relation") {
    let links = 0;
    let chars = 0;
    for (const row of rows) {
      const ls = (row.links?.[column.id] ?? []).filter((l) => !l.restricted);
      if (ls.length === 0) continue;
      p.filled++;
      links += ls.length;
      chars += ls.reduce((n, l) => n + l.title.length + HANDLE_LENGTH + 3, 0);
    }
    p.avgLinks = p.filled ? Math.round((links / p.filled) * 10) / 10 : 0;
    p.tokens = estimateTokens(" ".repeat(chars));
    return p;
  }
  if (CATEGORICAL_TYPES.has(column.type)) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const v = cellDisplayValue(row, column);
      if (!v) continue;
      p.filled++;
      const values =
        column.type === "multiSelect"
          ? [...new Set(v.split(", "))]
          : [v];
      for (const x of values) counts.set(x, (counts.get(x) ?? 0) + 1);
    }
    // Declared option order first (the vocabulary), then anything else seen.
    const declared = (column.config.options ?? []).map((o) => o.label);
    const ordered: Array<[string, number]> = [];
    for (const label of declared) if (counts.has(label)) ordered.push([label, counts.get(label)!]);
    for (const [label, n] of counts) if (!declared.includes(label)) ordered.push([label, n]);
    p.counts = ordered;
    return p;
  }
  if (RANGE_TYPES.has(column.type)) {
    let min: string | number | null = null;
    let max: string | number | null = null;
    const isDate = column.type === "date" || column.type === "createdAt" || column.type === "updatedAt";
    for (const row of rows) {
      const raw = row.data[column.key];
      if (raw === undefined || raw === "") continue;
      p.filled++;
      const v = isDate ? String(raw) : Number(raw);
      if (isDate ? typeof v !== "string" : Number.isNaN(v as number)) continue;
      if (min === null || v < min) min = v;
      if (max === null || v > max) max = v;
    }
    const show = (v: string | number | null) =>
      v === null ? "" : isDate ? String(v).slice(0, 7) : Number(v).toLocaleString("en-US");
    p.min = show(min);
    p.max = show(max);
    return p;
  }
  // Textual and everything else: fill + size.
  let chars = 0;
  for (const row of rows) {
    const v = cellDisplayValue(row, column);
    if (!v) continue;
    p.filled++;
    chars += v.length;
  }
  if (TEXTUAL_TYPES.has(column.type)) {
    p.avgChars = p.filled ? Math.round(chars / p.filled) : 0;
    p.tokens = estimateTokens(" ".repeat(chars));
  }
  return p;
}

function kTokens(n: number): string {
  return n >= 1000 ? `~${(n / 1000).toFixed(1)}k tokens` : `~${n} tokens`;
}

/** The clause appended to a column's digest line. */
export function profileClause(p: ColumnProfile): string {
  const fill = `filled ${p.filled}/${p.total}`;
  if (p.counts) {
    const empty = p.total - p.filled;
    const parts = p.counts.map(([l, n]) => `${l} ${n}`);
    parts.push(`empty ${empty}`);
    return parts.join(" · ");
  }
  if (p.min !== undefined) {
    return p.filled === 0 ? fill : `${p.min} … ${p.max} · ${fill}`;
  }
  if (p.avgLinks !== undefined) {
    return `${p.filled}/${p.total} linked · avg ${p.avgLinks} · ${kTokens(p.tokens ?? 0)} as titles`;
  }
  if (p.avgChars !== undefined) {
    return `${fill} · avg ${p.avgChars} chars · ${kTokens(p.tokens ?? 0)} to read`;
  }
  return fill;
}

// ── Result header (the durable transcript line) ─────────────────────────

export type ReadLifetime = "turn" | "run" | "chat";
export const READ_LIFETIMES: readonly ReadLifetime[] = ["turn", "run", "chat"];

export interface ReadHeaderInput {
  table: string;
  rows: number;
  total: number;
  columns: number;
  tokens: number;
  lifetime: ReadLifetime;
  /** Why this lifetime applied: "charter" (D8/D9), "requested", or default. */
  lifetimeOrigin?: "charter" | "requested" | "default";
  mode: RowFormatMode | "groupBy" | "index";
  budgetTokens?: number;
  approved?: boolean;
}

/**
 * First line of every query_database result. Machine-readable (the fold
 * and the chip parse it with `parseReadHeader`) and human-readable (it is
 * the durable trace in the transcript).
 */
export function readHeaderLine(h: ReadHeaderInput): string {
  const parts = [
    `query_database "${h.table}"`,
    `${h.rows} of ${h.total} row${h.total === 1 ? "" : "s"}`,
    `${h.columns} column${h.columns === 1 ? "" : "s"}`,
    kTokens(h.tokens),
    `lifetime: ${h.lifetime}${h.lifetimeOrigin === "charter" ? " (charter)" : h.lifetimeOrigin === "requested" ? " (requested)" : ""}`,
  ];
  if (h.budgetTokens !== undefined) {
    parts.push(`budget ${h.budgetTokens.toLocaleString("en-US")}${h.approved ? " (approved)" : ""}`);
  }
  if (h.mode === "groupBy") parts.push("group counts");
  if (h.mode === "index") parts.push("index tier");
  return parts.join(" · ");
}

export interface ParsedReadHeader {
  table: string;
  rows: number;
  total: number;
  tokens: number;
  lifetime: ReadLifetime;
  lifetimeOrigin: "charter" | "requested" | "default";
}

const HEADER_RE =
  /^query_database "(.+?)" · (\d+) of (\d+) rows? · \d+ columns? · ~([\d.]+)(k?) tokens · lifetime: (turn|run|chat)(?: \((charter|requested)\))?/;

export function parseReadHeader(text: string): ParsedReadHeader | null {
  const first = text.split("\n", 1)[0] ?? "";
  const m = HEADER_RE.exec(first);
  if (!m) return null;
  const n = Number(m[4]) * (m[5] === "k" ? 1000 : 1);
  return {
    table: m[1],
    rows: Number(m[2]),
    total: Number(m[3]),
    tokens: Math.round(n),
    lifetime: m[6] as ReadLifetime,
    lifetimeOrigin: (m[7] as "charter" | "requested" | undefined) ?? "default",
  };
}

// ── Over-budget footer ──────────────────────────────────────────────────

export function overBudgetFooter(input: {
  fullTokens: number;
  rows: number;
  columns: number;
  largest: Array<{ name: string; tokens: number }>;
  budget: number;
  threshold: number;
}): string {
  const largest = input.largest
    .slice(0, 2)
    .map((c) => `${c.name} ${kTokens(c.tokens)}`)
    .join(", ");
  const ask = Math.ceil(input.fullTokens / 100) * 100;
  const approval =
    ask > input.threshold ? " — the user will be asked to approve" : "";
  return (
    `Full read: ${kTokens(input.fullTokens)} (${input.rows} rows × ${input.columns} columns` +
    `${largest ? `; largest: ${largest}` : ""}) exceeds the budget of ${input.budget.toLocaleString("en-US")}. ` +
    `Call again with budget: ${ask} to read it${approval}. ` +
    `Cheaper: name only the columns you need, relations: "counts", rowIds for the rows that matter, or search.`
  );
}
