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

/** The interactable + orientation a11y snapshot, stitched across frames. */
export function coBrowseSnapshot(): Promise<CoBrowseResult<{ nodes: CoBrowseNode[] }>> {
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
