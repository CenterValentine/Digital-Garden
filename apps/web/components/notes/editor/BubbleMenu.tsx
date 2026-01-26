/**
 * BubbleMenu Component
 *
 * Floating toolbar that appears when text is selected.
 * Provides quick access to common formatting options:
 * - Bold, Italic, Strikethrough, Code
 * - Link insertion
 * - Heading levels
 */

"use client";

import { useState, useEffect } from "react";
import { BubbleMenu as TipTapBubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link as LinkIcon,
  Heading1,
  Heading2,
  Heading3,
} from "lucide-react";

// Create unique plugin key for this bubble menu
const textFormattingBubbleMenuKey = new PluginKey("textFormattingBubbleMenu");

export interface BubbleMenuProps {
  editor: Editor | null;
  onLinkClick?: () => void;
}

export function BubbleMenu({ editor, onLinkClick }: BubbleMenuProps) {
  // Force re-render when selection changes to update active states
  const [, setUpdateCounter] = useState(0);

  useEffect(() => {
    if (!editor) return;

    const updateActiveStates = () => {
      setUpdateCounter((prev) => prev + 1);
    };

    // Listen to selection updates to refresh active states
    editor.on("selectionUpdate", updateActiveStates);
    editor.on("transaction", updateActiveStates);

    return () => {
      editor.off("selectionUpdate", updateActiveStates);
      editor.off("transaction", updateActiveStates);
    };
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <TipTapBubbleMenu
      editor={editor}
      pluginKey={textFormattingBubbleMenuKey}
      updateDelay={100}
      shouldShow={({ state, editor }) => {
        // Only show when there's a non-empty text selection outside of tables
        const { selection } = state;
        const { empty } = selection;

        // Don't show if selection is empty
        if (empty) return false;

        // Don't show if we're inside a table
        if (editor.isActive("table")) return false;

        return true;
      }}
      className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/80 p-1 shadow-lg backdrop-blur-md"
    >
      {/* Bold */}
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
          editor.isActive("bold") ? "bg-white/20 text-white" : "text-gray-400"
        }`}
        title="Bold (Cmd+B)"
        type="button"
      >
        <Bold className="h-4 w-4" />
      </button>

      {/* Italic */}
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
          editor.isActive("italic") ? "bg-white/20 text-white" : "text-gray-400"
        }`}
        title="Italic (Cmd+I)"
        type="button"
      >
        <Italic className="h-4 w-4" />
      </button>

      {/* Strikethrough */}
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
          editor.isActive("strike")
            ? "bg-white/20 text-white"
            : "text-gray-400"
        }`}
        title="Strikethrough"
        type="button"
      >
        <Strikethrough className="h-4 w-4" />
      </button>

      {/* Code */}
      <button
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
          editor.isActive("code") ? "bg-white/20 text-white" : "text-gray-400"
        }`}
        title="Inline Code (Cmd+E)"
        type="button"
      >
        <Code className="h-4 w-4" />
      </button>

      {/* Divider */}
      <div className="mx-1 h-6 w-px bg-white/10" />

      {/* Link */}
      <button
        onClick={() => {
          if (editor.isActive("link")) {
            // Unlink
            editor.chain().focus().unsetLink().run();
          } else {
            // Open link dialog
            onLinkClick?.();
          }
        }}
        className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
          editor.isActive("link") ? "bg-white/20 text-white" : "text-gray-400"
        }`}
        title={editor.isActive("link") ? "Remove Link" : "Add Link (Cmd+K)"}
        type="button"
      >
        <LinkIcon className="h-4 w-4" />
      </button>

      {/* Divider */}
      <div className="mx-1 h-6 w-px bg-white/10" />

      {/* Heading 1 */}
      <button
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
        className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
          editor.isActive("heading", { level: 1 })
            ? "bg-white/20 text-white"
            : "text-gray-400"
        }`}
        title="Heading 1"
        type="button"
      >
        <Heading1 className="h-4 w-4" />
      </button>

      {/* Heading 2 */}
      <button
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
          editor.isActive("heading", { level: 2 })
            ? "bg-white/20 text-white"
            : "text-gray-400"
        }`}
        title="Heading 2"
        type="button"
      >
        <Heading2 className="h-4 w-4" />
      </button>

      {/* Heading 3 */}
      <button
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
        className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
          editor.isActive("heading", { level: 3 })
            ? "bg-white/20 text-white"
            : "text-gray-400"
        }`}
        title="Heading 3"
        type="button"
      >
        <Heading3 className="h-4 w-4" />
      </button>
    </TipTapBubbleMenu>
  );
}
