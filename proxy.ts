/**
 * Next.js 16 Proxy
 *
 * Runs before every matched request. Redirects unauthenticated users from
 * protected routes to /sign-in. The home page (/) is intentionally left
 * unprotected so visitors can see a landing page without being forced to log in.
 *
 * Always runs on the Node.js runtime — no runtime or config export needed.
 */

import { NextRequest, NextResponse } from "next/server";

/** Routes that require an active session */
const PROTECTED_PREFIXES = ["/content", "/settings", "/admin"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets and API routes
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/favicon") ||
    /\.(?:ico|png|svg|jpg|jpeg|gif|webp|woff2?|ttf|otf)$/.test(pathname)
  ) {
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
