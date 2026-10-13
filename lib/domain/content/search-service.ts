/**
 * Content search — ONE query builder for every caller.
 *
 * Until 2026-10-12 the search route (`/api/content/search`) and the chat tool
 * (`search_content`) each built their own Prisma `where`. They disagreed
 * silently: only the route searched HTML, code and file payloads, and only
 * the route matched database ROWS (a row hit surfaces its table). The MCP
 * server (MCP-DATABASE-REACH-PLAN §2.1) would have been a third copy. This
 * module is the single place the match semantics live; callers choose scope,
 * fields and projection, and keep their own formatting.
 *
 * `buildSearchWhere` is PURE (no Prisma calls) so the gate can pin its shape
 * without a database. The tag scope is resolved separately because it needs a
 * groupBy, and the caller decides what an empty tag scope means.
 */

import type { Prisma } from "@/lib/database/generated/prisma";
import type { ContentType } from "@/lib/domain/content/types";

export type SearchField = "note" | "html" | "code" | "file" | "data" | "dataRows";

/** Every payload the app indexes. Rows roll up to their table node. */
export const ALL_SEARCH_FIELDS: readonly SearchField[] = [
  "note",
  "html",
  "code",
  "file",
  "data",
  "dataRows",
];

export interface SearchWhereInput {
  ownerId: string;
  /** Raw query; whitespace-only means "no text match" (callers decide what that lists). */
  query: string;
  /**
   * Explicit content types. When given they are honoured verbatim — including
   * "shortcut", so the rows stay reachable for anyone who deliberately asks.
   * When absent, shortcuts are excluded: they carry their target's title and
   * none of its body, so an unfiltered search would return the same note once
   * real and once per shortcut aimed at it.
   */
  types?: readonly ContentType[];
  /** Pre-resolved tag scope (see `resolveTagScope`); undefined = no tag filter. */
  tagContentIds?: readonly string[];
  caseSensitive?: boolean;
  /** Which payload texts to match besides the title. */
  fields: readonly SearchField[];
}

/**
 * The `where` both callers used to build by hand. Order of the OR groups is
 * stable (title first, then payloads in `ALL_SEARCH_FIELDS` order) so the
 * query plan does not shift between callers.
 */
export function buildSearchWhere(input: SearchWhereInput): Prisma.ContentNodeWhereInput {
  const where: Prisma.ContentNodeWhereInput = {
    ownerId: input.ownerId,
    deletedAt: null,
  };

  if (input.tagContentIds) {
    where.id = { in: [...input.tagContentIds] };
  }

  if (input.types && input.types.length > 0) {
    where.contentType =
      input.types.length === 1 ? input.types[0] : { in: [...input.types] };
  } else {
    where.contentType = { not: "shortcut" };
  }

  const term = input.query.trim();
  if (term) {
    const mode: Prisma.QueryMode = input.caseSensitive ? "default" : "insensitive";
    const match = { contains: term, mode };
    const fields = new Set(input.fields);
    const or: Prisma.ContentNodeWhereInput[] = [{ title: match }];

    if (fields.has("note")) {
      or.push({ AND: [{ notePayload: { isNot: null } }, { notePayload: { searchText: match } }] });
    }
    if (fields.has("html")) {
      or.push({ AND: [{ htmlPayload: { isNot: null } }, { htmlPayload: { searchText: match } }] });
    }
    if (fields.has("code")) {
      or.push({ AND: [{ codePayload: { isNot: null } }, { codePayload: { searchText: match } }] });
    }
    if (fields.has("file")) {
      or.push({ AND: [{ filePayload: { isNot: null } }, { filePayload: { searchText: match } }] });
    }
    if (fields.has("data") || fields.has("dataRows")) {
      // A database matches on its own searchText (title + column names, so a
      // table is findable by a field the user names) OR on any live row's
      // derived text. Rolled up to the TABLE node: rows are not ContentNodes.
      const dataOr: Prisma.ContentNodeWhereInput[] = [];
      if (fields.has("data")) dataOr.push({ dataPayload: { searchText: match } });
      if (fields.has("dataRows")) {
        dataOr.push({
          dataPayload: { rows: { some: { deletedAt: null, searchText: match } } },
        });
      }
      or.push({ AND: [{ dataPayload: { isNot: null } }, { OR: dataOr }] });
    }
    where.OR = or;
  }

  return where;
}

/** Default ordering shared by every caller: most recently updated first. */
export const SEARCH_ORDER: Prisma.ContentNodeOrderByWithRelationInput = { updatedAt: "desc" };
