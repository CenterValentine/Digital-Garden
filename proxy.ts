/**
 * Next.js 16 Proxy
 *
 * Runs before every matched request. Three responsibilities:
 *
 *   1. Tenant resolution (Epoch 18 Phase 2) — when `MULTITENANT_ENABLED=true`,
 *      resolves the request's Host header to a Tenant via
 *      `resolveTenantByHost` and injects `x-tenant-id` + `x-tenant-slug`
 *      headers that downstream pages read via
 *      `lib/domain/tenancy/get-current-tenant.ts`. With the flag off, this
 *      step is a no-op and `getCurrentTenant()` falls back to the legacy
 *      `SITE_OWNER_ID` env path on the page side.
 *
 *   2. Auth gate — redirects unauthenticated users from protected routes to /sign-in.
 *      The home page (/) is intentionally left unprotected so visitors can see a
 *      landing page without being forced to log in.
 *
 *   3. Embed iframe token promotion — when /embed/content/[id]?_t=<uuid> is loaded
 *      from the browser extension's iframe, the URL carries the session token in
 *      a query param (because cross-site iframes can't reliably receive cookies in
 *      browsers like Vivaldi with strict tracker blocking). The proxy sets the
 *      session_token cookie here so subsequent same-origin client API calls from
 *      within the iframe can authenticate.
 *
 * Always runs on the Node.js runtime — no runtime or config export needed.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/core/logger/emit";
import { withTrace } from "@/lib/core/logger/context";
import { normalizeHost, resolveTenantByHost } from "@/lib/domain/tenancy";
import { validateSession } from "@/lib/infrastructure/auth/session";

/** Routes that require an active session */
const PROTECTED_PREFIXES = ["/content", "/settings", "/admin"];

const MULTITENANT_ENABLED = process.env.MULTITENANT_ENABLED === "true";
const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN?.trim().toLowerCase();
const TRACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Derive a trace_id for this proxy's work. Honors x-trace-id if the caller
 * (e.g. an upstream gateway) provided one, else generates a fresh UUID.
 * Matches the pattern used by withRouteTrace for API handlers.
 */
function deriveTraceId(request: NextRequest): string {
  const headerVal = request.headers.get("x-trace-id");
  if (headerVal && TRACE_ID_PATTERN.test(headerVal)) {
    return headerVal;
  }
  return randomUUID();
}

/**
 * Generate a per-request nonce. Used by server-component layouts to put
 * `nonce={...}` on inline <script> tags so they survive a future strict
 * CSP `script-src 'nonce-{value}'`. Until that CSP header is added (M-2
 * follow-up), the nonce attribute is inert — browsers ignore it without
 * a referencing CSP — so this is pure prep work.
 *
 * 16 bytes of crypto-random encoded base64 ≈ 22 chars. Long enough that
 * an attacker can't guess it within the request's lifetime.
 */
function generateNonce(): string {
  return randomBytes(16).toString("base64");
}

/**
 * Build the Headers object that downstream pages will see via the
 * `headers()` server function. Always sets `x-nonce`; layers on tenant
 * headers (and trace continuity) when multi-tenant is enabled and the
 * host resolves.
 *
 * Runs inside a withTrace scope so the spans emitted by resolveTenantByHost
 * have a valid trace context. The proxy is upstream of every route handler,
 * so withRouteTrace hasn't opened a trace yet — we open our own here.
 */
async function buildInjectedHeaders(
  request: NextRequest,
  nonce: string,
): Promise<Headers> {
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);

  if (!MULTITENANT_ENABLED) return headers;

  const host = request.headers.get("host");

  // Platform domain (e.g. notetrellis.com) is reserved for the platform's
  // own marketing surfaces — it is NOT a tenant. Even if a TenantHost row
  // exists for it (e.g. a leftover from custom-host testing), skip tenant
  // injection so that downstream routes don't accidentally render some
  // tenant's content at platform paths. The home dispatcher (app/page.tsx)
  // short-circuits to PlatformHome by inspecting the host directly.
  // Subdomains of the platform (e.g. yourname.notetrellis.com) still
  // resolve normally via resolveTenantByHost's subdomain path.
  if (PLATFORM_DOMAIN && normalizeHost(host) === PLATFORM_DOMAIN) {
    return headers;
  }

  const traceId = deriveTraceId(request);

  await withTrace(traceId, async () => {
    const tenant = await resolveTenantByHost(host);

    if (!tenant) {
      logger.info({
        layer: "route",
        event: "tenancy:host:passthrough",
        summary: "host did not resolve to a tenant — passing through",
        attrs: { host: host ?? "(none)" },
      });
      return;
    }

    headers.set("x-tenant-id", tenant.tenantId);
    headers.set("x-tenant-slug", tenant.slug);
    // Forward the trace_id so the downstream withRouteTrace continues
    // the same trace instead of starting a new one.
    headers.set("x-trace-id", traceId);
  });

  return headers;
}

