"use client";

import { useEffect, useMemo, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Placeholder from "@tiptap/extension-placeholder";
import type { Editor, JSONContent } from "@tiptap/core";
import { ImagePlus } from "lucide-react";
import { getEditorExtensions } from "@/lib/domain/editor/extensions-client";
import { useImagePasteHandler } from "@/lib/domain/editor/hooks/use-image-paste";
import { EMPTY_TIPTAP_DOC, normalizeTiptapDoc } from "@/lib/domain/flashcards";

interface AdaptiveFlashcardEditorProps {
  value: JSONContent;
  onChange?: (value: JSONContent) => void;
  mode: "plain" | "rich";
  placeholder: string;
  editable?: boolean;
  ariaLabel: string;
  compact?: boolean;
  /**
   * One step smaller than `compact`. Removes the min-height entirely so
   * the editor hugs its content (one line tall by default) and grows
   * vertically as text wraps. Vertical padding is reduced too. Use for
   * terse, one-line-default surfaces like the AI flashcard proposal
   * card's front side. Overrides `compact` when both are set.
   */
  tight?: boolean;
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
  tight = false,
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

  // Sprint 7: image paste/drop pipeline. The editorRef resolves the
  // chicken-egg between useEditor and editorProps — useEditor freezes
  // its editorProps closures at first render (when editor === null);
  // the hook's handlers read from editorRef.current at event time, so
  // by the time a paste fires, the ref points at the real editor.
  const editorRef = useRef<Editor | null>(null);
  const { handlePaste, handleDrop, insertImageFromFile } = useImagePasteHandler({
    editorRef,
    parentId: null, // flashcards live outside the file-tree folder
  });

  const editor = useEditor({
    extensions,
    content: normalizeTiptapDoc(value),
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        // Class composes mode + tight. The tight class targets a
        // globals.css override for `.ProseMirror.flashcard-editor-tight`
        // which strips the 4rem bottom padding the main editor uses for
        // the block-`+` button affordance — that padding doesn't apply
        // here.
        class: [
          "flashcard-editor",
          mode === "plain" ? "flashcard-editor-plain" : "flashcard-editor-rich",
          tight ? "flashcard-editor-tight" : "",
        ]
          .filter(Boolean)
          .join(" "),
      },
      handleKeyDown: (_view, event) => {
        if (mode !== "plain" || event.key !== "Enter") return false;
        event.preventDefault();
        return true;
      },
      // In rich mode only: wire the paste/drop handlers. Plain mode
      // doesn't include the image extension, so a pasted image would
      // be silently dropped — better to skip the handler entirely.
      ...(mode === "rich" ? { handlePaste, handleDrop } : {}),
    },
    onUpdate: ({ editor }) => {
      const json = normalizeTiptapDoc(editor.getJSON());
      lastValueRef.current = serialize(json);
      onChange?.(json);
    },
  });

  // Keep the ref pointed at the latest editor instance for the image
  // hook's handlers. useEditor returns null then the instance; this
  // effect bridges the two.
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

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

  // Hidden file input for the "Insert image" toolbar button. Clicking
  // the button proxies to .click() on this input, which opens the
  // OS file picker. Same pattern as MarkdownEditor's image upload.
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isToolbarVisible = mode === "rich" && editable;

  // Sizing: `tight` is the smallest — no min-height, the editor hugs
  // its content and grows with wrapping. `compact` is the intermediate
  // size used by the in-panel inline editor. Default is the full-size
  // editor used by the dialog flows. When both flags are set, `tight`
  // wins (the override-compact case for the AI proposal cards).
  const sizingClassName = tight
    ? ""
    : compact
      ? "min-h-[120px]"
      : "min-h-[180px]";

  return (
    <div
      className={`rounded-md border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.04] dark:bg-white/[0.02] ${sizingClassName}`}
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
          {/* Sprint 7: image-insert button. Opens the OS file picker;
              on file pick we hand off to the same insertImageFromFile
              the paste/drop pipeline uses, so all three paths share
              upload + placeholder + swap-to-final logic. */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Insert image"
            aria-label="Insert image"
            className="ml-auto inline-flex min-h-9 items-center gap-1 rounded px-2 text-gray-700 dark:text-gray-300 hover:bg-black/[0.05] dark:hover:bg-white/10"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            Image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) insertImageFromFile(file);
              // Reset so picking the same file twice fires onChange.
              e.target.value = "";
            }}
          />
        </div>
      ) : null}
      <div
        className={
          tight
            ? "px-3 py-1.5"
            : "px-4 py-3 md:px-5 md:py-4"
        }
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
