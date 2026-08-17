"use client";

/**
 * NoteWindowPicker — the Note Window's target picker.
 *
 * Thin flavor wrapper over the shared ContentTreePicker. Per the owner
 * (2026-08-15) this is the EXACT same surface as the pane tab-strip "+"
 * picker — same collapsed tree, same view-scope row, same quick-create
 * affordances (folder/scope "+ New Note" + insertion gaps, default-name
 * notes renamed later). The only Note Window specifics: "Previously
 * windowed" recents and the host note disabled.
 */

import {
  ContentTreePicker,
  useWorkspaceViewOptions,
  type PickerTarget,
} from "@/components/content/pickers/ContentTreePicker";

export type { PickerTarget };

export function NoteWindowPicker({
  anchorEl,
  hostContentId,
  recents,
  onPick,
  onClose,
}: {
  anchorEl: HTMLElement;
  hostContentId?: string | null;
  recents: Array<{ id: string; title: string }>;
  onPick: (target: PickerTarget) => void;
  onClose: () => void;
}) {
  const { views, defaultViewId } = useWorkspaceViewOptions();
  return (
    <ContentTreePicker
      anchorEl={anchorEl}
      onPick={onPick}
      onClose={onClose}
      disabledIds={hostContentId ? [hostContentId] : undefined}
      disabledReason="this note"
      recents={recents}
      recentsLabel="Previously windowed"
      quickCreate={{ defaultTitle: "Untitled", onCreated: onPick }}
      views={views}
      defaultViewId={defaultViewId}
      searchPlaceholder="Search notes… or browse below"
    />
  );
}
