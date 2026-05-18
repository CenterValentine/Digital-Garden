/**
 * BYOK Key Management API
 *
 * GET  /api/ai/keys — List stored keys (masked)
 * POST /api/ai/keys — Store a new key (encrypted)
 */

import { requireAuth } from "@/lib/infrastructure/auth";
import {
  listProviderKeys,
  storeProviderKey,
} from "@/lib/domain/ai/keys";
import type { CreateKeyRequest } from "@/lib/domain/ai/keys";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/ai/keys";

export async function GET(request: Request) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const keys = await withSpan(
        { layer: "ai", name: "keys_read" },
        undefined,
        async (span) => {
          const result = await listProviderKeys(session.user.id);
          span.attr("count", result.length).summary(`${result.length} keys`);
          return result;
        },
      );
      return Response.json({ success: true, data: keys });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return Response.json(
          { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
          { status: 401 }
        );
      }
      logger.error({
        layer: "ai",
        event: "keys_read:caught",
        summary: "GET caught — translated to 500",
        error,
      });
      return Response.json(
        { success: false, error: { code: "SERVER_ERROR", message: "Failed to list keys" } },
        { status: 500 }
      );
    }
  });
}

export async function POST(request: Request) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const body: CreateKeyRequest = await request.json();

      if (!body.providerId || !body.apiKey) {
        return Response.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "providerId and apiKey are required" } },
          { status: 400 }
        );
      }

      if (body.apiKey.length < 10) {
        return Response.json(
          { success: false, error: { code: "VALIDATION_ERROR", message: "API key appears too short" } },
          { status: 400 }
        );
      }

      const keys = await withSpan(
        { layer: "ai", name: "keys_write" },
        { attrs: { provider: body.providerId, op: "store" } },
        async (span) => {
          // body.apiKey is intentionally NOT logged — it's a secret. Only the
          // provider ID and operation type appear in attrs.
          await storeProviderKey(
            session.user.id,
            body.providerId,
            body.apiKey,
            body.label ?? ""
          );
          const result = await listProviderKeys(session.user.id);
          span.attr("count", result.length).summary("key stored");
          return result;
        },
      );

      return Response.json({ success: true, data: keys });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return Response.json(
          { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
          { status: 401 }
        );
      }
      logger.error({
        layer: "ai",
        event: "keys_write:caught",
        summary: "POST caught — translated to 500",
        error,
      });
      return Response.json(
        { success: false, error: { code: "SERVER_ERROR", message: "Failed to store key" } },
        { status: 500 }
      );
    }
  });
}
