/**
 * Database content type — the canonical TypeScript contract.
 *
 * These types are the app-layer truth for the `data` content type. They
 * deliberately mirror, but do not import from, the Prisma client: the domain
 * layer stays importable from `"use client"` modules (CLAUDE.md forbids Prisma
 * in client components), and the pure logic below is testable without a
 * database.
 *
 * Plan: docs/notes-feature/work-tracking/DATABASE-CONTENT-TYPE-PLAN.md (B8c)
 */

// ── Column types ─────────────────────────────────────────────────────────
//
// Declared exhaustively (plan D11): several ship with no implementation so
// that adding them later is never a Postgres enum migration.

export const DATA_COLUMN_TYPES = [
  "text",
  "longText",
  "number",
  "checkbox",
  "date",
  "select",
  "multiSelect",
  "status",
  "person",
  "relation",
  "contentLink",
  "file",
  "url",
  "email",
  "phone",
  "autoNumber",
  "formula",
  "rollup",
  "lookup",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
] as const;

export type DataColumnType = (typeof DATA_COLUMN_TYPES)[number];

/**
 * Types a user can pick in Phase 1a. The rest are declared in the enum but
 * not offered — the type picker reads THIS list, never `DATA_COLUMN_TYPES`.
 */
export const IMPLEMENTED_COLUMN_TYPES: readonly DataColumnType[] = [
  "text",
  "longText",
  "number",
  "checkbox",
  "date",
  "select",
  "multiSelect",
  "status",
  "url",
  "email",
  "relation",
];

/**
 * Types that store nothing in `DataRow.data` — either because the value lives
 * elsewhere (`relation` → DataRowLink) or because it is derived at read time.
 * Writing a cell for one of these is a bug, not a no-op, so the encoder
 * rejects it rather than silently dropping it.
 */
export const NON_STORING_COLUMN_TYPES: readonly DataColumnType[] = [
  "relation",
  "formula",
  "rollup",
  "lookup",
  "autoNumber",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
];

/** Types a form view can collect. Everything non-storing is unfillable. */
export const FORM_ELIGIBLE_COLUMN_TYPES: readonly DataColumnType[] =
  DATA_COLUMN_TYPES.filter(
    (t) => !NON_STORING_COLUMN_TYPES.includes(t) && t !== "file"
  );

// ── Select options ───────────────────────────────────────────────────────

/** Grouping for `status` columns — what makes a board's columns ordered. */
export type StatusGroup = "todo" | "active" | "done";

export interface SelectOption {
  /** Stable opaque id. The cell stores THIS, never the label (plan D3). */
  id: string;
  label: string;
  /** Design-token intent name, resolved by the renderer. */
  color?: string;
  /** `status` columns only; ignored on `select` / `multiSelect`. */
  group?: StatusGroup;
}

// ── Column config ────────────────────────────────────────────────────────

export interface DataColumnConfig {
  /** `select` · `multiSelect` · `status` */
  options?: SelectOption[];
  /** `number` — decimal places; 0 renders as an integer. */
  precision?: number;
  /** `number` — rendering hint, not storage. */
  numberFormat?: "plain" | "currency" | "percent";
  /** `date` — whether the time component is meaningful. */
  includeTime?: boolean;
  /** `relation` — the DataPayload.contentId this column points at. */
  relationTableId?: string;
  /** `relation` — the column id on the far side that mirrors this one. */
  symmetricColumnId?: string;
}

export interface DataColumn {
  id: string;
  /** Opaque, immutable, ≤16 chars. The key inside `DataRow.data`. */
  key: string;
  name: string;
  type: DataColumnType;
  position: string;
  isPrimary: boolean;
  config: DataColumnConfig;
  /** AI-facing help (plan D9). Form views override it per-view. */
  description: string | null;
  deletedAt?: string | null;
}

// ── Cells ────────────────────────────────────────────────────────────────

/**
 * Everything a cell may hold, once encoded. JSON-native throughout so that
 * `->>` casts cheaply and JSONB ordering matches display ordering.
 *
 * `undefined` is not a member: an empty cell has NO KEY (plan B8c). "Never
 * set" and "explicitly cleared" collapse into one state deliberately — it
 * removes a class of three-valued-logic bugs from filters, and no product
 * surface distinguishes them.
 */
export type CellValue = string | number | boolean | string[];

/** A row's cells, keyed by `DataColumn.key`. Absent key = empty. */
export type RowData = Record<string, CellValue>;

/**
 * One hydrated relation target (plan Phase 4). `restricted` is the V1-3
 * redaction: a link whose target table the viewer cannot read shows a
 * placeholder, NEVER the row's title — the existence of a private row must
 * not leak through a relation someone else drew to it.
 */
export interface RelationLinkRef {
  linkId: string;
  rowId: string;
  title: string;
  restricted: boolean;
}

