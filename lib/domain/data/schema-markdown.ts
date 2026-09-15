/**
 * Database schema → markdown.
 *
 * The one "vanilla" schema format that is readable by a person, a model,
 * and a diff tool: one table per database with the column vocabulary,
 * descriptions, option sets, and relation edges spelled out. Ships as the
 * `.schema.md` sidecar of the CSV export and feeds the off-platform
 * migration packet (a note worked into rows by an outside model needs the
 * exact column names and option labels, not the CSV's display values).
 *
 * PURE — no Prisma. Callers resolve titles/names for relation targets and
 * pass them in, so a script reading a JSON dump can render the same thing.
 */

import type { DataColumnConfig, DataColumnType } from "./types";

export interface SchemaExportColumn {
  id?: string;
  key?: string;
  name: string;
  type: DataColumnType | string;
  description: string | null;
  config: DataColumnConfig;
  isPrimary?: boolean;
}

export interface SchemaExportTable {
  id: string;
  title: string;
  description?: string | null;
  rowCount?: number;
  columns: SchemaExportColumn[];
}

export interface SchemaRenderContext {
  /** Relation target database id → title. Unresolved ids print as ids. */
  tableTitles?: Record<string, string>;
  /** Column id → name, for symmetric / lookup / rollup references. */
  columnNames?: Record<string, string>;
}

const SELECT_LIKE = new Set(["select", "multiSelect", "status"]);

function md(value: unknown): string {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

function describeOptions(config: DataColumnConfig, type: string): string {
  const options = config.options ?? [];
  if (options.length === 0) return "Options: (none)";
  const labels = options.map((o) =>
    type === "status" && o.group ? `${o.label} (${o.group})` : o.label
  );
  return `Options: ${labels.join(" · ")}`;
}

/** The "Details" cell: everything a writer needs beyond the type. */
export function describeColumnDetails(
  column: SchemaExportColumn,
  ctx: SchemaRenderContext = {}
): string {
  const { config } = column;
  const parts: string[] = [];
  const tableTitle = (id?: string) =>
    id ? (ctx.tableTitles?.[id] ?? id) : "?";
  const columnName = (id?: string) =>
    id ? (ctx.columnNames?.[id] ?? id) : "?";

  if (column.isPrimary) parts.push("Primary (row title)");
  if (SELECT_LIKE.has(column.type)) {
    parts.push(describeOptions(config, column.type));
  }
  if (column.type === "relation") {
    parts.push(`→ ${tableTitle(config.relationTableId)}`);
    if (config.isBacklink) {
      parts.push(`backlink of "${columnName(config.symmetricColumnId)}"`);
    } else if (config.symmetricColumnId) {
      parts.push(`mirrored there as "${columnName(config.symmetricColumnId)}"`);
    }
  }
  if (column.type === "lookup") {
    parts.push(
      `reads "${columnName(config.lookupColumnId)}" via "${columnName(config.relationColumnId)}"`
    );
  }
  if (column.type === "rollup") {
    const fn = config.rollupFn ?? "count";
    const target =
      fn === "count" ? "" : ` of "${columnName(config.rollupColumnId)}"`;
    parts.push(`${fn}${target} via "${columnName(config.relationColumnId)}"`);
  }
  if (column.type === "number") {
    if (config.numberFormat && config.numberFormat !== "plain") {
      parts.push(
        config.numberFormat === "currency"
          ? `currency ${config.currencyCode ?? "USD"}`
          : config.numberFormat
      );
    }
    if (typeof config.precision === "number") {
      parts.push(`${config.precision} decimals`);
    }
  }
  if (column.type === "file" && config.imageOnly) parts.push("images only");
  if (column.type === "date" && config.includeTime) parts.push("with time");
  if (column.type === "text" && typeof config.maxLength === "number") {
    parts.push(`max ${config.maxLength} chars`);
  }
  if (config.system) parts.push("system-locked");
  return parts.join("; ");
}

/** One database as a markdown section. */
export function renderDatabaseSchemaMarkdown(
  table: SchemaExportTable,
  ctx: SchemaRenderContext = {}
): string {
  const lines: string[] = [];
  lines.push(`# ${table.title} — schema`, "");
  lines.push(`- Database id: \`${table.id}\``);
  if (typeof table.rowCount === "number") lines.push(`- Rows: ${table.rowCount}`);
  if (table.description?.trim()) {
    lines.push(`- Description: ${md(table.description)}`);
  }
  lines.push("", "| Column | Type | Description | Details |", "| --- | --- | --- | --- |");
  for (const column of table.columns) {
    lines.push(
      `| ${md(column.name)} | ${column.type} | ${md(column.description)} | ${md(describeColumnDetails(column, ctx))} |`
    );
  }
  return lines.join("\n") + "\n";
}

/**
 * Several databases as one document, with the relation topology drawn once
 * at the top (forward edges only — backlinks are the same edge seen from
 * the other side). Titles and column names resolve against the set itself
 * before any caller-supplied context.
 */
export function renderDatabaseSetSchemaMarkdown(
  tables: SchemaExportTable[],
  ctx: SchemaRenderContext = {}
): string {
  const tableTitles: Record<string, string> = { ...ctx.tableTitles };
  const columnNames: Record<string, string> = { ...ctx.columnNames };
  for (const t of tables) {
    tableTitles[t.id] = t.title;
    for (const c of t.columns) if (c.id) columnNames[c.id] = c.name;
  }
  const merged = { tableTitles, columnNames };

  const edges: string[] = [];
  for (const t of tables) {
    for (const c of t.columns) {
      if (c.type !== "relation" || c.config.isBacklink) continue;
      const target = c.config.relationTableId;
      const mirror = c.config.symmetricColumnId
        ? columnNames[c.config.symmetricColumnId]
        : undefined;
      edges.push(
        `- **${t.title}**.${c.name} → **${tableTitles[target ?? ""] ?? target}**` +
          (mirror ? ` (mirrored as "${mirror}")` : "")
      );
    }
  }

  const out: string[] = [];
  out.push("# Database set — schema", "");
  out.push(`Tables: ${tables.map((t) => `**${t.title}**`).join(", ")}`, "");
  if (edges.length > 0) out.push("## Relations", "", ...edges, "");
  for (const t of tables) out.push(renderDatabaseSchemaMarkdown(t, merged));
  return out.join("\n");
}
