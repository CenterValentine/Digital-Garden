/**
 * Dynamic client registration (RFC 7591) for hosted MCP clients — the
 * `registration_endpoint` in /.well-known/oauth-authorization-server.
 * Anonymous by design (a client registers before anyone signs in), so it
 * is rate-limited per caller IP. Registering grants nothing: every token
 * still needs the owner's consent on /oauth/authorize.
 */

import { NextRequest, NextResponse } from "next/server";
import { withRouteTrace, logger } from "@/lib/core/logger";
import { consumeRateLimit } from "@/lib/infrastructure/rate-limiting";
import { OAUTH_API_CORS_HEADERS } from "@/lib/domain/mcp/oauth/discovery";
import { registerMcpOAuthClient } from "@/lib/domain/mcp/oauth/server";

const ROUTE_PATH = "/api/mcp/oauth/register";
const REGISTRATIONS_PER_HOUR = 20;

function reply(body: unknown, status: number, extra: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { ...OAUTH_API_CORS_HEADERS, "Cache-Control": "no-store", ...extra },
  });
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limit = await consumeRateLimit({
      key: `mcp-oauth-register:${ip}`,
      limit: REGISTRATIONS_PER_HOUR,
      windowSeconds: 3_600,
    });
    if (!limit.ok) {
      return reply(
        { error: "too_many_requests", error_description: "Too many registrations; try again later." },
        429,
        { "Retry-After": String(limit.retryAfterSeconds) }
      );
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return reply({ error: "invalid_client_metadata", error_description: "Body must be a JSON object." }, 400);
    }
    try {
      const outcome = await registerMcpOAuthClient(body);
      if (!outcome.client) {
        return reply({ error: outcome.error, error_description: outcome.errorDescription }, 400);
      }
      logger.info({
        layer: "auth",
        event: "mcp_oauth:client_registered",
        summary: "MCP OAuth client registered",
        attrs: { client_name: outcome.client.client_name, redirect_uris: outcome.client.redirect_uris.length },
      });
      return reply(outcome.client, 201);
    } catch (error) {
      logger.error({ layer: "auth", event: "mcp_oauth:register_caught", summary: "registration failed", error });
      return reply({ error: "server_error", error_description: "Registration failed." }, 500);
    }
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_API_CORS_HEADERS });
}
