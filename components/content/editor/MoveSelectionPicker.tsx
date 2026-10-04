"use client";

/**
 * MoveSelectionPicker — the target picker for "Move to Note" (context
 * menu). One instance per MarkdownEditor; opened by the `dg:move-selection`
 * event, which carries the editor it was raised for — MarkdownEditor is
 * multi-instance (split panes, Note Windows), so an unaddressed window
 * event would open a picker in every one of them (the 2026-08-15 mermaid
 * multiplication). Only the addressed instance answers.
 *
 * The picker is the shared ContentTreePicker, in its Note Window flavor:
 * collapsed tree, view-scope row, "+ New Note" on folders and insertion
 * gaps — the new note is named from the selection's first heading or line,
 * so it is named before its content exists. Notes only: the move appends
 * to note content.
 */

import { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import {
  ContentTreePicker,
  useWorkspaceViewOptions,
  type PickerTarget,
} from "@/components/content/pickers/ContentTreePicker";
import { moveSelectionToNote, type MoveTrace } from "@/lib/domain/editor/move-selection";

export const MOVE_SELECTION_EVENT = "dg:move-selection";

export interface MoveSelectionEventDetail {
  editor: Editor;
  trace: MoveTrace;
  /** Viewport point to hang the picker from (the right-click position). */
  x: number;
  y: number;
  /** Default name for a note created from the picker. */
  suggestedTitle: string;
  /** The note being edited — disabled in the picker (a note can't move text into itself). */
  hostContentId: string | null;
}

const NOTE_ONLY = new Set(["note"]);

export function MoveSelectionPicker({ editor }: { editor: Editor | null }) {
  const [request, setRequest] = useState<MoveSelectionEventDetail | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);
  const { views, defaultViewId } = useWorkspaceViewOptions();

  useEffect(() => {
    if (!editor) return;
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<MoveSelectionEventDetail>).detail;
      if (!detail || detail.editor !== editor) return;
      setRequest(detail);
    };
    window.addEventListener(MOVE_SELECTION_EVENT, onRequest);
    return () => window.removeEventListener(MOVE_SELECTION_EVENT, onRequest);
  }, [editor]);

  const close = useCallback(() => setRequest(null), []);

  const onPick = useCallback(
    (target: PickerTarget) => {
      const current = request;
      setRequest(null);
      if (!current || !editor) return;
      void moveSelectionToNote(editor, target, current.trace, current.hostContentId);
    },
    [request, editor],
  );

  if (!request) return null;

  return (
    <>
      {/* A 1×1 anchor at the click point: the picker positions off an element's rect. */}
      <div
        ref={setAnchorEl}
        aria-hidden
        style={{ position: "fixed", left: request.x, top: request.y, width: 1, height: 1, pointerEvents: "none" }}
      />
      {anchorEl ? (
        <ContentTreePicker
          anchorEl={anchorEl}
          onPick={onPick}
          onClose={close}
          disabledIds={request.hostContentId ? [request.hostContentId] : undefined}
          disabledReason="this note"
          quickCreate={{ defaultTitle: request.suggestedTitle, onCreated: onPick }}
          views={views}
          defaultViewId={defaultViewId}
          eligibleTypes={NOTE_ONLY}
          searchPlaceholder={
            request.trace === "link" ? "Move to… (a link stays here)" : "Move to… (nothing stays here)"
          }
        />
      ) : null}
    </>
  );
}
