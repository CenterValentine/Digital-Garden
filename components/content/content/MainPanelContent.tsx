/**
 * Main Panel Content (Client Component)
 *
 * Shows editor for selected note or welcome screen.
 * M5: TipTap editor integration with auto-save.
 * M9: Debug panel for TipTap document inspection (development mode only)
 */

"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ToolSurfaceProvider } from "@/lib/domain/tools";
import { ContentToolbar } from "../toolbar";
import { ToolDebugPanel } from "../toolbar/ToolDebugPanel";
import type { ContentType as ToolContentType } from "@/lib/domain/tools";
import { toast } from "sonner";
import { Allotment } from "allotment";
import {
  getPaneActiveContentId,
  getPaneActiveTab,
  useContentStore,
  type WorkspacePaneId,
} from "@/state/content-store";
import { useLeftPanelViewStore } from "@/state/left-panel-view-store";
import { useTreeStateStore } from "@/state/tree-state-store";
import { CalendarWorkspace } from "@/components/calendar/CalendarWorkspace";
import { useEditorStatsStore } from "@/state/editor-stats-store";
import { useOutlineStore } from "@/state/outline-store";
import { useDebugViewStore } from "@/state/debug-view-store";
import { MarkdownEditor } from "../editor/MarkdownEditor";
import { ExpandableEditor } from "../editor/ExpandableEditor";
import { FileViewer } from "../viewer/FileViewer";
import { FolderViewer } from "../viewer/FolderViewer";
import { ExternalViewer } from "../viewer/ExternalViewer";
import { ChatViewer } from "../viewer/ChatViewer";
import { VisualizationViewer } from "../viewer/VisualizationViewer";
import { DataViewer } from "../viewer/DataViewer";
import { HopeViewer } from "../viewer/HopeViewer";
import { WorkflowViewer } from "../viewer/WorkflowViewer";
import { DebugViewToggle } from "../viewer/DebugViewToggle";
import { JSONDebugView } from "../viewer/debug/JSONDebugView";
import { TreeDebugView } from "../viewer/debug/TreeDebugView";
import { MarkdownDebugView } from "../viewer/debug/MarkdownDebugView";
import { MetadataDebugView } from "../viewer/debug/MetadataDebugView";
import { PersonWorkspace } from "../people/PersonWorkspace";
import type { JSONContent } from "@tiptap/core";
import type { EditorStats } from "../editor/MarkdownEditor";
import type { OutlineHeading } from "@/lib/domain/content/outline-extractor";
import { extractOutline } from "@/lib/domain/content/outline-extractor";
import { SaveAsPageTemplateDialog } from "../dialogs/SaveAsPageTemplateDialog";
import { useNotesPanelStore } from "@/state/notes-panel-store";

