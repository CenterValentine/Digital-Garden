/**
 * Panel → extension bridge (BROWSER-REACH C2, app side).
 *
 * The side panel is an iframe inside an extension page. Anything that has to
 * happen *on the web page* — opening an overlay, for instance — must be asked
 * for through the panel host, which relays to the background service worker.
 *
 * Everything here is a no-op outside the panel, so callers can wire these
 * affordances unconditionally and let the surface decide.
 */

import { isAllowedEmbedMessageOrigin } from "./embed-message-origins";
import type {
  ExtensionAcquireMode,
  ExtensionAcquireResult,
} from "./page-bridge-client";

export type OverlayCorner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export const OVERLAY_CORNERS: OverlayCorner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

/** True when this document is the extension side panel's embed. */
export function isPanelEmbedSurface(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname.startsWith("/embed/panel");
}

/**
 * Ask the extension to open `contentId` as an overlay on the current page.
 * `corner` is where on the page it should land — the panel's four quadrants
 * map onto it, since a drag can't cross from the panel into the page.
 */
export function requestOverlayOpen(
  contentId: string,
  options: { corner?: OverlayCorner; contentKind?: string } = {}
): void {
  if (!isPanelEmbedSurface()) return;
  window.parent.postMessage(
    {
      v: 1,
      source: "dg-panel-embed",
      type: "open-overlay",
      payload: {
        contentId,
        corner: options.corner ?? "top-right",
        contentKind: options.contentKind ?? "embed",
      },
    },
    "*"
  );
}

/**
 * Ask the panel host to capture the current page at `scope`. The host relays
 * to the active tab's content script and posts the result back, which the
 * PanelShellClient listener writes to the page-context store.
 */
export function requestPageCapture(scope: string): void {
  if (!isPanelEmbedSurface()) return;
  window.parent.postMessage(
    { v: 1, source: "dg-panel-embed", type: "capture-page", payload: { scope } },
    "*"
  );
}

/** Ask the panel host to screenshot the visible area of the active tab. */
export function requestScreenshot(): void {
  if (!isPanelEmbedSurface()) return;
  window.parent.postMessage(
    { v: 1, source: "dg-panel-embed", type: "capture-screenshot" },
    "*"
  );
}

/**
 * Ask the panel host to fetch the Associated-Content resource context for a
 * page URL (Quick access). The panel embed runs on the app's *session* auth
 * and can't hit the extension's bearer-auth resource-context route directly,
 * so the host relays to the background worker (which holds the bearer token)
 * and posts the result back as a `resource-context` message. Mirrors the B2
 * page-capture relay.
 */
export function requestResourceContext(payload: {
  url: string;
  title?: string;
  faviconUrl?: string;
}): void {
  if (!isPanelEmbedSurface()) return;
  window.parent.postMessage(
    { v: 1, source: "dg-panel-embed", type: "fetch-resource-context", payload },
    "*"
  );
}

/**
 * Ask the panel host for other content on the same domain ("More from
 * {hostname}"). Relayed to the background exactly like resource-context; the
 * result comes back as a `domain-associations` message.
 */
export function requestDomainAssociations(payload: {
  url: string;
  excludeResourceId?: string;
}): void {
  if (!isPanelEmbedSurface()) return;
  window.parent.postMessage(
    { v: 1, source: "dg-panel-embed", type: "fetch-domain-associations", payload },
    "*"
  );
}

/**
 * Resolve the page's external content node — the anchor for "chat about this
 * page." Conversations need a ContentNode; the host reuses the page's existing
 * external node if there is one, else creates it, and replies with a single
 * content id as a `page-node-resolved` message.
 */
export function requestResolvePageNode(payload: {
  url: string;
  title?: string;
}): void {
  if (!isPanelEmbedSurface()) return;
  window.parent.postMessage(
    { v: 1, source: "dg-panel-embed", type: "resolve-page-node", payload },
    "*"
  );
}

/**
 * Link the given page (by URL) to a content note (B3-B). The host resolves the
 * URL to a webResourceId (via resource-context) then creates the association;
 * the result comes back as an `association-changed` message. Also used as the
 * manual "associate the page I'm viewing right now" action from the note's link
 * icon — the caller passes its current (live) page URL.
 */
export function requestAssociate(payload: {
  url: string;
  contentId: string;
  title?: string;
}): void {
  if (!isPanelEmbedSurface()) return;
  window.parent.postMessage(
    { v: 1, source: "dg-panel-embed", type: "associate-page", payload },
    "*"
  );
}

