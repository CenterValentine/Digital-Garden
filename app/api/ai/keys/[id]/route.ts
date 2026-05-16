/**
 * BYOK Key Instance API
 *
 * PATCH  /api/ai/keys/[id] — Update label/active status
 * DELETE /api/ai/keys/[id] — Remove a stored key
 */

import { requireAuth } from "@/lib/infrastructure/auth";
import {
  updateProviderKey,
  deleteProviderKey,
  listProviderKeys,
} from "@/lib/domain/ai/keys";
import type { UpdateKeyRequest } from "@/lib/domain/ai/keys";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/ai/keys/[id]";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await context.params;
      const body: UpdateKeyRequest = await request.json();

      const keys = await withSpan(
        { layer: "ai", name: "keys_write" },
        { attrs: { key_id: id, op: "update" } },
        async (span) => {
          await updateProviderKey(id, session.user.id, body);
          const result = await listProviderKeys(session.user.id);
          span.attr("count", result.length).summary("key updated");
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
        summary: "PATCH caught — translated to 500",
        error,
      });
      return Response.json(
        { success: false, error: { code: "SERVER_ERROR", message: "Failed to update key" } },
        { status: 500 }
      );
    }
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await context.params;

      const keys = await withSpan(
        { layer: "ai", name: "keys_write" },
        { attrs: { key_id: id, op: "delete" } },
        async (span) => {
          await deleteProviderKey(id, session.user.id);
          const result = await listProviderKeys(session.user.id);
          span.attr("count", result.length).summary("key deleted");
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
        summary: "DELETE caught — translated to 500",
        error,
      });
      return Response.json(
        { success: false, error: { code: "SERVER_ERROR", message: "Failed to delete key" } },
        { status: 500 }
      );
    }
  });
}
