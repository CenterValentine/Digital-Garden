/**
 * AI schema digest for a database (plan B1).
 *
 * This is what the self-healing context engine reads for a `data` node —
 * SCHEMA, never rows. Because the digest is derived only from schema-level
 * facts, `sourceContentHash` is schema-derived, and cell edits cannot dirty
 * context *by construction* rather than by convention. Editing a column or
 * table description DOES change the digest, which is correct: descriptions
 * are semantic (plan D9).
 *
 * Deterministic on purpose: same schema in, same string out, so the hash is
 * stable. Two deliberate choices serve that:
 *  - columns are emitted in position order (their stable display order);
 *  - the row count is BUCKETED to an order of magnitude. The plan lists
 *    "row count" in the digest, but an exact count would shift the hash on
 *    every row add and re-trigger regeneration — precisely the churn B1
 *    exists to prevent. "About 10 rows" carries the signal a model needs.
 *
 * SERVER-ONLY (Prisma).
 */

import { prisma } from "@/lib/database/client";
import type { DataColumnConfig, SelectOption } from "@/lib/domain/data";

function bucketRowCount(n: number): string {
  if (n === 0) return "empty";
  if (n <= 10) return "about 10 rows";
  if (n <= 100) return "tens of rows";
  if (n <= 1000) return "hundreds of rows";
  return "thousands of rows";
}

/** Option vocab, capped (Phase 6 token contract): 50 labels, then a count. */
const OPTION_CAP = 50;

function describeOptions(options: SelectOption[] | undefined): string {
  if (!options || options.length === 0) return "";
  const shown = options.slice(0, OPTION_CAP).map((o) => o.label).join(", ");
  const more =
    options.length > OPTION_CAP ? ` (+${options.length - OPTION_CAP} more)` : "";
  return ` — options: ${shown}${more}`;
}


// ── Relation graph (plan AI-RELATIONAL-DATABASE-REACH P3) ────────────────
//
// A relation rendered as "- Claims (relation)" told a model nothing: not the
// target, not which half of the pair it is, not what a rollup counts. A
// production session read exactly that and concluded the product had no
// relations at all, then wrote the owner a feature request asking for them.
// The graph IS the schema for a linked set of tables, so the digest names it.
//
// Determinism holds: every name here is a schema-level fact, so the hash
// moves only when the schema does. Renaming a target table does re-hash this
// table's digest — correct, since this digest's text genuinely changed.

interface GraphNames {
  /** DataPayload.contentId → table title. */
  tables: Map<string, string>;
  /** DataColumn.id → column name (targets AND same-table relations). */
  columns: Map<string, string>;
}

type DigestColumn = {
  id: string;
  name: string;
  type: string;
  config: unknown;
};

/**
 * One batched lookup for every table/column id the graph columns point at.
 * Two queries regardless of column count; skipped entirely (no queries) for
 * a table with no relation-family columns, which is most tables.
 */
