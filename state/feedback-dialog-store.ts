/**
 * In-app feedback dialog state (transient — not persisted).
 *
 * Opened from the profile menu ("Send Feedback" → feature, "Report an
 * Issue" → bug) and the editor's "/Report an Issue" slash command. The
 * dialog is mounted once in NotesNavBar, so it exists wherever the profile
 * menu does (IDE, settings, admin). `openFeedbackDialog` returns false when
 * no host is mounted (e.g. an embedded editor with no nav bar), and callers
 * fall back to GitHub's new-issue page.
 *
 * Drafts live here rather than in the dialog so an accidental close (Esc, a
 * click outside) doesn't throw away a half-written report. They clear on a
 * successful submit.
 */

import { create } from "zustand";
import type { FeedbackKind } from "@/lib/domain/feedback/issue-templates";

export interface FeedbackDraft {
  title: string;
  fields: Record<string, string>;
  areas: string[];
  /** Small change only: extra type flags (`bug` / `enhancement`). */
  flags: string[];
  /** "More labels" picks — any other repo label this user may apply. */
  extraLabels: string[];
  severe: boolean;
}

export const emptyFeedbackDraft = (): FeedbackDraft => ({
  title: "",
  fields: {},
  areas: [],
  flags: [],
  extraLabels: [],
  severe: false,
});

interface FeedbackDialogState {
  open: boolean;
  kind: FeedbackKind;
  drafts: Record<FeedbackKind, FeedbackDraft>;
  includeDiagnostics: boolean;
  includeUsername: boolean;
  /** Mounted dialog hosts; 0 means nothing would render if opened. */
  hosts: number;
  openDialog: (kind: FeedbackKind) => void;
  close: () => void;
  setKind: (kind: FeedbackKind) => void;
  updateDraft: (kind: FeedbackKind, patch: Partial<FeedbackDraft>) => void;
  clearDraft: (kind: FeedbackKind) => void;
  setIncludeDiagnostics: (value: boolean) => void;
  setIncludeUsername: (value: boolean) => void;
  registerHost: () => () => void;
}

export const useFeedbackDialogStore = create<FeedbackDialogState>((set) => ({
  open: false,
  kind: "bug",
  drafts: {
    bug: emptyFeedbackDraft(),
    feature: emptyFeedbackDraft(),
    modification: emptyFeedbackDraft(),
  },
  includeDiagnostics: true,
  includeUsername: false,
  hosts: 0,
  openDialog: (kind) => set({ open: true, kind }),
  close: () => set({ open: false }),
  setKind: (kind) => set({ kind }),
  updateDraft: (kind, patch) =>
    set((s) => ({ drafts: { ...s.drafts, [kind]: { ...s.drafts[kind], ...patch } } })),
  clearDraft: (kind) =>
    set((s) => ({ drafts: { ...s.drafts, [kind]: emptyFeedbackDraft() } })),
  setIncludeDiagnostics: (includeDiagnostics) => set({ includeDiagnostics }),
  setIncludeUsername: (includeUsername) => set({ includeUsername }),
  registerHost: () => {
    set((s) => ({ hosts: s.hosts + 1 }));
    return () => set((s) => ({ hosts: Math.max(0, s.hosts - 1) }));
  },
}));

/**
 * Open the dialog on `kind`. Returns false when no dialog host is mounted,
 * so the caller can open GitHub instead.
 */
export function openFeedbackDialog(kind: FeedbackKind): boolean {
  const store = useFeedbackDialogStore.getState();
  if (store.hosts === 0) return false;
  store.openDialog(kind);
  return true;
}
