/**
 * Main Panel Content (Client Component)
 *
 * Shows editor for selected note or welcome screen.
 * M5: TipTap editor integration with auto-save.
 * M9: Debug panel for TipTap document inspection (development mode only)
 */

"use client";

import { createElement, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AlertTriangle } from "lucide-react";
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
import { usePageTemplateStore } from "@/state/page-template-store";
import { useTreeStateStore } from "@/state/tree-state-store";
import {
  useExtensionContentViewer,
  useExtensionMainWorkspace,
} from "@/lib/extensions/client-registry";
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
import type { JSONContent } from "@tiptap/core";
import type { EditorStats } from "../editor/MarkdownEditor";
import type { OutlineHeading } from "@/lib/domain/content/outline-extractor";
import { extractOutline } from "@/lib/domain/content/outline-extractor";
import { getViewerExtensions } from "@/lib/domain/editor/extensions-client";
import { sanitizeTipTapJsonWithExtensions } from "@/lib/domain/editor/unsupported-content";
import { SaveAsPageTemplateDialog } from "../dialogs/SaveAsPageTemplateDialog";
import { useNotesPanelStore } from "@/state/notes-panel-store";
import { setDocumentDates } from "@/lib/domain/editor/extensions/inline-timestamp";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/client/ui/tooltip";
import {
  getContentCollaborationCapability,
  useCollaborationRuntime,
} from "@/lib/domain/collaboration/runtime";

