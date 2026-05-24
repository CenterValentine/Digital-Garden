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

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/core/logger/emit";
import { withTrace } from "@/lib/core/logger/context";
import { resolveTenantByHost } from "@/lib/domain/tenancy";

/** Routes that require an active session */
const PROTECTED_PREFIXES = ["/content", "/settings", "/admin"];

const MULTITENANT_ENABLED = process.env.MULTITENANT_ENABLED === "true";
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
 * Resolve the request's tenant and return a new Headers object with
 * x-tenant-id / x-tenant-slug injected. Returns null when the flag is off
 * or the host doesn't resolve — callers pass through without header
 * mutation in that case (preserving today's behavior).
 *
 * Runs inside a withTrace scope so the spans emitted by resolveTenantByHost
 * have a valid trace context. The proxy is upstream of every route handler,
 * so withRouteTrace hasn't opened a trace yet — we open our own here.
 */
async function resolveTenantHeaders(
  request: NextRequest,
): Promise<Headers | null> {
  if (!MULTITENANT_ENABLED) return null;

  const host = request.headers.get("host");
  const traceId = deriveTraceId(request);

  return withTrace(traceId, async () => {
    const tenant = await resolveTenantByHost(host);

    if (!tenant) {
      logger.info({
        layer: "route",
        event: "tenancy:host:passthrough",
        summary: "host did not resolve to a tenant — passing through",
        attrs: { host: host ?? "(none)" },
      });
      return null;
    }

    const headers = new Headers(request.headers);
    headers.set("x-tenant-id", tenant.tenantId);
    headers.set("x-tenant-slug", tenant.slug);
    // Forward the trace_id so the downstream withRouteTrace continues
    // the same trace instead of starting a new one.
    headers.set("x-trace-id", traceId);
    return headers;
  });
}

/**
 * Build a `NextResponse.next()` that carries the tenant-injected headers
 * when available. If no headers were produced (flag off or unresolved
 * host), this is a plain `NextResponse.next()` — same shape as before.
 */
function nextWithTenantHeaders(injected: Headers | null): NextResponse {
  if (!injected) return NextResponse.next();
  return NextResponse.next({ request: { headers: injected } });
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, searchParams } = request.nextUrl;

  // Skip static assets and API routes — no tenant resolution, no auth check.
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/favicon") ||
    /\.(?:ico|png|svg|jpg|jpeg|gif|webp|woff2?|ttf|otf)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Tenant resolution runs before auth/embed handling so injected headers
  // are present on every downstream branch.
  const injectedHeaders = await resolveTenantHeaders(request);

  // Embed iframe: promote URL token to cookie before the page renders.
  // We don't validate against the DB here (proxy runtime should stay light) —
  // the page itself re-validates and redirects to /sign-in if the token is bad.
  if (pathname.startsWith("/embed/content/")) {
    const urlToken = searchParams.get("_t");
    const existingCookie = request.cookies.get("session_token")?.value;
    if (urlToken && existingCookie !== urlToken) {
      const response = nextWithTenantHeaders(injectedHeaders);
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
    return nextWithTenantHeaders(injectedHeaders);
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (!isProtected) return nextWithTenantHeaders(injectedHeaders);

  const hasSession = request.cookies.has("session_token");
  if (hasSession) return nextWithTenantHeaders(injectedHeaders);

  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(signInUrl);
}
