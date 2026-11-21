import "server-only";

/**
 * The garden as an OAuth 2.1 authorization server for its own MCP clients
 * (MCP-DATABASE-REACH-PLAN §8.1). Hosted apps (claude.ai, ChatGPT) and
 * `codex mcp login` speak OAuth only; personal access tokens keep working
 * untouched, because the token this issuer mints IS a personal access token:
 * an `McpToken` row with `issuedVia: "oauth"`, verified by the same
 * `validateMcpToken` → `verifyMcpBearer` path, with the same capabilities,
 * roots and jurisdiction.
 *
 * Library over bespoke: `@node-oauth/oauth2-server` does the protocol —
 * authorize/token request validation, redirect-URI matching, PKCE (S256
 * only; `plain` is refused by default), code expiry, error shapes. This file
 * is its storage model plus the Next.js request adapters. The MCP SDK's v1
 * `mcpAuthRouter` (the plan's first pick) did not survive into SDK 2.x.
 *
 * Deliberately absent: refresh tokens (consent is re-run when a token
 * expires, so reach is never silently renewed), confidential clients, and
 * client-ID metadata documents (CIMD — fetching a client-supplied URL needs
 * SSRF hardening; DCR covers every current client, see the PR).
 */

import crypto from "crypto";
import OAuth2Server, {
  type AuthorizationCodeModel,
  type Client,
  type User,
} from "@node-oauth/oauth2-server";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { createMcpTokenRecord, createMcpTokenValue } from "../tokens";
import {
  AUTHORIZATION_CODE_LIFETIME_SECONDS,
  grantFromJson,
  isAllowedRedirectUri,
  MAX_REDIRECT_URIS,
  MCP_OAUTH_CLIENT_ID_PREFIX,
  type McpOAuthGrant,
} from "./policy";

// ── storage model ─────────────────────────────────────────────────────

interface GardenOAuthUser extends User {
  id: string;
  grant: McpOAuthGrant;
}

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function toClient(row: { clientId: string; clientName: string; redirectUris: string[] }): Client {
  return {
    id: row.clientId,
    name: row.clientName,
    redirectUris: row.redirectUris,
    grants: ["authorization_code"],
  };
}

