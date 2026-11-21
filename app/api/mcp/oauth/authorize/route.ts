/**
 * The consent screen's decision (POST from /oauth/authorize). Session-authed
 * and same-origin only: this is the one step a signed-in owner performs, and
 * it is where a grant (capabilities, roots, chats, expiry) is chosen.
 *
 * Returns `{ redirectUrl }` — the client's redirect URI carrying either the
 * authorization code or an error — and the page navigates there.
 */

import { NextRequest, NextResponse } from "next/server";
import OAuth2Server from "@node-oauth/oauth2-server";
import { getPublicOrigin } from "mcp-handler";
import { withRouteTrace, logger } from "@/lib/core/logger";
import { getSession } from "@/lib/infrastructure/auth/session";
import { assertOwnedMcpRoots } from "@/lib/domain/mcp/tokens";
import { parseConsentGrant } from "@/lib/domain/mcp/oauth/policy";
import {
  checkAuthorizeRequest,
  errorRedirectUrl,
  pickAuthorizeParams,
} from "@/lib/domain/mcp/oauth/authorize";
import { isOAuthError, mcpOAuthServer, toOAuthRequest } from "@/lib/domain/mcp/oauth/server";

const ROUTE_PATH = "/api/mcp/oauth/authorize";

function fail(status: number, message: string) {
  return NextResponse.json({ success: false, error: { message } }, { status, headers: { "Cache-Control": "no-store" } });
}
function go(redirectUrl: string) {
  return NextResponse.json({ success: true, data: { redirectUrl } }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    const origin = getPublicOrigin(request);
    // CSRF: the session cookie is SameSite=Lax, and this check refuses any
    // cross-origin caller outright.
    const callerOrigin = request.headers.get("origin");
    if (!callerOrigin || callerOrigin !== origin) return fail(403, "Cross-origin consent is not accepted.");

    const session = await getSession();
    if (!session) return fail(401, "Sign in again to approve this app.");

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.params !== "object" || body.params === null) {
      return fail(400, "Malformed consent request.");
    }
    const params = pickAuthorizeParams(body.params as Record<string, unknown>);
    const check = await checkAuthorizeRequest(params, origin);
    if (check.fatal || !check.redirectUri) return fail(400, check.fatal ?? "Invalid request.");
    if (check.redirectError) {
      return go(errorRedirectUrl(check.redirectUri, params.state, check.redirectError.error, check.redirectError.description));
    }
    if (body.decision !== "allow") {
      return go(errorRedirectUrl(check.redirectUri, params.state, "access_denied", "The garden owner declined."));
    }

    const parsed = parseConsentGrant((body.grant ?? {}) as Record<string, unknown>);
    if (!parsed.ok || !parsed.grant) return fail(400, parsed.reason ?? "Invalid grant.");
    try {
      await assertOwnedMcpRoots(session.user.id, parsed.grant.rootIds);
    } catch (error) {
      return fail(400, error instanceof Error ? error.message : "Invalid roots.");
    }

    const user = { id: session.user.id, grant: parsed.grant };
    const oauthBody: Record<string, string> = { ...params, redirect_uri: check.redirectUri } as Record<string, string>;
    const oauthRequest = toOAuthRequest(request, oauthBody, 0);
    // The library reads parameters from body OR query; the query here is the
    // decision route's own (empty), so only the checked params count.
    oauthRequest.query = {};
    const oauthResponse = new OAuth2Server.Response();
    try {
      await mcpOAuthServer.authorize(oauthRequest, oauthResponse, {
        authenticateHandler: { handle: () => user },
      });
    } catch (error) {
      if (!isOAuthError(error)) {
        logger.error({ layer: "auth", event: "mcp_oauth:authorize_caught", summary: "authorize failed", error });
        return fail(500, "Could not complete the authorization.");
      }
    }
    const location = oauthResponse.get("location") as string | undefined;
    if (!location) return fail(400, "The authorization request was refused.");
    logger.info({
      layer: "auth",
      event: "mcp_oauth:consent",
      summary: "owner approved an MCP OAuth client",
      attrs: { client_id: check.client?.clientId, capabilities: parsed.grant.capabilities.join(","), roots: parsed.grant.rootIds.length },
    });
    return go(location);
  });
}
