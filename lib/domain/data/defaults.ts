/**
 * What a brand-new database looks like, and the form-label fallback chain.
 *
 * Pure — safe to import from client components.
 */

import { keyAtEnd, generateColumnKey } from "./ordering";
import type {
  DataColumn,
  DataView,
  FormFieldConfig,
  SelectOption,
  StatusGroup,
} from "./types";

// ── Empty state ──────────────────────────────────────────────────────────

/**
 * A new database gets ONE text column named "Name" and nothing else.
 *
 * Deliberately not Notion's Name/Tags/Date: columns a user did not ask for
 * are noise they must delete before they can start, and adding `status` or a
 * date is one click away. The primary column has to exist because promotion
 * and titles depend on it (plan Phase 1a).
 */
export function buildDefaultColumns(): Array<
  Pick<DataColumn, "key" | "name" | "type" | "position" | "isPrimary" | "config" | "description">
> {
  return [
    {
      key: generateColumnKey(),
      name: "Name",
      type: "text",
      position: keyAtEnd(null),
      isPrimary: true,
      config: {},
      description: null,
    },
  ];
}

/** The implicit first view. Every table has at least one. */
export function buildDefaultView(): Pick<
  DataView,
  "name" | "mode" | "access" | "filters" | "sorts" | "groupByColumnId" | "columnPrefs" | "config" | "position" | "section"
> {
  return {
    name: "All",
    mode: "grid",
    access: "collaborative",
    section: null,
    filters: { op: "and", children: [] },
    sorts: [],
    groupByColumnId: null,
    columnPrefs: {},
    config: {},
    position: keyAtEnd(null),
  };
}

// ── Status options ───────────────────────────────────────────────────────

const STATUS_SEED: Array<{ label: string; group: StatusGroup; color: string }> = [
  { label: "Not started", group: "todo", color: "neutral" },
  { label: "In progress", group: "active", color: "primary" },
  { label: "Done", group: "done", color: "success" },
];

/**
 * Seed options for a new `status` column. A status column with no options is
 * useless — a board built on it renders zero groups — so it is created
 * populated and the user edits from there.
 */
export function buildDefaultStatusOptions(): SelectOption[] {
  return STATUS_SEED.map((s) => ({
    id: generateColumnKey(),
    label: s.label,
    color: s.color,
    group: s.group,
  }));
}

/** Board column order. Ungrouped options sort last, preserving their order. */
export const STATUS_GROUP_ORDER: readonly StatusGroup[] = ["todo", "active", "done"];

export function sortStatusOptions(options: SelectOption[]): SelectOption[] {
  return [...options].sort((a, b) => {
    const ai = a.group ? STATUS_GROUP_ORDER.indexOf(a.group) : STATUS_GROUP_ORDER.length;
    const bi = b.group ? STATUS_GROUP_ORDER.indexOf(b.group) : STATUS_GROUP_ORDER.length;
    return ai - bi;
  });
}

// ── Form labelling (plan O15) ────────────────────────────────────────────

/**
 * Resolve a form field's label and help text.
 *
 *   label = view override  ??  column.name
 *   help  = view override  ??  column.description  ??  none
 *
 * The override lives on the VIEW, not the column, for two reasons. A grid
 * header is terse because a column is narrow ("Est. hrs") while a form label
 * can afford a sentence. And `column.description` is written for the AI that
 * maintains the table — internal phrasing — whereas form help addresses
 * whoever is filling the form in, possibly a stranger. One table may need a
 * public submission form and an internal intake form whose wording differs;
 * column-level storage makes that impossible.
 */
export function resolveFormField(
  column: DataColumn,
  override: FormFieldConfig | undefined
): { label: string; help: string | null; required: boolean; hidden: boolean; placeholder: string | null } {
  return {
    label: override?.label?.trim() || column.name,
    help: override?.help?.trim() || column.description || null,
    required: override?.required ?? false,
    hidden: override?.hidden ?? false,
    placeholder: override?.placeholder?.trim() || null,
  };
}
