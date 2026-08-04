/**
 * App-side BrowserActuator client (Phase 2b, Slice 5a).
 *
 * Typed wrappers over the panel-host co-browse channel (`requestCoBrowse`). The
 * interaction engine itself — chrome.debugger + CDP, the a11y snapshot, and the
 * resolveFresh → scroll → hit-test → dispatch pipeline — lives in the extension
 * background; this module is the app's handle to it. It is reachable ONLY from
 * the trust-gated side-panel embed (see requestCoBrowse), never a web page.
 *
 * D-ENG: raw CDP is the locked engine behind this `BrowserActuator` seam;
 * playwright-crx is the deferred swap for the form-fill / hard-acting phases —
 * swapping it in means changing what the background does, not this client.
 */
import {
  isPanelEmbedSurface,
  requestCoBrowse,
  type CoBrowseResult,
} from "./panel-bridge";

/** A semantic target the agent selects from the a11y snapshot (role + name). */
export interface CoBrowseTarget {
  role?: string;
  name?: string;
  /** Disambiguator when role+name matches more than one node (0-based). */
  nth?: number;
}

/** One normalized a11y node from the snapshot (mirrors the extension shape). */
export interface CoBrowseNode {
  backendDOMNodeId?: number;
  role?: string;
  name?: string;
  value?: string;
  expanded?: boolean;
  disabled?: boolean;
  focusable?: boolean;
  level?: number;
  interactable?: boolean;
  /** Nearest container (card/row/listitem) — elements sharing it belong together. */
  group?: number;
  /** Set when the node lives in a cross-origin (OOPIF) child frame. */
  sessionId?: string;
  frameUrl?: string;
}

/** Co-browse is trust-gated to the side panel; false everywhere else. */
export function isCoBrowseAvailable(): boolean {
  return isPanelEmbedSurface();
}

/** Attach a CDP session to `tabId` (defaults to the resolved active tab). */
export function coBrowseAttach(tabId?: number): Promise<CoBrowseResult> {
  return requestCoBrowse("attach", typeof tabId === "number" ? { tabId } : {});
}

/** Detach — ends the session and drops the debugger banner. */
export function coBrowseDetach(): Promise<CoBrowseResult> {
  return requestCoBrowse("detach");
}

/** Current session (or null) — for the co-browse indicator. */
export function coBrowseStatus(): Promise<CoBrowseResult<{ session: unknown }>> {
  return requestCoBrowse("status");
}

/**
 * The interactable + orientation a11y snapshot (+ current url), stitched across
 * frames. `captchaDetected` is true when a captcha/anti-bot challenge frame is
 * attached — its nodes are excluded from `nodes`, and the model is told to pause
 * and hand to the user (captcha = detect + human, never act).
 */
export function coBrowseSnapshot(): Promise<
  CoBrowseResult<{ nodes: CoBrowseNode[]; url?: string; captchaDetected?: boolean }>
> {
  return requestCoBrowse("snapshot");
}

/** Navigate the bound tab (reuses the reads' SSRF/private-net policy gate). */
export function coBrowseNavigate(url: string): Promise<CoBrowseResult> {
  return requestCoBrowse("navigate", { url });
}

/** Trusted click on a semantic target (same-frame or cross-frame). */
export function coBrowseClick(target: CoBrowseTarget): Promise<CoBrowseResult<{ x: number; y: number }>> {
  return requestCoBrowse("click", { ...target });
}

/** Trusted hover (fires native :hover / JS menus). */
export function coBrowseHover(target: CoBrowseTarget): Promise<CoBrowseResult<{ x: number; y: number }>> {
  return requestCoBrowse("hover", { ...target });
}

/** Focus a field and type `text` (basic inputs; rich/controlled → later). */
export function coBrowseType(target: CoBrowseTarget, text: string): Promise<CoBrowseResult> {
  return requestCoBrowse("type", { ...target, text });
}

/** Scroll the page to reveal lazy/virtualized content. Returns `atBottom`. */
export function coBrowseScroll(opts?: {
  direction?: "down" | "up";
  to?: "bottom" | "top";
}): Promise<CoBrowseResult<{ atBottom: boolean }>> {
  return requestCoBrowse("scroll", { ...(opts ?? {}) });
}

/** Auto scroll-collect a long/virtualized list in one call (dedup by role+name+value). */
export function coBrowseCollect(): Promise<CoBrowseResult<{ nodes: CoBrowseNode[]; url?: string }>> {
  return requestCoBrowse("collect");
}

/** Inject the on-page countdown overlay (T1) — returns immediately; engine sleeps. */
export function coBrowseShowTimer(seconds: number, label?: string): Promise<CoBrowseResult> {
  return requestCoBrowse("show-timer", { seconds, ...(label ? { label } : {}) });
}

/** Remove the on-page countdown overlay early. */
export function coBrowseClearTimer(): Promise<CoBrowseResult> {
  return requestCoBrowse("clear-timer");
}

/** Go back to the previous page (undo a navigation). */
export function coBrowseBack(): Promise<CoBrowseResult> {
  return requestCoBrowse("back");
}

// ── Session / tab manager (Slice 5b) ─────────────────────────────────────────

/** One open tab's metadata (for "pick a tab" and metadata resolution). */
export interface CoBrowseTab {
  tabId: number;
  title: string;
  url: string;
  favIconUrl: string | null;
  active: boolean;
  windowId: number;
}

/**
 * Open a NEW agent-owned tab and drive it (the default topology). Foregrounds it
 * by default so the user sees the agent start; focus emulation keeps it live if
 * they switch away. Replaces any current session.
 */
export function coBrowseOpen(url: string, opts?: { active?: boolean }): Promise<CoBrowseResult<{ tabId: number }>> {
  return requestCoBrowse("open", { url, active: opts?.active !== false });
}

/** Teleport the bound tab (and its window) to the foreground — "show me." */
export function coBrowseReveal(): Promise<CoBrowseResult<{ tabId: number }>> {
  return requestCoBrowse("reveal");
}

/** All open http(s) tabs (metadata) — backs an explicit "pick a tab." */
export function coBrowseListTabs(): Promise<CoBrowseResult<{ tabs: CoBrowseTab[] }>> {
  return requestCoBrowse("list-tabs");
}

/**
 * Lean tab-metadata resolution — "which tab did you mean?" Ranked candidates the
 * agent PROPOSES; the user approves before attaching (coBrowseAttach(tabId)).
 */
export function coBrowseResolveTab(
  query: string
): Promise<CoBrowseResult<{ candidates: (CoBrowseTab & { score: number })[] }>> {
  return requestCoBrowse("resolve-tab", { query });
}