interface ContentResponse {
  success: boolean;
  data: {
    id: string;
    title: string;
    slug: string;
    parentId: string | null;
    contentType: string;
    isPublished: boolean;
    customIcon?: string | null;
    iconColor?: string | null;
    createdAt?: string;
    updatedAt?: string;
    // Path A: populated when this visualization is owned by a note.
    ownedByNoteId?: string | null;
    ownedByNote?: { id: string; title: string } | null;
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

interface ShareGrant {
  id: string;
  contentId: string;
  userId: string;
  accessLevel: "view" | "edit" | string;
  grantedAt: string;
  expiresAt: string | null;
  user: {
    id: string;
    email: string | null;
    username: string | null;
  };
}

interface ShareGrantsResponse {
  success: boolean;
  data?: {
    content: {
      id: string;
      title: string;
      isPublished: boolean;
    };
    grants: ShareGrant[];
  };
  error?: {
    message?: string;
  };
}

interface MainPanelContentProps {
  paneId: WorkspacePaneId;
}

interface PageTemplateResponse {
  id: string;
  title: string;
  tiptapJson: unknown;
  categoryId: string;
  categoryName: string;
  userId: string | null;
  isSystem: boolean;
  defaultTitle: string | null;
  customIcon: string | null;
  iconColor: string | null;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export function MainPanelContent({ paneId }: MainPanelContentProps) {
  const { activeView, setActiveView } = useLeftPanelViewStore();
  const { position: notesPanelPosition } = useNotesPanelStore();
  const activePaneId = useContentStore((state) => state.activePaneId);
  const layoutMode = useContentStore((state) => state.layoutMode);
  const selectedContentId = useContentStore((state) =>
    getPaneActiveContentId(state, paneId)
  );
  const activeTab = useContentStore((state) => getPaneActiveTab(state, paneId));
  const activeTabId = activeTab?.id ?? null;
  const isPageTemplateTab = activeTab?.contentType === "page-template";
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
  const [contentIsPublished, setContentIsPublished] = useState(false);
  const [contentData, setContentData] = useState<any>(null); // Phase 2: Store payload data
  // Path A: when this ContentNode is a visualization owned by a note, the
  // standalone viewer is read-only. Non-null means "this is an embedded
  // drawing; edits happen in the owning note."
  const [ownedByNote, setOwnedByNote] = useState<{ id: string; title: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Used to force refetch
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareEmails, setShareEmails] = useState<string[]>([]);
  const [shareAccessLevel, setShareAccessLevel] = useState<"view" | "edit">("view");
  const [shareGrants, setShareGrants] = useState<ShareGrant[]>([]);
  const [isShareGrantsLoading, setIsShareGrantsLoading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const refreshPageTemplates = usePageTemplateStore((state) => state.fetchTemplates);
  const collaborationEnabled = process.env.NEXT_PUBLIC_COLLABORATION_ENABLED === "true";
  const visualizationEngine = contentType === "visualization" ? (contentData?.engine as string | null | undefined) ?? null : null;
  const collaborationCapability = useMemo(
    () => (collaborationEnabled ? getContentCollaborationCapability(contentType) : null),
    [collaborationEnabled, contentType]
  );
  const collaborationDescriptor = useMemo(
    () => ({
      surfaceKind: "workspace-pane" as const,
      workspaceId: "content-workspace",
      paneId,
      tabId: activeTabId,
      viewInstanceId: `${paneId}:${activeTabId ?? selectedContentId ?? "empty"}`,
      requiresEditableField:
        contentType === "note" ? "default" :
        contentType === "visualization" ? "primary" :
        null,
      requiresLiveTransport: false,
    }),
    [activeTabId, contentType, paneId, selectedContentId]
  );
  const collaborationRuntime = useCollaborationRuntime({
    contentId:
      collaborationEnabled &&
      (contentType === "note" || contentType === "visualization") &&
      (contentType !== "note" || !!noteContent) &&
      // Path A: a visualization owned by a note is read-only here — the live
      // canonical state lives in the owning note's ydoc. Skip the runtime.
      !(contentType === "visualization" && ownedByNote) &&
      !!selectedContentId
        ? selectedContentId
        : null,
    capability: collaborationCapability,
    descriptor: collaborationDescriptor,
    initialContent: contentType === "note" ? noteContent : null,
  });

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
      setContentIsPublished(false);
      setContentData(null);
      setContentCustomIcon(null);
      setContentIconColor(null);
      setOwnedByNote(null);
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
      setOwnedByNote(null);
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
      setOwnedByNote(null);
      return;
    }

    const fetchNote = async () => {
      setIsLoading(true);
      setError(null);

      try {
        if (isPageTemplateTab) {
          const response = await fetch(
            `/api/content/page-templates/${selectedContentId}`,
            {
              credentials: "include",
            }
          );

          if (response.status === 404) {
            console.warn(
              `Page template ${selectedContentId} not found (404). Closing stale tab.`
            );
            toast.error("Page template not found. It may have been deleted.");
            closeContentTabs([selectedContentId]);
            return;
          }

          const result = (await response.json()) as PageTemplateResponse;

          if (!response.ok) {
            throw new Error(result.error || "Failed to fetch page template");
          }

          setNoteTitle(result.title);
          setContentParentId(null);
          setContentIsPublished(false);
          setContentType("page-template");
          setContentCustomIcon(result.customIcon ?? null);
          setContentIconColor(result.iconColor ?? null);
          setOwnedByNote(null);
          setContentData({
            categoryId: result.categoryId,
            categoryName: result.categoryName,
            userId: result.userId,
            isSystem: result.isSystem,
            defaultTitle: result.defaultTitle,
            usageCount: result.usageCount,
          });
          setDocumentDates(
            result.createdAt
              ? new Date(result.createdAt).toISOString().slice(0, 10)
              : "",
            result.updatedAt
              ? new Date(result.updatedAt).toISOString().slice(0, 10)
              : ""
          );
          updateContentTab(selectedContentId, {
            title: result.title,
            contentType: "page-template",
            isTemporary: false,
          });

          const rawContent =
            typeof result.tiptapJson === "string"
              ? JSON.parse(result.tiptapJson)
              : result.tiptapJson;
          const validContent =
            rawContent &&
            typeof rawContent === "object" &&
            "type" in (rawContent as object)
              ? (rawContent as JSONContent)
              : ({
                  type: "doc",
                  content: [{ type: "paragraph" }],
                } as JSONContent);
          const sanitized = sanitizeTipTapJsonWithExtensions(
            validContent,
            getViewerExtensions()
          );
          setNoteContent(sanitized.json);
          setOutline(selectedContentId, extractOutline(sanitized.json));
          return;
        }

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
        setContentIsPublished(Boolean(result.data.isPublished));
        setContentType(result.data.contentType);
        setContentCustomIcon(result.data.customIcon ?? null);
        setContentIconColor(result.data.iconColor ?? null);
        setOwnedByNote(result.data.ownedByNote ?? null);
        // Provide creation/updated dates to inline-timestamp nodes
        setDocumentDates(
          result.data.createdAt ? new Date(result.data.createdAt).toISOString().slice(0, 10) : "",
          result.data.updatedAt ? new Date(result.data.updatedAt).toISOString().slice(0, 10) : ""
        );
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
              const sanitized = sanitizeTipTapJsonWithExtensions(
                validContent,
                getViewerExtensions()
              );
              if (
                sanitized.rewritten.length > 0 &&
                process.env.NODE_ENV === "development"
              ) {
                console.warn(
                  "[content] rewrote unsupported TipTap content while loading note",
                  sanitized.rewritten
                );
              }
              setNoteContent(sanitized.json);

              // Extract initial outline from loaded content
              const initialOutline = extractOutline(sanitized.json);
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
    isPageTemplateTab,
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

  const handleCollaborationSyncChange = useCallback(
    (sync: {
      isSaving: boolean;
      hasUnsavedChanges: boolean;
      lastSaved?: Date;
    }) => {
      if (!isActivePane) return;
      setIsSaving(sync.isSaving);
      setHasUnsavedChanges(sync.hasUnsavedChanges);
      if (sync.lastSaved) {
        setLastSaved(sync.lastSaved);
      }
    },
    [isActivePane, setHasUnsavedChanges, setIsSaving, setLastSaved]
  );

  // Auto-save handler — hardened against cross-document race conditions.
  // The contentId is captured in the closure at creation time. Before making
  // the API call, we verify it still matches the currently-viewed document.
  // An AbortController cancels any in-flight fetch if the user navigates away.
  const handleSave = useCallback(
    async (content: JSONContent) => {
      if (!selectedContentId) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setHasUnsavedChanges(true);
        return;
      }

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
        const response = await fetch(
          isPageTemplateTab
            ? `/api/content/page-templates/${selectedContentId}`
            : `/api/content/content/${selectedContentId}`,
          {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tiptapJson: content,
          }),
          signal: abortController.signal,
          }
        );

        const result = await response.json();

        if (isPageTemplateTab) {
          if (!response.ok) {
            throw new Error(result.error || "Failed to save page template");
          }
        } else if (!response.ok || !result.success) {
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
        const message = err instanceof Error ? err.message : String(err);
        if (
          (typeof navigator !== "undefined" && !navigator.onLine) ||
          message.includes("Can't reach database server") ||
          message.includes("Failed to fetch")
        ) {
          setHasUnsavedChanges(true);
          return;
        }
        console.error("Failed to save note:", err);
        throw err; // Re-throw so editor knows save failed
      } finally {
        setIsSaving(false);
      }
    },
    [
      isPageTemplateTab,
      paneId,
      selectedContentId,
      setHasUnsavedChanges,
      setIsSaving,
      setLastSaved,
    ]
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
      const response = await fetch(
        isPageTemplateTab
          ? `/api/content/page-templates/${selectedContentId}`
          : `/api/content/content/${selectedContentId}`,
        {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
        }
      );
      const result = await response.json().catch(() => null);
      if (!response.ok || (!isPageTemplateTab && !result?.success)) {
        throw new Error(
          isPageTemplateTab
            ? result?.error || "Failed to rename template"
            : result?.error?.message || "Failed to rename"
        );
      }
      if (isPageTemplateTab) {
        await refreshPageTemplates();
      } else {
        window.dispatchEvent(
          new CustomEvent("content-updated", {
            detail: {
              contentId: selectedContentId,
              updates: { title: newTitle },
            },
          }),
        );
      }
    } catch {
      // Revert
      setNoteTitle(noteTitle);
      updateContentTab(selectedContentId, { title: noteTitle });
      toast.error("Failed to rename");
    }
  }, [
    isPageTemplateTab,
    noteTitle,
    refreshPageTemplates,
    selectedContentId,
    titleDraft,
    updateContentTab,
  ]);

