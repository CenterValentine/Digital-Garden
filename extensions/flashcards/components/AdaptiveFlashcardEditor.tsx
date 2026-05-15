"use client";

import { useEffect, useMemo, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Placeholder from "@tiptap/extension-placeholder";
import type { JSONContent } from "@tiptap/core";
import { getEditorExtensions } from "@/lib/domain/editor/extensions-client";
import { EMPTY_TIPTAP_DOC, normalizeTiptapDoc } from "@/lib/domain/flashcards";

interface AdaptiveFlashcardEditorProps {
  value: JSONContent;
  onChange?: (value: JSONContent) => void;
  mode: "plain" | "rich";
  placeholder: string;
  editable?: boolean;
  ariaLabel: string;
  compact?: boolean;
}

function serialize(value: JSONContent) {
  return JSON.stringify(value);
}

export function AdaptiveFlashcardEditor({
  value,
  onChange,
  mode,
  placeholder,
  editable = true,
  ariaLabel,
  compact = false,
}: AdaptiveFlashcardEditorProps) {
  const lastValueRef = useRef(serialize(value || EMPTY_TIPTAP_DOC));
  const extensions = useMemo(() => {
    if (mode === "plain") {
      return [
        Document,
        Paragraph,
        Text,
        Placeholder.configure({ placeholder }),
      ];
    }

    return getEditorExtensions();
  }, [mode, placeholder]);

  const editor = useEditor({
    extensions,
    content: normalizeTiptapDoc(value),
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        class:
          mode === "plain"
            ? "flashcard-editor flashcard-editor-plain"
            : "flashcard-editor flashcard-editor-rich",
      },
      handleKeyDown: (_view, event) => {
        if (mode !== "plain" || event.key !== "Enter") return false;
        event.preventDefault();
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      const json = normalizeTiptapDoc(editor.getJSON());
      lastValueRef.current = serialize(json);
      onChange?.(json);
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editable, editor]);

  useEffect(() => {
    if (!editor) return;
    const next = normalizeTiptapDoc(value);
    const nextSerialized = serialize(next);
    if (lastValueRef.current === nextSerialized) return;
    lastValueRef.current = nextSerialized;
    editor.commands.setContent(next);
  }, [editor, value]);

  const isToolbarVisible = mode === "rich" && editable;

  return (
    <div
      className={`rounded-md border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.04] dark:bg-white/[0.02] ${
        compact ? "min-h-[120px]" : "min-h-[180px]"
      }`}
    >
      {isToolbarVisible ? (
        <div className="flex min-h-11 items-center gap-1 overflow-x-auto border-b border-black/[0.06] dark:border-white/[0.06] px-2 py-1 text-xs">
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className="min-h-9 rounded px-2 text-gray-700 dark:text-gray-300 hover:bg-black/[0.05] dark:hover:bg-white/10"
          >
            Bold
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            className="min-h-9 rounded px-2 text-gray-700 dark:text-gray-300 hover:bg-black/[0.05] dark:hover:bg-white/10"
          >
            Italic
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
            className="min-h-9 rounded px-2 text-gray-700 dark:text-gray-300 hover:bg-black/[0.05] dark:hover:bg-white/10"
          >
            Code
          </button>
        </div>
      ) : null}
      <div className="px-4 py-3 md:px-5 md:py-4">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
