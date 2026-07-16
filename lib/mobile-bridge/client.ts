/**
 * Web-side bridge to the native mobile shell.
 *
 * When the Next.js app runs inside the React Native WebView, the shell injects
 * a `window.ReactNativeWebView` object with a `postMessage` method. This helper
 * is the web app's typed, dependency-light way to talk to native — and a no-op
 * (safely) when running in a normal browser.
 *
 * NOTE: the message contract is intentionally duplicated here rather than
 * imported from `mobile/` — the Expo app is an isolated package excluded from
 * the web build. Keep this union in sync with
 * `mobile/src/bridge/messages.ts` (`WebToNativeMessage`).
 */

export type WebToNativeMessage =
  | { type: "web:open-external-url"; url: string }
  | { type: "web:set-title"; title: string }
  | { type: "web:haptic"; style?: "light" | "medium" | "heavy" }
  | { type: "web:request-camera" }
  | { type: "web:request-microphone" }
  | { type: "web:request-location" };

interface ReactNativeWebViewBridge {
  postMessage: (data: string) => void;
}

type BridgeWindow = Window & {
  ReactNativeWebView?: ReactNativeWebViewBridge;
};

/** True when the page is running inside the native shell. */
export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as BridgeWindow).ReactNativeWebView?.postMessage);
}

/**
 * Send a message to the native shell. Returns true if it was delivered, false
 * when not running inside the shell (so callers can fall back to web behavior).
 */
export function postToNative(message: WebToNativeMessage): boolean {
  if (typeof window === "undefined") return false;
  const bridge = (window as BridgeWindow).ReactNativeWebView;
  if (!bridge?.postMessage) return false;
  bridge.postMessage(JSON.stringify(message));
  return true;
}

/**
 * Open a URL the right way depending on environment: hand it to native (which
 * opens the system browser) when in the shell, otherwise open a new tab.
 */
export function openExternalUrl(url: string): void {
  if (postToNative({ type: "web:open-external-url", url })) return;
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
