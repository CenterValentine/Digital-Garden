"use client";

/**
 * Claims the right sidebar's extension tab for nodes imported from Canvas
 * (CANVAS-ARCHIVE-PLAN.md §9.1). Notes and folders render in core viewers,
 * so no Canvas viewer is there to claim the tab: this controller watches the
 * selection instead. Another extension's claim wins (the reader's Book tab on
 * an imported PDF is the more useful one there).
 */

import { useEffect, useState } from "react";
import { useContentStore } from "@/state/content-store";
import { useContentSidebarClaims } from "@/lib/extensions/content-sidebar";
import { CANVAS_EXTENSION_ID } from "../manifest";
import { CANVAS_CHANGED_EVENT, canvasClient } from "../lib/api";

export function CanvasSidebarController() {
  const selectedContentId = useContentStore((state) => state.selectedContentId);
  const [linked, setLinked] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      canvasClient
        .linked()
        .then(({ ids }) => {
          if (!cancelled) setLinked(new Set(ids));
        })
        .catch(() => undefined);
    };
    load();
    window.addEventListener(CANVAS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(CANVAS_CHANGED_EVENT, load);
    };
  }, []);

  useEffect(() => {
    if (!selectedContentId || !linked.has(selectedContentId)) return;
    const { claims, claim, release } = useContentSidebarClaims.getState();
    const owner = claims[selectedContentId];
    if (owner && owner !== CANVAS_EXTENSION_ID) return;
    claim(selectedContentId, CANVAS_EXTENSION_ID);
    return () => release(selectedContentId, CANVAS_EXTENSION_ID);
  }, [selectedContentId, linked]);

  return null;
}
