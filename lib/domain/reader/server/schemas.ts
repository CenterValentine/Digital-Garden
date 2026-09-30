/** Request schemas shared by /api/reader routes. */

import { z } from "zod";

/** A CatalogEntry as the library UI sends it back (acquire / add-as-link). */
export const catalogEntrySchema = z.object({
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
    .max(20),
  externalUrl: z.string().url().max(2000).optional(),
  externalLabel: z.string().max(200).optional(),
});