/** Unlink a page from a content note (B3-B). Replies `association-changed`. */
export function requestUnassociate(payload: {
  url: string;
  contentId: string;
}): void {
  if (!isPanelEmbedSurface()) return;
  window.parent.postMessage(
    { v: 1, source: "dg-panel-embed", type: "unassociate-page", payload },
    "*"
  );
}

/**
 * Auto-capture controls (B3-B), stored in the extension's chrome.storage.
 * `autoAssociate` defaults OFF (settle-then-associate is opt-in); `navHistory`
 * defaults ON (viewership log, user-disableable); `denylist` is user-authored.
 */
export interface CaptureSettings {
  autoAssociate: boolean;
  navHistory: boolean;
  denylist: string[];
}

/** One "page you visited" entry from the persisted browser-history log. */
export interface PageHistoryEntry {
  url: string;
  normalizedUrl: string;
  title: string;
  favIconUrl: string | null;
  firstViewedAt: string;
  lastViewedAt: string;
  viewCount: number;
}

/**
 * Ask the host for the capture settings (killswitch + denylist). The reply
 * arrives as a `capture-settings` host→embed message. Used to gate the panel's
 * settle-then-associate and to seed the Recents browser-history filter.
 */
export function requestCaptureSettings(): void {
  if (!isPanelEmbedSurface()) return;
  window.parent.postMessage(
    { v: 1, source: "dg-panel-embed", type: "get-capture-settings" },
    "*"
  );
}

/**
 * Ask the host for the persisted browser page-history (Phase C viewership).
 * The reply arrives as a `page-history` host→embed message. Browser-only —
 * this data never left the browser, so it's absent in the standalone app.
 */
export function requestPageHistory(): void {
  if (!isPanelEmbedSurface()) return;
  window.parent.postMessage(
    { v: 1, source: "dg-panel-embed", type: "get-page-history" },
    "*"
  );
}

/** Ask the host to open a URL in a new browser tab (Recents history click). */
export function requestOpenUrl(url: string): void {
  if (!isPanelEmbedSurface()) return;
  window.parent.postMessage(
    { v: 1, source: "dg-panel-embed", type: "open-url", payload: { url } },
    "*"
  );
}

const PANEL_ACQUIRE_TIMEOUT_MS = 35_000;

/**
 * Panel-embed acquisition (B5). The extension's `page-bridge` content script
 * doesn't run in this iframe, so acquisition can't use it here — it rides the
 * panel-host channel instead (embed → host → background → provider). Unlike the
 * fire-and-forget helpers above, this is a promise-based round-trip: the host
 * replies with a single `acquire-url-result`. Only meaningful in the panel
 * embed; resolves `ok:false` elsewhere so the caller can fall back.
 *
 * Requests are issued sequentially by the acquisition ladder (P2 then P3), so a
 * single in-flight listener is sufficient — no request id needed.
 */
export function requestPanelAcquire(
  url: string,
  mode: ExtensionAcquireMode
): Promise<ExtensionAcquireResult> {
  return new Promise((resolve) => {
    if (!isPanelEmbedSurface()) {
      resolve({ ok: false, reason: "not in the panel embed" });
      return;
    }
    let settled = false;
    const finish = (result: ExtensionAcquireResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(result);
    };
    function onMessage(event: MessageEvent) {
      if (!isAllowedEmbedMessageOrigin(event.origin)) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.v !== 1 || data.source !== "dg-panel-host") return;
      if (data.type === "acquire-url-result") {
        finish(
          (data.payload ?? { ok: false, reason: "empty result" }) as ExtensionAcquireResult
        );
      }
    }
    const timer = window.setTimeout(
      () => finish({ ok: false, reason: "the extension took too long" }),
      PANEL_ACQUIRE_TIMEOUT_MS
    );
    window.addEventListener("message", onMessage);
    window.parent.postMessage(
      { v: 1, source: "dg-panel-embed", type: "acquire-url", payload: { url, mode } },
      "*"
    );
  });
}

/** Decode a data: URL into a File for the chat's attachment path. */
export function dataUrlToFile(dataUrl: string, filename: string): File | null {
  try {
    const [meta, b64] = dataUrl.split(",");
    if (!b64) return null;
    const mime = /:(.*?);/.exec(meta)?.[1] ?? "image/jpeg";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], filename, { type: mime });
  } catch {
    return null;
  }
}
