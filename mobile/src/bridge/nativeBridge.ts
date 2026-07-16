import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";

import { getAppOrigin } from "../config";
import type { WebToNativeMessage } from "./messages";

/**
 * Side-effecting handlers for messages the web page sends to native, plus the
 * navigation policy that decides when a link should leave the app.
 */

/** Schemes we will hand to the OS. Anything else is ignored for safety. */
const OPENABLE_SCHEMES = ["http:", "https:", "mailto:", "tel:"];

function getScheme(url: string): string | null {
  try {
    return new URL(url).protocol;
  } catch {
    return null;
  }
}

/** True when two URLs share the same scheme+host+port. */
export function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/**
 * Context the bridge needs from the host component (callbacks into React
 * state, etc.). Kept tiny on purpose — grow it as capabilities land.
 */
export interface NativeBridgeContext {
  /** Called when the page asks to set the shell's title (web:set-title). */
  onSetTitle?: (title: string) => void;
}

/**
 * Execute the effect for a parsed web→native message.
 *
 * Phase 1 implements `web:open-external-url` and `web:set-title`. The
 * permission / haptic variants are acknowledged but intentionally inert — they
 * exist as contracts for later phases, so the web app can start calling them
 * without crashing the shell.
 */
export async function handleWebToNativeMessage(
  message: WebToNativeMessage,
  ctx: NativeBridgeContext = {}
): Promise<void> {
  switch (message.type) {
    case "web:open-external-url": {
      const scheme = getScheme(message.url);
      // Never hand the OS a `javascript:`/`data:`/`file:` URL from page JS.
      if (!scheme || !OPENABLE_SCHEMES.includes(scheme)) return;
      // http(s) → in-app browser (SFSafariViewController): the user stays inside
      // the app and returns via a "Done" button, instead of being thrown out to
      // full Safari. mailto:/tel: have no web page to show, so hand those to the
      // OS (Mail / Phone) via Linking.
      if (scheme === "http:" || scheme === "https:") {
        await WebBrowser.openBrowserAsync(message.url);
        return;
      }
      const canOpen = await Linking.canOpenURL(message.url);
      if (canOpen) await Linking.openURL(message.url);
      return;
    }
    case "web:set-title": {
      ctx.onSetTitle?.(message.title);
      return;
    }
    // ── Future contracts (declared, not yet wired) ───────────────────────
    case "web:haptic":
    case "web:request-camera":
    case "web:request-microphone":
    case "web:request-location":
      return;
  }
}

/**
 * Navigation policy: should this URL open in the device browser instead of
 * inside the WebView?
 *
 * ┌─ DECISION POINT (yours to own) ────────────────────────────────────────┐
 * │ This predicate shapes both UX and security. Consider:                   │
 * │   • Same-origin app navigation MUST stay in the WebView (return false)  │
 * │     or you'll break the SPA.                                            │
 * │   • Truly external links (other domains) usually belong in the system   │
 * │     browser (return true) — better UX, and keeps your session cookies   │
 * │     out of third-party pages.                                           │
 * │   • OAuth / payment redirects are the tricky middle: some providers     │
 * │     need to round-trip back to your origin, so blanket-externalizing    │
 * │     every off-origin URL can strand the user. You may want an allowlist │
 * │     of "trusted redirect" hosts that stay in-WebView.                   │
 * │   • mailto:/tel: should always leave the WebView.                       │
 * │                                                                         │
 * │ The default below is deliberately conservative: keep same-origin and    │
 * │ about:blank in-app, send clearly-external http(s) + mail/tel out. Tune  │
 * │ it to your auth flow — that's the 5–10 lines worth your judgement.      │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export function shouldOpenExternally(
  targetUrl: string,
  appOrigin: string = getAppOrigin()
): boolean {
  if (targetUrl === "about:blank") return false;

  const scheme = getScheme(targetUrl);
  if (scheme === "mailto:" || scheme === "tel:") return true;

  // Only http(s) past this point; let unknown schemes stay in-WebView so the
  // page can decide what to do with them.
  if (scheme !== "http:" && scheme !== "https:") return false;

  // Same app origin → in-app navigation. Different origin → external.
  return !sameOrigin(targetUrl, appOrigin);
}
