/**
 * Render a `data` node as readable text for the GENERALIST read path.
 *
 * Why this exists (AI-TOOL-SUMMONER-PLAN §1.2): `read_content` used to
 * refuse every content type but `note` and `folder`, so a chat that reached
 * for a database by the ordinary read tool got
 * `"… is a data, not readable as text."` — a dead end, while the machinery to
 * render it sat one directory away. A production charter run (2026-09-17)
 * fell into exactly that hole: denied `query_database` by the run diet, its
 * correct fallback to `read_content` hit this refusal and the run proceeded
 * blind.
 *
 * This is a PREVIEW, deliberately: the schema capsule plus a bounded index-tier
 * page. Filtering, searching, sorting, full columns, digests and the token
 * budget/approval contract all remain `query_database`'s job — this never
 * grows into a second read path with its own governance.
 */
import { buildDataSchemaDigest } from "./digest";
import { loadRowPage, loadTable } from "./queries";
import { formatRows, indexTierColumns } from "@/lib/domain/data/read-format";
import type { DataView, RowPage } from "@/lib/domain/data";

/** Rows the preview will fetch at most. `query_database` is the way past this. */
export const DATA_PREVIEW_MAX_ROWS = 25;
/** Hard ceiling on the rendered rows; the preview trims itself to fit. */
export const DATA_PREVIEW_TOKEN_BUDGET = 1_500;
/** Index-tier cells clip here, matching `query_database`'s index tier. */
const PREVIEW_CLIP_CHARS = 120;
/** One linked title per relation cell, as in the index tier. */
const PREVIEW_RELATION_RENDER = {
  maxLinkedTitles: 1,
  linkedTitleClip: 40,
} as const;

/**
 * The schema capsule plus a bounded row preview, or `null` when `nodeId` is
 * not a data node (no `DataPayload`) — callers treat `null` as "not mine".
 */
export async function renderDataNodePreview(
  nodeId: string,
  options: { viewerId?: string } = {},
): Promise<string | null> {
  const digest = await buildDataSchemaDigest(nodeId);
  if (!digest) return null;

  const table = await loadTable(nodeId, options.viewerId);
  // Schema exists but the table failed to load: the capsule alone is still a
  // true, useful answer — never downgrade to the old refusal.
  if (!table) return digest;

  const live = table.columns.filter((c) => !c.deletedAt);
  if (live.length === 0) return `${digest}\n\nNo columns yet — no rows to preview.`;

  // Synthetic view: loadRowPage reads only filters/sorts from it, and the
  // preview applies neither.
  const view = {
    filters: { op: "and", children: [] },
    sorts: [],
  } as unknown as DataView;

  let page: RowPage;
  try {
    page = await loadRowPage({
      tableId: nodeId,
      view,
      columns: live,
      cursor: null,
      limit: DATA_PREVIEW_MAX_ROWS,
      viewerId: options.viewerId,
    });
  } catch {
    // Rows are the optional half of this answer. A read must not dead-end, so
    // a row-load failure still returns the schema.
    return `${digest}\n\n[Row preview unavailable — read the rows with query_database.]`;
  }

  if (page.total === 0) {
    return `${digest}\n\nThis database has no rows yet.`;
  }

  const shown = indexTierColumns(live);
  const render = {
    relations: "titles" as const,
    clipChars: PREVIEW_CLIP_CHARS,
    ...PREVIEW_RELATION_RENDER,
  };

  // Trim to the budget rather than truncating mid-render: halve the row count
  // until it fits, so every rendered line is whole.
  let rows = page.rows;
  let body = formatRows({ rows, columns: shown, live, render });
  while (body.tokens > DATA_PREVIEW_TOKEN_BUDGET && rows.length > 1) {
    rows = rows.slice(0, Math.floor(rows.length / 2));
    body = formatRows({ rows, columns: shown, live, render });
  }

  const footer =
    `[Preview: ${rows.length} of ${page.total} row${page.total === 1 ? "" : "s"}, index tier. ` +
    "Use query_database on this database to filter, search, sort, page, read full columns, or append row digests.]";

  return `${digest}\n\n${body.text}\n\n${footer}`;
}