const model: AuthorizationCodeModel = {
  async getClient(clientId: string) {
    if (!clientId.startsWith(MCP_OAUTH_CLIENT_ID_PREFIX)) return null;
    const row = await prisma.mcpOAuthClient.findUnique({ where: { clientId } });
    return row ? toClient(row) : null;
  },

  async saveAuthorizationCode(code, client, user) {
    const u = user as GardenOAuthUser;
    // Expired codes are swept on write; the expiresAt index keeps this cheap.
    await prisma.mcpOAuthCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await prisma.mcpOAuthCode.create({
      data: {
        codeHash: hashCode(code.authorizationCode),
        clientId: client.id,
        userId: u.id,
        redirectUri: code.redirectUri,
        codeChallenge: code.codeChallenge ?? "",
        codeChallengeMethod: code.codeChallengeMethod ?? "",
        scope: code.scope ?? [],
        grant: u.grant as unknown as Prisma.InputJsonValue,
        expiresAt: code.expiresAt,
      },
    });
    return { ...code, client, user };
  },

  async getAuthorizationCode(authorizationCode: string) {
    const row = await prisma.mcpOAuthCode.findUnique({
      where: { codeHash: hashCode(authorizationCode) },
      include: { client: true },
    });
    if (!row) return null;
    const grant = grantFromJson(row.grant);
    if (!grant) return null;
    const user: GardenOAuthUser = { id: row.userId, grant };
    return {
      authorizationCode,
      expiresAt: row.expiresAt,
      redirectUri: row.redirectUri,
      scope: row.scope,
      codeChallenge: row.codeChallenge || undefined,
      codeChallengeMethod: row.codeChallengeMethod || undefined,
      client: toClient(row.client),
      user,
    };
  },

  /** Single use: the delete is the claim — a concurrent replay deletes nothing and fails. */
  async revokeAuthorizationCode(code) {
    const { count } = await prisma.mcpOAuthCode.deleteMany({
      where: { codeHash: hashCode(code.authorizationCode) },
    });
    return count === 1;
  },

  /** The consent screen decides; whatever the client asked for is advisory. */
  async validateScope(user) {
    return (user as GardenOAuthUser).grant.capabilities;
  },

  async generateAccessToken() {
    return createMcpTokenValue();
  },

  /** Mint the McpToken row — the same constructor Settings → MCP uses. */
  async saveToken(token, client, user) {
    const u = user as GardenOAuthUser;
    const { grant } = u;
    const expiresAt = grant.expiresInDays
      ? new Date(Date.now() + grant.expiresInDays * 86_400_000)
      : null;
    const label = typeof client.name === "string" && client.name ? client.name : "MCP client";
    const created = await createMcpTokenRecord(u.id, {
      name: `${label} (OAuth)`.slice(0, 120),
      capabilities: grant.capabilities,
      rootIds: grant.rootIds,
      allChats: grant.allChats,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      issuedVia: "oauth",
      tokenValue: token.accessToken,
    });
    await prisma.mcpOAuthClient
      .update({ where: { clientId: client.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return {
      accessToken: token.accessToken,
      // Undefined = no expires_in in the response (the token never expires).
      accessTokenExpiresAt: expiresAt ?? undefined,
      scope: created.record.capabilities,
      client,
      user,
    };
  },

  /** Unused: the MCP route verifies bearers through validateMcpToken, never this server. */
  async getAccessToken() {
    return null;
  },
};

export const mcpOAuthServer = new OAuth2Server({
  model,
  authorizationCodeLifetime: AUTHORIZATION_CODE_LIFETIME_SECONDS,
  requirePKCE: true,
  // Clients may omit state; PKCE is what binds the code to the requester.
  allowEmptyState: true,
});

// ── Next.js ↔ library adapters ─────────────────────────────────────────

/**
 * The library's `Request.is()` uses `type-is`, which reports "no body" unless
 * content-length or transfer-encoding is present — HTTP/2 requests often
 * carry neither — so the length of the body we already read is set here.
 */
export function toOAuthRequest(
  req: Request,
  body: Record<string, string>,
  rawBodyLength: number
): OAuth2Server.Request {
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });
  headers["content-length"] = String(rawBodyLength);
  const url = new URL(req.url);
  return new OAuth2Server.Request({
    method: req.method,
    headers,
    query: Object.fromEntries(url.searchParams),
    body,
  });
}

export function isOAuthError(error: unknown): error is OAuth2Server.OAuthError {
  return error instanceof OAuth2Server.OAuthError;
}

// ── dynamic client registration (RFC 7591) ─────────────────────────────

export interface RegisteredClient {
  client_id: string;
  client_id_issued_at: number;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
}

export interface RegistrationOutcome {
  client?: RegisteredClient;
  /** RFC 7591 §3.2.2 error code when refused. */
  error?: string;
  errorDescription?: string;
}

/**
 * Register a public client. Requested auth methods and grant types are
 * replaced with what this server supports (RFC 7591 §3.2.1 permits it):
 * `none` + `authorization_code`. Redirect URIs are the only thing refused.
 */
export async function registerMcpOAuthClient(raw: Record<string, unknown>): Promise<RegistrationOutcome> {
  const uris = Array.isArray(raw.redirect_uris) ? raw.redirect_uris : [];
  if (uris.length === 0) {
    return { error: "invalid_redirect_uri", errorDescription: "redirect_uris must list at least one URI" };
  }
  if (uris.length > MAX_REDIRECT_URIS) {
    return { error: "invalid_redirect_uri", errorDescription: `at most ${MAX_REDIRECT_URIS} redirect_uris` };
  }
  const bad = uris.find((u) => !isAllowedRedirectUri(u));
  if (bad !== undefined) {
    return {
      error: "invalid_redirect_uri",
      errorDescription: `redirect URI not allowed: ${String(bad).slice(0, 200)} (https, http on loopback, or a reverse-domain app scheme)`,
    };
  }
  const name =
    typeof raw.client_name === "string" && raw.client_name.trim()
      ? raw.client_name.trim().slice(0, 200)
      : "MCP client";
  const clientId = `${MCP_OAUTH_CLIENT_ID_PREFIX}${crypto.randomBytes(16).toString("hex")}`;
  const row = await prisma.mcpOAuthClient.create({
    data: { clientId, clientName: name, redirectUris: [...new Set(uris as string[])] },
  });
  return {
    client: {
      client_id: row.clientId,
      client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
      client_name: row.clientName,
      redirect_uris: row.redirectUris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  };
}

/** For the consent page: the registered client, or null. */
export async function findMcpOAuthClient(clientId: string) {
  if (!clientId.startsWith(MCP_OAUTH_CLIENT_ID_PREFIX)) return null;
  return prisma.mcpOAuthClient.findUnique({ where: { clientId } });
}