async function resolveGraphNames(
  columns: DigestColumn[]
): Promise<GraphNames> {
  const tableIds = new Set<string>();
  const columnIds = new Set<string>();
  for (const column of columns) {
    if (!GRAPH_TYPES.has(column.type)) continue;
    const config = (column.config ?? {}) as unknown as DataColumnConfig;
    if (config.relationTableId) tableIds.add(config.relationTableId);
    for (const id of [
      config.symmetricColumnId,
      config.relationColumnId,
      config.lookupColumnId,
      config.rollupColumnId,
    ]) {
      if (id) columnIds.add(id);
    }
  }
  if (tableIds.size === 0 && columnIds.size === 0) {
    return { tables: new Map(), columns: new Map() };
  }

  const [tables, targetColumns] = await Promise.all([
    tableIds.size > 0
      ? prisma.contentNode.findMany({
          where: { id: { in: [...tableIds] } },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
    columnIds.size > 0
      ? prisma.dataColumn.findMany({
          where: { id: { in: [...columnIds] } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const names: GraphNames = {
    tables: new Map(tables.map((t) => [t.id, t.title])),
    columns: new Map(targetColumns.map((c) => [c.id, c.name])),
  };
  // Same-table relations (what a lookup/rollup traverses) are already in
  // hand — no query needed, and they win over a stale fetch.
  for (const column of columns) names.columns.set(column.id, column.name);
  return names;
}

const GRAPH_TYPES = new Set(["relation", "lookup", "rollup"]);

/** The bracketed graph clause for a relation, lookup, or rollup column. */
function describeGraph(
  column: DigestColumn,
  config: DataColumnConfig,
  graph: GraphNames
): string {
  const table = (id: string | undefined) =>
    (id && graph.tables.get(id)) || "an unavailable database";
  const col = (id: string | undefined) =>
    (id && graph.columns.get(id)) || "an unavailable column";

  if (column.type === "relation") {
    const target = table(config.relationTableId);
    // The backlink half owns no links; saying so is what stops a model
    // from trying to write through it (the links route refuses).
    return config.isBacklink
      ? ` [backlink → ${target}; mirrors "${col(config.symmetricColumnId)}" there, filled by linking from that side]`
      : ` [relation → ${target}; linked rows, mirrored as "${col(config.symmetricColumnId)}" there]`;
  }
  if (column.type === "lookup") {
    return ` [lookup: reads "${col(config.lookupColumnId)}" through "${col(config.relationColumnId)}" — computed, not writable]`;
  }
  if (column.type === "rollup") {
    const fn = config.rollupFn ?? "count";
    const over =
      fn === "count" ? "" : ` of "${col(config.rollupColumnId)}"`;
    return ` [rollup: ${fn}${over} through "${col(config.relationColumnId)}" — computed, not writable]`;
  }
  return "";
}

/**
 * Build the digest text, or null when the node has no data payload.
 * User-authored descriptions (D9) make this a genuinely good context
 * document with zero LLM spend — a well-described table may never need a
 * generation pass at all.
 */
export async function buildDataSchemaDigest(
  nodeId: string
): Promise<string | null> {
  const payload = await prisma.dataPayload.findUnique({
    where: { contentId: nodeId },
    select: {
      mode: true,
      description: true,
      rowCount: true,
      content: { select: { title: true } },
      columns: {
        where: { deletedAt: null },
        // Ordered by the IMMUTABLE key, not position: drag-reordering
        // columns is presentational, and ordering the digest by position
        // would shift the context hash on every drag — churn with no
        // semantic change. Same reasoning as the bucketed row count.
        orderBy: { key: "asc" },
        select: {
          id: true,
          name: true,
          type: true,
          description: true,
          config: true,
        },
      },
      views: {
        orderBy: { position: "asc" },
        select: { name: true, mode: true },
      },
    },
  });
  if (!payload) return null;

  const lines: string[] = [
    // The id is the address query_database/insert_rows take — without it
    // a mention capsule names a database the tools cannot reach.
    `# ${payload.content.title} (database, ${payload.mode}) [id: ${nodeId}]`,
  ];
  if (payload.description) lines.push(payload.description);
  lines.push(`Size: ${bucketRowCount(payload.rowCount)}`);

  const graph = await resolveGraphNames(payload.columns);

  lines.push("", "Columns:");
  for (const column of payload.columns) {
    const config = (column.config ?? {}) as unknown as DataColumnConfig;
    const desc = column.description ? ` — ${column.description}` : "";
    // The intent split the type names alone don't teach (owner
    // clarification 2026-08-31): file = external content brought INTO the
    // app; contentLink = references to content already in it. Without
    // this, models reasoned "same id arrays, same thing".
    const intent =
      column.type === "file"
        ? config.imageOnly
          ? " [uploaded IMAGE attachments — cell ids must be image file nodes; the user uploads via the cell's +]"
          : " [uploaded attachments — cell ids must be FILE nodes; the user uploads via the cell's +, or attach a file you created]"
        : column.type === "contentLink"
          ? " [references to existing app content — notes, folders, any node]"
          : describeGraph(column, config, graph);
    lines.push(
      `- ${column.name} (${column.type})${intent}${desc}${describeOptions(config.options)}`
    );
  }

  if (payload.views.length > 0) {
    lines.push(
      "",
      `Views: ${payload.views.map((v) => `${v.name} (${v.mode})`).join(", ")}`
    );
  }

  // The Phase 6 token contract, stated where the model reads it: schema
  // rides the capsule, rows arrive ONLY through tools, paged and bounded.
  lines.push(
    "",
    "Rows are never included in context. Use query_database (filtered, paged) to read rows and describe_database for the full schema."
  );

  return lines.join("\n");
}

/**
 * Row properties block for a PROMOTED row's note (Phase 6b): the page's
 * cells, serialized compactly, appended to the note's own context so a
 * row-page mention carries its data instead of an empty body. Bounded by
 * construction — one row, cellToText strings, empties skipped.
 */
export async function buildRowPropertiesBlock(
  contentId: string
): Promise<string | null> {
  const row = await prisma.dataRow.findFirst({
    where: { contentId, deletedAt: null },
    select: {
      data: true,
      table: {
        select: {
          content: { select: { title: true } },
          columns: {
            where: { deletedAt: null },
            orderBy: { position: "asc" },
            select: {
              id: true,
              key: true,
              name: true,
              type: true,
              position: true,
              isPrimary: true,
              config: true,
              description: true,
            },
          },
        },
      },
    },
  });
  if (!row) return null;

  const { cellToText } = await import("@/lib/domain/data");
  const data = (row.data ?? {}) as Record<string, unknown>;
  const lines: string[] = [
    `Row of database "${row.table.content.title}" — properties:`,
  ];
  for (const c of row.table.columns) {
    const column = {
      id: c.id,
      key: c.key,
      name: c.name,
      type: c.type,
      position: c.position,
      isPrimary: c.isPrimary,
      config: (c.config ?? {}) as unknown as DataColumnConfig,
      description: c.description,
      deletedAt: null,
    };
    const text = cellToText(column, data[c.key] as never);
    if (text) lines.push(`- ${c.name}: ${text}`);
  }
  return lines.length > 1 ? lines.join("\n") : null;
}
