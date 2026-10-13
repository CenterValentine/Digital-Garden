import "server-only";

/**
 * The Prisma half of content search. Pure query shaping is in
 * `search-service.ts` (no server-only import, so the gate can load it).
 */

import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { SEARCH_ORDER, buildSearchWhere, type SearchWhereInput } from "./search-service";

/**
 * Resolve tag slugs to the content ids that carry ALL of them (AND
 * semantics), scoped to the owner's tags. `undefined` when no slugs were
 * given, so callers can tell "no filter" from "filter matched nothing".
 */
export async function resolveTagScope(
  ownerId: string,
  tagSlugs: readonly string[]
): Promise<string[] | undefined> {
  if (tagSlugs.length === 0) return undefined;
  const grouped = await prisma.contentTag.groupBy({
    by: ["contentId"],
    where: { tag: { userId: ownerId, slug: { in: [...tagSlugs] } } },
    having: { contentId: { _count: { gte: tagSlugs.length } } },
  });
  return grouped.map((g) => g.contentId);
}

/**
 * Run a search with the caller's projection. Generic over `select` so the
 * route keeps its three-ancestor path and payload texts while the chat tool
 * keeps its database counts, each fully typed.
 */
export async function searchContentNodes<S extends Prisma.ContentNodeSelect>(
  input: SearchWhereInput & { limit: number },
  select: S
): Promise<Array<Prisma.ContentNodeGetPayload<{ select: S }>>> {
  const where = buildSearchWhere(input);
  const rows = await prisma.contentNode.findMany({
    where,
    select,
    orderBy: SEARCH_ORDER,
    take: input.limit,
  });
  return rows as Array<Prisma.ContentNodeGetPayload<{ select: S }>>;
}
