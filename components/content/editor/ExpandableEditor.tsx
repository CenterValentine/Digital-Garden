/**
 * ExpandableEditor Component
 *
 * Collapsible TipTap editor that attaches to non-note content types.
 * Allows any ContentNode (file, folder, external, etc.) to have
 * rich-text notes via the shared NotePayload relation.
 *
 * Features:
 * - Per-node expansion state persisted in localStorage
 * - Word count badge when content exists
 * - Compact MarkdownEditor for secondary editing
 * - Context-aware placeholder text
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { MarkdownEditor } from "./MarkdownEditor";
import type { JSONContent } from "@tiptap/core";

interface ExpandableEditorProps {
  /** ID of the content node this editor is attached to */
  contentId: string;
  /** Content type label for placeholder text */
  contentType: string;
  /** Existing note content (null if no notes yet) */
  noteContent: JSONContent | null;
  /** Save handler — PATCHes to the content API */
  onSave: (content: JSONContent) => Promise<void>;
  /** Read-only mode */
  readOnly?: boolean;
  /** Callback when a wiki-link is clicked */
  onWikiLinkClick?: (targetTitle: string) => void;
  /** Fetch notes for wiki-link autocomplete */
  fetchNotesForWikiLink?: (query: string) => Promise<Array<{ id: string; title: string; slug: string }>>;
  /** Fetch tags for tag autocomplete */
  fetchTags?: (query: string) => Promise<Array<{ id: string; name: string; slug: string; color: string | null; usageCount: number }>>;
  /** Create a new tag */
  createTag?: (tagName: string) => Promise<{ id: string; name: string; slug: string; color: string | null; usageCount: number }>;
}

/**
 * Hook for per-node expansion persistence.
 * Reads initial state from localStorage synchronously to avoid flash.
 */
function useExpandedState(contentId: string): [boolean, (expanded: boolean) => void] {
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem(`editor-expanded-${contentId}`);
    return stored === "true";
  });

  useEffect(() => {
    localStorage.setItem(`editor-expanded-${contentId}`, String(isExpanded));
  }, [contentId, isExpanded]);

  return [isExpanded, setIsExpanded];
}

/** Extract word count from TipTap JSON content */
function getWordCount(content: JSONContent | null): number {
  if (!content) return 0;

  function extractText(node: JSONContent): string {
    let text = "";
    if (node.text) text += node.text;
    if (node.content) {
      for (const child of node.content) {
        text += extractText(child) + " ";
      }
    }
    return text;
  }

  const text = extractText(content).trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

/** Check if content has meaningful text (not just empty paragraphs) */
function hasNonEmptyContent(content: JSONContent | null): boolean {
  if (!content) return false;
  return getWordCount(content) > 0;
}

export function ExpandableEditor({
  contentId,
  contentType,
  noteContent,
  onSave,
  readOnly = false,
  onWikiLinkClick,
  fetchNotesForWikiLink,
  fetchTags,
  createTag,
}: ExpandableEditorProps) {
  const [isExpanded, setIsExpanded] = useExpandedState(contentId);
  const hasContent = hasNonEmptyContent(noteContent);
  const wordCount = hasContent ? getWordCount(noteContent) : 0;

  // Provide empty doc when expanding without existing content
  const editorContent: JSONContent = noteContent ?? {
    type: "doc",
    content: [{ type: "paragraph" }],
  };

  const handleSave = useCallback(
    async (content: JSONContent) => {
      await onSave(content);
    },
    [onSave]
  );

  return (
    <div className="border-t border-white/10">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "flex items-center gap-2 w-full px-4 py-2 text-left",
          "hover:bg-white/5 transition-colors duration-150",
          isExpanded && "border-b border-white/5"
        )}
      >
        <ChevronRight
          className={cn(
            "w-4 h-4 text-gray-400 transition-transform duration-200",
            isExpanded && "rotate-90"
          )}
        />
        <span className="text-sm font-medium text-gray-300">
          {hasContent ? "Notes" : "Add notes"}
        </span>
        {hasContent && (
          <span className="ml-auto text-xs text-gray-500">
            {wordCount} {wordCount === 1 ? "word" : "words"}
          </span>
        )}
      </button>

      {/* Expandable Editor */}
      {isExpanded && (
        <div
          className="px-2 py-1"
          onKeyDown={(e) => e.stopPropagation()}
        >
          <MarkdownEditor
            content={editorContent}
            onSave={handleSave}
            editable={!readOnly}
            compact
            placeholder={`Add notes about this ${contentType}...`}
            onWikiLinkClick={onWikiLinkClick}
            fetchNotesForWikiLink={fetchNotesForWikiLink}
            fetchTags={fetchTags}
            createTag={createTag}
          />
        </div>
      )}
    </div>
  );
}
