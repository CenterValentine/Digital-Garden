"use client";

/**
 * Session cache of charter-marked content ids.
 *
 * The file tree's API payload carries each note's charter flag
 * (`note.charter` / legacy `note.playbook` — the P0a dual-key), but
 * surfaces that render from lighter data — the workspace TAB strip most
 * of all — only know `{ id, title, contentType }` and were silently
 * falling back to the generic note icon (owner report 2026-09-04: a
 * charter opened in the main panel loses its ScrollText identity).
 *
 * Rather than threading a flag through the workspace-tab shape (which
 * rides the layout-sync payloads — deliberately not touched), the tree
 * load feeds this store and icon call sites do an id lookup. Session-
 * lived, never persisted: the next tree load rebuilds it.
 */

import { create } from "zustand";

interface CharterIdsState {
  ids: Set<string>;
  /** Replace the set from a freshly-loaded tree (recursive walk). */
  setFromTree: (nodes: unknown[]) => void;
}

function collectCharterIds(nodes: unknown[], into: Set<string>): void {
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const n = node as {
      id?: unknown;
      note?: { charter?: unknown; playbook?: unknown };
      children?: unknown[];
    };
    if (
      typeof n.id === "string" &&
      (n.note?.charter === true || n.note?.playbook === true)
    ) {
      into.add(n.id);
    }
    if (Array.isArray(n.children)) collectCharterIds(n.children, into);
  }
}

export const useCharterIdsStore = create<CharterIdsState>((set) => ({
  ids: new Set<string>(),
  setFromTree: (nodes) => {
    const ids = new Set<string>();
    collectCharterIds(nodes, ids);
    set({ ids });
  },
}));
