/**
 * Cell encoding, validation, and derived text.
 *
 * The rules here are the ones that keep JSONB queryable (plan B8c):
 *
 *  - JSON-native types throughout, so `->>` casts cheaply and JSONB ordering
 *    matches display ordering. Numbers are numbers, never numeric strings.
 *  - Dates are ISO-8601, because lexical sort IS chronological sort.
 *  - Selects store option IDS, never labels — so renaming an option touches
 *    zero rows (plan D3).
 *  - Empty DELETES the key rather than writing null. "Never set" and
 *    "explicitly cleared" collapse into one state on purpose.
 *  - Type violations are REJECTED, never coerced-and-stored. A `number`
 *    column holding "abc" would poison every sort, filter and rollup
 *    downstream of it, and the damage outlives the bad keystroke.
 *
 * Pure — no Prisma, no I/O. Safe to import from client components.
 */

import {
  NON_STORING_COLUMN_TYPES,
  type CellValue,
  type DataColumn,
  type RowData,
} from "./types";

// ── Result type ──────────────────────────────────────────────────────────

export type EncodeResult =
  | { ok: true; /** `undefined` means "delete the key" */ value: CellValue | undefined }
  | { ok: false; error: string };

const ok = (value: CellValue | undefined): EncodeResult => ({ ok: true, value });
const fail = (error: string): EncodeResult => ({ ok: false, error });

/**
 * Explicit guard rather than relying on `!result.ok` to narrow the union.
 * This project compiles with `strict: false`, where discriminated-union
 * narrowing on boolean literals is not dependable — the guard is.
 */
export function isEncodeError(
  result: EncodeResult
): result is { ok: false; error: string } {
  return result.ok === false;
}

// ── Emptiness ────────────────────────────────────────────────────────────

/**
 * What counts as empty on the way in. Note `false` and `0` are NOT empty —
 * an unchecked checkbox and a zero are real values a user chose.
 */
function isEmptyInput(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  if (typeof raw === "string" && raw.trim() === "") return true;
  if (Array.isArray(raw) && raw.length === 0) return true;
  return false;
}

// ── Date handling ────────────────────────────────────────────────────────

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Accept what a date input or a paste realistically produces, emit ISO-8601.
 * Date-only strings stay date-only — widening "2026-03-08" to midnight UTC
 * invents a timezone the user never specified, and then it renders as the
 * 7th for anyone west of Greenwich.
 */
function encodeDate(raw: unknown, includeTime: boolean): EncodeResult {
  if (typeof raw === "number") {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return fail("Not a valid date");
    return ok(includeTime ? d.toISOString() : d.toISOString().slice(0, 10));
  }
  if (typeof raw !== "string") return fail("Expected a date");

  const trimmed = raw.trim();
  if (!includeTime && ISO_DATE_ONLY.test(trimmed)) return ok(trimmed);

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return fail(`"${trimmed}" is not a date`);
  return ok(
    includeTime ? parsed.toISOString() : parsed.toISOString().slice(0, 10)
  );
}

// ── Number handling ──────────────────────────────────────────────────────

function encodeNumber(raw: unknown, precision?: number): EncodeResult {
  let n: number;
  if (typeof raw === "number") {
    n = raw;
  } else if (typeof raw === "string") {
    // Lossless coercion only: strip grouping separators and currency-ish
    // decoration a paste may carry, then require the remainder to be numeric.
    const cleaned = raw.replace(/[,\s$£€]/g, "");
    if (cleaned === "" || !/^-?\d*\.?\d+$/.test(cleaned)) {
      return fail(`"${raw}" is not a number`);
    }
    n = Number(cleaned);
  } else {
    return fail("Expected a number");
  }

  if (!Number.isFinite(n)) return fail("Not a finite number");
  if (precision !== undefined && precision >= 0) {
    const factor = 10 ** precision;
    n = Math.round(n * factor) / factor;
  }
  return ok(n);
}

// ── Option handling ──────────────────────────────────────────────────────

function encodeOptionId(raw: unknown, column: DataColumn): EncodeResult {
  if (typeof raw !== "string") return fail("Expected an option");
  const options = column.config.options ?? [];
  if (!options.some((o) => o.id === raw)) {
    // Guarding here is what makes "the cell stores ids" true rather than
    // aspirational — a label sneaking in would render fine and filter wrong.
    return fail("Unknown option for this column");
  }
  return ok(raw);
}

function encodeOptionIds(raw: unknown, column: DataColumn): EncodeResult {
  if (!Array.isArray(raw)) return fail("Expected a list of options");
  const options = column.config.options ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") return fail("Expected option ids");
    if (!options.some((o) => o.id === entry)) {
      return fail("Unknown option for this column");
    }
    // Order is significant (it is the display order), but duplicates are not.
    if (!seen.has(entry)) {
      seen.add(entry);
      out.push(entry);
    }
  }
  return out.length === 0 ? ok(undefined) : ok(out);
}

// ── Simple validators ────────────────────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function encodeUrl(raw: unknown): EncodeResult {
  if (typeof raw !== "string") return fail("Expected a URL");
  const trimmed = raw.trim();
  // Bare domains are what people actually type; upgrade rather than reject.
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return fail("Only http and https links are allowed");
    }
    return ok(parsed.toString());
  } catch {
    return fail(`"${trimmed}" is not a valid URL`);
  }
}

