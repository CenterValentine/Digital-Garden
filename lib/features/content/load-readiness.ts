/**
 * Content-load readiness — the shared gate consumers use instead of inventing
 * their own race guards. See docs/notes-feature/core/CONTENT-LOAD-CASCADE.md.
 *
 * The content page hydrates from several independent sources. Surfaces must
 * render a *loader*, not a guessed default, until their prerequisite is ready
 * (spec §3.1-3.2). This module exposes those readiness booleans in one place.
 */

"use client";

import { useEffect, useState } from "react";
import { useWorkspaceStore } from "@/state/workspace-store";
import { useContentStore } from "@/state/content-store";
import { useRightSidebarStateStore } from "@/state/right-sidebar-state-store";

/** Minimal shape of a zustand `persist` API we depend on. */
interface PersistLike {
  hasHydrated: () => boolean;
  onFinishHydration: (cb: () => void) => () => void;
}

/**
 * True once the given persisted store has finished hydrating from storage.
 * Writes during the hydration window get clobbered by the persisted merge, so
 * effects that depend on persisted state MUST gate on this.
 */
export function useStoreHydrated(persist: PersistLike | undefined): boolean {
  const [hydrated, setHydrated] = useState(() => persist?.hasHydrated() ?? false);
  useEffect(() => {
    if (!persist) return;
    // Hydration may have completed between the lazy init and this effect.
    if (persist.hasHydrated()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydration sync (Zustand-prescribed pattern)
      setHydrated(true);
      return;
    }
    return persist.onFinishHydration(() => setHydrated(true));
  }, [persist]);
  return hydrated;
}

export interface ContentReadiness {
  /** workspace-store has resolved the active workspace + restored its snapshot. */
  workspaceReady: boolean;
  /** right-sidebar-state-store (per-content last-seen tab) has hydrated. */
  rightSidebarHydrated: boolean;
  /** Active selection (may be null for an empty workspace). */
  activeContentId: string | null;
  activeContentType: string | null;
  /**
   * The right panel may render its real (saved) view. Until then it shows a
   * preference loader and its tabs are non-interactive (spec §3.4).
   */
  rightPanelReady: boolean;
}

export function useContentReadiness(): ContentReadiness {
  // workspace-store restores content-store on load, so `hasLoadedOnce` is the
  // gate that the selection is settled (content present or genuinely none).
  const workspaceReady = useWorkspaceStore((s) => s.hasLoadedOnce);
  const rightSidebarHydrated = useStoreHydrated(useRightSidebarStateStore.persist);
  const activeContentId = useContentStore((s) => s.selectedContentId);
  const activeContentType = useContentStore((s) => s.selectedContentType);

  return {
    workspaceReady,
    rightSidebarHydrated,
    activeContentId,
    activeContentType,
    rightPanelReady: workspaceReady && rightSidebarHydrated,
  };
}