/**
 * Build a `NextResponse.next()` that carries the injected headers (nonce
 * plus optional tenant ids).
 */
function nextWithInjectedHeaders(injected: Headers): NextResponse {
  return NextResponse.next({ request: { headers: injected } });
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, searchParams } = request.nextUrl;

  // Skip static assets and API routes — no tenant resolution, no auth check.
  // .well-known/workflow is the Workflow DevKit's internal queue transport;
  // intercepting or buffering it breaks workflow execution (see WDK docs).
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/.well-known/workflow/") ||
    pathname.startsWith("/favicon") ||
    /\.(?:ico|png|svg|jpg|jpeg|gif|webp|woff2?|ttf|otf)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Per-request nonce + tenant resolution. Headers are built once and
  // shared across every downstream branch so the nonce a layout reads
  // matches the cookie/tenant context the route handler sees.
  const nonce = generateNonce();
  const injectedHeaders = await buildInjectedHeaders(request, nonce);

  // Embed iframe: promote URL token to cookie before the page renders.
  //
  // Two threats this branch defends against:
  //   1. Garbage tokens — set a junk cookie that wastes a page render before
  //      bouncing to /sign-in. Validate the URL token before setting.
  //   2. Cross-user session fixation — an attacker who possesses any valid
  //      session token crafts /embed/content/...?_t=ATTACKER_TOKEN and sends
  //      it to a logged-in victim, overriding their cookie. We block this by
  //      validating the existing cookie too and refusing to overwrite if it
  //      belongs to a different user.
  //
  // What is NOT addressed here (tracked as a follow-up): a logged-out
  // victim has no existing cookie to compare against, so promotion of any
  // valid attacker token still succeeds. Fully closing that gap requires a
  // different token model — single-use, time-bounded, or content-bound —
  // and is out of scope for this proxy-level patch.
  //
  // validateSession is cache-backed (hot tokens <1ms; invalid tokens are
  // negative-cached), so the added DB cost is paid only on first-touch.
  if (pathname.startsWith("/embed/content/")) {
    const urlToken = searchParams.get("_t");
    const existingCookie = request.cookies.get("session_token")?.value;
    if (urlToken && existingCookie !== urlToken) {
      const validatedUrl = await validateSession(urlToken);
      if (!validatedUrl) {
        logger.warn({
          layer: "auth",
          event: "embed_token_promote:rejected",
          summary: "rejected invalid _t param at proxy",
        });
        return nextWithInjectedHeaders(injectedHeaders);
      }

      if (existingCookie) {
        const validatedCookie = await validateSession(existingCookie);
        if (
          validatedCookie &&
          validatedCookie.user.id !== validatedUrl.user.id
        ) {
          logger.warn({
            layer: "auth",
            event: "embed_token_promote:cross_user_blocked",
            summary: "refused to override cookie belonging to a different user",
            attrs: {
              existing_user_id: validatedCookie.user.id,
              incoming_user_id: validatedUrl.user.id,
            },
          });
          return nextWithInjectedHeaders(injectedHeaders);
        }
      }

      const response = nextWithInjectedHeaders(injectedHeaders);
      response.cookies.set("session_token", urlToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        // Scope to /embed so this short-lived (30 min) embed session does NOT
        // shadow the long-lived (7 day) cookie at path "/" set by sign-in.
        // Both cookies coexist; browsers send the /embed one for embed routes
        // and the / one everywhere else.
        path: "/embed",
        maxAge: 30 * 60, // 30 min — matches embed session lifetime
      });
      return response;
    }
    return nextWithInjectedHeaders(injectedHeaders);
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (!isProtected) return nextWithInjectedHeaders(injectedHeaders);

  const hasSession = request.cookies.has("session_token");
  if (hasSession) return nextWithInjectedHeaders(injectedHeaders);

  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(signInUrl);
}
