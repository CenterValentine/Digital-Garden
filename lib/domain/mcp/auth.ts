import "server-only";

/**
 * Bearer verification for the MCP route (MCP-DATABASE-REACH-PLAN §4, §8.1).
 *
 * ONE verifier: a personal access token minted on the settings page and a
 * token issued by the (later) OAuth flow are the same `McpToken` row, so
 * the route never learns how a key was minted. The verified identity rides
 * on `AuthInfo.extra` into every tool as an `McpPrincipal`.
 */

import type { AuthInfo } from "@modelcontextprotocol/server";
import { validateMcpToken, type McpTokenDto } from "./tokens";
import type { McpCapability } from "./capabilities";

export interface McpPrincipal {
  userId: string;
  token: McpTokenDto;
}

/** `withMcpAuth`'s verifier: undefined = 401 with the RFC 9728 challenge. */
export async function verifyMcpBearer(
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const ctx = await validateMcpToken(bearerToken, "garden:read");
  if (!ctx) return undefined;
  const principal: McpPrincipal = { userId: ctx.userId, token: ctx.record };
  return {
    token: bearerToken,
    clientId: ctx.record.id,
    scopes: ctx.record.capabilities,
    ...(ctx.record.expiresAt
      ? { expiresAt: Math.floor(new Date(ctx.record.expiresAt).getTime() / 1000) }
      : {}),
    extra: { principal },
  };
}

/** Pull the principal back out of a request context; null when unauthenticated. */
export function principalFrom(authInfo: AuthInfo | undefined): McpPrincipal | null {
  const p = authInfo?.extra?.principal as McpPrincipal | undefined;
  return p && typeof p.userId === "string" ? p : null;
}

export function hasCapability(p: McpPrincipal, cap: McpCapability): boolean {
  return p.token.capabilities.includes(cap);
}
