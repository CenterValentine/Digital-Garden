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

function describeOptions(options: SelectOption[] | undefined): string {
  if (!options || options.length === 0) return "";
  const labels = options.map((o) => o.label).join(", ");
  return ` — options: ${labels}`;
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
        orderBy: { position: "asc" },
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

  return lines.join("\n");
}
