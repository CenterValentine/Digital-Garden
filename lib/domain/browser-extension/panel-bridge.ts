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
