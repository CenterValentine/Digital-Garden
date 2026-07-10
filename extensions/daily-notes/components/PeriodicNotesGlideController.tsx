"use client";

import { useCallback, useEffect, useState } from "react";
import moment from "moment";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useContentStore } from "@/state/content-store";

interface NeighborNote {
  id: string;
  title: string;
  periodKey: string;
}

interface NeighborsState {
  // The note these neighbors belong to. Guards against a slow fetch resolving
  // after the user has already glided/switched to a different note.
  contentId: string;
  kind: string;
  prev: NeighborNote | null;
  next: NeighborNote | null;
}

function formatNeighborLabel(kind: string, periodKey: string): string {
  if (kind === "weekly") {
    const parsed = moment(periodKey, "GGGG-[W]WW");
    return parsed.isValid() ? parsed.format("[Wk] WW") : periodKey;
  }
  if (kind === "monthly") {
    const parsed = moment(periodKey, "YYYY-MM");
    return parsed.isValid() ? parsed.format("MMM YYYY") : periodKey;
  }
  if (kind === "quarterly") {
    // periodKey is "YYYY-Q#" — surface it as "Q# YYYY".
    const parsed = moment(periodKey, "YYYY-[Q]Q");
    return parsed.isValid() ? parsed.format("[Q]Q YYYY") : periodKey;
  }
  if (kind === "yearly") {
    // periodKey is already "YYYY" — nothing to reformat.
    return periodKey;
  }
  const parsed = moment(periodKey, "YYYY-MM-DD");
  return parsed.isValid() ? parsed.format("ddd, MMM D") : periodKey;
}

/**
 * Sparse "glide" navigation between periodic notes. Renders a floating pill
 * over the workspace when the focused pane is showing a daily/weekly note,
 * letting the user step to the nearest existing note before/after it in its
 * sequence. Backed by GET /api/periodic-notes/neighbors — no client-side
 * sequencing logic, the DB index does the ordering.
 */
export function PeriodicNotesGlideController() {
  const selectedContentId = useContentStore((state) => state.selectedContentId);
  const selectedContentType = useContentStore(
    (state) => state.selectedContentType
  );
  const setSelectedContentId = useContentStore(
    (state) => state.setSelectedContentId
  );
  const [neighbors, setNeighbors] = useState<NeighborsState | null>(null);

  useEffect(() => {
    // Only notes can be periodic — skip the round-trip for folders/files.
    // Stale state (from a previously-open note) is filtered at render time by
    // matching contentId, so there's no need to synchronously clear here.
    if (!selectedContentId || selectedContentType !== "note") return;

    const contentId = selectedContentId;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(
          `/api/periodic-notes/neighbors?contentId=${encodeURIComponent(contentId)}`,
          { credentials: "include", signal: controller.signal }
        );
        const result = await response.json();
        if (controller.signal.aborted) return;

        if (response.ok && result.success && result.data?.isPeriodic) {
          setNeighbors({
            contentId,
            kind: result.data.kind,
            prev: result.data.prev,
            next: result.data.next,
          });
        } else {
          setNeighbors(null);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("[PeriodicNotesGlideController] neighbors fetch failed:", error);
        }
      }
    };

    void load();
    return () => controller.abort();
  }, [selectedContentId, selectedContentType]);

  const glideTo = useCallback(
    (target: NeighborNote | null) => {
      if (!target) return;
      setSelectedContentId(target.id, {
        title: target.title,
        contentType: "note",
      });
    },
    [setSelectedContentId]
  );

  // Render only when the resolved neighbors belong to the currently-focused
  // note (guards the async race) and there's somewhere to glide to.
  if (
    !neighbors ||
    neighbors.contentId !== selectedContentId ||
    (!neighbors.prev && !neighbors.next)
  ) {
    return null;
  }

  const buttonBase =
    "flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors";
  const enabled =
    "text-gray-900 hover:bg-primary/10 hover:text-primary dark:text-gray-200 dark:hover:bg-white/10 dark:hover:text-white";
  const disabled = "cursor-default text-gray-400 dark:text-gray-600";

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-black/10 bg-white/95 px-1.5 py-1 shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-gray-900/95">
        <button
          type="button"
          className={`${buttonBase} ${neighbors.prev ? enabled : disabled}`}
          onClick={() => glideTo(neighbors.prev)}
          disabled={!neighbors.prev}
          title={
            neighbors.prev
              ? `Previous note · ${neighbors.prev.title}`
              : "No earlier note"
          }
          aria-label="Previous periodic note"
        >
          <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
          {neighbors.prev
            ? formatNeighborLabel(neighbors.kind, neighbors.prev.periodKey)
            : "Start"}
        </button>

        <div className="h-4 w-px bg-black/10 dark:bg-white/10" />

        <button
          type="button"
          className={`${buttonBase} ${neighbors.next ? enabled : disabled}`}
          onClick={() => glideTo(neighbors.next)}
          disabled={!neighbors.next}
          title={
            neighbors.next
              ? `Next note · ${neighbors.next.title}`
              : "No later note"
          }
          aria-label="Next periodic note"
        >
          {neighbors.next
            ? formatNeighborLabel(neighbors.kind, neighbors.next.periodKey)
            : "Latest"}
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        </button>
      </div>
    </div>
  );
}
