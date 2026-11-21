import "server-only";

/**
 * The consent step of the garden's OAuth flow. The page at /oauth/authorize
 * and its decision route both run `checkAuthorizeRequest` first, so the page
 * never renders a consent screen the decision route would refuse.
 *
 * RFC 6749 §4.1.2.1 splits failures in two:
 *   - FATAL — unknown client, or a redirect_uri the client never registered.
 *     The error is shown on the page; redirecting would hand the error (and
 *     the user) to an unverified URL.
 *   - REDIRECTABLE — everything else (bad response_type, missing PKCE, wrong
 *     resource). Sent back to the client's own redirect URI with `error=`.
 */

import { getPublicOrigin } from "mcp-handler";
import { isMcpCapability, type McpCapability } from "../capabilities";
import { mcpResourceUrl } from "./discovery";
import { findMcpOAuthClient } from "./server";

/** The authorize parameters we read; anything else the client sent is ignored. */
export const AUTHORIZE_PARAM_KEYS = [
  "client_id",
  "redirect_uri",
  "response_type",
  "code_challenge",
  "code_challenge_method",
  "state",
  "scope",
  "resource",
] as const;

export type AuthorizeParams = Partial<Record<(typeof AUTHORIZE_PARAM_KEYS)[number], string>>;

export function pickAuthorizeParams(source: Record<string, unknown>): AuthorizeParams {
  const out: AuthorizeParams = {};
  for (const key of AUTHORIZE_PARAM_KEYS) {
    const v = source[key];
    if (typeof v === "string") out[key] = v;
    else if (Array.isArray(v) && typeof v[0] === "string") out[key] = v[0];
  }
  return out;
}

export interface AuthorizeCheck {
  client?: { clientId: string; clientName: string };
  redirectUri?: string;
  /** Shown on the page; nothing is redirected. */
  fatal?: string;
  /** Sent back to the client's redirect URI. */
  redirectError?: { error: string; description: string };
  /** Capabilities the client asked for in `scope` (advisory: consent decides). */
  requestedCapabilities: McpCapability[];
}

export function publicOriginFromHeaders(h: Headers): string {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3015";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return getPublicOrigin(new Request(`${proto}://${host}/`, { headers: h }));
}

const trimSlash = (s: string) => s.replace(/\/+$/, "");

export async function checkAuthorizeRequest(
  params: AuthorizeParams,
  origin: string
): Promise<AuthorizeCheck> {
  const requestedCapabilities = (params.scope ?? "")
    .split(/\s+/)
    .filter(isMcpCapability);

  const clientId = params.client_id;
  if (!clientId) return { fatal: "The request did not say which app is asking (no client_id).", requestedCapabilities };
  const row = await findMcpOAuthClient(clientId);
  if (!row) {
    return {
      fatal: "This app is not registered with this garden. Reconnect it from the app so it registers again.",
      requestedCapabilities,
    };
  }
  const client = { clientId: row.clientId, clientName: row.clientName };

  let redirectUri = params.redirect_uri;
  if (!redirectUri) {
    if (row.redirectUris.length !== 1) {
      return { client, fatal: "The request did not say where to return (no redirect_uri).", requestedCapabilities };
    }
    redirectUri = row.redirectUris[0];
  }
  if (!row.redirectUris.includes(redirectUri)) {
    return {
      client,
      fatal: "The return address in this request is not one the app registered, so it was not followed.",
      requestedCapabilities,
    };
  }

  const fail = (error: string, description: string): AuthorizeCheck => ({
    client,
    redirectUri,
    redirectError: { error, description },
    requestedCapabilities,
  });

  if (params.response_type !== "code") {
    return fail("unsupported_response_type", "Only response_type=code is supported.");
  }
  if (!params.code_challenge) {
    return fail("invalid_request", "PKCE is required: send code_challenge with code_challenge_method=S256.");
  }
  if (params.code_challenge_method && params.code_challenge_method !== "S256") {
    return fail("invalid_request", "Only code_challenge_method=S256 is supported.");
  }
  // RFC 8707: a client that names a resource must name this MCP server.
  if (params.resource && trimSlash(params.resource) !== mcpResourceUrl(origin)) {
    return fail("invalid_target", `This server only issues tokens for ${mcpResourceUrl(origin)}.`);
  }
  return { client, redirectUri, requestedCapabilities };
}

/** The client's redirect URI with an RFC 6749 §4.1.2.1 error appended. */
export function errorRedirectUrl(
  redirectUri: string,
  state: string | undefined,
  error: string,
  description: string
): string {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}
