/**
 * Shared Work cache (RESEARCH-READER-PLAN.md §9.5) — public metadata only.
 *
 * One row per identifier key a Work answers to, so a later lookup by DOI,
 * PMID or arXiv id all hit. Resolved Works are re-fetched after a week;
 * retraction status is what most needs to stay fresh, and a week is the
 * bound on how stale it can be.
 */

import "server-only";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { identifierKey, identifierKeys } from "../identifiers";
import type { Work, WorkIdentifier } from "../types";

export const WORK_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function readCachedWork(identifiers: WorkIdentifier[]): Promise<Work | null> {
  const keys = identifiers.filter((identifier) => identifier.scheme !== "url").map(identifierKey);
  if (!keys.length) return null;
  const row = await prisma.workCache.findFirst({
    where: { key: { in: keys }, fetchedAt: { gt: new Date(Date.now() - WORK_CACHE_TTL_MS) } },
    orderBy: { fetchedAt: "desc" },
  });
  return row ? (row.work as unknown as Work) : null;
}

export async function writeCachedWork(work: Work): Promise<void> {
  const keys = identifierKeys(work.identifiers).filter((key) => !key.startsWith("url:"));
  const data = {
    workKey: work.key,
    work: work as unknown as Prisma.InputJsonValue,
    sources: work.provenance,
    fetchedAt: new Date(),
  };
  await prisma.$transaction(
    keys.map((key) =>
      prisma.workCache.upsert({
        where: { key },
        create: { key, ...data },
        update: data,
      })
    )
  );
}
