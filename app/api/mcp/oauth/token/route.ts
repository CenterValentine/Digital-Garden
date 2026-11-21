/**
 * OAuth token endpoint (authorization_code + PKCE, public clients) — the
 * `token_endpoint` in /.well-known/oauth-authorization-server. A successful
 * exchange mints an McpToken row (`issuedVia: "oauth"`) carrying exactly what
 * the owner granted on the consent screen; the MCP route then verifies it
 * like any personal access token.
 */

import { NextRequest, NextResponse } from "next/server";
import OAuth2Server from "@node-oauth/oauth2-server";
import { withRouteTrace, logger } from "@/lib/core/logger";
import { OAUTH_API_CORS_HEADERS } from "@/lib/domain/mcp/oauth/discovery";
import { isOAuthError, mcpOAuthServer, toOAuthRequest } from "@/lib/domain/mcp/oauth/server";

const ROUTE_PATH = "/api/mcp/oauth/token";

function reply(response: OAuth2Server.Response, fallbackStatus: number) {
  return NextResponse.json(response.body ?? {}, {
    status: response.status && response.status !== 200 ? response.status : fallbackStatus,
    headers: {
      ...OAUTH_API_CORS_HEADERS,
      ...(response.headers ?? {}),
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
  });
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    const raw = await request.text();
    const body = Object.fromEntries(new URLSearchParams(raw));
    const oauthRequest = toOAuthRequest(request, body, Buffer.byteLength(raw));
    const oauthResponse = new OAuth2Server.Response();
    try {
      await mcpOAuthServer.token(oauthRequest, oauthResponse);
      logger.info({ layer: "auth", event: "mcp_oauth:token_issued", summary: "MCP OAuth token issued" });
      return reply(oauthResponse, 200);
    } catch (error) {
      if (isOAuthError(error)) {
        return reply(oauthResponse, error.code || 400);
      }
      logger.error({ layer: "auth", event: "mcp_oauth:token_caught", summary: "token exchange failed", error });
      return NextResponse.json(
        { error: "server_error", error_description: "Token exchange failed." },
        { status: 500, headers: OAUTH_API_CORS_HEADERS }
      );
    }
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_API_CORS_HEADERS });
}
