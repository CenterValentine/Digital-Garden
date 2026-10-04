/**
 * PUT    /api/reader/connections/[provider] { token } → validate + store (encrypted)
 * DELETE /api/reader/connections/[provider]
 */

import { z } from "zod";
import {
  deleteConnection,
  saveConnection,
} from "@/lib/domain/reader/server/integrations";
import { readerRouteWithParams } from "@/lib/domain/reader/server/route";
import { READER_CONNECTION_PROVIDERS } from "@/lib/domain/reader/types";

const ROUTE = "/api/reader/connections/[provider]";
const providerSchema = z.enum(
  READER_CONNECTION_PROVIDERS as unknown as ["readwise", "hardcover", "google-books"]
);

export const PUT = readerRouteWithParams<{ provider: string }, unknown>(
  ROUTE,
  async ({ ownerId, params, request }) => {
    const provider = providerSchema.parse(params.provider);
    const { token } = z.object({ token: z.string().min(1).max(2000) }).parse(await request.json());
    return { connection: await saveConnection(ownerId, provider, token) };
  }
);

export const DELETE = readerRouteWithParams<{ provider: string }, unknown>(
  ROUTE,
  async ({ ownerId, params }) => {
    await deleteConnection(ownerId, providerSchema.parse(params.provider));
    return { deleted: true };
  }
);
