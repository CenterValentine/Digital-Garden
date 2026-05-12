/**
 * Next.js 16 Proxy
 *
 * Runs before every matched request. Two responsibilities:
 *
 *   1. Auth gate — redirects unauthenticated users from protected routes to /sign-in.
 *      The home page (/) is intentionally left unprotected so visitors can see a
 *      landing page without being forced to log in.
 *
 *   2. Embed iframe token promotion — when /embed/content/[id]?_t=<uuid> is loaded
 *      from the browser extension's iframe, the URL carries the session token in
 *      a query param (because cross-site iframes can't reliably receive cookies in
 *      browsers like Vivaldi with strict tracker blocking). The proxy sets the
 *      session_token cookie here so subsequent same-origin client API calls from
 *      within the iframe can authenticate.
 *
 * Always runs on the Node.js runtime — no runtime or config export needed.
 */

import { NextRequest, NextResponse } from "next/server";

/** Routes that require an active session */
const PROTECTED_PREFIXES = ["/content", "/settings", "/admin"];

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Skip static assets and API routes
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/favicon") ||
    /\.(?:ico|png|svg|jpg|jpeg|gif|webp|woff2?|ttf|otf)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Embed iframe: promote URL token to cookie before the page renders.
  // We don't validate against the DB here (proxy runtime should stay light) —
  // the page itself re-validates and redirects to /sign-in if the token is bad.
  if (pathname.startsWith("/embed/content/")) {
    const urlToken = searchParams.get("_t");
    const existingCookie = request.cookies.get("session_token")?.value;
    if (urlToken && existingCookie !== urlToken) {
      const response = NextResponse.next();
      response.cookies.set("session_token", urlToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 60, // 30 min — matches embed session lifetime
      });
      return response;
    }
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (!isProtected) return NextResponse.next();

  const hasSession = request.cookies.has("session_token");
  if (hasSession) return NextResponse.next();

  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(signInUrl);
}
