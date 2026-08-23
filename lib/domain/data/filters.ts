/**
 * Filter tree — validation and in-memory evaluation.
 *
 * This shape has TWO consumers that must agree: the view layer and the
 * `query_database` AI tool (plan Phase 6). If they drift, filters silently
 * return the wrong rows — no error, no crash, just a table that quietly lies.
 * So the operator set is closed, validated per column type, and evaluated by
 * exactly one function that both callers share.
 *
 * Pure — no Prisma, no I/O. Safe to import from client components.
 */

import { cellToText } from "./cells";
import {
  isFilterGroup,
  type CellValue,
  type DataColumn,
  type FilterCondition,
  type FilterNode,
  type FilterOperator,
  type RelativeDateWindow,
  type RowData,
} from "./types";

// ── Which operators are legal on which type ──────────────────────────────

const UNIVERSAL: FilterOperator[] = ["isEmpty", "isNotEmpty"];
const EQUALITY: FilterOperator[] = ["is", "isNot"];
const TEXTUAL: FilterOperator[] = ["contains", "notContains", "startsWith"];
const ORDINAL: FilterOperator[] = ["gt", "gte", "lt", "lte"];
const SET: FilterOperator[] = ["hasAny", "hasAll", "hasNone"];

const OPERATORS_BY_TYPE: Partial<Record<DataColumn["type"], FilterOperator[]>> = {
  text: [...UNIVERSAL, ...EQUALITY, ...TEXTUAL],
  longText: [...UNIVERSAL, ...TEXTUAL],
  url: [...UNIVERSAL, ...EQUALITY, ...TEXTUAL],
  email: [...UNIVERSAL, ...EQUALITY, ...TEXTUAL],
  phone: [...UNIVERSAL, ...EQUALITY, ...TEXTUAL],
  number: [...UNIVERSAL, ...EQUALITY, ...ORDINAL],
  autoNumber: [...UNIVERSAL, ...EQUALITY, ...ORDINAL],
  checkbox: EQUALITY,
  date: [...UNIVERSAL, ...EQUALITY, ...ORDINAL, "isWithin"],
  createdAt: [...UNIVERSAL, ...ORDINAL, "isWithin"],
  updatedAt: [...UNIVERSAL, ...ORDINAL, "isWithin"],
  select: [...UNIVERSAL, ...EQUALITY],
  status: [...UNIVERSAL, ...EQUALITY],
  multiSelect: [...UNIVERSAL, ...SET],
  person: [...UNIVERSAL, ...EQUALITY],
  contentLink: [...UNIVERSAL, ...SET],
  file: UNIVERSAL,
  relation: [...UNIVERSAL, ...SET],
};

export function operatorsForType(type: DataColumn["type"]): FilterOperator[] {
  return OPERATORS_BY_TYPE[type] ?? UNIVERSAL;
}

// ── Validation ───────────────────────────────────────────────────────────

export interface FilterValidationError {
  path: string;
  message: string;
}

/**
 * Reject unknown columns and illegal operators at the API boundary rather
 * than ignoring them. An ignored filter clause returns MORE rows than the
 * user asked for, which is the failure direction that leaks data.
 */
export function validateFilter(
  node: FilterNode,
  columns: DataColumn[],
  path = "filters"
): FilterValidationError[] {
  const errors: FilterValidationError[] = [];

  if (isFilterGroup(node)) {
    if (node.op !== "and" && node.op !== "or") {
      errors.push({ path, message: `Unknown group operator "${node.op}"` });
    }
    if (!Array.isArray(node.children)) {
      errors.push({ path, message: "Group children must be a list" });
      return errors;
    }
    node.children.forEach((child, i) => {
      errors.push(...validateFilter(child, columns, `${path}.children[${i}]`));
    });
    return errors;
  }

  const column = columns.find((c) => c.id === node.columnId && !c.deletedAt);
  if (!column) {
    errors.push({ path, message: `Unknown column "${node.columnId}"` });
    return errors;
  }

  const legal = operatorsForType(column.type);
  if (!legal.includes(node.operator)) {
    errors.push({
      path,
      message: `Operator "${node.operator}" is not valid on a ${column.type} column`,
    });
  }

  const needsValue = node.operator !== "isEmpty" && node.operator !== "isNotEmpty";
  if (needsValue && node.value === undefined) {
    errors.push({ path, message: `Operator "${node.operator}" requires a value` });
  }

  return errors;
}

// ── Relative date windows ────────────────────────────────────────────────

/**
 * Resolved against a caller-supplied `now` rather than `Date.now()` so the
 * evaluator stays pure and testable — and so a server-side query and a
 * client-side preview of the same filter agree on where "today" starts.
 */
