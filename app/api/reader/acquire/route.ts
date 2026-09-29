/**
 * POST /api/reader/acquire
 * { sourceId, entry, acquisitionIndex?, parentId? }
 *
 * Downloads a DRM-free book into the user's library folder (or `parentId`)
 * as an ordinary file node + BookMeta. 422 when the file is copy-protected.
 */

import { z } from "zod";
import { acquireBook } from "@/lib/domain/reader/server/library";
import { readerRoute } from "@/lib/domain/reader/server/route";

const entrySchema = z.object({
  id: z.string().max(2000),
  title: z.string().min(1).max(1000),
  authors: z.array(z.string().max(500)).max(50),
  summary: z.string().max(20000).optional(),
  language: z.string().max(40).optional(),
  coverUrl: z.string().url().max(2000).optional(),
  publishedYear: z.number().int().optional(),
  isbn: z.string().max(20).optional(),
  openLibraryId: z.string().max(40).optional(),
  license: z.enum(["public-domain", "creative-commons", "owned", "unknown"]).optional(),
  acquisitions: z
    .array(
      z.object({
        href: z.string().url().max(4000),
        type: z.string().max(200),
        rel: z.string().max(100),
      })
    )
    .min(1)
    .max(20),
  externalUrl: z.string().url().max(2000).optional(),
  externalLabel: z.string().max(200).optional(),
});

const bodySchema = z.object({
  sourceId: z.string().min(1).max(200),
  entry: entrySchema,
  acquisitionIndex: z.number().int().min(0).max(19).optional(),
  parentId: z.string().uuid().nullish(),
});

export const POST = readerRoute("/api/reader/acquire", async ({ ownerId, request }) => {
  const body = bodySchema.parse(await request.json());
  return acquireBook({
    ownerId,
    sourceId: body.sourceId,
    entry: body.entry,
    acquisitionIndex: body.acquisitionIndex,
    parentId: body.parentId ?? null,
  });
});
