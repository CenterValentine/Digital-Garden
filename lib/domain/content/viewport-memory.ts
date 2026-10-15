// Per-document viewport memory — "leave a tab, come back to the same spot".
//
// WHY THIS EXISTS
// The main panel renders exactly ONE `MainPanelContent` per *pane*, never per
// tab (`MainPanelWorkspace.tsx`), and the loading branch
// (`if (isLoading) return <EditorSkeleton />`) unmounts the whole editor
// subtree on every switch. Scroll containers are destroyed along with their
// `scrollTop`. Nothing else in the app remembered where the reader was.
//
// WHY IT IS KEYED BY (contentId, REGION)
// Almost every content type has TWO independent scroll regions, not one:
//
//   ┌─ ExpandableEditor ──────────── region: "note"      (attached notes)
//   ├─ contentElement ───────────── region: "primary"   (folder grid, data
//   │                                                    table, PDF, image…)
//   └─ ExpandableEditor ──────────── region: "note"      (when placed below)
//
// Both are rendered for the SAME contentId (see `isNonNoteContent` in
// MainPanelContent), so a contentId-only key would have the folder's grid and
// its attached note fighting over one slot. A standalone note simply has only
// the "note" region.
//
// WHY IT IS NOT ZUSTAND STATE
// Scroll fires at frame rate. Routing the offset through the reactive content
// store would re-render every pane on every frame of every scroll. This is a
// plain module-level map read imperatively, with a debounced localStorage
// flush — the same shape as `lib/domain/content/prefetch.ts`.
//
// SCOPE NOTE (extension surface)
// The browser extension's embed runs in a *partitioned* iframe with its own
// empty localStorage, so positions recorded in the app tab are deliberately
// invisible in the overlay and vice versa. That is per-surface memory, not a
// bug — and `EmbedContentClient` restores a single-tab workspace anyway.

const STORAGE_KEY = "workspaceTabViewports";
const FLUSH_DEBOUNCE_MS = 400;

// Bound the persisted map so a heavy user's localStorage doesn't grow without
// limit. Eviction is least-recently-touched.
const MAX_ENTRIES = 240;

/**
 * Which scroll region of a content item an offset belongs to.
 *
 * - `primary` — the content's own specialized view: folder grid/list/kanban,
 *   database table, PDF page, image, code, external preview.
 * - `note` — the note body: the whole document for a standalone note, or the
 *   attached-notes drawer (`ExpandableEditor`) for every other type.
 */
export type ViewportRegion = "primary" | "note";

type ViewportEntry = {
  /** scrollTop of the region's scroll container, in CSS pixels. */
  top: number;
  /** Epoch ms of the last write — the LRU key for eviction. */
  at: number;
};

function keyFor(contentId: string, region: ViewportRegion): string {
  return `${contentId}::${region}`;
}

let entries: Record<string, ViewportEntry> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function hydrate(): Record<string, ViewportEntry> {
  if (entries) return entries;
  entries = {};
  if (typeof window === "undefined") return entries;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return entries;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      // Keys are `${contentId}::${region}`; anything else is from a shape we
      // no longer understand and is dropped rather than half-interpreted.
      if (!key.includes("::")) continue;
      if (typeof value !== "object" || value === null) continue;
      const { top, at } = value as { top?: unknown; at?: unknown };
      if (typeof top !== "number" || !Number.isFinite(top) || top < 0) continue;
      entries[key] = {
        top,
        at: typeof at === "number" && Number.isFinite(at) ? at : 0,
      };
    }
  } catch {
    // Corrupt payload — start clean rather than wedging every tab switch.
    entries = {};
  }
  return entries;
}

function flush() {
  flushTimer = null;
  if (typeof window === "undefined" || !entries) return;

  const keys = Object.keys(entries);
  if (keys.length > MAX_ENTRIES) {
    const survivors = keys
      .sort((a, b) => entries![b].at - entries![a].at)
      .slice(0, MAX_ENTRIES);
    const trimmed: Record<string, ViewportEntry> = {};
    for (const key of survivors) trimmed[key] = entries[key];
    entries = trimmed;
  }

  try {
    if (Object.keys(entries).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }
  } catch {
    // Quota failure is non-fatal — positions just won't survive this reload.
  }
}

