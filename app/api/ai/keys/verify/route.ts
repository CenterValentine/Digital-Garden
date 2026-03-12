/**
 * BYOK Key Verification API
 *
 * POST /api/ai/keys/verify — Test an API key by making a minimal call
 */

import { requireAuth } from "@/lib/infrastructure/auth";
import { resolveChatModel } from "@/lib/domain/ai/providers/registry";
import { generateText } from "ai";
import type { VerifyKeyRequest } from "@/lib/domain/ai/keys";
import { PROVIDER_CATALOG } from "@/lib/domain/ai/providers/catalog";

export async function POST(request: Request) {
  try {
    await requireAuth();
    const body: VerifyKeyRequest = await request.json();

    if (!body.providerId || !body.apiKey) {
      return Response.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "providerId and apiKey are required" } },
        { status: 400 }
      );
    }

    // Find the cheapest model for this provider to minimize verification cost
    const provider = PROVIDER_CATALOG.find((p) => p.id === body.providerId);
    if (!provider || provider.models.length === 0) {
      return Response.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: `Unknown provider: ${body.providerId}` } },
        { status: 400 }
      );
    }

    // Pick lowest cost model for verification
    const cheapestModel =
      provider.models.find((m) => m.costTier === "low") ?? provider.models[0];

    const model = await resolveChatModel({
      providerId: body.providerId,
      modelId: cheapestModel.id,
      apiKey: body.apiKey,
    });

    // Minimal API call — single token response
    await generateText({
      model,
      prompt: "Hi",
      maxOutputTokens: 5,
    });

    return Response.json({ success: true, data: { valid: true } });
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required") {
      return Response.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    // API key verification failed — return as invalid key, not server error
    return Response.json({
      success: true,
      data: {
        valid: false,
        error: error instanceof Error ? error.message : "Verification failed",
      },
    });
  }
}