export interface DataRow {
  id: string;
  tableId: string;
  sortKey: string;
  data: RowData;
  /**
   * Relation cells, hydrated server-side and keyed by COLUMN ID. Links live
   * only in DataRowLink (plan D4) — never mirrored into `data` — so this is
   * a read-model attachment, not stored cell state.
   */
  links?: Record<string, RelationLinkRef[]>;
  /** Non-null once the row has been promoted to a ContentNode (plan D2). */
  contentId: string | null;
  /**
   * Query-mode only: the underlying node's content type, so opening the
   * "row" opens the REAL note/file rather than a row page.
   */
  nodeContentType?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Filters ──────────────────────────────────────────────────────────────
//
// One recursive shape with TWO consumers that must agree — the view layer and
// the `query_database` AI tool (Phase 6). Divergence here is a silent
// correctness bug, which is why the operator list is closed and validated
// rather than free-form.

export const FILTER_OPERATORS = [
  "isEmpty",
  "isNotEmpty",
  "is",
  "isNot",
  "contains",
  "notContains",
  "startsWith",
  "gt",
  "gte",
  "lt",
  "lte",
  "hasAny",
  "hasAll",
  "hasNone",
  "isWithin",
] as const;

export type FilterOperator = (typeof FILTER_OPERATORS)[number];

/** Relative date windows for `isWithin`. Resolved server-side, never cached. */
export type RelativeDateWindow =
  | "today"
  | "yesterday"
  | "last7Days"
  | "last30Days"
  | "thisMonth"
  | "thisYear";

export interface FilterCondition {
  columnId: string;
  operator: FilterOperator;
  /** Omitted for `isEmpty` / `isNotEmpty`. */
  value?: CellValue | RelativeDateWindow;
}

export interface FilterGroup {
  op: "and" | "or";
  children: FilterNode[];
}

export type FilterNode = FilterGroup | FilterCondition;

export function isFilterGroup(node: FilterNode): node is FilterGroup {
  return "op" in node && "children" in node;
}

/** An empty group means "no filter" — the read path skips it entirely. */
export const EMPTY_FILTER: FilterGroup = { op: "and", children: [] };

// ── Sorts ────────────────────────────────────────────────────────────────

export interface DataSort {
  columnId: string;
  direction: "asc" | "desc";
}

// ── Views ────────────────────────────────────────────────────────────────

export const DATA_VIEW_MODES = [
  "grid",
  "board",
  "gallery",
  "list",
  "split",
  "form",
] as const;

export type DataViewMode = (typeof DATA_VIEW_MODES)[number];

/** Airtable's three-state model (plan O14). */
export type DataViewAccess = "collaborative" | "personal" | "locked";

export interface ColumnPref {
  hidden?: boolean;
  width?: number;
  /** Overrides the column's own position within this view only. */
  position?: string;
}

/** Per-field overrides for a form view (plan O15) — view-scoped, not column. */
export interface FormFieldConfig {
  label?: string;
  help?: string;
  required?: boolean;
  hidden?: boolean;
  placeholder?: string;
}

export interface DataViewConfig {
  /** `form` only. Keyed by column id. */
  fields?: Record<string, FormFieldConfig>;
  /** `form` only. */
  formTitle?: string;
  formDescription?: string;
  submitLabel?: string;
  confirmationMessage?: string;
  /** `gallery` — which column supplies the cover; falls back per B8b. */
  coverColumnId?: string;
  cardSize?: "small" | "medium" | "large";
  /** `grid` — affects row height only, never stored data. */
  rowHeight?: "short" | "medium" | "tall";
}

export interface DataView {
  id: string;
  tableId: string;
  ownerId: string;
  name: string;
  mode: DataViewMode;
  access: DataViewAccess;
  section: string | null;
  filters: FilterNode;
  sorts: DataSort[];
  groupByColumnId: string | null;
  columnPrefs: Record<string, ColumnPref>;
  config: DataViewConfig;
  position: string;
}

// ── Table ────────────────────────────────────────────────────────────────

export type DataTableMode = "inline" | "external" | "query";

/**
 * The saved query behind a `mode: "query"` table (plan Phase 3).
 *
 * A query table owns nothing — it is a saved search rendered as a table.
 * Rows ARE the matching ContentNodes; nothing is copied, so tagging a new
 * note makes it appear and deleting the table harms no note. Kept
 * deliberately small in v1: tags are ALL-of (matching the tag-filter
 * semantics of search), types are ANY-of.
 */
export interface ContentQuery {
  /** Tag slugs the node must carry ALL of. */
  tags: string[];
  /** Content types to include (ANY of). Empty = notes only. */
  contentTypes: string[];
}

export const DEFAULT_CONTENT_QUERY: ContentQuery = {
  tags: [],
  contentTypes: ["note"],
};

export interface DataTable {
  contentId: string;
  title: string;
  mode: DataTableMode;
  /** Present when mode === "query" — the saved query the table renders. */
  query?: ContentQuery;
  description: string | null;
  defaultViewId: string | null;
  rowCount: number;
  columns: DataColumn[];
  views: DataView[];
}

// ── Pagination ───────────────────────────────────────────────────────────

/**
 * Cursor-based on `(sortKey, id)`, never offset: offset pagination skips and
 * duplicates rows under concurrent insertion, which is exactly what a shared
 * table has (plan B8d).
 */
export interface RowPageCursor {
  sortKey: string;
  id: string;
}

export interface RowPage {
  rows: DataRow[];
  nextCursor: RowPageCursor | null;
  /** Total matching the current filter — for the header, not for paging. */
  total: number;
}

export const DEFAULT_ROW_PAGE_SIZE = 100;
