/**
 * GET /embed/auth?token=<session-uuid>&to=<path>
 *
 * Token-based auth landing for the browser extension iframe.
 *
 * Why this exists: the extension pre-plants a session_token cookie via
 * chrome.cookies.set, but SameSite=None without Secure may be rejected by some
 * browsers on localhost HTTP. This route bypasses the cookie-delivery problem
 * entirely — the extension passes the short-lived session token in the URL,
 * the server validates it and sets the cookie in the redirect response. All
 * subsequent navigations are same-origin (localhost → localhost), so SameSite=Lax
 * is sufficient and third-party cookie restrictions never apply.
 *
 * Security: `to` is validated against the current origin to prevent open redirects.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token = searchParams.get("token");
  const to = searchParams.get("to") ?? "/sign-in";

  const signIn = NextResponse.redirect(new URL("/sign-in", request.url));

  if (!token) return signIn;

  const session = await prisma.session.findFirst({
    where: { token, expiresAt: { gt: new Date() } },
    select: { token: true, expiresAt: true },
  });

  if (!session) return signIn;

  // Prevent open redirects — `to` must be a path on the same origin.
  let dest: URL;
  try {
    dest = new URL(to, origin);
    if (dest.origin !== origin) return signIn;
  } catch {
    return signIn;
  }

  const response = NextResponse.redirect(dest);
  const isSecure = request.url.startsWith("https://");

  // SameSite=Lax is sufficient: after this redirect all subsequent requests
  // from within the iframe are same-origin (localhost:3014 → localhost:3014).
  response.cookies.set("session_token", session.token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    expires: session.expiresAt,
    // Scope to /embed so a short-lived embed session never shadows the
    // long-lived cookie at path "/" set by regular sign-in.
    path: "/embed",
  });

  return response;
}
