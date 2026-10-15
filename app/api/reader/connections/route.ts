/**
 * GET /api/reader/connections → Readwise / Hardcover / Google Books status.
 */

import { listConnections } from "@/lib/domain/reader/server/integrations";
import { readerRoute } from "@/lib/domain/reader/server/route";

export const GET = readerRoute("/api/reader/connections", async ({ ownerId }) => ({
  connections: await listConnections(ownerId),
}));
