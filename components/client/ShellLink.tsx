"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent, ReactNode } from "react";

import { isNativeShell, navigateInNativeShell } from "@/lib/mobile-bridge/client";

type ShellLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  /** Internal, auth-gated destination. */
  href: string;
  children: ReactNode;
};

/**
 * A <Link> that falls back to a full document load inside the native shell.
 *
 * The launcher's cards all point at auth-gated routes (/content, /settings,
 * /mobile/note/[id]). WKWebView does not reliably carry the session cookie on
 * the RSC fetch behind a soft navigation, so those taps can resolve to a
 * sign-in bounce — or to nothing at all, which reads as a dead card. Routing
 * them through a top-level request sends the cookie the way the destination's
 * proxy check expects. See navigateInNativeShell for the full rationale.
 *
 * The rendered href is identical in both environments and the branch is taken
 * at click time, so there is no hydration mismatch and desktop keeps soft nav.
 */
export default function ShellLink({
  href,
  children,
  onClick,
  ...rest
}: ShellLinkProps) {
  return (
    <Link
      href={href}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || !isNativeShell()) return;
        e.preventDefault();
        navigateInNativeShell(href);
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