function scheduleFlush() {
  if (typeof window === "undefined") return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, FLUSH_DEBOUNCE_MS);
}

/**
 * Record where the reader is in one region of a document. Safe to call at
 * scroll frequency — the localStorage write is debounced, the in-memory write
 * is a field set.
 */
export function recordViewport(
  contentId: string | null | undefined,
  region: ViewportRegion,
  top: number
): void {
  if (!contentId || contentId.startsWith("temp-")) return;
  if (!Number.isFinite(top) || top < 0) return;

  const map = hydrate();
  const key = keyFor(contentId, region);
  const prev = map[key];
  // Round to whole pixels: sub-pixel churn would flush constantly for nothing.
  const next = Math.round(top);
  if (prev && prev.top === next) return;

  map[key] = { top: next, at: Date.now() };
  scheduleFlush();
}

/** The last recorded offset for a region, or `undefined` if we have none. */
export function readViewport(
  contentId: string | null | undefined,
  region: ViewportRegion
): number | undefined {
  if (!contentId) return undefined;
  return hydrate()[keyFor(contentId, region)]?.top;
}

/** Drop a document's remembered positions — call when its tab is closed. */
export function forgetViewport(contentId: string | null | undefined): void {
  if (!contentId) return;
  const map = hydrate();
  let changed = false;
  for (const region of ["primary", "note"] as const) {
    const key = keyFor(contentId, region);
    if (key in map) {
      delete map[key];
      changed = true;
    }
  }
  if (changed) scheduleFlush();
}

/**
 * Resolve a *usable* scroll offset for a container that has just painted.
 *
 * A remembered offset can outlive the document it describes — a collaborator
 * deleted half the note, an AI rewrite collapsed it, the reader switched to a
 * narrower pane where the same prose reflows shorter. Restoring blindly then
 * dumps them at the very bottom of a document they left in the middle, which
 * reads as a worse bug than simply starting at the top.
 *
 * Returns the offset to apply, or `null` to leave the container where it is.
 */
export function resolveRestoreOffset(
  saved: number | undefined,
  scrollHeight: number,
  clientHeight: number
): number | null {
  if (saved === undefined || saved <= 0) return null;

  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  // Nothing to scroll: the content now fits on screen.
  if (maxScroll <= 0) return null;

  // Comfortably in range — restore exactly.
  if (saved <= maxScroll) return saved;

  // The content got shorter. A small overshoot is ordinary reflow (a wider
  // pane, a lazy image that settled, a trailing block removed) and clamping to
  // the end lands the reader essentially where they were. A large overshoot
  // means this is not the same content they left; start at the top instead of
  // stranding them at the end of something unfamiliar.
  return saved <= maxScroll * 1.5 ? maxScroll : null;
}

/**
 * Find the element that actually scrolls inside `root`.
 *
 * Needed because a content type's real scroller is usually NOT the wrapper we
 * can reach: `FolderViewer` delegates to `ListView` / `GalleryView` /
 * `KanbanView` / `DashboardView`, and each of those owns its own
 * `overflow-auto` div. The wrapper in `MainPanelContent` never scrolls at all.
 *
 * Prefers the root itself when it scrolls, else the first descendant that both
 * overflows and is styled to scroll. Mirrors the `findScrollContainer` helper
 * already used in `lib/domain/blocks/node-view-factory.ts`.
 */
export function findScrollableElement(
  root: HTMLElement | null
): HTMLElement | null {
  if (!root) return null;
  if (root.scrollHeight - root.clientHeight > 1) return root;

  const candidates = root.querySelectorAll<HTMLElement>("*");
  for (const el of candidates) {
    if (el.scrollHeight - el.clientHeight <= 1) continue;
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return el;
  }
  return null;
}

// Persist immediately when the page goes away — the debounce would otherwise
// lose the last few hundred milliseconds of scrolling on a close or reload.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}
