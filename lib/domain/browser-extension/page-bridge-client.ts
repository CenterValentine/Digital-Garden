/**
 * Page-bridge client (BROWSER-REACH B5).
 *
 * The app talks to the browser extension through a content-script bridge
 * (`page-bridge.js`): the app posts a `dg-browser-bookmarks-app` request (via
 * both `window.postMessage` and a `dg-browser-bookmarks-request` CustomEvent),
 * the extension replies with a `dg-browser-bookmarks-extension` message/event.
 * This is the ONLY app→extension channel that works on any app page (there is
 * deliberately no `externally_connectable`), so acquisition requests ride it.
 *
 * The request/response plumbing was previously trapped inside
 * `BrowserBookmarksSettingsPage`; this module is the reusable extraction so the
 * acquisition flow (and, later, the settings page + SendToTabButton) share one
 * implementation. Everything here is a client-only no-op when there's no DOM.
 */

const APP_SOURCE = "dg-browser-bookmarks-app";
const EXTENSION_SOURCE = "dg-browser-bookmarks-extension";
const PRESENCE_NODE_ID = "dg-browser-bookmarks-extension-presence";
const DEFAULT_TIMEOUT_MS = 3000;
// A session-tab fetch loads a real page and waits for it to settle before
// extracting, so acquisition needs a much longer ceiling than a config read.
const ACQUIRE_TIMEOUT_MS = 30_000;

/** True when the extension's content script has announced itself on this page. */
export function isExtensionInstalled(): boolean {
  if (typeof document === "undefined") return false;
  return document.getElementById(PRESENCE_NODE_ID) !== null;
}

/** Fire a request at the extension over both transports the bridge listens on. */
export function dispatchBridgeRequest(
  type: string,
  payload?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  window.postMessage({ source: APP_SOURCE, type, payload }, window.location.origin);
  document.dispatchEvent(
    new CustomEvent("dg-browser-bookmarks-request", {
      detail: { source: APP_SOURCE, type, payload },
    })
  );
}

/**
 * Send `requestType` and resolve with the payload of the first matching
 * `successType` reply, rejecting on `bridge-error` or after `timeoutMs`.
 * Listens on both the `message` and CustomEvent transports.
 */
export function requestBridgeResponse<T>(
  requestType: string,
  successType: string,
  payload?: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener("message", handleMessage);
      document.removeEventListener(
        "dg-browser-bookmarks-response",
        handleBridgeEvent as EventListener
      );
      window.clearTimeout(timeoutId);
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const inspect = (type: string | undefined, detailPayload: unknown): boolean => {
      if (type === successType) {
        finish(() => resolve(detailPayload as T));
        return true;
      }
      if (type === "bridge-error") {
        finish(() =>
          reject(
            new Error(
              (detailPayload as { message?: string } | undefined)?.message ||
                "Browser extension bridge failed"
            )
          )
        );
        return true;
      }
      return false;
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.source !== EXTENSION_SOURCE) return;
      inspect(event.data.type, event.data.payload);
    };

    const handleBridgeEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{
        source?: string;
        type?: string;
        payload?: unknown;
      }>;
      if (customEvent.detail?.source !== EXTENSION_SOURCE) return;
      inspect(customEvent.detail?.type, customEvent.detail?.payload);
    };

    const timeoutId = window.setTimeout(() => {
      finish(() => reject(new Error("Timed out waiting for the browser extension")));
    }, timeoutMs);

    window.addEventListener("message", handleMessage);
    document.addEventListener(
      "dg-browser-bookmarks-response",
      handleBridgeEvent as EventListener
    );

    dispatchBridgeRequest(requestType, payload);
  });
}

// ── Acquisition over the bridge (B5, P2/P3) ──────────────────────────────────

/** Which browser-side provider the extension should run. */
export type ExtensionAcquireMode = "session-tab" | "sw-fetch";

/** Readability output from a session-tab (P3) extraction — envelope-less. */
export interface ExtensionExtracted {
  title?: string;
  byline?: string;
  siteName?: string;
  excerpt?: string;
  content: string;
  quality: "readable" | "raw" | "empty";
}

/**
 * Flat result (repo is `strict:false`, matching the acquisition types' own
 * convention). `ok` true ⇒ exactly one of `rawHtml` (P2) / `extracted` (P3) is
 * set; `ok` false ⇒ `reason` explains the refusal (policy denial, budget, …).
 * The extension NEVER builds the trusted envelope — the server does that from
 * this raw material, so provenance/trust stay server-authoritative.
 */
export interface ExtensionAcquireResult {
  ok: boolean;
  mode?: ExtensionAcquireMode;
  url?: string;
  finalUrl?: string;
  rawHtml?: string;
  extracted?: ExtensionExtracted;
  reason?: string;
}

/**
 * Ask the extension to acquire `url` with the user's session. Returns a
 * structured result (policy denials/budget come back as `ok:false`, not a
 * throw); a missing extension resolves `ok:false` too so callers can fall back.
 */
export async function requestExtensionAcquire(
  url: string,
  opts: { mode: ExtensionAcquireMode; visible?: boolean }
): Promise<ExtensionAcquireResult> {
  if (!isExtensionInstalled()) {
    return { ok: false, reason: "extension not available" };
  }
  try {
    return await requestBridgeResponse<ExtensionAcquireResult>(
      "acquire-url",
      "acquire-url-result",
      // `visible` (read-completion launcher) asks the extension to open a
      // foreground tab; the extension gates it on its own setting + policy.
      { url, mode: opts.mode, visible: opts.visible === true },
      ACQUIRE_TIMEOUT_MS
    );
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "acquire failed",
    };
  }
}
