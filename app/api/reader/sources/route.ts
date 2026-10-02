/**
 * Reader book sources.
 *
 * GET    /api/reader/sources            → built-in sources + the user's OPDS catalogs
 * POST   /api/reader/sources            → add an OPDS catalog { url, name?, username?, password? }
 * DELETE /api/reader/sources?id=opds:…  → remove a custom catalog
 */

import { z } from "zod";
import { readerTablesAvailable } from "@/lib/domain/reader/db";
import { readerRoute } from "@/lib/domain/reader/server/route";
import {
  addCatalog,
  deleteCatalog,
  listBookSources,
} from "@/lib/domain/reader/server/sources";

const ROUTE = "/api/reader/sources";

export const GET = readerRoute(ROUTE, async ({ ownerId }) => ({
  sources: await listBookSources(ownerId),
  tablesReady: readerTablesAvailable(),
}));

const addSchema = z.object({
  url: z.string().url().max(2000),
  name: z.string().max(120).optional(),
  username: z.string().max(200).optional(),
  password: z.string().max(500).optional(),
});

export const POST = readerRoute(ROUTE, async ({ ownerId, request }) => {
  const body = addSchema.parse(await request.json());
  return { source: await addCatalog(ownerId, body) };
});

export const DELETE = readerRoute(ROUTE, async ({ ownerId, request }) => {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  await deleteCatalog(ownerId, id);
  return { deleted: true };
});
