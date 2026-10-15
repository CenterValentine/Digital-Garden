"use client";

// One ref, and a content region remembers where the reader was.
//
//   const ref = useViewportMemory(contentId, "primary");
//   <div ref={ref} className="flex-1 overflow-auto">{contentElement}</div>
//
// WHY A CAPTURE-PHASE LISTENER AND NOT AN `onScroll` PROP
// Scroll events do not bubble. For most content types the element that really
// scrolls is NOT the wrapper we can attach to — `FolderViewer` delegates to
// `ListView` / `GalleryView` / `KanbanView` / `DashboardView`, each owning its
// own `overflow-auto` div, and `DataTableViewer` scrolls its own virtualized
// container. An `onScroll` on the wrapper would never fire for any of them.
// A capture-phase listener on the wrapper DOES observe descendant scrolls,
// which is what lets one ref cover every viewer without touching each one.

import { useCallback, useEffect, useRef } from "react";
import { useContentAnchorStore } from "@/state/content-anchor-store";
import {
  findScrollableElement,
  readViewport,
  recordViewport,
  resolveRestoreOffset,
  type ViewportRegion,
} from "./viewport-memory";

/**
 * Is a wiki-link anchor waiting to be honored for this content?
 *
 * An anchored link (`[[Note#annotation:…]]`, `[[Alma 32:21]]`) asks to open the
 * target AT a specific spot; the viewer takes that from `content-anchor-store`
 * and jumps there. An explicit "take me here" outranks a remembered offset
 * every time, so viewport restore must stand down rather than race it — our
 * restore retries for up to 20 frames and would otherwise win by arriving last.
 *
 * This PEEKS at `pending` and must never call `take()`: taking consumes the
 * anchor, and the viewer would then never receive it.
 */
function anchorPending(contentId: string): boolean {
  return Boolean(useContentAnchorStore.getState().pending[contentId]);
}

/** ≈330ms at 60fps. */
const MAX_RESTORE_FRAMES = 20;

export function useViewportMemory(
  contentId: string | null | undefined,
  region: ViewportRegion,
  options: { enabled?: boolean } = {}
) {
  const enabled = options.enabled ?? true;
  const rootRef = useRef<HTMLDivElement | null>(null);

  // While a restore is pending we must not RECORD. On the warm-switch path a
  // scroll container is reused across documents: swapping the content drives it
  // back to 0, which fires a real scroll event — and by then `contentId` is
  // already the NEW document, so an unguarded handler would write 0 over the
  // very position we are about to restore.
  const suppressRef = useRef(false);

  const handleScroll = useCallback(
    (event: Event) => {
      if (suppressRef.current || !enabled) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      recordViewport(contentId, region, target.scrollTop);
    },
    [contentId, region, enabled]
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;
    root.addEventListener("scroll", handleScroll, true);
    return () => root.removeEventListener("scroll", handleScroll, true);
  }, [handleScroll, enabled]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !contentId || !enabled) return;

    // An anchored link owns this open — don't restore, and don't record over
    // wherever the anchor lands either until the next genuine scroll.
    if (anchorPending(contentId)) return;

    suppressRef.current = true;
    const saved = readViewport(contentId, region);

    // Retry across frames rather than restoring once. Content arrives late in
    // several ordinary cases — a collaborative note's Y.Doc materializes after
    // the editor is recreated, a folder view fetches its children, a
    // virtualized table measures its rows — so the first frames can measure a
    // container that is still nearly empty.
    let frame = 0;
    let raf = 0;

    const attempt = () => {
      const scroller = findScrollableElement(rootRef.current);

      if (!scroller) {
        // Nothing scrollable yet. Keep waiting; the content may still be on
        // its way in.
        if (saved !== undefined && saved > 0 && frame < MAX_RESTORE_FRAMES) {
          frame += 1;
          raf = requestAnimationFrame(attempt);
          return;
        }
        suppressRef.current = false;
        return;
      }

      const offset = resolveRestoreOffset(
        saved,
        scroller.scrollHeight,
        scroller.clientHeight
      );

      const stillGrowing =
        saved !== undefined &&
        saved > 0 &&
        offset === null &&
        frame < MAX_RESTORE_FRAMES;

      if (stillGrowing) {
        frame += 1;
        raf = requestAnimationFrame(attempt);
        return;
      }

      // Deliberately NOT gated on `scrollTop === 0`. On the warm-switch path a
      // container is reused across documents, so arriving at a LONGER document
      // leaves the previous one's offset in place — a zero-check would read
      // that as "the reader already moved" and strand them at an offset that
      // belongs to different content. Every run of this effect means content
      // just (re)arrived, so the remembered offset — or the top — is always the
      // right answer.
      scroller.scrollTop = offset ?? 0;
      suppressRef.current = false;
    };

    raf = requestAnimationFrame(attempt);

    return () => {
      cancelAnimationFrame(raf);
      suppressRef.current = false;
    };
  }, [contentId, region, enabled]);

  return rootRef;
}
