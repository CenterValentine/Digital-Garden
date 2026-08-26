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
        select: { name: true, type: true, description: true, config: true },
      },
      views: {
        orderBy: { position: "asc" },
        select: { name: true, mode: true },
      },
    },
  });
  if (!payload) return null;

  const lines: string[] = [
    `# ${payload.content.title} (database, ${payload.mode})`,
  ];
  if (payload.description) lines.push(payload.description);
  lines.push(`Size: ${bucketRowCount(payload.rowCount)}`);

  lines.push("", "Columns:");
  for (const column of payload.columns) {
    const config = (column.config ?? {}) as unknown as DataColumnConfig;
    const desc = column.description ? ` — ${column.description}` : "";
    lines.push(
      `- ${column.name} (${column.type})${desc}${describeOptions(config.options)}`
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
