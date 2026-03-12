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

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requireAuth();
    const { id } = await context.params;
    const body: UpdateKeyRequest = await request.json();

    await updateProviderKey(id, session.user.id, body);
    const keys = await listProviderKeys(session.user.id);
    return Response.json({ success: true, data: keys });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return Response.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }
    console.error("PATCH /api/ai/keys/[id] error:", error);
    return Response.json(
      { success: false, error: { code: "SERVER_ERROR", message: "Failed to update key" } },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const session = await requireAuth();
    const { id } = await context.params;

    await deleteProviderKey(id, session.user.id);
    const keys = await listProviderKeys(session.user.id);
    return Response.json({ success: true, data: keys });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return Response.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }
    console.error("DELETE /api/ai/keys/[id] error:", error);
    return Response.json(
      { success: false, error: { code: "SERVER_ERROR", message: "Failed to delete key" } },
      { status: 500 }
    );
  }
}
