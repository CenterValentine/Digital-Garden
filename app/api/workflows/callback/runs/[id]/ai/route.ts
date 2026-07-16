import { NextRequest, NextResponse } from "next/server";

import { withRouteTrace } from "@/lib/core/logger";
import { generateViaChatRoute } from "@/extensions/workflows/server/ai";
import {
  CallbackError,
  handleCallbackError,
  readJsonBody,
  requireCallbackRun,
} from "@/extensions/workflows/server/callback";

const ROUTE_PATH = "/api/workflows/callback/runs/[id]/ai";

type Params = Promise<{ id: string }>;

const DEFAULT_MAX_OUTPUT_TOKENS = 700;
const MAX_OUTPUT_TOKENS_CAP = 4000;

/**
 * AI proxy — the "proxy-not-share" seam. An external engine (n8n) has no
 * provider keys; it POSTs a system/user prompt here and the app runs the
 * completion through the OWNER's BYOK feature routing (chat feature + fallback
 * chain), scoped by the run's owner. Returns `{ text, stubbed }`: `stubbed`
 * true means no AI route is configured (keyless env) — the engine decides how
 * to proceed rather than the run silently failing.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const { id } = await params;
      const { run } = await requireCallbackRun(request, id);
      const body = await readJsonBody(request);

      const user = body.user;
      if (typeof user !== "string" || user.trim().length === 0) {
        throw new CallbackError(
          400,
          "VALIDATION_ERROR",
          "user (the prompt) is required."
        );
      }
      const system =
        typeof body.system === "string" && body.system.length > 0
          ? body.system
          : "You are a helpful assistant executing a workflow step.";

      const requested =
        typeof body.maxOutputTokens === "number" && body.maxOutputTokens > 0
          ? Math.floor(body.maxOutputTokens)
          : DEFAULT_MAX_OUTPUT_TOKENS;
      const maxOutputTokens = Math.min(requested, MAX_OUTPUT_TOKENS_CAP);

      const text = await generateViaChatRoute(
        run.ownerId,
        system,
        user,
        maxOutputTokens
      );

      return NextResponse.json({
        success: true,
        data: { text, stubbed: text === null },
      });
    } catch (error) {
      return handleCallbackError(error, "Failed to run AI proxy completion");
    }
  });
}
