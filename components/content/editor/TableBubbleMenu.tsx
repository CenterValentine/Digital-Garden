/**
 * TableBubbleMenu Component
 *
 * Floating toolbar that appears when cursor is inside a table.
 * Provides quick access to table manipulation:
 * - Add/delete rows and columns
 * - Delete entire table
 * - Toggle header row (future)
 */

"use client";

import { BubbleMenu as TipTapBubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import {
  Plus,
  Minus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";

// Create unique plugin key for this bubble menu
const tableBubbleMenuKey = new PluginKey("tableBubbleMenu");

export interface TableBubbleMenuProps {
  editor: Editor | null;
}

export function TableBubbleMenu({ editor }: TableBubbleMenuProps) {
  if (!editor) {
    return null;
  }

  return (
    <TipTapBubbleMenu
      editor={editor}
      pluginKey={tableBubbleMenuKey}
      updateDelay={100}
      shouldShow={({ editor }) => {
        // Only show when cursor is inside a table
        return editor.isActive("table");
      }}
      className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/80 p-1 shadow-lg backdrop-blur-md"
    >
      {/* Add Row Above */}
      <button
        onClick={() => editor.chain().focus().addRowBefore().run()}
        className="rounded p-1.5 transition-colors hover:bg-white/10 text-gray-400"
        title="Add Row Above"
        type="button"
      >
        <div className="flex items-center gap-0.5">
          <ArrowUp className="h-3 w-3" />
          <Plus className="h-3 w-3" />
        </div>
      </button>

      {/* Add Row Below */}
      <button
        onClick={() => editor.chain().focus().addRowAfter().run()}
        className="rounded p-1.5 transition-colors hover:bg-white/10 text-gray-400"
        title="Add Row Below"
        type="button"
      >
        <div className="flex items-center gap-0.5">
          <ArrowDown className="h-3 w-3" />
          <Plus className="h-3 w-3" />
        </div>
      </button>

      {/* Delete Row */}
      <button
        onClick={() => editor.chain().focus().deleteRow().run()}
        className="rounded p-1.5 transition-colors hover:bg-white/10 text-gray-400"
        title="Delete Row"
        type="button"
      >
        <div className="flex items-center gap-0.5">
          <Minus className="h-3 w-3" />
          <ArrowUp className="h-3 w-3" />
        </div>
      </button>

      {/* Divider */}
      <div className="mx-1 h-6 w-px bg-white/10" />

      {/* Add Column Left */}
      <button
        onClick={() => editor.chain().focus().addColumnBefore().run()}
        className="rounded p-1.5 transition-colors hover:bg-white/10 text-gray-400"
        title="Add Column Left"
        type="button"
      >
        <div className="flex items-center gap-0.5">
          <ArrowLeft className="h-3 w-3" />
          <Plus className="h-3 w-3" />
        </div>
      </button>

      {/* Add Column Right */}
      <button
        onClick={() => editor.chain().focus().addColumnAfter().run()}
        className="rounded p-1.5 transition-colors hover:bg-white/10 text-gray-400"
        title="Add Column Right"
        type="button"
      >
        <div className="flex items-center gap-0.5">
          <ArrowRight className="h-3 w-3" />
          <Plus className="h-3 w-3" />
        </div>
      </button>

      {/* Delete Column */}
      <button
        onClick={() => editor.chain().focus().deleteColumn().run()}
        className="rounded p-1.5 transition-colors hover:bg-white/10 text-gray-400"
        title="Delete Column"
        type="button"
      >
        <div className="flex items-center gap-0.5">
          <Minus className="h-3 w-3" />
          <ArrowLeft className="h-3 w-3" />
        </div>
      </button>

      {/* Divider */}
      <div className="mx-1 h-6 w-px bg-white/10" />

      {/* Delete Table */}
      <button
        onClick={() => editor.chain().focus().deleteTable().run()}
        className="rounded p-1.5 transition-colors hover:bg-red-500/20 text-red-400 hover:text-red-300"
        title="Delete Table"
        type="button"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </TipTapBubbleMenu>
  );
}
