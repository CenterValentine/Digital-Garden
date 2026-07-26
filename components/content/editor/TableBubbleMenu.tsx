/**
 * TableBubbleMenu — Sprint 36 rebuild from TipTap docs
 *
 * Floating menu that appears when the cursor is inside a table.
 * Uses TipTap's built-in table commands. Minimal — text buttons only.
 */

"use client";

import { BubbleMenu as TipTapBubbleMenu } from "@tiptap/react/menus";
import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { CellSelection } from "@tiptap/pm/tables";
import { NodeSelection, PluginKey } from "@tiptap/pm/state";

const tableBubbleMenuKey = new PluginKey("tableBubbleMenu");

/** Prevent browser from stealing focus from ProseMirror on button click. */
const preventFocusLoss = (e: React.MouseEvent) => {
  e.preventDefault();
};

/**
 * Stable shouldShow — module-level to avoid shared-meta cross-contamination
 * between BubbleMenu instances (see BubbleMenu.tsx for full explanation).
 */
const tableShouldShow = ({
  editor,
  state,
}: {
  editor: Editor;
  state: import("@tiptap/pm/state").EditorState;
}): boolean => {
  const { selection } = state;
  if (!editor.isActive("table")) return false;
  if (selection instanceof NodeSelection) return false;
  if (!selection.empty && !(selection instanceof CellSelection)) return false;
  return true;
};

export interface TableBubbleMenuProps {
  editor: Editor | null;
}

/**
 * Which table commands are available RIGHT NOW.
 *
 * This has to come from `useEditorState`, not from calling `editor.can()` in
 * the render body. TipTap v3 defaults `shouldRerenderOnTransaction` to false
 * (MarkdownEditor doesn't override it), so React does NOT re-render on a
 * transaction — and moving the caret is only a transaction. `shouldShow` runs
 * inside the ProseMirror plugin, so the menu itself always tracks the caret;
 * the buttons rendered inside it did not, and kept whatever `disabled` value
 * was computed the last time something else happened to re-render.
 *
 * That is the "round-tripped tables can't be manipulated" bug. Applying the
 * markdown source view calls `setContent(json, { emitUpdate: false })` — no
 * update event, so nothing re-renders — and clicking into the restored table
 * is a selection-only transaction, so the menu appeared with every button
 * frozen disabled from when the caret was outside the table. A freshly
 * inserted table looked fine only because inserting it is a doc change, which
 * fires onUpdate → setState → re-render while the caret is already inside it.
 * The document was never the problem: the same table returns
 * `can().addRowAfter() === true` throughout.
 */
function useTableCommandAvailability(editor: Editor | null) {
  return useEditorState({
    editor,
    // The menu is hidden outside a table, so skip the probes entirely there
    // rather than running seven state forks on every keystroke in the document.
    selector: ({ editor: current }) => {
      if (!current?.isActive("table")) return null;
      return {
        addRowBefore: current.can().addRowBefore(),
        addRowAfter: current.can().addRowAfter(),
        deleteRow: current.can().deleteRow(),
        addColumnBefore: current.can().addColumnBefore(),
        addColumnAfter: current.can().addColumnAfter(),
        deleteColumn: current.can().deleteColumn(),
        deleteTable: current.can().deleteTable(),
      };
    },
  });
}

export function TableBubbleMenu({ editor }: TableBubbleMenuProps) {
  const can = useTableCommandAvailability(editor);

  if (!editor) return null;

  return (
    <TipTapBubbleMenu
      editor={editor}
      pluginKey={tableBubbleMenuKey}
      updateDelay={100}
      shouldShow={tableShouldShow}
      className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/80 p-1 shadow-lg backdrop-blur-md"
    >
      <button
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().addRowBefore().run()}
        disabled={!can?.addRowBefore}
        className="rounded px-2 py-1 text-xs transition-colors hover:bg-white/10 text-gray-300 disabled:opacity-30"
        title="Add row above"
        type="button"
      >
        Row +↑
      </button>

      <button
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().addRowAfter().run()}
        disabled={!can?.addRowAfter}
        className="rounded px-2 py-1 text-xs transition-colors hover:bg-white/10 text-gray-300 disabled:opacity-30"
        title="Add row below"
        type="button"
      >
        Row +↓
      </button>

      <button
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().deleteRow().run()}
        disabled={!can?.deleteRow}
        className="rounded px-2 py-1 text-xs transition-colors hover:bg-white/10 text-gray-300 disabled:opacity-30"
        title="Delete row"
        type="button"
      >
        Row −
      </button>

      <div className="mx-0.5 h-4 w-px bg-white/10" />

      <button
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().addColumnBefore().run()}
        disabled={!can?.addColumnBefore}
        className="rounded px-2 py-1 text-xs transition-colors hover:bg-white/10 text-gray-300 disabled:opacity-30"
        title="Add column left"
        type="button"
      >
        Col +←
      </button>

      <button
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().addColumnAfter().run()}
        disabled={!can?.addColumnAfter}
        className="rounded px-2 py-1 text-xs transition-colors hover:bg-white/10 text-gray-300 disabled:opacity-30"
        title="Add column right"
        type="button"
      >
        Col +→
      </button>

      <button
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().deleteColumn().run()}
        disabled={!can?.deleteColumn}
        className="rounded px-2 py-1 text-xs transition-colors hover:bg-white/10 text-gray-300 disabled:opacity-30"
        title="Delete column"
        type="button"
      >
        Col −
      </button>

      <div className="mx-0.5 h-4 w-px bg-white/10" />

      <button
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().deleteTable().run()}
        disabled={!can?.deleteTable}
        className="rounded px-2 py-1 text-xs transition-colors hover:bg-red-500/20 text-red-400 disabled:opacity-30"
        title="Delete table"
        type="button"
      >
        Delete
      </button>
    </TipTapBubbleMenu>
  );
}