interface ContentResponse {
  success: boolean;
  data: {
    id: string;
    title: string;
    slug: string;
    parentId: string | null;
    contentType: string;
    customIcon?: string | null;
    iconColor?: string | null;
    note?: {
      tiptapJson: any; // Prisma Json type
      searchText: string;
      metadata: Record<string, unknown>;
    };
    folder?: {
      viewMode: string;
      sortMode: string | null;
      viewPrefs: Record<string, unknown>;
      includeReferencedContent: boolean;
    };
    external?: {
      url: string;
      subtype: string | null;
      preview: Record<string, unknown>;
    };
    chat?: {
      messages: Array<{ role: string; content: string; timestamp: string }>;
    };
    visualization?: {
      engine: string;
      config: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    data?: {
      mode: string;
      source: Record<string, unknown>;
      schema: Record<string, unknown>;
    };
    hope?: {
      kind: string;
      status: string;
      description: string | null;
    };
    workflow?: {
      engine: string;
      definition: Record<string, unknown>;
      enabled: boolean;
    };
  };
  error?: {
    code: string;
    message: string;
  };
}

interface MainPanelContentProps {
  paneId: WorkspacePaneId;
}

export function MainPanelContent({ paneId }: MainPanelContentProps) {
  const { activeView, setActiveView } = useLeftPanelViewStore();
  const { position: notesPanelPosition } = useNotesPanelStore();
  const activePaneId = useContentStore((state) => state.activePaneId);
  const layoutMode = useContentStore((state) => state.layoutMode);
  const selectedContentId = useContentStore((state) =>
    getPaneActiveContentId(state, paneId)
  );
  const activeTabId = useContentStore((state) =>
    getPaneActiveTab(state, paneId)?.id ?? null
  );
  const setSelectedContentId = useContentStore((state) => state.setSelectedContentId);
  const setSelectedContentType = useContentStore((state) => state.setSelectedContentType);
  const updateContentTab = useContentStore((state) => state.updateContentTab);
  const pinContentTab = useContentStore((state) => state.pinContentTab);
  const closeContentTabs = useContentStore((state) => state.closeContentTabs);
  const { setStats, setLastSaved, setIsSaving, setHasUnsavedChanges, reset: resetStats } = useEditorStatsStore();
  const { setOutline } = useOutlineStore();
  const { isDebugPanelVisible, toggleDebugPanel, setDebugPanelVisible, viewMode } = useDebugViewStore();
  const isActivePane = activePaneId === paneId;
  const isMultiPane = layoutMode !== "single";
  const [noteContent, setNoteContent] = useState<JSONContent | null>(null);
  const [noteTitle, setNoteTitle] = useState<string>("");
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [contentCustomIcon, setContentCustomIcon] = useState<string | null>(null);
  const [contentIconColor, setContentIconColor] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string | null>(null);
  const [contentParentId, setContentParentId] = useState<string | null>(null);
  const [contentData, setContentData] = useState<any>(null); // Phase 2: Store payload data
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Used to force refetch

  // AbortController for in-flight save requests. When the user navigates to
  // a different document, we abort any pending fetch to prevent Doc A's content
  // from being written to Doc B's API endpoint.
  const saveAbortControllerRef = useRef<AbortController | null>(null);

  // Cancel in-flight saves whenever selectedContentId changes
  useEffect(() => {
    return () => {
      if (saveAbortControllerRef.current) {
        saveAbortControllerRef.current.abort();
        saveAbortControllerRef.current = null;
      }
    };
  }, [selectedContentId]);

  // Fetch note content when selection changes
  // Also re-fetch when content is updated (e.g., renamed in file tree)
  useEffect(() => {
    if (!selectedContentId) {
      setNoteContent(null);
      setNoteTitle("");
      setContentType(null);
      setContentParentId(null);
      setContentData(null);
      setContentCustomIcon(null);
      setContentIconColor(null);
      return;
    }

    if (selectedContentId.startsWith("person:")) {
      setIsLoading(false);
      setError(null);
      setNoteContent(null);
      setContentParentId(null);
      setContentData(null);
      setContentCustomIcon(null);
      setContentIconColor(null);
      setContentType("person-profile");
      return;
    }

    // If this is a temporary ID (being created), show loading and clear contentType.
    // Without clearing contentType, the previous FolderViewer stays mounted with
    // the temp ID as its folderId, causing ListView to fetch a non-existent parentId.
    if (selectedContentId.startsWith("temp-")) {
      setIsLoading(true);
      setError(null);
      setNoteContent(null);
      setNoteTitle("");
      setContentType(null);
      setContentData(null);
      return;
    }

    const fetchNote = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/content/content/${selectedContentId}`, {
          credentials: "include",
        });

        // Log response for debugging
        console.log('API Response status:', response.status);

        // Handle 404 - content no longer exists (stale localStorage/URL)
        if (response.status === 404) {
          console.warn(`Content ${selectedContentId} not found (404). Clearing stale selection.`);
          toast.error("Note not found. It may have been deleted.");
          closeContentTabs([selectedContentId]);
          return;
        }

        const result: ContentResponse = await response.json();
        console.log('API Response data:', result);
        console.log('Content type:', result.data?.contentType);
        console.log('Has note payload?', !!result.data?.note);

        if (!response.ok || !result.success) {
          const errorMsg = result.error?.message || "Failed to fetch note";
          console.error('API Error:', errorMsg, result.error);
          throw new Error(errorMsg);
        }

        setNoteTitle(result.data.title);
        setContentParentId(result.data.parentId);
        setContentType(result.data.contentType);
        setContentCustomIcon(result.data.customIcon ?? null);
        setContentIconColor(result.data.iconColor ?? null);
        updateContentTab(selectedContentId, {
          title: result.data.title,
          contentType: result.data.contentType,
          isTemporary: false,
        });

        // Store payload data for Phase 2 content types
        switch (result.data.contentType) {
          case "folder":
            setContentData(result.data.folder);
            break;
          case "external":
            setContentData(result.data.external);
            break;
          case "chat":
            setContentData(result.data.chat);
            break;
          case "visualization":
            setContentData(result.data.visualization);
            break;
          case "data":
            setContentData(result.data.data);
            break;
          case "hope":
            setContentData(result.data.hope);
            break;
          case "workflow":
            setContentData(result.data.workflow);
            break;
          default:
            setContentData(null);
        }

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
              setOutline(selectedContentId, initialOutline);
            } else {
              console.log('Setting note content:', content);
              const validContent = content as JSONContent;
              setNoteContent(validContent);

              // Extract initial outline from loaded content
              const initialOutline = extractOutline(validContent);
              setOutline(selectedContentId, initialOutline);
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
            setOutline(selectedContentId, initialOutline);
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
          setOutline(selectedContentId, initialOutline);
        }
      } catch (err) {
        console.error("Failed to fetch note:", err);
        setError(err instanceof Error ? err.message : "Failed to load note");
      } finally {
        setIsLoading(false);
      }
    };

    fetchNote();
  }, [
    selectedContentId,
    refreshTrigger,
    closeContentTabs,
    setOutline,
    updateContentTab,
  ]);

  useEffect(() => {
    if (!isActivePane || selectedContentId) return;
    resetStats();
    setSelectedContentType(null);
  }, [isActivePane, resetStats, selectedContentId, setSelectedContentType]);

  useEffect(() => {
    if (!isActivePane) return;
    setSelectedContentType(contentType);
  }, [contentType, isActivePane, setSelectedContentType]);

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
            updateContentTab(contentId, { title: updates.title });
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
  }, [selectedContentId, updateContentTab]);

  // Stats change handler
  const handleStatsChange = useCallback(
    (stats: EditorStats) => {
      if (!isActivePane) return;
      setStats({
        wordCount: stats.words,
        characterCount: stats.characters,
      });
    },
    [isActivePane, setStats]
  );

  // Outline change handler
  const handleOutlineChange = useCallback(
    (outline: OutlineHeading[]) => {
      if (!selectedContentId) return;
      setOutline(selectedContentId, outline);
    },
    [selectedContentId, setOutline]
  );

  // Auto-save handler — hardened against cross-document race conditions.
  // The contentId is captured in the closure at creation time. Before making
  // the API call, we verify it still matches the currently-viewed document.
  // An AbortController cancels any in-flight fetch if the user navigates away.
  const handleSave = useCallback(
    async (content: JSONContent) => {
      if (!selectedContentId) return;

      // GUARD: Only discard saves when this pane has navigated to a different
      // document. Another pane becoming focused should not cancel the save.
      const currentId = getPaneActiveContentId(useContentStore.getState(), paneId);
      if (currentId !== selectedContentId) {
        console.warn(
          `[MainPanelContent] Blocked cross-document save: handleSave targets ${selectedContentId}, but pane ${paneId} has ${currentId}`
        );
        return;
      }

      // Cancel any previous in-flight save
      if (saveAbortControllerRef.current) {
        saveAbortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      saveAbortControllerRef.current = abortController;

      setIsSaving(true);
      setHasUnsavedChanges(true);

      try {
        const response = await fetch(`/api/content/content/${selectedContentId}`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tiptapJson: content,
          }),
          signal: abortController.signal,
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error?.message || "Failed to save note");
        }

        // Final guard: verify we're still on the same document before
        // updating parent state. This catches the edge case where the user
        // navigated during the network round-trip.
        const postSaveId = getPaneActiveContentId(useContentStore.getState(), paneId);
        if (postSaveId !== selectedContentId) {
          console.warn(
            `[MainPanelContent] Pane ${paneId} navigated during save — skipping state update for ${selectedContentId}`
          );
          return;
        }

        console.log("Note saved successfully");
        setLastSaved(new Date());
        // Keep parent state in sync so re-mounts (e.g., ExpandableEditor
        // collapse/reopen) receive the latest persisted content
        setNoteContent(content);
      } catch (err: unknown) {
        // AbortError is expected when we cancel a save due to navigation
        if (err instanceof DOMException && err.name === "AbortError") {
          console.log(`[MainPanelContent] Save aborted for ${selectedContentId} (navigation)`);
          return;
        }
        console.error("Failed to save note:", err);
        throw err; // Re-throw so editor knows save failed
      } finally {
        setIsSaving(false);
      }
    },
    [paneId, selectedContentId, setIsSaving, setHasUnsavedChanges, setLastSaved]
  );

  // Wiki-link click handler - navigate to note or folder by title
  const handleWikiLinkClick = useCallback(
    async (targetTitle: string) => {
      console.log('[MainPanelContent] Wiki-link clicked:', targetTitle);

      try {
        // Search for the content by title (note or folder)
        const response = await fetch(`/api/content/content?search=${encodeURIComponent(targetTitle)}`, {
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
          setSelectedContentId(matchedContent.id, {
            title: matchedContent.title,
            contentType: matchedContent.contentType,
            paneId,
          });
        } else {
          console.warn('[MainPanelContent] No content found with title:', targetTitle);
        }
      } catch (err) {
        console.error('[MainPanelContent] Error finding content:', err);
      }
    },
    [paneId, setSelectedContentId]
  );

  // Fetch notes for wiki-link autocomplete
  const fetchNotesForWikiLink = useCallback(
    async (query: string) => {
      console.log('[MainPanelContent] Fetching notes for autocomplete:', query);

      try {
        // Search for notes matching the query
        const response = await fetch(`/api/content/content?search=${encodeURIComponent(query)}`, {
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
        const response = await fetch(`/api/content/tags?search=${encodeURIComponent(query)}`, {
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

  const fetchPeopleMentions = useCallback(
    async (query: string) => {
      try {
        const params = new URLSearchParams();
        params.set("q", query);
        params.set("limit", "20");
        const response = await fetch(`/api/people/search?${params.toString()}`, {
          credentials: "include",
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          return [];
        }

        return (result.data?.results || [])
          .filter((item: any) => item.treeNodeKind === "person")
          .map((item: any) => ({
            id: item.id,
            personId: item.personId,
            label: item.label,
            slug: item.slug,
            email: item.email || null,
            phone: item.phone || null,
            avatarUrl: item.avatarUrl || null,
          }));
      } catch (error) {
        console.error("[MainPanelContent] Error fetching people mentions:", error);
        return [];
      }
    },
    []
  );

  const handlePersonMentionClick = useCallback(
    async (personId: string) => {
      try {
        const response = await fetch(`/api/people/persons/${personId}`, {
          credentials: "include",
        });
        const result = await response.json();

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error?.message || "Failed to load person");
        }

        const treePresence = result.data.treePresence;
        if (treePresence?.isVisibleInFileTree) {
          const treeState = useTreeStateStore.getState();
          treeState.expandMany([
            ...(treePresence.contentAncestorIds || []),
            ...(treePresence.peopleAncestorIds || []),
          ]);
          treeState.setSelectedIds([treePresence.selectedNodeId || `person:${personId}`]);
          setActiveView("files");
          window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
          return;
        }

        setActiveView("people");
        window.dispatchEvent(
          new CustomEvent("dg:people-focus", {
            detail: {
              personId,
              openProfile: true,
            },
          })
        );
      } catch (error) {
        console.error("[MainPanelContent] Error handling person mention click:", error);
        toast.error("Failed to open person", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    [setActiveView]
  );

  // Create a new tag
  const createTag = useCallback(
    async (tagName: string) => {
      console.log('[MainPanelContent] Creating new tag:', tagName);

      try {
        const response = await fetch('/api/content/tags', {
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

  // Debug panel keyboard shortcut (Cmd+Shift+D)
  useEffect(() => {
    // Only in development mode
    if (process.env.NODE_ENV !== "development") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isMultiPane) {
        return;
      }

      // Cmd+Shift+D (Mac) or Ctrl+Shift+D (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "D") {
        e.preventDefault();
        toggleDebugPanel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMultiPane, toggleDebugPanel]);

  useEffect(() => {
    if (!isMultiPane || !isDebugPanelVisible) return;
    setDebugPanelVisible(false);
  }, [isDebugPanelVisible, isMultiPane, setDebugPanelVisible]);

  // ─── Tool Surface Handlers ───
  const handleExportMarkdown = useCallback(async () => {
    if (!selectedContentId) return;
    try {
      const response = await fetch(`/api/content/export/${selectedContentId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "markdown" }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const code = errorData?.error?.code;
        if (code === "SETTINGS_NOT_FOUND") {
          toast.error("Configure export settings in Settings → Export first");
        } else {
          toast.error("Export failed");
        }
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${noteTitle || "export"}.md`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported as Markdown");
    } catch {
      toast.error("Export failed");
    }
  }, [selectedContentId, noteTitle]);

  const handleCopyLink = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  }, []);

  const handleImportMarkdown = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.json";
    input.multiple = true; // Allow .md + .meta.json together

    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      const formData = new FormData();
      for (const file of Array.from(files)) {
        if (file.name.endsWith(".meta.json")) {
          formData.append("sidecar", file);
        } else {
          formData.append("file", file);
        }
      }

      // Use current selection as parentId if it's a folder
      if (contentType === "folder" && selectedContentId) {
        formData.append("parentId", selectedContentId);
      }

      try {
        const response = await fetch("/api/content/import", {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        const result = await response.json();

        if (result.success) {
          toast.success(`Imported "${result.data.title}"`);
          if (result.data.warnings?.length > 0) {
            toast.warning(`${result.data.warnings.length} import warnings`);
          }
          // Navigate to the imported note
          if (result.data.contentId) {
            setSelectedContentId(result.data.contentId, {
              title: result.data.title,
              contentType: "note",
              pin: true,
              paneId,
            });
            setSelectedContentType("note");
          }
        } else {
          toast.error(result.error?.message || "Import failed");
        }
      } catch {
        toast.error("Import failed");
      }
    };

    input.click();
  }, [contentType, paneId, selectedContentId, setSelectedContentId, setSelectedContentType]);

  // Export chat conversation as markdown transcript
  const handleExportChat = useCallback(() => {
    if (!contentData?.messages || contentData.messages.length === 0) {
      toast.error("No messages to export");
      return;
    }

    const lines: string[] = [`# ${noteTitle}`, ""];
    for (const msg of contentData.messages) {
      const role = msg.role === "user" ? "User" : "Assistant";
      lines.push(`### ${role}`, "", msg.content, "");
    }

    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${noteTitle || "chat-export"}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Chat exported as Markdown");
  }, [contentData, noteTitle]);

  const handleSaveAsTemplate = useCallback(() => {
    setTemplateDialogOpen(true);
  }, []);

  const handleTitleEditStart = useCallback(() => {
    setTitleDraft(noteTitle);
    setIsTitleEditing(true);
    setTimeout(() => {
      titleInputRef.current?.select();
    }, 0);
  }, [noteTitle]);

  const handleTitleCommit = useCallback(async () => {
    setIsTitleEditing(false);
    const newTitle = titleDraft.trim();
    if (!newTitle || newTitle === noteTitle || !selectedContentId) return;

    // Optimistic update
    setNoteTitle(newTitle);
    updateContentTab(selectedContentId, { title: newTitle });

    try {
      const response = await fetch(`/api/content/content/${selectedContentId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      if (!response.ok) throw new Error("Failed to rename");
      // Refresh file tree to reflect new name
      window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
    } catch {
      // Revert
      setNoteTitle(noteTitle);
      updateContentTab(selectedContentId, { title: noteTitle });
      toast.error("Failed to rename");
    }
  }, [titleDraft, noteTitle, selectedContentId, updateContentTab]);

  // Handlers passed as prop to ToolSurfaceProvider (can't use useRegisterToolHandler
  // here because this component renders the provider — useContext sees the parent, not self)
  const toolHandlers = useMemo(() => ({
    "import-markdown": handleImportMarkdown,
    "export-markdown": handleExportMarkdown,
    "export-chat": handleExportChat,
    "copy-link": handleCopyLink,
    "save-as-template": handleSaveAsTemplate,
  }), [handleImportMarkdown, handleExportMarkdown, handleExportChat, handleCopyLink, handleSaveAsTemplate]);

  // Calendar workspace — shown in pane 1 when calendar view is active
  if (activeView === "calendar" && paneId === "top-left") {
    return (
      <ToolSurfaceProvider contentType={null} handlers={toolHandlers}>
        <CalendarWorkspace />
        {process.env.NODE_ENV === "development" && <ToolDebugPanel />}
      </ToolSurfaceProvider>
    );
  }

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
        <div className="text-sm text-gray-400">Loading...</div>
      </div>
    );
  }

  // Render content based on type
  let contentElement: React.ReactNode;

  if (error) {
    contentElement = (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm text-red-400 mb-2">Failed to load content</div>
          <div className="text-xs text-gray-500">{error}</div>
        </div>
      </div>
    );
  } else if (contentType === "person-profile" && selectedContentId.startsWith("person:")) {
    contentElement = (
      <PersonWorkspace
        personId={selectedContentId.replace("person:", "")}
        paneId={paneId}
      />
    );
  } else if (contentType === "file" && selectedContentId) {
    contentElement = <FileViewer contentId={selectedContentId} title={noteTitle} />;
  }

  else if (contentType === "folder" && selectedContentId) {
    contentElement = (
      <FolderViewer
        contentId={selectedContentId}
        paneId={paneId}
        title={noteTitle}
        viewMode={contentData?.viewMode || "list"}
        sortMode={contentData?.sortMode || null}
        viewPrefs={contentData?.viewPrefs || {}}
        includeReferencedContent={contentData?.includeReferencedContent || false}
      />
    );
  } else if (contentType === "external" && contentData) {
    contentElement = (
      <ExternalViewer
        contentId={selectedContentId}
        title={noteTitle}
        url={contentData.url}
        subtype={contentData.subtype}
        preview={contentData.preview}
      />
    );
  } else if (contentType === "chat") {
    contentElement = (
      <ChatViewer
        contentId={selectedContentId}
        title={noteTitle}
        messages={contentData?.messages || []}
        metadata={contentData?.metadata}
      />
    );
  } else if (contentType === "visualization") {
    contentElement = (
      <VisualizationViewer
        contentId={selectedContentId}
        title={noteTitle}
        engine={contentData?.engine}
        config={contentData?.config}
        data={contentData?.data}
      />
    );
  } else if (contentType === "data") {
    contentElement = (
      <DataViewer
        title={noteTitle}
        mode={contentData?.mode}
        source={contentData?.source}
        schema={contentData?.schema}
      />
    );
  } else if (contentType === "hope") {
    contentElement = (
      <HopeViewer
        title={noteTitle}
        kind={contentData?.kind}
        status={contentData?.status}
        description={contentData?.description}
      />
    );
  } else if (contentType === "workflow") {
    contentElement = (
      <WorkflowViewer
        title={noteTitle}
        engine={contentData?.engine}
        definition={contentData?.definition}
        enabled={contentData?.enabled}
      />
    );
  } else if (noteContent) {
    // Render debug view based on selected mode
    const renderDebugView = () => {
      switch (viewMode) {
        case "json":
          return <JSONDebugView content={noteContent} title={noteTitle} />;
        case "tree":
          return <TreeDebugView content={noteContent} title={noteTitle} />;
        case "markdown":
          return <MarkdownDebugView content={noteContent} title={noteTitle} />;
        case "metadata":
          return <MetadataDebugView content={noteContent} title={noteTitle} />;
        default:
          return <JSONDebugView content={noteContent} title={noteTitle} />;
      }
    };

    // Main editor component
    const editorElement = (
      <div className="flex flex-col h-full">
        {/* Note title header with debug toggle */}
        <div className="flex-none px-6 pt-6 pb-2 flex items-start justify-between">
          {isTitleEditing ? (
            <input
              ref={titleInputRef}
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleTitleCommit}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); handleTitleCommit(); }
                if (e.key === "Escape") { e.preventDefault(); setIsTitleEditing(false); }
              }}
              className="flex-1 text-3xl font-semibold text-foreground bg-transparent border-b border-primary/40 focus:border-primary focus:outline-none mb-0 mr-4"
            />
          ) : (
            <h1
              className="text-3xl font-semibold text-foreground mb-0 cursor-text hover:opacity-80 transition-opacity"
              title="Click to rename"
              onClick={handleTitleEditStart}
            >
              {noteTitle}
            </h1>
          )}
          {process.env.NODE_ENV === "development" && !isMultiPane && <DebugViewToggle />}
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          <MarkdownEditor
            contentId={selectedContentId ?? undefined}
            parentId={contentParentId}
            content={noteContent}
            onSave={handleSave}
            onStatsChange={handleStatsChange}
            onOutlineChange={handleOutlineChange}
            onWikiLinkClick={handleWikiLinkClick}
            fetchNotesForWikiLink={fetchNotesForWikiLink}
            fetchTags={fetchTags}
            createTag={createTag}
            fetchPeopleMentions={fetchPeopleMentions}
            onPersonMentionClick={handlePersonMentionClick}
            autoSaveDelay={2000}
          />
        </div>
      </div>
    );

    // Wrap in split pane if debug panel is visible
    if (isDebugPanelVisible && !isMultiPane && process.env.NODE_ENV === "development") {
      contentElement = (
        <Allotment defaultSizes={[60, 40]}>
          <Allotment.Pane minSize={300}>{editorElement}</Allotment.Pane>
          <Allotment.Pane minSize={300}>{renderDebugView()}</Allotment.Pane>
        </Allotment>
      );
    } else {
      contentElement = editorElement;
    }
  } else {
    contentElement = null;
  }

  // For non-note content types, append the expandable notes editor
  // This lets any content type (file, folder, external, etc.) have attached notes
  const isNonNoteContent = contentType && contentType !== "note" && contentType !== "person-profile" && selectedContentId && !error;

  // Render navigation once, then content below
  return (
    <ToolSurfaceProvider contentType={contentType === "person-profile" ? null : (contentType as ToolContentType) ?? null} handlers={toolHandlers}>
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden"
        onPointerDownCapture={() => {
          if (activeTabId) {
            pinContentTab(activeTabId);
          }
        }}
        onFocusCapture={() => {
          if (activeTabId) {
            pinContentTab(activeTabId);
          }
        }}
      >
        {selectedContentId && !selectedContentId.startsWith("person:") && <ContentToolbar />}
        {isNonNoteContent ? (
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
            {notesPanelPosition === "above" && (
              <ExpandableEditor
                contentId={selectedContentId}
                contentType={contentType}
                noteContent={noteContent}
                onSave={handleSave}
                onWikiLinkClick={handleWikiLinkClick}
                fetchNotesForWikiLink={fetchNotesForWikiLink}
                fetchTags={fetchTags}
                createTag={createTag}
                fetchPeopleMentions={fetchPeopleMentions}
                onPersonMentionClick={handlePersonMentionClick}
                onSaveAsPageTemplate={handleSaveAsTemplate}
              />
            )}
            <div className="flex-1 min-h-0 overflow-hidden">{contentElement}</div>
            {notesPanelPosition !== "above" && (
              <ExpandableEditor
                contentId={selectedContentId}
                contentType={contentType}
                noteContent={noteContent}
                onSave={handleSave}
                onWikiLinkClick={handleWikiLinkClick}
                fetchNotesForWikiLink={fetchNotesForWikiLink}
                fetchTags={fetchTags}
                createTag={createTag}
                fetchPeopleMentions={fetchPeopleMentions}
                onPersonMentionClick={handlePersonMentionClick}
                onSaveAsPageTemplate={handleSaveAsTemplate}
              />
            )}
          </div>
        ) : (
          contentElement
        )}
        {process.env.NODE_ENV === "development" && !isMultiPane && <ToolDebugPanel />}
      </div>
      <SaveAsPageTemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        noteTitle={noteTitle}
        tiptapJson={noteContent}
        customIcon={contentCustomIcon}
        iconColor={contentIconColor}
      />
    </ToolSurfaceProvider>
  );
}
