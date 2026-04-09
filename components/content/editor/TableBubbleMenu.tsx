/**
 * TableBubbleMenu — Sprint 36 rebuild from TipTap docs
 *
 * Floating menu that appears when the cursor is inside a table.
 * Uses TipTap's built-in table commands. Minimal — text buttons only.
 */

"use client";

import { BubbleMenu as TipTapBubbleMenu } from "@tiptap/react/menus";
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

export function TableBubbleMenu({ editor }: TableBubbleMenuProps) {
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
        disabled={!editor.can().addRowBefore()}
        className="rounded px-2 py-1 text-xs transition-colors hover:bg-white/10 text-gray-300 disabled:opacity-30"
        title="Add row above"
        type="button"
      >
        Row +↑
      </button>

      <button
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().addRowAfter().run()}
        disabled={!editor.can().addRowAfter()}
        className="rounded px-2 py-1 text-xs transition-colors hover:bg-white/10 text-gray-300 disabled:opacity-30"
        title="Add row below"
        type="button"
      >
        Row +↓
      </button>

      <button
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().deleteRow().run()}
        disabled={!editor.can().deleteRow()}
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
        disabled={!editor.can().addColumnBefore()}
        className="rounded px-2 py-1 text-xs transition-colors hover:bg-white/10 text-gray-300 disabled:opacity-30"
        title="Add column left"
        type="button"
      >
        Col +←
      </button>

      <button
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().addColumnAfter().run()}
        disabled={!editor.can().addColumnAfter()}
        className="rounded px-2 py-1 text-xs transition-colors hover:bg-white/10 text-gray-300 disabled:opacity-30"
        title="Add column right"
        type="button"
      >
        Col +→
      </button>

      <button
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().deleteColumn().run()}
        disabled={!editor.can().deleteColumn()}
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
        disabled={!editor.can().deleteTable()}
        className="rounded px-2 py-1 text-xs transition-colors hover:bg-red-500/20 text-red-400 disabled:opacity-30"
        title="Delete table"
        type="button"
      >
        Delete
      </button>
    </TipTapBubbleMenu>
  );
}
