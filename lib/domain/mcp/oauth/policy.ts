/**
 * The garden issuer's PURE rules (no Prisma) — what a client may register,
 * and how the consent screen's form becomes a token grant. Pinned by
 * `pnpm mcp:oauth:check`.
 */

import { parseMcpCapabilities, type McpCapability } from "../capabilities";

export const MCP_OAUTH_CLIENT_ID_PREFIX = "dgmcpc_";
/** Authorization codes live five minutes (RFC 6749 §4.1.2 "shortly"). */
export const AUTHORIZATION_CODE_LIFETIME_SECONDS = 300;
/** What the consent screen pre-fills for expiry. Blank = never, as on Settings → MCP. */
export const DEFAULT_OAUTH_TOKEN_DAYS = 90;
export const MAX_REDIRECT_URIS = 10;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
/** RFC 8252 §7.1 private-use scheme: reverse-domain, so it contains a dot. */
const PRIVATE_USE_SCHEME = /^[a-z][a-z0-9+-]*(\.[a-z0-9+-]+)+:$/;
const FORBIDDEN_SCHEMES = new Set(["javascript:", "data:", "file:", "vbscript:", "blob:", "about:"]);

/**
 * A redirect URI a registering client may claim:
 *   - https anywhere (hosted apps: claude.ai, chatgpt.com),
 *   - http only on loopback (CLIs: Claude Code, Codex, Gemini CLI — RFC 8252 §7.3),
 *   - a reverse-domain private-use scheme (desktop apps such as `cursor://`).
 * Never a fragment (RFC 6749 §3.1.2), never credentials in the URL.
 */
export function isAllowedRedirectUri(raw: unknown): boolean {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (FORBIDDEN_SCHEMES.has(url.protocol)) return false;
  if (url.protocol === "https:") return url.hostname.length > 0;
  if (url.protocol === "http:") return LOOPBACK_HOSTS.has(url.hostname);
  return PRIVATE_USE_SCHEME.test(url.protocol);
}

/** The redirect URI's host (or scheme), for the consent screen's "you'll be sent to" line. */
export function redirectTargetLabel(uri: string): string {
  try {
    const url = new URL(uri);
    return url.host || url.protocol.replace(/:$/, "");
  } catch {
    return uri;
  }
}

/** What the owner ticked on the consent screen; rides on the authorization code. */
export interface McpOAuthGrant {
  capabilities: McpCapability[];
  rootIds: string[];
  allChats: boolean;
  /** Null = never expires (revocable on Settings → MCP like any token). */
  expiresInDays: number | null;
}

export interface McpOAuthGrantParse {
  ok: boolean;
  grant?: McpOAuthGrant;
  reason?: string;
}

/** Shape-check the consent form; ownership of roots is checked server-side. */
export function parseConsentGrant(raw: Record<string, unknown>): McpOAuthGrantParse {
  const caps = parseMcpCapabilities(raw.capabilities);
  if (!caps.ok) return { ok: false, reason: caps.reason };
  const rootIds = Array.isArray(raw.rootIds)
    ? [...new Set(raw.rootIds.filter((x): x is string => typeof x === "string" && x.length > 0))]
    : [];
  let expiresInDays: number | null = null;
  if (raw.expiresInDays !== null && raw.expiresInDays !== undefined && raw.expiresInDays !== "") {
    const n = Number(raw.expiresInDays);
    if (!Number.isFinite(n) || n <= 0 || n > 3650) {
      return { ok: false, reason: "expiry must be between 1 and 3650 days, or blank for never" };
    }
    expiresInDays = Math.floor(n);
  }
  return {
    ok: true,
    grant: { capabilities: caps.capabilities, rootIds, allChats: raw.allChats === true, expiresInDays },
  };
}

/**
 * Narrow a stored grant back out of JSON (the code row's `grant` column).
 * Malformed → null, and the exchange fails with invalid_grant. It never falls
 * back to a default: empty roots mean the WHOLE garden, so any "safe default"
 * here would be the widest grant there is.
 */
export function grantFromJson(raw: unknown): McpOAuthGrant | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.capabilities) || !Array.isArray(obj.rootIds)) return null;
  const parsed = parseConsentGrant(obj);
  return parsed.ok && parsed.grant ? parsed.grant : null;
}
