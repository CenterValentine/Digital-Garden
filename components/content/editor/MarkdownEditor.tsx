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
import { useEffect, useRef, useState } from "react";
import { getEditorExtensions } from "@/lib/domain/editor/extensions-client";
import type { JSONContent } from "@tiptap/core";
import { LinkDialog } from "./LinkDialog";
import { BubbleMenu } from "./BubbleMenu";
import { TableBubbleMenu } from "./TableBubbleMenu";
import { extractOutline, type OutlineHeading } from "@/lib/domain/content/outline-extractor";

export interface EditorStats {
  /** Word count */
  words: number;
  /** Character count (including spaces) */
  characters: number;
  /** Character count (excluding spaces) */
  charactersWithoutSpaces: number;
}

export interface MarkdownEditorProps {
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

  // Initialize editor
  const editor = useEditor({
    extensions: getEditorExtensions({
      onWikiLinkClick,
      fetchNotesForWikiLink,
      onTagClick,
      fetchTags,
      createTag,
      onTagSelect,
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

      // Schedule auto-save
      if (onSave) {
        saveTimeoutRef.current = setTimeout(async () => {
          setIsSaving(true);
          try {
            await onSave(json);
            setHasUnsavedChanges(false);
          } catch (error) {
            console.error("Failed to save:", error);
            // Keep hasUnsavedChanges=true on error
          } finally {
            setIsSaving(false);
          }
        }, autoSaveDelay);
      }
    },
  });

  // Update editor content when prop changes (external updates)
  useEffect(() => {
    if (editor && content !== editor.getJSON()) {
      editor.commands.setContent(content);
    }
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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Editor */}
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>

      {/* Bubble Menu - floating toolbar on text selection */}
      <BubbleMenu
        editor={editor}
        onLinkClick={() => setIsLinkDialogOpen(true)}
      />

      {/* Table Bubble Menu - floating toolbar for table editing */}
      <TableBubbleMenu editor={editor} />

      {/* Link Dialog (Cmd+K) */}
      <LinkDialog
        editor={editor}
        open={isLinkDialogOpen}
        onOpenChange={setIsLinkDialogOpen}
      />
    </div>
  );
}