export function resolveDateWindow(
  window: RelativeDateWindow,
  now: Date
): { from: Date; to: Date } {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  switch (window) {
    case "today":
      return { from: startOfDay, to: endOfDay };
    case "yesterday": {
      const from = new Date(startOfDay);
      from.setDate(from.getDate() - 1);
      return { from, to: startOfDay };
    }
    case "last7Days": {
      const from = new Date(startOfDay);
      from.setDate(from.getDate() - 7);
      return { from, to: endOfDay };
    }
    case "last30Days": {
      const from = new Date(startOfDay);
      from.setDate(from.getDate() - 30);
      return { from, to: endOfDay };
    }
    case "thisMonth": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { from, to };
    }
    case "thisYear": {
      const from = new Date(now.getFullYear(), 0, 1);
      const to = new Date(now.getFullYear() + 1, 0, 1);
      return { from, to };
    }
  }
}

// ── Evaluation ───────────────────────────────────────────────────────────

function asArray(value: CellValue | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [String(value)];
}

function compareOrdinal(
  cell: CellValue,
  target: unknown
): number | null {
  if (typeof cell === "number") {
    const n = typeof target === "number" ? target : Number(target);
    return Number.isFinite(n) ? cell - n : null;
  }
  if (typeof cell === "string" && typeof target === "string") {
    // ISO-8601 dates compare correctly as strings — that is why they are
    // stored that way (plan B8c).
    return cell < target ? -1 : cell > target ? 1 : 0;
  }
  return null;
}

function evaluateCondition(
  condition: FilterCondition,
  column: DataColumn,
  data: RowData,
  now: Date
): boolean {
  const cell = data[column.key];
  const empty = cell === undefined;

  switch (condition.operator) {
    case "isEmpty":
      return empty;
    case "isNotEmpty":
      return !empty;
  }

  // Every remaining operator is a positive assertion about a value, so an
  // empty cell fails it — EXCEPT `isNot` and `notContains`, where "no value"
  // genuinely is "not that value". Getting this backwards is the classic
  // three-valued-logic bug.
  if (empty) {
    return condition.operator === "isNot" || condition.operator === "notContains";
  }

  switch (condition.operator) {
    case "is":
      if (column.type === "checkbox") return cell === condition.value;
      return String(cell) === String(condition.value);
    case "isNot":
      if (column.type === "checkbox") return cell !== condition.value;
      return String(cell) !== String(condition.value);

    case "contains":
      return cellToText(column, cell)
        .toLowerCase()
        .includes(String(condition.value).toLowerCase());
    case "notContains":
      return !cellToText(column, cell)
        .toLowerCase()
        .includes(String(condition.value).toLowerCase());
    case "startsWith":
      return cellToText(column, cell)
        .toLowerCase()
        .startsWith(String(condition.value).toLowerCase());

    case "gt": {
      const c = compareOrdinal(cell, condition.value);
      return c !== null && c > 0;
    }
    case "gte": {
      const c = compareOrdinal(cell, condition.value);
      return c !== null && c >= 0;
    }
    case "lt": {
      const c = compareOrdinal(cell, condition.value);
      return c !== null && c < 0;
    }
    case "lte": {
      const c = compareOrdinal(cell, condition.value);
      return c !== null && c <= 0;
    }

    case "hasAny": {
      const have = asArray(cell);
      return asArray(condition.value as CellValue).some((v) => have.includes(v));
    }
    case "hasAll": {
      const have = asArray(cell);
      return asArray(condition.value as CellValue).every((v) => have.includes(v));
    }
    case "hasNone": {
      const have = asArray(cell);
      return !asArray(condition.value as CellValue).some((v) => have.includes(v));
    }

    case "isWithin": {
      if (typeof cell !== "string") return false;
      const { from, to } = resolveDateWindow(
        condition.value as RelativeDateWindow,
        now
      );
      const t = new Date(cell).getTime();
      return t >= from.getTime() && t < to.getTime();
    }

    default:
      return false;
  }
}

/**
 * Evaluate a filter tree against one row.
 *
 * Used for client-side preview and for board/gallery grouping. The server
 * translates the same tree into SQL; both must agree, which is why the
 * semantics live here in one readable place rather than only in a query
 * builder.
 */
export function evaluateFilter(
  node: FilterNode,
  columns: DataColumn[],
  data: RowData,
  now: Date = new Date()
): boolean {
  if (isFilterGroup(node)) {
    if (node.children.length === 0) return true;
    return node.op === "and"
      ? node.children.every((c) => evaluateFilter(c, columns, data, now))
      : node.children.some((c) => evaluateFilter(c, columns, data, now));
  }

  const column = columns.find((c) => c.id === node.columnId);
  // A filter on a soft-deleted column matches everything rather than nothing:
  // hiding every row because a column was removed looks like data loss.
  if (!column || column.deletedAt) return true;

  return evaluateCondition(node, column, data, now);
}

/** True when a filter would not narrow anything — lets callers skip work. */
export function isEmptyFilter(node: FilterNode | null | undefined): boolean {
  if (!node) return true;
  if (!isFilterGroup(node)) return false;
  return node.children.every(isEmptyFilter);
}
