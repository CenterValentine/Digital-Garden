/**
 * /api/canvas/connection
 *   GET     → your Canvas connections (host, masked token hint; never the token)
 *   PUT     { baseUrl, token } → validate against Canvas, store encrypted
 *   DELETE  ?id= → forget the token (imported courses keep their provenance)
 */

import { z } from "zod";
import {
  disconnectApiConnection,
  listApiConnections,
  saveApiConnection,
} from "@/lib/domain/canvas/server/connection";
import { canvasRoute } from "@/lib/domain/canvas/server/route";

const putSchema = z.object({
  baseUrl: z.string().min(1).max(500),
  token: z.string().min(1).max(500),
});

export const GET = canvasRoute("/api/canvas/connection", async ({ ownerId }) => ({
  connections: await listApiConnections(ownerId),
}));

export const PUT = canvasRoute("/api/canvas/connection", async ({ ownerId, request }) => {
  const body = putSchema.parse(await request.json());
  return { connection: await saveApiConnection(ownerId, body.baseUrl, body.token) };
});

export const DELETE = canvasRoute("/api/canvas/connection", async ({ ownerId, request }) => {
  const id = z.string().uuid().parse(request.nextUrl.searchParams.get("id"));
  await disconnectApiConnection(ownerId, id);
  return { disconnected: true };
});
