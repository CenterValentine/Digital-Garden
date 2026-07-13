/**
 * Typed message contract between the web app (running in the WebView) and
 * the native shell.
 *
 * Direction is encoded in the `type` prefix:
 *   web:*    — sent FROM the web page TO native (via window.ReactNativeWebView.postMessage)
 *   native:* — sent FROM native TO the web page (via webView.injectJavaScript / postMessage)
 *
 * Phase 1 only ACTS on `web:open-external-url` (and optionally `web:set-title`).
 * The remaining variants are declared now so both sides share one source of
 * truth as native capabilities land — they are contracts, not yet features.
 */

export type WebToNativeMessage =
  | { type: "web:open-external-url"; url: string }
  | { type: "web:set-title"; title: string }
  | { type: "web:haptic"; style?: "light" | "medium" | "heavy" }
  | { type: "web:request-camera" }
  | { type: "web:request-microphone" }
  | { type: "web:request-location" };

export type NativeToWebMessage =
  | { type: "native:ready" }
  | { type: "native:app-state"; state: "active" | "background" | "inactive" }
  | { type: "native:permission-result"; permission: string; granted: boolean };

const WEB_MESSAGE_TYPES: ReadonlySet<WebToNativeMessage["type"]> = new Set([
  "web:open-external-url",
  "web:set-title",
  "web:haptic",
  "web:request-camera",
  "web:request-microphone",
  "web:request-location",
]);

/**
 * Safely parse a raw onMessage payload into a WebToNativeMessage.
 *
 * WebView `onMessage` hands us arbitrary strings — anything on the page can
 * call postMessage. We never trust the shape: parse, then validate the
 * discriminant before returning. Unknown / malformed payloads return null so
 * callers can ignore them instead of throwing.
 */
export function parseWebToNativeMessage(
  raw: string
): WebToNativeMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    typeof data !== "object" ||
    data === null ||
    !("type" in data) ||
    typeof (data as { type: unknown }).type !== "string"
  ) {
    return null;
  }

  const type = (data as { type: string }).type;
  if (!WEB_MESSAGE_TYPES.has(type as WebToNativeMessage["type"])) {
    return null;
  }

  return data as WebToNativeMessage;
}

/** Serialize a native→web message for injection into the page. */
export function serializeNativeToWebMessage(
  message: NativeToWebMessage
): string {
  return JSON.stringify(message);
}
