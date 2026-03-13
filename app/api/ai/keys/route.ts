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

export async function GET() {
  try {
    const session = await requireAuth();
    const keys = await listProviderKeys(session.user.id);
    return Response.json({ success: true, data: keys });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return Response.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }
    console.error("GET /api/ai/keys error:", error);
    return Response.json(
      { success: false, error: { code: "SERVER_ERROR", message: "Failed to list keys" } },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
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

    await storeProviderKey(
      session.user.id,
      body.providerId,
      body.apiKey,
      body.label ?? ""
    );

    // Return updated list
    const keys = await listProviderKeys(session.user.id);
    return Response.json({ success: true, data: keys });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return Response.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }
    console.error("POST /api/ai/keys error:", error);
    return Response.json(
      { success: false, error: { code: "SERVER_ERROR", message: "Failed to store key" } },
      { status: 500 }
    );
  }
}