function encodeStringIdList(raw: unknown): EncodeResult {
  if (!Array.isArray(raw)) return fail("Expected a list");
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || entry.trim() === "") {
      return fail("Expected a list of ids");
    }
    out.push(entry);
  }
  return out.length === 0 ? ok(undefined) : ok(out);
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Encode one user-supplied value for storage.
 *
 * `{ ok: true, value: undefined }` means DELETE THE KEY — callers must
 * distinguish that from a stored value, not treat it as a falsy write.
 */
export function encodeCell(column: DataColumn, raw: unknown): EncodeResult {
  if (NON_STORING_COLUMN_TYPES.includes(column.type)) {
    // Not a silent no-op: writing here means a caller misunderstands where
    // this column's value lives, and swallowing it hides the bug.
    return fail(`"${column.name}" is computed and cannot be written directly`);
  }

  if (isEmptyInput(raw)) return ok(undefined);

  switch (column.type) {
    case "text":
    case "longText":
      return typeof raw === "string" ? ok(raw) : fail("Expected text");

    case "number":
      return encodeNumber(raw, column.config.precision);

    case "checkbox":
      if (typeof raw === "boolean") return ok(raw);
      if (raw === "true") return ok(true);
      if (raw === "false") return ok(false);
      return fail("Expected true or false");

    case "date":
      return encodeDate(raw, column.config.includeTime ?? false);

    case "select":
    case "status":
      return encodeOptionId(raw, column);

    case "multiSelect":
      return encodeOptionIds(raw, column);

    case "url":
      return encodeUrl(raw);

    case "email": {
      if (typeof raw !== "string") return fail("Expected an email address");
      const trimmed = raw.trim();
      return EMAIL.test(trimmed) ? ok(trimmed) : fail(`"${trimmed}" is not an email address`);
    }

    case "phone":
      return typeof raw === "string" ? ok(raw.trim()) : fail("Expected a phone number");

    case "person":
      return typeof raw === "string" ? ok(raw) : fail("Expected a person");

    case "contentLink":
    case "file":
      return encodeStringIdList(raw);

    default:
      return fail(`Unsupported column type "${column.type}"`);
  }
}

/**
 * Apply an encoded value to a row, honouring empty-is-absent.
 * Returns a NEW object — callers diff against the original for undo.
 */
export function applyCell(
  data: RowData,
  key: string,
  value: CellValue | undefined
): RowData {
  const next: RowData = { ...data };
  if (value === undefined) {
    delete next[key];
  } else {
    next[key] = value;
  }
  return next;
}

/**
 * Canonical JSON for comparison — object keys sorted, array order preserved.
 *
 * This is what undo's compare-and-swap compares (plan B4.1). Array order is
 * deliberately significant: reordering a multiSelect IS a change, because the
 * order is what the user sees.
 */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** True when two cell values are equivalent for CAS purposes. */
export function cellsEqual(a: unknown, b: unknown): boolean {
  return canonicalize(a) === canonicalize(b);
}

/**
 * Human-readable text for one cell — the shared basis for search indexing,
 * CSV export, and the AI schema digest, so those three can never disagree.
 */
export function cellToText(column: DataColumn, value: CellValue | undefined): string {
  if (value === undefined) return "";
  switch (column.type) {
    case "select":
    case "status": {
      const opt = column.config.options?.find((o) => o.id === value);
      return opt?.label ?? "";
    }
    case "multiSelect": {
      if (!Array.isArray(value)) return "";
      return value
        .map((id) => column.config.options?.find((o) => o.id === id)?.label ?? "")
        .filter(Boolean)
        .join(", ");
    }
    case "checkbox":
      return value ? "yes" : "no";
    // Ids are not words. Indexing them would match a UUID paste and nothing
    // a person would ever type.
    case "person":
    case "contentLink":
    case "file":
      return "";
    default:
      return Array.isArray(value) ? value.join(" ") : String(value);
  }
}

/**
 * The row's contribution to search (plan B2). Text-ish columns only, so a
 * search for "kent" finds the row without a date or a rating matching by
 * accident.
 */
export function deriveRowSearchText(
  columns: DataColumn[],
  data: RowData
): string {
  const parts: string[] = [];
  for (const column of columns) {
    if (column.deletedAt) continue;
    const text = cellToText(column, data[column.key]);
    if (text) parts.push(text);
  }
  return parts.join(" ").slice(0, 8000).toLowerCase();
}

/** The table's contribution to search — its own name plus its schema. */
export function deriveTableSearchText(
  title: string,
  columns: DataColumn[]
): string {
  return [title, ...columns.filter((c) => !c.deletedAt).map((c) => c.name)]
    .join(" ")
    .slice(0, 2000)
    .toLowerCase();
}

/** The value shown in the tree, tabs, and breadcrumbs for a promoted row. */
export function deriveRowTitle(columns: DataColumn[], data: RowData): string {
  const primary = columns.find((c) => c.isPrimary && !c.deletedAt);
  if (!primary) return "Untitled";
  const text = cellToText(primary, data[primary.key]).trim();
  return text || "Untitled";
}
