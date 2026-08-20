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

/** Mirror of `mobile/src/bridge/messages.ts` (`NativeToWebMessage`). */
export type NativeToWebMessage =
  | { type: "native:ready" }
  | { type: "native:app-state"; state: "active" | "background" | "inactive" }
  | { type: "native:permission-result"; permission: string; granted: boolean };

/**
 * Event name the shell dispatches on `window` for native→web messages.
 * A CustomEvent (rather than a global callback the page must register first)
 * means a message that arrives before any listener mounts is simply missed
 * rather than lost in a race — acceptable because every native→web message so
 * far is a state *transition*, and the next one re-establishes the truth.
 */
const NATIVE_MESSAGE_EVENT = "dg:native-message";

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

/** Narrow an arbitrary payload to a NativeToWebMessage, or null. */
function parseNativeToWebMessage(raw: unknown): NativeToWebMessage | null {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof data !== "object" || data === null) return null;
  const type = (data as { type?: unknown }).type;
  if (typeof type !== "string" || !type.startsWith("native:")) return null;
  return data as NativeToWebMessage;
}

/**
 * Subscribe to messages from the native shell. Returns an unsubscribe fn.
 * No-ops (returning a no-op unsubscriber) outside the shell and on the server,
 * so callers can wire it unconditionally.
 */
export function onNativeMessage(
  handler: (message: NativeToWebMessage) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const message = parseNativeToWebMessage(
      (event as CustomEvent<unknown>).detail
    );
    if (message) handler(message);
  };
  window.addEventListener(NATIVE_MESSAGE_EVENT, listener);
  return () => window.removeEventListener(NATIVE_MESSAGE_EVENT, listener);
}
