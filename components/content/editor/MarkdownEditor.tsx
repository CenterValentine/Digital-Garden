/**
 * MarkdownEditor Component
 *
 * TipTap-based rich text editor for note editing.
 * Features:
 * - WYSIWYG editing with StarterKit extensions
 * - Syntax-highlighted code blocks
 * - Auto-save with debouncing
 * - Unsaved changes tracking
 */

"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getEditorExtensions } from "@/lib/domain/editor/extensions-client";
import type { JSONContent } from "@tiptap/core";
import { LinkDialog } from "./LinkDialog";
import { BubbleMenu } from "./BubbleMenu";
import { TableBubbleMenu } from "./TableBubbleMenu";
import { ImageBubbleMenu } from "./ImageBubbleMenu";
import { extractOutline, type OutlineHeading } from "@/lib/domain/content/outline-extractor";
import { uploadImage } from "@/lib/domain/editor/hooks/use-image-upload";
import { isImageUrl } from "@/lib/domain/editor/utils/image-url";
import { useEditorInstanceStore } from "@/state/editor-instance-store";
import { useSettingsStore } from "@/state/settings-store";
import { toast } from "sonner";

export interface EditorStats {
  /** Word count */
  words: number;
  /** Character count (including spaces) */
  characters: number;
  /** Character count (excluding spaces) */
  charactersWithoutSpaces: number;
}

export interface MarkdownEditorProps {
  /** Content ID this editor is bound to — used to prevent cross-document saves */
  contentId?: string;
  /** Parent folder ID — used for referenced content (image uploads) placement */
  parentId?: string | null;
  /** Initial content in TipTap JSON format */
  content: JSONContent;
  /** Callback when content changes */
  onChange?: (content: JSONContent) => void;
  /** Callback for auto-save (debounced) */
  onSave?: (content: JSONContent) => Promise<void>;
  /** Callback when editor stats change */
  onStatsChange?: (stats: EditorStats) => void;
  /** Callback when outline changes (headings extracted) */
  onOutlineChange?: (outline: OutlineHeading[]) => void;
  /** Callback when a wiki-link is clicked */
  onWikiLinkClick?: (targetTitle: string) => void;
  /** Fetch notes for wiki-link autocomplete */
  fetchNotesForWikiLink?: (query: string) => Promise<Array<{ id: string; title: string; slug: string }>>;
  /** Callback when a tag is clicked */
  onTagClick?: (tagId: string, tagName: string) => void;
  /** Fetch tags for tag autocomplete */
  fetchTags?: (query: string) => Promise<Array<{ id: string; name: string; slug: string; color: string | null; usageCount: number }>>;
  /** Create a new tag */
  createTag?: (tagName: string) => Promise<{ id: string; name: string; slug: string; color: string | null; usageCount: number }>;
  /** Callback when a tag is selected from autocomplete */
  onTagSelect?: (tag: { id: string; name: string; slug: string; color: string | null }) => void;
  /** Fetch people for @ mention autocomplete */
  fetchPeopleMentions?: (query: string) => Promise<Array<{ id: string; personId: string; label: string; slug: string; email: string | null; phone: string | null; avatarUrl: string | null }>>;
  /** Callback when a person mention is clicked */
  onPersonMentionClick?: (personId: string) => void;
  /** Auto-save delay in milliseconds */
  autoSaveDelay?: number;
  /** Read-only mode */
  editable?: boolean;
  /** Compact mode for secondary/embedded editors (less padding, smaller prose) */
  compact?: boolean;
  /** Placeholder text when editor is empty */
  placeholder?: string;
  /** Custom class name */
  className?: string;
}

