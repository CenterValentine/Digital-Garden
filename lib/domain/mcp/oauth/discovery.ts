/**
 * OAuth discovery for the garden's MCP server: the PURE half (no Prisma,
 * no `server-only`), so the `mcp:oauth:check` gate can import it.
 *
 * The chain a hosted client walks (MCP authorization spec, RFC 9728, RFC 8414):
 *
 *   POST /api/mcp                       → 401, WWW-Authenticate: resource_metadata=<PRM url>
 *   GET  <PRM url>                      → { resource, authorization_servers: [<issuer>] }
 *   GET  <issuer>/.well-known/oauth-authorization-server
 *                                       → { authorization_endpoint, token_endpoint, registration_endpoint, … }
 *
 * Every path in that chain is a constant here. The MCP route hands
 * `PROTECTED_RESOURCE_METADATA_PATH` to `withMcpAuth`, the well-known routes
 * build their bodies from these functions, and the gate asserts each path
 * resolves to a real route file instead of falling through to the public
 * `/[...path]` catch-all (which 307s unknown paths to `/` — the 2026-11 bug).
 *
 * The garden is its own issuer (MCP-DATABASE-REACH-PLAN §8.1): the issuer is
 * the request's public origin, the same origin `withMcpAuth` uses for the
 * challenge, so the three documents can never disagree about the host.
 */

import { generateProtectedResourceMetadata } from "mcp-handler";
import { MCP_CAPABILITIES } from "../capabilities";

/** The protected resource: the MCP endpoint itself. */
export const MCP_RESOURCE_PATH = "/api/mcp";

/**
 * What the 401 challenge advertises. The bare form (no resource suffix) is
 * mcp-handler's default and what deployed clients already cached; the
 * path-suffixed RFC 9728 §3.1 form is served too (`…/api/mcp`), because
 * spec-following clients try it first.
 */
export const PROTECTED_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";
export const PROTECTED_RESOURCE_METADATA_SUFFIXED_PATH = `${PROTECTED_RESOURCE_METADATA_PATH}${MCP_RESOURCE_PATH}`;

/** RFC 8414 metadata for an issuer with no path component. */
export const AUTHORIZATION_SERVER_METADATA_PATH = "/.well-known/oauth-authorization-server";

/** The consent page (a session-authed page, not an API route). */
export const AUTHORIZE_PATH = "/oauth/authorize";
/** Where the consent page posts the owner's decision. */
export const AUTHORIZE_DECISION_PATH = "/api/mcp/oauth/authorize";
export const TOKEN_PATH = "/api/mcp/oauth/token";
/** Dynamic client registration (RFC 7591). */
export const REGISTRATION_PATH = "/api/mcp/oauth/register";

/** Strip a trailing slash so `https://x/` and `https://x` are one issuer. */
export function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

export function mcpResourceUrl(origin: string): string {
  return `${normalizeOrigin(origin)}${MCP_RESOURCE_PATH}`;
}

/** RFC 9728 protected-resource metadata. */
export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
  resource_name: string;
}

/**
 * Built through mcp-handler's own generator (the library the route already
 * uses for the challenge). Its `protectedResourceHandler` is NOT used as-is:
 * served at the bare well-known path it derives `resource` by stripping the
 * `/.well-known/…` segment, which yields the origin — not `/api/mcp`.
 */
export function buildProtectedResourceMetadata(origin: string): ProtectedResourceMetadata {
  const issuer = normalizeOrigin(origin);
  return generateProtectedResourceMetadata({
    authServerUrls: [issuer],
    resourceUrl: mcpResourceUrl(issuer),
    additionalMetadata: {
      scopes_supported: [...MCP_CAPABILITIES],
      bearer_methods_supported: ["header"],
      resource_name: "Digital Garden MCP",
    },
  }) as ProtectedResourceMetadata;
}

/** RFC 8414 authorization-server metadata. */
export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  scopes_supported: string[];
  service_documentation: string;
}

export function buildAuthorizationServerMetadata(origin: string): AuthorizationServerMetadata {
  const issuer = normalizeOrigin(origin);
  return {
    issuer,
    authorization_endpoint: `${issuer}${AUTHORIZE_PATH}`,
    token_endpoint: `${issuer}${TOKEN_PATH}`,
    registration_endpoint: `${issuer}${REGISTRATION_PATH}`,
    response_types_supported: ["code"],
    // No refresh tokens: an issued token is an McpToken row the owner can see,
    // narrow and revoke on Settings → MCP; when it expires the client re-runs
    // consent rather than silently renewing reach the owner granted once.
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    // Public clients only — PKCE is the proof, there is no secret to leak.
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...MCP_CAPABILITIES],
    service_documentation: `${issuer}/settings/mcp`,
  };
}

/**
 * CORS for the token and registration endpoints. Safe to open: they take no
 * cookies, and a token exchange needs the PKCE verifier only the requester has.
 */
export const OAUTH_API_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

/** CORS for metadata: any origin may read it (browser-based MCP clients do). */
export const METADATA_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};