  const fetchShareGrants = useCallback(async () => {
    if (!selectedContentId || selectedContentId.startsWith("person:")) {
      setShareGrants([]);
      return;
    }

    setIsShareGrantsLoading(true);
    try {
      const response = await fetch(
        `/api/collaboration/grants?contentId=${encodeURIComponent(selectedContentId)}`,
        {
          method: "GET",
          credentials: "include",
        }
      );
      const result = (await response.json()) as ShareGrantsResponse;

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error?.message || "Failed to load sharing access");
      }

      setShareGrants(result.data.grants);
      setContentIsPublished(Boolean(result.data.content.isPublished));
    } catch (error) {
      setShareGrants([]);
      toast.error(
        error instanceof Error ? error.message : "Failed to load sharing access"
      );
    } finally {
      setIsShareGrantsLoading(false);
    }
  }, [selectedContentId]);

  const handleShareOpen = useCallback(() => {
    if (!selectedContentId || selectedContentId.startsWith("person:")) {
      toast.error("Select content before sharing");
      return;
    }

    setShareDialogOpen(true);
  }, [selectedContentId]);

  useEffect(() => {
    if (!shareDialogOpen) return;
    void fetchShareGrants();
  }, [fetchShareGrants, shareDialogOpen]);

  const getPublicShareUrl = useCallback(() => {
    if (typeof window === "undefined" || !selectedContentId) return "";
    return `${window.location.origin}/share/${selectedContentId}`;
  }, [selectedContentId]);

  const copyPublicShareLink = useCallback(async () => {
    const url = getPublicShareUrl();
    if (!url) return;

    await navigator.clipboard.writeText(url);
    toast.success("Public share link copied");
  }, [getPublicShareUrl]);

  const addShareEmailEntries = useCallback((rawValue: string) => {
    const entries = rawValue
      .split(/[\s,;]+/)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);

    if (entries.length === 0) return;
    const validEntries: string[] = [];
    for (const entry of entries) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry)) {
        toast.error(`${entry} is not a valid email address`);
      } else {
        validEntries.push(entry);
      }
    }

    if (validEntries.length === 0) {
      setShareEmail("");
      return;
    }

    setShareEmails((current) => {
      const existing = new Set(current);
      const next = [...current];
      for (const entry of validEntries) {
        if (!existing.has(entry)) {
          existing.add(entry);
          next.push(entry);
        }
      }
      return next;
    });
    setShareEmail("");
  }, []);

  const removeShareEmailEntry = useCallback((email: string) => {
    setShareEmails((current) => current.filter((entry) => entry !== email));
  }, []);

  const updatePublicShare = useCallback(
    async (nextPublished: boolean) => {
      if (!selectedContentId) return;

      setIsSharing(true);
      const previous = contentIsPublished;
      setContentIsPublished(nextPublished);

      try {
        const response = await fetch(`/api/content/content/${selectedContentId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPublished: nextPublished }),
        });
        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.success) {
          throw new Error(result?.error?.message || "Failed to update public sharing");
        }

        toast.success(
          nextPublished
            ? "Public view-only share link enabled"
            : "Public share link disabled"
        );
      } catch (error) {
        setContentIsPublished(previous);
        toast.error(
          error instanceof Error ? error.message : "Failed to update public sharing"
        );
      } finally {
        setIsSharing(false);
      }
    },
    [contentIsPublished, selectedContentId]
  );

  const submitShareGrant = useCallback(
    async () => {
      if (!selectedContentId) return;
      const email = shareEmail.trim();
      const emails = email ? [...shareEmails, email] : shareEmails;
      const normalizedEmails = Array.from(
        new Set(emails.map((entry) => entry.trim().toLowerCase()).filter(Boolean))
      );

      if (normalizedEmails.length === 0) {
        toast.error("Enter at least one collaborator email");
        return;
      }
      const invalidEmail = normalizedEmails.find(
        (entry) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry)
      );
      if (invalidEmail) {
        toast.error(`${invalidEmail} is not a valid email address`);
        return;
      }

      setIsSharing(true);
      try {
        const results = await Promise.all(
          normalizedEmails.map(async (targetEmail) => {
            const response = await fetch("/api/collaboration/grants", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contentId: selectedContentId,
                email: targetEmail,
                accessLevel: shareAccessLevel,
              }),
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
              throw new Error(
                `${targetEmail}: ${result.error?.message || "Failed to update sharing"}`
              );
            }
            return targetEmail;
          })
        );

        toast.success(
          `${results.length} collaborator${results.length === 1 ? "" : "s"} can ${
            shareAccessLevel === "edit" ? "edit" : "view"
          } this content.`
        );
        setShareEmail("");
        setShareEmails([]);
        await fetchShareGrants();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update sharing");
      } finally {
        setIsSharing(false);
      }
    },
    [fetchShareGrants, selectedContentId, shareAccessLevel, shareEmail, shareEmails]
  );

  const revokeShareGrant = useCallback(
    async (grant: ShareGrant) => {
      if (!selectedContentId) return;

      setIsSharing(true);
      try {
        const response = await fetch("/api/collaboration/grants", {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentId: selectedContentId,
            grantId: grant.id,
            userId: grant.userId,
          }),
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error?.message || "Failed to revoke sharing");
        }

        setShareGrants((current) => current.filter((item) => item.id !== grant.id));
        toast.success(`${grant.user.email ?? grant.user.username ?? "User"} no longer has access.`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to revoke sharing");
      } finally {
        setIsSharing(false);
      }
    },
    [selectedContentId]
  );

  // Handlers passed as prop to ToolSurfaceProvider (can't use useRegisterToolHandler
  // here because this component renders the provider — useContext sees the parent, not self)
  const toolHandlers = useMemo(() => ({
    "import-markdown": handleImportMarkdown,
    "export-markdown": handleExportMarkdown,
    "export-chat": handleExportChat,
    "copy-link": handleCopyLink,
    "save-as-template": handleSaveAsTemplate,
    "share": handleShareOpen,
  }), [handleImportMarkdown, handleExportMarkdown, handleExportChat, handleCopyLink, handleSaveAsTemplate, handleShareOpen]);

  // Extension workspace — shown in pane 1 when an extension view is active
  const ExtensionMainWorkspace = useExtensionMainWorkspace(activeView);
  const ExtensionContentViewer = useExtensionContentViewer({
    selectedContentId,
    contentType,
  });
  if (ExtensionMainWorkspace && paneId === "top-left") {
    return (
      <ToolSurfaceProvider contentType={null} handlers={toolHandlers}>
        {createElement(ExtensionMainWorkspace)}
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
  const isReadOnlyPageTemplate =
    contentType === "page-template" && Boolean(contentData?.isSystem);
  const templateWarningText =
    contentType === "page-template"
      ? isReadOnlyPageTemplate
        ? "You are viewing a system page template. It can be used to create notes, but it cannot be edited."
        : "You are editing a page template. Changes here affect future notes created from this template."
      : null;

  if (error) {
    contentElement = (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm text-red-400 mb-2">Failed to load content</div>
          <div className="text-xs text-gray-500">{error}</div>
        </div>
      </div>
    );
  } else if (ExtensionContentViewer && selectedContentId) {
    contentElement = (
      <ExtensionContentViewer
        paneId={paneId}
        selectedContentId={selectedContentId}
        contentType={contentType}
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
        collaborationRuntime={collaborationRuntime}
        isReadOnly={!!ownedByNote}
        ownerNoteInfo={
          ownedByNote
            ? { noteId: ownedByNote.id, noteTitle: ownedByNote.title }
            : null
        }
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
        <div className="flex-none px-6 pt-6 pb-4 flex items-start justify-between shadow-[0_4px_8px_-2px_rgba(15,23,42,0.08),0_10px_24px_-6px_rgba(15,23,42,0.05)]">
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
            <div className="mr-4 flex min-w-0 flex-1 items-start gap-3">
              <h1
                className={`min-w-0 text-3xl font-semibold text-foreground mb-0 transition-opacity ${
                  isReadOnlyPageTemplate
                    ? "cursor-default"
                    : "cursor-text hover:opacity-80"
                }`}
                title={
                  contentType === "page-template"
                    ? isReadOnlyPageTemplate
                      ? "System template (read-only)"
                      : "Click to rename template"
                    : "Click to rename"
                }
                onClick={isReadOnlyPageTemplate ? undefined : handleTitleEditStart}
              >
                {noteTitle}
              </h1>
              {contentType === "page-template" && templateWarningText ? (
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300/80 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Template
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs text-xs">
                      {templateWarningText}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
            </div>
          )}
          {process.env.NODE_ENV === "development" && !isMultiPane && <DebugViewToggle />}
        </div>

        {contentType === "page-template" && templateWarningText ? (
          <div className="mx-6 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {isReadOnlyPageTemplate
              ? "Viewing a system page template. It can be used to create notes, but it is read-only here."
              : "Editing a page template. Changes here affect future notes created from this template."}
          </div>
        ) : null}

        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          <MarkdownEditor
            contentId={selectedContentId ?? undefined}
            title={noteTitle}
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
            editable={!isReadOnlyPageTemplate}
            collaborationEnabled={contentType === "note" ? collaborationEnabled : false}
            collaborationRuntime={collaborationRuntime}
            onCollaborationSyncChange={handleCollaborationSyncChange}
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
  const isNonNoteContent =
    contentType &&
    contentType !== "note" &&
    contentType !== "page-template" &&
    contentType !== "person-profile" &&
    selectedContentId &&
    !error;

  // Render navigation once, then content below
  return (
    <ToolSurfaceProvider
      contentType={
        contentType === "person-profile" || contentType === "page-template"
          ? null
          : (contentType as ToolContentType) ?? null
      }
      handlers={toolHandlers}
    >
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
        {selectedContentId &&
          !selectedContentId.startsWith("person:") &&
          contentType !== "page-template" && <ContentToolbar />}
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
            <div className="flex-1 min-h-[150px] overflow-auto">{contentElement}</div>
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
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Content</DialogTitle>
            <DialogDescription>
              Manage public view-only sharing and signed-in collaborator access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Public share link</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Anyone with this link can view this content at `/share`.
                  </p>
                </div>
                <Button
                  type="button"
                  variant={contentIsPublished ? "outline" : "default"}
                  disabled={isSharing}
                  onClick={() => updatePublicShare(!contentIsPublished)}
                >
                  {contentIsPublished ? "Disable" : "Enable"}
                </Button>
              </div>
              {contentIsPublished ? (
                <div className="mt-3 flex gap-2">
                  <Input readOnly value={getPublicShareUrl()} />
                  <Button type="button" variant="outline" onClick={copyPublicShareLink}>
                    Copy
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor={`share-email-${paneId}`}>
                Collaborator emails
              </label>
              <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-md border border-input bg-background px-2 py-1 shadow-sm focus-within:ring-1 focus-within:ring-ring">
                {shareEmails.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
                  >
                    {email}
                    <button
                      type="button"
                      className="rounded-full px-1 text-muted-foreground hover:bg-background hover:text-foreground"
                      onClick={() => removeShareEmailEntry(email)}
                      aria-label={`Remove ${email}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  id={`share-email-${paneId}`}
                  type="text"
                  value={shareEmail}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value.includes(",") || value.includes(";")) {
                      addShareEmailEntries(value);
                    } else {
                      setShareEmail(value);
                    }
                  }}
                  onBlur={() => addShareEmailEntries(shareEmail)}
                  onKeyDown={(event) => {
                    if (event.key === "Tab" || event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      addShareEmailEntries(shareEmail);
                    }
                    if (event.key === "Backspace" && !shareEmail && shareEmails.length > 0) {
                      setShareEmails((current) => current.slice(0, -1));
                    }
                  }}
                  placeholder={shareEmails.length === 0 ? "person@example.com" : "Add another"}
                  className="min-w-[14rem] flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Press comma, tab, enter, or click away to add each address.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor={`share-access-${paneId}`}>
                Access level
              </label>
              <select
                id={`share-access-${paneId}`}
                value={shareAccessLevel}
                onChange={(event) =>
                  setShareAccessLevel(event.target.value === "edit" ? "edit" : "view")
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="view">View only</option>
                <option value="edit">Can edit</option>
              </select>
            </div>
            <div className="rounded-lg border border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Signed-in collaborators</p>
                  <p className="text-xs text-muted-foreground">
                    View grants can open `/share`; edit grants can use `/content`.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isShareGrantsLoading}
                  onClick={fetchShareGrants}
                >
                  Refresh
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {isShareGrantsLoading ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">
                    Loading collaborators...
                  </p>
                ) : shareGrants.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">
                    No signed-in collaborators have been added.
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {shareGrants.map((grant) => {
                      const displayName =
                        grant.user.username || grant.user.email || "Unknown user";
                      const grantedAt = new Date(grant.grantedAt).toLocaleDateString();

                      return (
                        <div
                          key={grant.id}
                          className="flex items-center justify-between gap-3 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{displayName}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {grant.user.email}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {grant.accessLevel === "edit" ? "Can edit" : "View only"} · Added{" "}
                              {grantedAt}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isSharing}
                            onClick={() => revokeShareGrant(grant)}
                          >
                            Revoke
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Signed-in users with edit access should use `/content` for live
              collaboration. Public `/share` access is view-only.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              disabled={isSharing}
              onClick={submitShareGrant}
            >
              {isSharing ? "Updating..." : "Apply Access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ToolSurfaceProvider>
  );
}
