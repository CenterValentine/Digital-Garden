/**
 * Spring-loaded tabs: while content is dragged out of a note's editor,
 * resting it on a tab opens that tab, so the content can be dropped into the
 * note it shows. Releasing switches the pane the drag started in back to the
 * tab it showed (owner, 2026-10-06: "if a user drags an image or text …
 * over another tab, that tab should open (even if it changes the pane it was
 * being dragged from) … Releasing will then change the view back to where
 * the user dragged it from").
 *
 * Only the SOURCE pane is switched back: a tab opened in another pane is
 * where the content went, and stays. If no hover changed the source pane,
 * a release changes nothing. Switching back is also what brings the source
 * note's editor back, so a move out of it can finish
 * (lib/domain/editor/cross-editor-move.ts).
 *
 * Pure: `tree:smooth:check` drives it; `use-spring-tabs.ts` wires it.
 */

/** How long a drag must rest on a tab before it opens. */
export const SPRING_TAB_DELAY_MS = 500;

export interface PanesLike {
  activePaneId: string | null;
  panes: Readonly<Record<string, { activeTabId: string | null } | undefined>>;
  tabs: Readonly<Record<string, { contentId: string } | undefined>>;
}

/** The pane showing `noteId` — the focused pane if it does, else the first that does. */
export function paneShowing(state: PanesLike, noteId: string | null): string | null {
  if (!noteId) return null;
  const shows = (paneId: string) => {
    const tabId = state.panes[paneId]?.activeTabId;
    return tabId ? state.tabs[tabId]?.contentId === noteId : false;
  };
  if (state.activePaneId && shows(state.activePaneId)) return state.activePaneId;
  return Object.keys(state.panes).find(shows) ?? null;
}

export interface SpringTabSession {
  /** The pane the drag started in, and the tab it showed. */
  sourcePaneId: string | null;
  sourceTabId: string | null;
  /** The pane that had focus. */
  focusedPaneId: string | null;
}

export function startSpringTabSession(state: PanesLike, noteId: string | null): SpringTabSession {
  const sourcePaneId = paneShowing(state, noteId);
  return {
    sourcePaneId,
    sourceTabId: sourcePaneId ? (state.panes[sourcePaneId]?.activeTabId ?? null) : null,
    focusedPaneId: state.activePaneId,
  };
}

/** Whether resting on `tabId` should open it: a tab that isn't already showing in its pane. */
export function springsTab(state: PanesLike, tabId: string | null, paneId: string | null): boolean {
  if (!tabId || !paneId) return false;
  return state.panes[paneId]?.activeTabId !== tabId;
}

/**
 * What a release puts back: the source pane's tab, and focus where it was —
 * only when a hover switched the source pane away from it.
 */
export function restoreAfterSpring(
  session: SpringTabSession | null,
  state: PanesLike,
): { tabId: string; focusPaneId: string | null } | null {
  if (!session?.sourcePaneId || !session.sourceTabId) return null;
  if (state.panes[session.sourcePaneId]?.activeTabId === session.sourceTabId) return null;
  if (!state.tabs[session.sourceTabId]) return null;
  return { tabId: session.sourceTabId, focusPaneId: session.focusedPaneId };
}