export function MarkdownEditor({
  contentId,
  parentId,
  content,
  onChange,
  onSave,
  onStatsChange,
  onOutlineChange,
  onWikiLinkClick,
  fetchNotesForWikiLink,
  onTagClick,
  fetchTags,
  createTag,
  onTagSelect,
  fetchPeopleMentions,
  onPersonMentionClick,
  autoSaveDelay = 2000,
  editable = true,
  compact = false,
  placeholder,
  className = "",
}: MarkdownEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track the last content we saved so we can distinguish save-echoes
  // (parent updating state after our save) from genuine external updates
  // (navigation, refetch). Prevents cursor-jump-on-autosave bug.
  const lastSavedContentRef = useRef<JSONContent | null>(null);
  // Snapshot the onSave callback in a ref so the timeout always uses the
  // version that was current when the edit happened — not a stale or
  // re-created callback that might target a different document.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  // Track which contentId this editor instance is bound to, so we can
  // discard saves that fire after the user navigated away.
  const contentIdRef = useRef(contentId);
  contentIdRef.current = contentId;
  // Sprint 37: File input for image upload via slash command
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Ref for insertImageFromFile — editorProps closures are frozen at first render
  // (useEditor doesn't re-apply editorProps on re-renders), so they'd capture a
  // stale version where editor=null. Same pattern as onSaveRef/contentIdRef.
  const insertImageFromFileRef = useRef<(file: File) => void>(() => {});

  // Initialize editor
  const editor = useEditor({
    extensions: getEditorExtensions({
      onWikiLinkClick,
      fetchNotesForWikiLink,
      onTagClick,
      fetchTags,
      createTag,
      onTagSelect,
      fetchPeopleMentions,
      onPersonMentionClick,
    }),
    content,
    editable,
    immediatelyRender: false, // Prevent SSR hydration mismatch
    editorProps: {
      attributes: {
        class: compact
          ? "prose prose-sm max-w-none focus:outline-none min-h-[120px] px-4 pt-2 pb-2"
          : "prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none focus:outline-none min-h-[500px] px-6 pt-3 pb-4",
      },
      // Sprint 37: Allow external file drops (Finder, desktop, etc.)
      // Both dragenter AND dragover must call preventDefault for the browser
      // to accept the drop (WebKit/Safari requires both).
      handleDOMEvents: {
        dragenter: (_view, event) => {
          if (event.dataTransfer?.types.includes("Files")) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }
          return false;
        },
        dragover: (_view, event) => {
          if (event.dataTransfer?.types.includes("Files")) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }
          return false;
        },
      },
      // Sprint 37: Image paste handler
      // Uses insertImageFromFileRef to avoid stale closure (see ref declaration)
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files || []);
        const imageFiles = files.filter((f) => f.type.startsWith("image/"));

        if (imageFiles.length > 0) {
          event.preventDefault();
          for (const file of imageFiles) {
            insertImageFromFileRef.current(file);
          }
          return true;
        }

        // Check for image URL paste
        const text = event.clipboardData?.getData("text/plain");
        if (text && isImageUrl(text)) {
          event.preventDefault();
          const { state, dispatch } = view;
          const node = state.schema.nodes.image.create({
            src: text,
            source: "url",
          });
          const tr = state.tr.replaceSelectionWith(node);
          dispatch(tr);
          return true;
        }

        return false;
      },
      // Sprint 37: Image drop handler (ProseMirror-level)
      // Uses insertImageFromFileRef to avoid stale closure (see ref declaration)
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false; // Internal drag — let ProseMirror handle it

        const files = Array.from(event.dataTransfer?.files || []);
        const imageFiles = files.filter((f) => f.type.startsWith("image/"));

        if (imageFiles.length > 0) {
          event.preventDefault();
          for (const file of imageFiles) {
            insertImageFromFileRef.current(file);
          }
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();

      // Trigger immediate onChange
      onChange?.(json);

      // Update stats from CharacterCount extension
      if (onStatsChange) {
        const storage = editor.storage.characterCount;
        onStatsChange({
          words: storage?.words?.() || 0,
          characters: storage?.characters?.() || 0,
          charactersWithoutSpaces: 0, // Not easily available from extension
        });
      }

      // Extract outline from headings (debounced via onOutlineChange caller)
      if (onOutlineChange) {
        const outline = extractOutline(json);
        onOutlineChange(outline);
      }

      // Mark as unsaved
      setHasUnsavedChanges(true);

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Schedule auto-save.
      // IMPORTANT: Snapshot the save callback AND contentId at the moment the
      // edit happens. This prevents the race condition where the user navigates
      // to a different document during the debounce window — without this,
      // React could give us a fresh handleSave targeting the NEW document,
      // causing Doc A's content to overwrite Doc B.
      const snapshotSave = onSaveRef.current;
      const snapshotContentId = contentIdRef.current;
      if (snapshotSave) {
        saveTimeoutRef.current = setTimeout(async () => {
          // Guard: if contentId changed since the edit, discard this save
          if (snapshotContentId && contentIdRef.current !== snapshotContentId) {
            return;
          }
          setIsSaving(true);
          try {
            // Track the content object we're about to save. When the parent
            // calls setNoteContent(content) after save, it echoes back as a
            // prop change. The ref lets us skip the setContent call for that echo.
            lastSavedContentRef.current = json;
            await snapshotSave(json);
            setHasUnsavedChanges(false);
          } catch (error) {
            console.error("Failed to save:", error);
            lastSavedContentRef.current = null;
            // Keep hasUnsavedChanges=true on error
          } finally {
            setIsSaving(false);
          }
        }, autoSaveDelay);
      }
    },
  });

  // Sync editor content when the prop changes from an EXTERNAL source
  // (navigation to a different note, refetch after rename).
  // Skip when the change is a save-echo: the parent updating state after
  // our own autosave — applying that would reset the cursor and lose
  // any content the user typed during the save round-trip.
  useEffect(() => {
    if (!editor || !content) return;

    // If this content matches what we just saved, it's a save-echo — skip it
    if (content === lastSavedContentRef.current) {
      lastSavedContentRef.current = null;
      return;
    }

    // Genuine external update — apply it
    editor.commands.setContent(content);
  }, [content, editor]);

  // Initial stats update when editor is created
  useEffect(() => {
    if (editor && onStatsChange) {
      const storage = editor.storage.characterCount;
      onStatsChange({
        words: storage?.words?.() || 0,
        characters: storage?.characters?.() || 0,
        charactersWithoutSpaces: 0, // Not easily available from extension
      });
    }
  }, [editor, onStatsChange]);

  // Register editor instance in global store for AI chat panel access
  useEffect(() => {
    if (editor && contentId) {
      useEditorInstanceStore.getState().setEditor(contentId, editor);
    }
    return () => {
      if (contentId) {
        useEditorInstanceStore.getState().clearEditor(contentId);
      }
    };
  }, [contentId, editor]);

  // Handle Cmd+K / Ctrl+K keyboard shortcut for link dialog
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setIsLinkDialogOpen(true);
      }
    };

    // Attach keyboard listener
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [editor]);

  // Listen for scroll-to-heading events from the outline panel
  useEffect(() => {
    if (!editor) return;

    const handleScrollToHeading = (e: Event) => {
      const { text, level } = (e as CustomEvent).detail;

      // Search for the heading by text + level (more reliable than position counter)
      let targetPos: number | null = null;
      editor.state.doc.descendants((node, pos) => {
        if (targetPos !== null) return false; // Stop after first match
        if (
          node.type.name === "heading" &&
          node.attrs.level === level &&
          node.textContent.trim() === text.trim()
        ) {
          targetPos = pos;
          return false;
        }
      });

      if (targetPos !== null) {
        editor.chain().setTextSelection(targetPos).scrollIntoView().run();
      }
    };

    window.addEventListener("scroll-to-heading", handleScrollToHeading);
    return () => window.removeEventListener("scroll-to-heading", handleScrollToHeading);
  }, [editor]);

  // Sprint 37: Listen for image upload trigger from slash command
  useEffect(() => {
    const handleImageUpload = () => {
      fileInputRef.current?.click();
    };
    window.addEventListener("editor-image-upload", handleImageUpload);
    return () => window.removeEventListener("editor-image-upload", handleImageUpload);
  }, []);

  // Sprint 42: Listen for AI-generated image insertion at cursor position
  useEffect(() => {
    if (!editor) return;

    const handleInsertAiImage = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const { src, alt, contentId: imgContentId, source } = detail;

      editor
        .chain()
        .focus()
        .setImage({
          src,
          alt: alt || "AI generated image",
          contentId: imgContentId || null,
          source: source || "ai-generated",
        } as any)
        .run();
    };

    window.addEventListener("insert-ai-image", handleInsertAiImage);
    return () => window.removeEventListener("insert-ai-image", handleInsertAiImage);
  }, [editor]);

  // Sprint 37: Insert image from file — shared by paste, drop, and file input.
  // Immediately shows a blob URL placeholder, uploads async, then swaps src.
  // NOTE: editorProps handlers use insertImageFromFileRef (not this directly)
  // because useEditor freezes editorProps at first render when editor is null.
  const insertImageFromFile = useCallback(
    (file: File) => {
      if (!editor) return;

      const blobUrl = URL.createObjectURL(file);

      // Insert placeholder image immediately for instant feedback
      editor
        .chain()
        .focus()
        .setImage({
          src: blobUrl,
          alt: file.name,
          uploading: true,
          source: "user-uploaded",
        } as any)
        .run();

      // Upload in the background
      uploadImage(file, parentId ?? null)
        .then(({ contentId: imgContentId, downloadUrl }) => {
          // Find the placeholder node by its blob URL and update it
          editor.state.doc.descendants((node, pos) => {
            if (node.type.name === "image" && node.attrs.src === blobUrl) {
              editor.view.dispatch(
                editor.state.tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  src: downloadUrl,
                  contentId: imgContentId,
                  uploading: false,
                })
              );
              return false; // stop traversal
            }
          });
          URL.revokeObjectURL(blobUrl);
        })
        .catch((err) => {
          // Remove the placeholder node on failure
          editor.state.doc.descendants((node, pos) => {
            if (node.type.name === "image" && node.attrs.src === blobUrl) {
              editor.view.dispatch(
                editor.state.tr.delete(pos, pos + node.nodeSize)
              );
              return false;
            }
          });
          URL.revokeObjectURL(blobUrl);
          toast.error(`Image upload failed: ${err.message}`);
        });
    },
    [editor, parentId]
  );
  insertImageFromFileRef.current = insertImageFromFile;

  // Sprint 37: Handle file input change (image selected from file picker)
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      insertImageFromFile(file);
      // Reset file input so the same file can be selected again
      e.target.value = "";
    },
    [insertImageFromFile]
  );

  // Cancel pending saves when contentId changes (user navigated away)
  // or on unmount. This is the first line of defense against cross-document saves.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [contentId]);

  // AI highlight visibility — controlled by settings toggle
  const showAiHighlight = useSettingsStore((s) => s.ai?.showAiHighlight ?? true);

  return (
    <div className={`flex flex-col h-full ${className} ${showAiHighlight ? "" : "ai-highlight-hidden"}`}>
      {/* Sprint 37: Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Editor — React-level drag handlers as primary drop zone for external files.
          ProseMirror's handleDrop doesn't always receive external file drops (browser
          may not fire 'drop' on the contenteditable). React handlers on the wrapper
          catch drops reliably regardless of where they land in the editor area. */}
      <div
        className="flex-1 overflow-y-auto"
        onDragOver={(e) => {
          if (
            e.dataTransfer.types.includes("Files") ||
            e.dataTransfer.types.includes("application/x-dg-ai-image")
          ) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDragEnter={(e) => {
          if (
            e.dataTransfer.types.includes("Files") ||
            e.dataTransfer.types.includes("application/x-dg-ai-image")
          ) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(e) => {
          // Sprint 42: Handle AI image drop from chat
          const aiImageData = e.dataTransfer.getData("application/x-dg-ai-image");
          if (aiImageData && editor) {
            e.preventDefault();
            e.stopPropagation();
            try {
              const parsed = JSON.parse(aiImageData);
              const { src, alt, contentId: imgContentId, source } = parsed;
              const imageAttrs = {
                src,
                alt: alt || "AI generated image",
                contentId: imgContentId || null,
                source: source || "ai-generated",
              };

              // Convert drop coordinates to a ProseMirror document position
              const dropPos = editor.view.posAtCoords({
                left: e.clientX,
                top: e.clientY,
              });

              if (dropPos) {
                editor
                  .chain()
                  .focus()
                  .insertContentAt(dropPos.pos, {
                    type: "image",
                    attrs: imageAttrs,
                  })
                  .run();
              } else {
                // Fallback: insert at current cursor position
                editor
                  .chain()
                  .focus()
                  .setImage(imageAttrs as any)
                  .run();
              }
            } catch (err) {
              console.error("[AI Image Drop] Error:", err);
            }
            return;
          }

          const files = Array.from(e.dataTransfer.files);
          const imageFiles = files.filter((f) => f.type.startsWith("image/"));
          if (imageFiles.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            for (const file of imageFiles) {
              insertImageFromFile(file);
            }
          }
        }}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Bubble Menu - floating toolbar on text selection */}
      <BubbleMenu
        editor={editor}
        onLinkClick={() => setIsLinkDialogOpen(true)}
      />

      {/* Table Bubble Menu - floating toolbar for table editing */}
      <TableBubbleMenu editor={editor} />

      {/* Image Bubble Menu - size presets, alt text, delete */}
      <ImageBubbleMenu editor={editor} />

      {/* Link Dialog (Cmd+K) */}
      <LinkDialog
        editor={editor}
        open={isLinkDialogOpen}
        onOpenChange={setIsLinkDialogOpen}
      />
    </div>
  );
}
