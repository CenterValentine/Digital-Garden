/**
 * Typed message contract between the web app (renderer) and the desktop shell.
 *
 * Mirrors the mobile contract (mobile/src/bridge/messages.ts) and its web-side
 * copy (lib/mobile-bridge/client.ts). M1 generalizes the web side into
 * lib/native-shell/ and adds a `native-shell:contract:check` gate so the copies
 * cannot drift (DESKTOP-APP-PLAN D4).
 *
 *   web:*    — renderer → main, via window.dgNative.postMessage (preload → ipcRenderer.send)
 *   native:* — main → renderer, via webContents.send → window.dgNative.onMessage
 */

export const IPC_CHANNELS = {
  webToNative: "dg:web-to-native",
  nativeToWeb: "dg:native-to-web",
} as const;

/**
 * What this shell can do. The web app branches on capabilities, never on
 * "am I desktop?" (D4), so a capability added to mobile later lights up there
 * with no web-side change.
 */
export type NativeCapability = "open-external-url" | "window-title";

export const DESKTOP_CAPABILITIES: readonly NativeCapability[] = [
  "open-external-url",
  "window-title",
];

export type WebToNativeMessage =
  | { type: "web:open-external-url"; url: string }
  | { type: "web:set-title"; title: string };

export type NativeToWebMessage =
  | {
      type: "native:ready";
      shell: "desktop";
      version: string;
      capabilities: readonly NativeCapability[];
    }
  | { type: "native:connectivity"; online: boolean };

/**
 * Validate an IPC payload from the renderer. The page is remote content, so
 * nothing about the shape is trusted: unknown or malformed messages return
 * null and are dropped. Stricter than the mobile parser: field types are checked
 * too, not just the discriminant.
 */
export function parseWebToNativeMessage(data: unknown): WebToNativeMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;

  switch (record.type) {
    case "web:open-external-url":
      return typeof record.url === "string"
        ? { type: "web:open-external-url", url: record.url }
        : null;
    case "web:set-title":
      return typeof record.title === "string"
        ? { type: "web:set-title", title: record.title.slice(0, 200) }
        : null;
    default:
      return null;
  }
}
