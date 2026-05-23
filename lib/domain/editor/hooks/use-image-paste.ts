import { useCallback } from "react";
import type { EditorView } from "@tiptap/pm/view";
import type { Slice } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/core";
import { toast } from "sonner";
import { uploadImage } from "./use-image-upload";
import { isImageUrl } from "../utils/image-url";

// Attribute shape accepted by the EditorImage extension's setImage()
// command. Mirrors the same local interface in MarkdownEditor.tsx —
// candidate for a single source of truth in a future refactor, but
// duplicated for now to keep this hook standalone.
interface EditorImageAttrs {
  src: string;
  alt?: string;
  contentId?: string | null;
  source?: string;
  uploading?: boolean;
}

// Sprint 7 — shared image paste/drop handlers for any TipTap editor.
//
// Originally lived inside MarkdownEditor.tsx (Sprint 37). Extracted
// here so the flashcard editors (AdaptiveFlashcardEditor) can wire
// the same paste/drop/upload pipeline without duplicating ~70 lines
// of editorProps logic.
//
// Why the editor REF (not editor instance): `useEditor({ editorProps:
// { handlePaste, ... } })` freezes editorProps closures at first
// render, when the editor instance is still null. The caller wires
// this up by passing a ref that they update when the editor mounts.
// Handlers close over the stable ref so they always reach the latest
// editor instance.

export interface UseImagePasteOptions {
  // RefObject pointing at the editor. Caller updates `.current` when
  // useEditor mounts (typically via useEffect). The hook reads from
  // ref.current inside handler closures so the editorProps capture-
  // at-first-render problem is sidestepped.
  editorRef: { current: Editor | null };
  // Parent folder for the uploaded image's referenced ContentNode.
  // null = orphan upload. Flashcards pass null.
  parentId?: string | null;
}

export interface UseImagePasteResult {
  handlePaste: (view: EditorView, event: ClipboardEvent) => boolean;
  handleDrop: (view: EditorView, event: DragEvent, slice: Slice, moved: boolean) => boolean;
  // Direct invocation for toolbar "Insert image" buttons.
  insertImageFromFile: (file: File) => void;
}

export function useImagePasteHandler({
  editorRef,
  parentId = null,
}: UseImagePasteOptions): UseImagePasteResult {
  // The actual upload + insert routine. Re-created when parentId
  // changes; reads editor from the ref at call time. In practice the
  // flashcard call site always passes parentId=null, so this rarely
  // re-creates — but the React Compiler enforces the ref-write rule
  // strictly enough that updating a ref during render is rejected.
  const insertImageFromFile = useCallback(
    (file: File) => {
      const editor = editorRef.current;
      if (!editor) return;
      const blobUrl = URL.createObjectURL(file);

      editor
        .chain()
        .focus()
        .setImage({
          src: blobUrl,
          alt: file.name,
          uploading: true,
          source: "user-uploaded",
        } as EditorImageAttrs)
        .run();

      void uploadImage(file, parentId)
        .then(({ contentId: imgContentId, downloadUrl }) => {
          editor.state.doc.descendants((node, pos) => {
            if (node.type.name === "image" && node.attrs.src === blobUrl) {
              editor.view.dispatch(
                editor.state.tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  src: downloadUrl,
                  contentId: imgContentId,
                  uploading: false,
                }),
              );
              return false;
            }
            return true;
          });
          URL.revokeObjectURL(blobUrl);
        })
        .catch((err) => {
          editor.state.doc.descendants((node, pos) => {
            if (node.type.name === "image" && node.attrs.src === blobUrl) {
              editor.view.dispatch(
                editor.state.tr.delete(pos, pos + node.nodeSize),
              );
              return false;
            }
            return true;
          });
          URL.revokeObjectURL(blobUrl);
          toast.error(
            `Image upload failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    },
    [editorRef, parentId],
  );

  const handlePaste = useCallback(
    (view: EditorView, event: ClipboardEvent): boolean => {
      const files = Array.from(event.clipboardData?.files || []);
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));

      if (imageFiles.length > 0) {
        event.preventDefault();
        for (const file of imageFiles) {
          insertImageFromFile(file);
        }
        return true;
      }

      const text = event.clipboardData?.getData("text/plain");
      if (text && isImageUrl(text)) {
        event.preventDefault();
        const { state, dispatch } = view;
        const node = state.schema.nodes.image.create({ src: text, source: "url" });
        const tr = state.tr.replaceSelectionWith(node);
        dispatch(tr);
        return true;
      }

      return false;
    },
    [insertImageFromFile],
  );

  const handleDrop = useCallback(
    (view: EditorView, event: DragEvent, _slice: Slice, moved: boolean): boolean => {
      void view;
      if (moved) return false;

      const files = Array.from(event.dataTransfer?.files || []);
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));

      if (imageFiles.length > 0) {
        event.preventDefault();
        for (const file of imageFiles) {
          insertImageFromFile(file);
        }
        return true;
      }
      return false;
    },
    [insertImageFromFile],
  );

  return { handlePaste, handleDrop, insertImageFromFile };
}
