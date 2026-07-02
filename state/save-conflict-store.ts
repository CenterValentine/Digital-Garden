/**
 * Save-conflict store — optimistic-concurrency conflict state for the editor.
 *
 * When an autosave PATCH is refused with 409 PRECONDITION_FAILED (the document
 * changed elsewhere since we loaded it — e.g. a stale tab the user returned to,
 * or a concurrent edit on another device/collaborator via Hocuspocus), we do
 * NOT overwrite. Instead we record the conflict here and pause autosave until
 * the user explicitly resolves it (Keep mine / Take theirs / Open theirs).
 *
 * Pending edits are also stashed to localStorage so a browser reload while a
 * conflict is open doesn't lose the user's unsaved work (plain-fallback docs
 * have no IndexedDB persistence the way collaboration docs do).
 *
 * See docs/notes-feature/core/CONTENT-LOAD-CASCADE.md (write persistence).
 */

"use client";

import { create } from "zustand";
import type { JSONContent } from "@tiptap/core";

export interface SaveConflict {
  contentId: string;
  /** The user's local edits that were refused. */
  mine: JSONContent;
  /** Server's current body hash — echo as If-Match to force "Keep mine". */
  theirHash: string;
}

interface SaveConflictState {
  /** Active conflicts keyed by contentId. Usually 0 or 1, but per-doc is safe. */
  conflicts: Record<string, SaveConflict>;
  setConflict: (conflict: SaveConflict) => void;
  clearConflict: (contentId: string) => void;
  getConflict: (contentId: string | null | undefined) => SaveConflict | null;
}

const DRAFT_KEY_PREFIX = "saveDraft:";

function draftKey(contentId: string): string {
  return `${DRAFT_KEY_PREFIX}${contentId}`;
}

/**
 * Persist the user's unsaved edits so a reload mid-conflict preserves them.
 * Stored separately from the in-memory conflict so it survives a full reload.
 */
export function stashConflictDraft(contentId: string, content: JSONContent): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(draftKey(contentId), JSON.stringify(content));
  } catch {
    // Quota/serialization failure is non-fatal — the in-memory conflict still
    // protects against overwrite; only reload-survival is lost.
  }
}

export function loadConflictDraft(contentId: string): JSONContent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(contentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "type" in parsed) {
      return parsed as JSONContent;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearConflictDraft(contentId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(draftKey(contentId));
  } catch {
    // ignore
  }
}

export const useSaveConflictStore = create<SaveConflictState>((set, get) => ({
  conflicts: {},
  setConflict: (conflict) =>
    set((state) => ({
      conflicts: { ...state.conflicts, [conflict.contentId]: conflict },
    })),
  clearConflict: (contentId) =>
    set((state) => {
      if (!state.conflicts[contentId]) return state;
      const next = { ...state.conflicts };
      delete next[contentId];
      return { conflicts: next };
    }),
  getConflict: (contentId) =>
    contentId ? get().conflicts[contentId] ?? null : null,
}));
