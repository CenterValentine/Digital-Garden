"use client";

/**
 * Client-side companion to GoogleAuthError (./oauth.ts).
 *
 * Lives OUTSIDE the auth barrel on purpose: index.ts re-exports oauth.ts,
 * which imports Prisma, and Prisma must never reach a "use client" bundle.
 * Import this file directly.
 *
 * Contract: Google-auth-touching API routes attach `code` to their error
 * JSON (`{ error, code }`). A reauth code means the stored refresh token is
 * dead and the ONLY fix is a trip back through Google's consent screen —
 * which `/api/auth/google?reauth=1` forces. The toast is shown only at the
 * moment a Google-backed action actually fails, never preemptively.
 */

import { toast } from "sonner";

const REAUTH_CODES = new Set(["reauth_required", "not_linked"]);

export function isGoogleReauthCode(code: unknown): boolean {
  return typeof code === "string" && REAUTH_CODES.has(code);
}

export function googleReauthUrl(options?: {
  redirect?: string;
  scope?: string;
}): string {
  const redirect =
    options?.redirect ??
    (typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/content");
  const params = new URLSearchParams({ redirect, reauth: "1" });
  if (options?.scope) params.set("scope", options.scope);
  return `/api/auth/google?${params.toString()}`;
}

/**
 * Error toast with a "Reconnect" action that re-runs the Google consent
 * flow and returns the user to `redirect` (default: the current page).
 */
export function toastGoogleReauth(options?: {
  message?: string;
  redirect?: string;
  scope?: string;
}): void {
  toast.error(options?.message ?? "Google connection needs to be renewed", {
    description: "Reconnect to keep using Google features.",
    action: {
      label: "Reconnect",
      onClick: () => {
        window.location.href = googleReauthUrl(options);
      },
    },
  });
}
