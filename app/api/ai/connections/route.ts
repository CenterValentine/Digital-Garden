/**
 * AI Connections API — collection endpoint.
 *
 * GET  /api/ai/connections        — list user's active connections
 * POST /api/ai/connections        — create a connection (from a template or custom)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import {
  createConnection,
  listConnections,
  type CreateConnectionInput,
  type ConnectionKind,
  type AdapterKind,
} from "@/lib/features/ai-connections";
import { lookupTemplate } from "@/lib/features/ai-connections";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/ai/connections";

const KINDS: ConnectionKind[] = ["direct", "gateway", "custom"];
const ADAPTERS: AdapterKind[] = [
  "anthropic", "openai", "google", "xai", "mistral", "groq",
  "vercel-gateway", "openai-compat",
];

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const items = await listConnections(session.user.id);
      return NextResponse.json({ success: true, data: { items } });
    } catch (error) {
      return handleError("GET", error);
    }
  });
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const body = (await request.json()) as Partial<CreateConnectionInput>;

      // Validation
      if (!body.kind || !KINDS.includes(body.kind)) {
        return NextResponse.json(
          { success: false, error: "Invalid or missing `kind`" },
          { status: 400 },
        );
      }
      if (!body.label || body.label.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: "`label` is required" },
          { status: 400 },
        );
      }
      if (!body.apiKey || body.apiKey.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: "`apiKey` is required" },
          { status: 400 },
        );
      }
      if (!body.adapterKind || !ADAPTERS.includes(body.adapterKind as AdapterKind)) {
        return NextResponse.json(
          { success: false, error: "Invalid or missing `adapterKind`" },
          { status: 400 },
        );
      }

      // Apply template defaults when presetId is known
      const template = lookupTemplate(body.presetId ?? null);
      const input: CreateConnectionInput = {
        kind: body.kind,
        presetId: body.presetId ?? null,
        label: body.label.trim(),
        baseURL: body.baseURL ?? template?.defaultBaseURL ?? null,
        apiKey: body.apiKey,
        adapterKind: body.adapterKind,
        models: body.models ?? template?.defaultModels ?? [],
        isPinned: body.isPinned ?? false,
        pinOrder: body.pinOrder ?? null,
        preferRouteVia: body.preferRouteVia ?? null,
      };

      const created = await createConnection(session.user.id, input);
      return NextResponse.json(
        { success: true, data: created },
        { status: 201 },
      );
    } catch (error) {
      return handleError("POST", error);
    }
  });
}

function handleError(method: "GET" | "POST", error: unknown): NextResponse {
  if (error instanceof Error && error.message === "Authentication required") {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  logger.error({
    layer: "ai",
    event: `connections:${method.toLowerCase()}:caught`,
    summary: `${method} ${ROUTE_PATH} caught — 500`,
    error,
  });
  return NextResponse.json(
    {
      success: false,
      error: "Connection request failed",
      details: error instanceof Error ? error.message : "Unknown error",
    },
    { status: 500 },
  );
}
