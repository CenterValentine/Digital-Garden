/**
 * Main Panel Content (Client Component)
 *
 * Shows editor for selected note or welcome screen.
 * M5: TipTap editor integration with auto-save.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useContentStore } from "@/stores/content-store";
import { useEditorStatsStore } from "@/stores/editor-stats-store";
import { useOutlineStore } from "@/stores/outline-store";
import { MarkdownEditor } from "../editor/MarkdownEditor";
import { FileViewer } from "../viewer/FileViewer";
import type { JSONContent } from "@tiptap/core";
import type { EditorStats } from "../editor/MarkdownEditor";
import type { OutlineHeading } from "@/lib/content/outline-extractor";
import { extractOutline } from "@/lib/content/outline-extractor";

interface NoteResponse {
  success: boolean;
  data: {
    id: string;
    title: string;
    slug: string;
    contentType: string;
    note?: {
      tiptapJson: any; // Prisma Json type
      searchText: string;
      metadata: Record<string, unknown>;
    };
  };
  error?: {
    code: string;
    message: string;
  };
}

export function MainPanelContent() {
  const selectedContentId = useContentStore((state) => state.selectedContentId);
  const setSelectedContentId = useContentStore((state) => state.setSelectedContentId);
  const clearSelection = useContentStore((state) => state.clearSelection);
  const { setStats, setLastSaved, setIsSaving, setHasUnsavedChanges, reset: resetStats } = useEditorStatsStore();
  const { setOutline, clearOutline } = useOutlineStore();
  const [noteContent, setNoteContent] = useState<JSONContent | null>(null);
  const [noteTitle, setNoteTitle] = useState<string>("");
  const [contentType, setContentType] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Used to force refetch

  // Restore selection from URL or localStorage on mount
  useEffect(() => {
    // Only run once on mount
    if (selectedContentId) return;

    // Try URL first (using "content" param for all content types)
    const urlParams = new URLSearchParams(window.location.search);
    const contentIdFromUrl = urlParams.get("content");

    if (contentIdFromUrl) {
      console.log('[MainPanelContent] Restoring content from URL:', contentIdFromUrl);
      setSelectedContentId(contentIdFromUrl);
      return;
    }

    // Fallback to localStorage
    const lastSelectedId = localStorage.getItem("lastSelectedContentId");
    if (lastSelectedId) {
      console.log('[MainPanelContent] Restoring content from localStorage:', lastSelectedId);
      setSelectedContentId(lastSelectedId);
    }
  }, []); // Empty dependency array - only run on mount

  // Fetch note content when selection changes
  // Also re-fetch when content is updated (e.g., renamed in file tree)
  useEffect(() => {
    if (!selectedContentId) {
      setNoteContent(null);
      setNoteTitle("");
      resetStats(); // Reset stats when no note selected
      clearOutline(); // Clear outline when no note selected
      return;
    }

    // If this is a temporary ID (being created), show loading state but don't fetch
    if (selectedContentId.startsWith("temp-")) {
      setIsLoading(true);
      setError(null);
      setNoteContent(null);
      setNoteTitle("");
      return;
    }

    const fetchNote = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/notes/content/${selectedContentId}`, {
          credentials: "include",
        });

        // Log response for debugging
        console.log('API Response status:', response.status);

        // Handle 404 - content no longer exists (stale localStorage/URL)
        if (response.status === 404) {
          console.warn(`Content ${selectedContentId} not found (404). Clearing stale selection.`);
          toast.error("Note not found. It may have been deleted.");
          clearSelection();
          return;
        }

        const result: NoteResponse = await response.json();
        console.log('API Response data:', result);
        console.log('Content type:', result.data?.contentType);
        console.log('Has note payload?', !!result.data?.note);

        if (!response.ok || !result.success) {
          const errorMsg = result.error?.message || "Failed to fetch note";
          console.error('API Error:', errorMsg, result.error);
          throw new Error(errorMsg);
        }

        setNoteTitle(result.data.title);
        setContentType(result.data.contentType);

        // Load note content (or empty document if no payload)
        if (result.data.note?.tiptapJson) {
          try {
            // tiptapJson is stored as Prisma Json type, ensure it's proper JSONContent
            const content = typeof result.data.note.tiptapJson === 'string'
              ? JSON.parse(result.data.note.tiptapJson)
              : result.data.note.tiptapJson;

            // Validate that it's a valid TipTap document
            if (!content || typeof content !== 'object' || !content.type) {
              console.warn('Invalid TipTap JSON structure, using empty document');
              const emptyDoc = {
                type: "doc",
                content: [{ type: "paragraph" }],
              };
              setNoteContent(emptyDoc);

              // Extract initial outline
              const initialOutline = extractOutline(emptyDoc);
              setOutline(initialOutline);
            } else {
              console.log('Setting note content:', content);
              const validContent = content as JSONContent;
              setNoteContent(validContent);

              // Extract initial outline from loaded content
              const initialOutline = extractOutline(validContent);
              setOutline(initialOutline);
            }
          } catch (parseError) {
            console.error('Failed to parse TipTap JSON:', parseError);
            console.warn('Using empty document due to parse error');
            const emptyDoc = {
              type: "doc",
              content: [{ type: "paragraph" }],
            };
            setNoteContent(emptyDoc);

            // Extract initial outline
            const initialOutline = extractOutline(emptyDoc);
            setOutline(initialOutline);
          }
        } else {
          console.log('No note payload, using empty document');
          // Empty document
          const emptyDoc = {
            type: "doc",
            content: [{ type: "paragraph" }],
          };
          setNoteContent(emptyDoc);

          // Extract initial outline from loaded content
          const initialOutline = extractOutline(emptyDoc);
          setOutline(initialOutline);
        }
      } catch (err) {
        console.error("Failed to fetch note:", err);
        setError(err instanceof Error ? err.message : "Failed to load note");
      } finally {
        setIsLoading(false);
      }
    };

    fetchNote();
  }, [selectedContentId, refreshTrigger, clearSelection, resetStats, clearOutline, setOutline]);

  // Listen for content updates (e.g., when renamed in file tree)
  useEffect(() => {
    const handleContentUpdate = (event: CustomEvent) => {
      const { contentId, updates } = event.detail;

      // If the updated content is the currently selected one, refresh it
      if (contentId === selectedContentId) {
        console.log('[MainPanelContent] Content updated, refreshing:', contentId, updates);

        // If only title changed, update it directly (faster than refetch)
        if (updates.title && Object.keys(updates).length === 1) {
          setNoteTitle(updates.title);
        } else {
          // Other changes, trigger full refetch
          setRefreshTrigger(prev => prev + 1);
        }
      }
    };

    window.addEventListener('content-updated' as any, handleContentUpdate as any);
    return () => {
      window.removeEventListener('content-updated' as any, handleContentUpdate as any);
    };
  }, [selectedContentId]);

  // Stats change handler
  const handleStatsChange = useCallback(
    (stats: EditorStats) => {
      setStats({
        wordCount: stats.words,
        characterCount: stats.characters,
      });
    },
    [setStats]
  );

  // Outline change handler
  const handleOutlineChange = useCallback(
    (outline: OutlineHeading[]) => {
      setOutline(outline);
    },
    [setOutline]
  );

  // Auto-save handler
  const handleSave = useCallback(
    async (content: JSONContent) => {
      if (!selectedContentId) return;

      setIsSaving(true);
      setHasUnsavedChanges(true);

      try {
        const response = await fetch(`/api/notes/content/${selectedContentId}`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tiptapJson: content,
          }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error?.message || "Failed to save note");
        }

        console.log("Note saved successfully");
        setLastSaved(new Date());
      } catch (err) {
        console.error("Failed to save note:", err);
        throw err; // Re-throw so editor knows save failed
      } finally {
        setIsSaving(false);
      }
    },
    [selectedContentId, setIsSaving, setHasUnsavedChanges, setLastSaved]
  );

  // Wiki-link click handler - navigate to note or folder by title
  const handleWikiLinkClick = useCallback(
    async (targetTitle: string) => {
      console.log('[MainPanelContent] Wiki-link clicked:', targetTitle);

      try {
        // Search for the content by title (note or folder)
        const response = await fetch(`/api/notes/content?search=${encodeURIComponent(targetTitle)}`, {
          credentials: "include",
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          console.error('[MainPanelContent] Failed to find content:', result.error);
          return;
        }

        // Find exact title match (case-insensitive)
        const matchedContent = result.data?.items?.find(
          (item: any) => item.title.toLowerCase() === targetTitle.toLowerCase()
        );

        if (matchedContent) {
          console.log('[MainPanelContent] Navigating to:', matchedContent.contentType, matchedContent.id, matchedContent.title);

          if (matchedContent.contentType === 'folder') {
            // For folders: select in tree and expand (don't open in editor)
            // Import tree state store to handle folder navigation
            const { setSelectedIds, setExpanded } = await import('@/stores/tree-state-store').then(m => m.useTreeStateStore.getState());
            setSelectedIds([matchedContent.id]);
            setExpanded(matchedContent.id, true);
            setSelectedContentId(null); // Clear editor selection
          } else {
            // For notes: open in editor
            setSelectedContentId(matchedContent.id);
          }
        } else {
          console.warn('[MainPanelContent] No content found with title:', targetTitle);
        }
      } catch (err) {
        console.error('[MainPanelContent] Error finding content:', err);
      }
    },
    [setSelectedContentId]
  );

  // Fetch notes for wiki-link autocomplete
  const fetchNotesForWikiLink = useCallback(
    async (query: string) => {
      console.log('[MainPanelContent] Fetching notes for autocomplete:', query);

      try {
        // Search for notes matching the query
        const response = await fetch(`/api/notes/content?search=${encodeURIComponent(query)}`, {
          credentials: "include",
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          console.error('[MainPanelContent] Failed to fetch notes:', result.error);
          return [];
        }

        // Return notes in the format expected by autocomplete
        return (result.data?.items || [])
          .filter((item: any) => item.contentType === 'note') // Only show notes, not folders
          .map((item: any) => ({
            id: item.id,
            title: item.title,
            slug: item.slug,
          }));
      } catch (err) {
        console.error('[MainPanelContent] Error fetching notes:', err);
        return [];
      }
    },
    []
  );

  // Fetch tags for tag autocomplete
  const fetchTags = useCallback(
    async (query: string) => {
      console.log('[MainPanelContent] Fetching tags for autocomplete:', query);

      try {
        const response = await fetch(`/api/notes/tags?search=${encodeURIComponent(query)}`, {
          credentials: "include",
        });

        if (!response.ok) {
          console.error('[MainPanelContent] Failed to fetch tags:', response.status);
          return [];
        }

        const tags = await response.json();

        // Return tags in the format expected by autocomplete
        return tags.map((tag: any) => ({
          id: tag.id,
          name: tag.name,
          slug: tag.slug,
          color: tag.color,
          usageCount: tag._count?.contentTags || 0,
        }));
      } catch (err) {
        console.error('[MainPanelContent] Error fetching tags:', err);
        return [];
      }
    },
    []
  );

  // Create a new tag
  const createTag = useCallback(
    async (tagName: string) => {
      console.log('[MainPanelContent] Creating new tag:', tagName);

      try {
        const response = await fetch('/api/notes/tags', {
          method: 'POST',
          credentials: "include",
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: tagName }),
        });

        if (!response.ok) {
          throw new Error('Failed to create tag');
        }

        const newTag = await response.json();
        console.log('[MainPanelContent] Tag created:', newTag);

        return {
          id: newTag.id,
          name: newTag.name,
          slug: newTag.slug,
          color: newTag.color,
          usageCount: 0,
        };
      } catch (err) {
        console.error('[MainPanelContent] Error creating tag:', err);
        throw err;
      }
    },
    []
  );

  // Welcome screen when no note selected
  if (!selectedContentId) {
    return (
      <div className="flex-1 overflow-auto p-8">
        <div className="prose prose-invert mx-auto max-w-3xl">
          
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-gray-400">Loading note...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm text-red-400 mb-2">Failed to load content</div>
          <div className="text-xs text-gray-500">{error}</div>
        </div>
      </div>
    );
  }

  // File viewer for uploaded files
  if (contentType === "file" && selectedContentId) {
    return <FileViewer contentId={selectedContentId} title={noteTitle} />;
  }

  // Editor for notes
  if (noteContent) {
    return (
      <div className="flex flex-col h-full">
        {/* Note title header */}
        <div className="flex-none px-6 pt-6 pb-2">
          <h1 className="text-3xl font-semibold text-foreground mb-0">{noteTitle}</h1>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          <MarkdownEditor
            content={noteContent}
            onSave={handleSave}
            onStatsChange={handleStatsChange}
            onOutlineChange={handleOutlineChange}
            onWikiLinkClick={handleWikiLinkClick}
            fetchNotesForWikiLink={fetchNotesForWikiLink}
            fetchTags={fetchTags}
            createTag={createTag}
            autoSaveDelay={2000}
          />
        </div>
      </div>
    );
  }

  return null;
}

