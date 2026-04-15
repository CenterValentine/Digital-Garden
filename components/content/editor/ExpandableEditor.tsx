/**
 * ExpandableEditor Component
 *
 * Collapsible TipTap editor that attaches to non-note content types.
 * Allows any ContentNode (file, folder, external, etc.) to have
 * rich-text notes via the shared NotePayload relation.
 *
 * Features:
 * - Universal expansion state (global, not per-node) via useNotesPanelStore
 * - Position toggle: notes can be above or below the main content
 * - Inline toolbar: Save as page template
 * - Compact MarkdownEditor for secondary editing
 * - Context-aware placeholder text
 */

"use client";

import { useCallback } from "react";
import { ChevronRight, ArrowUp, ArrowDown, BookmarkPlus } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { MarkdownEditor } from "./MarkdownEditor";
import { useNotesPanelStore } from "@/state/notes-panel-store";
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
  fetchPeopleMentions?: (query: string) => Promise<Array<{ id: string; personId: string; label: string; slug: string; email: string | null; phone: string | null; avatarUrl: string | null }>>;
  onPersonMentionClick?: (personId: string) => void;
  /** Create a new tag */
  createTag?: (tagName: string) => Promise<{ id: string; name: string; slug: string; color: string | null; usageCount: number }>;
  /** Callback to open Save as Page Template dialog */
  onSaveAsPageTemplate?: () => void;
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
  fetchPeopleMentions,
  onPersonMentionClick,
  createTag,
  onSaveAsPageTemplate,
}: ExpandableEditorProps) {
  const { isExpanded, toggleExpanded, position, togglePosition } = useNotesPanelStore();
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
      <div
        className={cn(
          "flex items-center w-full px-3",
          isExpanded && "border-b border-white/5"
        )}
      >
        {/* Toggle button — takes remaining space */}
        <button
          onClick={toggleExpanded}
          className="flex flex-1 items-center gap-2 py-1.5 text-left hover:bg-white/5 transition-colors duration-150 rounded"
        >
          <ChevronRight
            className={cn(
              "w-3.5 h-3.5 text-gray-400 transition-transform duration-200 flex-shrink-0",
              isExpanded && "rotate-90"
            )}
          />
          <span className="text-xs font-medium text-gray-400">
            {hasContent ? "Notes" : "Add notes"}
          </span>
          {hasContent && (
            <span className="text-xs text-gray-600">
              {wordCount} {wordCount === 1 ? "word" : "words"}
            </span>
          )}
        </button>

        {/* Inline toolbar — only visible when expanded */}
        {isExpanded && (
          <div className="flex items-center gap-0.5 ml-1">
            {onSaveAsPageTemplate && (
              <button
                onClick={(e) => { e.stopPropagation(); onSaveAsPageTemplate(); }}
                className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-gray-500 hover:bg-white/5 hover:text-gray-300 transition-colors"
                title="Save as page template"
                type="button"
              >
                <BookmarkPlus className="h-3 w-3" />
                <span className="hidden sm:inline">Save as page template</span>
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); togglePosition(); }}
              className="rounded p-1 text-gray-500 hover:bg-white/5 hover:text-gray-300 transition-colors"
              title={position === "below" ? "Move notes above content" : "Move notes below content"}
              type="button"
            >
              {position === "below" ? (
                <ArrowUp className="h-3 w-3" />
              ) : (
                <ArrowDown className="h-3 w-3" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Expandable Editor */}
      {isExpanded && (
        <div
          className="overflow-y-auto px-2 pb-1 pt-0"
          style={{ maxHeight: "35vh" }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <MarkdownEditor
            contentId={contentId}
            content={editorContent}
            onSave={handleSave}
            editable={!readOnly}
            compact
            placeholder={`Add notes about this ${contentType}...`}
            onWikiLinkClick={onWikiLinkClick}
            fetchNotesForWikiLink={fetchNotesForWikiLink}
            fetchTags={fetchTags}
            fetchPeopleMentions={fetchPeopleMentions}
            onPersonMentionClick={onPersonMentionClick}
            createTag={createTag}
          />
        </div>
      )}
    </div>
  );
}
