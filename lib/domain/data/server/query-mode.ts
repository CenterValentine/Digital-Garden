/**
 * Query mode — tables whose rows ARE ContentNodes (plan Phase 3).
 *
 * In one sentence: a normal table owns its rows; a query table owns
 * nothing — it is a saved search rendered as a table. Rows are the matching
 * nodes themselves. Nothing is copied: tag a new note and it appears,
 * delete the table and no note is harmed.
 *
 * The projection is deliberately shaped like the inline read path's output
 * (synthesized DataColumns + DataRow-shaped rows), so the ENTIRE Phase 2
 * view stack — grid, peek, the rail, ?view= — renders it unchanged. That
 * was the point of decoupling the view layer from DataRow.
 *
 * Access: the query runs over the TABLE OWNER's content, further narrowed
 * to nodes the viewer can actually see (owner, or a live ViewGrant) — the
 * same redaction stance as resolveLinkTargets (plan V1-3). A shared query
 * table must never become a periscope into unshared notes.
 *
 * SERVER-ONLY (Prisma).
 */

import { prisma } from "@/lib/database/client";
import type { ContentType, Prisma } from "@/lib/database/generated/prisma";
import {
  DEFAULT_CONTENT_QUERY,
  type ContentQuery,
  type DataColumn,
  type DataRow,
} from "@/lib/domain/data";

/** Types a query may target. `data` is excluded — a table of tables can
 * recurse through the rail and viewer in ways nothing else handles yet. */
const QUERYABLE_TYPES = new Set([
  "note",
  "file",
  "html",
  "code",
  "external",
  "template",
]);

/** Parse + clamp whatever is in `DataPayload.source`. Never trusts stored
 * shape — the column was Json long before this module existed. */
export function parseContentQuery(source: unknown): ContentQuery {
  const raw = (source ?? {}) as Partial<ContentQuery>;
  const tags = Array.isArray(raw.tags)
    ? raw.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10)
    : [];
  const contentTypes = Array.isArray(raw.contentTypes)
    ? raw.contentTypes.filter(
        (t): t is string => typeof t === "string" && QUERYABLE_TYPES.has(t)
      )
    : [];
  return {
    tags,
    contentTypes:
      contentTypes.length > 0 ? contentTypes : DEFAULT_CONTENT_QUERY.contentTypes,
  };
}

/**
 * The synthesized projection columns. Fixed keys, stable across loads —
 * they are the "schema" every Phase 2 surface renders. Read-only by
 * construction: none are inline-editable types except title/date, and the
 * viewer disables editing for query tables wholesale.
 */
export function buildQueryColumns(): DataColumn[] {
  const col = (
    key: string,
    name: string,
    type: DataColumn["type"],
    position: string,
    isPrimary = false,
    description: string | null = null
  ): DataColumn => ({
    id: `query:${key}`,
    key,
    name,
    type,
    position,
    isPrimary,
    config: {},
    description,
    deletedAt: null,
  });
  return [
    col("title", "Title", "text", "a0", true),
    col("type", "Type", "text", "a1"),
    col("tags", "Tags", "text", "a2", false, "Every tag on the item."),
    col("updated", "Last edited", "date", "a3"),
    col("created", "Created", "date", "a4"),
  ];
}

/**
 * Run the saved query and shape matches as rows.
 *
 * Ordered by updatedAt DESC — the sortKey is synthesized as an INVERTED
 * timestamp so the client's ascending-sortKey assumptions (poll merge,
 * board grouping) hold without a special case.
 */
export async function loadQueryRows(
  tableOwnerId: string,
  viewerId: string,
  query: ContentQuery,
  limit = 500
): Promise<DataRow[]> {
  const where: Prisma.ContentNodeWhereInput = {
    ownerId: tableOwnerId,
    deletedAt: null,
    // QUERYABLE_TYPES gates these strings to real enum members at parse
    // time, so the cast is a formality rather than a hope.
    contentType: { in: query.contentTypes as ContentType[] },
    // Redaction (plan V1-3): the viewer sees only nodes they could open —
    // their own, or ones carrying a live grant for them.
    ...(viewerId === tableOwnerId
      ? {}
      : {
          viewGrants: {
            some: {
              userId: viewerId,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
          },
        }),
    // ALL-of tag semantics, one relation clause per slug.
    AND: query.tags.map((slug) => ({
      contentTags: { some: { tag: { slug } } },
    })),
  };

  const nodes = await prisma.contentNode.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      contentType: true,
      createdAt: true,
      updatedAt: true,
      contentTags: { select: { tag: { select: { name: true } } } },
    },
  });

  return nodes.map((node) => ({
    id: node.id,
    tableId: "",
    // Inverted ms since epoch, zero-padded: ascending sortKey = newest
    // first, matching the server's ORDER BY without client special-casing.
    sortKey: String(1e15 - node.updatedAt.getTime()).padStart(16, "0"),
    data: {
      title: node.title,
      type: node.contentType,
      tags: node.contentTags.map((ct) => ct.tag.name).join(", "),
      updated: node.updatedAt.toISOString().slice(0, 10),
      created: node.createdAt.toISOString().slice(0, 10),
    },
    // The row IS a node — the viewer opens it as real content.
    contentId: node.id,
    nodeContentType: node.contentType,
    createdAt: node.createdAt.toISOString(),
    updatedAt: node.updatedAt.toISOString(),
  }));
}
