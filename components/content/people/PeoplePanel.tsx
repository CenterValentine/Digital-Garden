"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import * as LucideIcons from "lucide-react";
import {
  ChevronDown,
  ChevronRight,
  File,
  FileText,
  Folder,
  FolderOpen,
  Pencil,
  Plus,
  Search,
  Upload,
  User,
  Users,
  Code,
  FileCode,
  ExternalLink,
  MessageCircle,
  Network,
  BarChart3,
  Braces,
  FileSpreadsheet,
  FileAudio,
  FileImage,
  FileVideo,
  FileType,
  Archive,
} from "lucide-react";
import { toast } from "sonner";

import type {
  PeopleSearchResult,
  PeopleTreeContentNode,
  PeopleTreeGroupNode,
  PeopleTreePersonNode,
  PeopleTreeResponse,
} from "@/lib/domain/people";
import { useContentStore } from "@/state/content-store";
import { getNewContentMenuItems, type NewContentMenuItem } from "@/components/content/menu-items/new-content-menu";
import { calculateMenuPosition } from "@/lib/core/menu-positioning";
import { PeopleCreateDialog } from "./PeopleCreateDialog";
import { PeopleProfileDialog } from "./PeopleProfileDialog";
import { FileUploadDialog } from "../dialogs/FileUploadDialog";

interface PeopleTreeApiResponse {
  success: boolean;
  data?: PeopleTreeResponse;
  error?: {
    code: string;
    message: string;
  };
}

interface PeopleSearchApiResponse {
  success: boolean;
  data?: {
    results: PeopleSearchResult[];
  };
  error?: {
    code: string;
    message: string;
  };
}

interface ContentCreateApiResponse {
  success: boolean;
  data?: {
    id: string;
    title: string;
    contentType?: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

type PeopleDragPayload =
  | { kind: "person"; personId: string; label: string }
  | { kind: "peopleGroup"; groupId: string; label: string };

const PEOPLE_DRAG_MIME = "application/x-dg-people";

type PeopleSelection =
  | { kind: "peopleGroup"; id: string; groupId: string; label: string }
  | { kind: "person"; id: string; personId: string; primaryGroupId: string; label: string }
  | {
      kind: "content";
      id: string;
      contentId: string;
      contentType: string;
      title: string;
      parentId: string | null;
      peopleGroupId: string | null;
      personId: string | null;
      label: string;
    };

type PeopleContextMenuState = {
  x: number;
  y: number;
  selection: PeopleSelection;
} | null;

export function PeoplePanel() {
  const [tree, setTree] = useState<PeopleTreeResponse | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PeopleSearchResult[]>([]);
  const [isLoadingTree, setIsLoadingTree] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<"person" | "group" | null>(null);
  const [profilePersonId, setProfilePersonId] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<PeopleSelection | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [renameTarget, setRenameTarget] = useState<PeopleSelection | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isSubmittingRename, setIsSubmittingRename] = useState(false);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [isDragOverRoot, setIsDragOverRoot] = useState(false);
  const [insertTarget, setInsertTarget] = useState<{
    groupId: string;
    position: "before" | "after";
    parentGroupId: string | null;
  } | null>(null);
  const [selection, setSelection] = useState<PeopleSelection | null>(null);
  const [contextMenu, setContextMenu] = useState<PeopleContextMenuState>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [addMenuPosition, setAddMenuPosition] = useState<{ x: number; y: number; maxHeight: number } | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number; maxHeight: number } | null>(null);

  const setSelectedContentId = useContentStore((state) => state.setSelectedContentId);
  const updateContentTab = useContentStore((state) => state.updateContentTab);

  // Optimistically update a content node title in the local tree state so the
  // sidebar reflects the rename immediately, without waiting for the refetch.
  const patchTreeContentTitle = useCallback((contentId: string, newTitle: string) => {
    const patchNodes = (nodes: PeopleTreeContentNode[]): PeopleTreeContentNode[] =>
      nodes.map((n) =>
        n.contentId === contentId
          ? { ...n, title: newTitle, children: patchNodes(n.children) }
          : { ...n, children: patchNodes(n.children) }
      );
    const patchGroup = (g: PeopleTreeGroupNode): PeopleTreeGroupNode => ({
      ...g,
      content: patchNodes(g.content),
      people: g.people.map((p) => ({ ...p, content: patchNodes(p.content) })),
      childGroups: g.childGroups.map(patchGroup),
    });
    setTree((prev) => prev ? { ...prev, groups: prev.groups.map(patchGroup) } : prev);
  }, []);

  const trimmedQuery = query.trim();
  const isSearchMode = trimmedQuery.length > 0;

  const fetchTree = useCallback(async (signal?: AbortSignal) => {
    setIsLoadingTree(true);
    setError(null);

    try {
      const response = await fetch("/api/people/tree", {
        credentials: "include",
        signal,
      });
      const result = (await response.json()) as PeopleTreeApiResponse;

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error?.message || "Failed to load People tree");
      }

      setTree(result.data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("[PeoplePanel] Failed to load People tree:", err);
      setError(err instanceof Error ? err.message : "Failed to load People tree");
    } finally {
      setIsLoadingTree(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchTree(controller.signal);
    return () => controller.abort();
  }, [fetchTree]);

  useEffect(() => {
    const handleRefresh = () => {
      void fetchTree();
    };

    window.addEventListener("dg:people-refresh", handleRefresh);
    return () => window.removeEventListener("dg:people-refresh", handleRefresh);
  }, [fetchTree]);

  useEffect(() => {
    if (!trimmedQuery) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsSearching(true);

      try {
        const params = new URLSearchParams({
          q: trimmedQuery,
          limit: "20",
        });
        const response = await fetch(`/api/people/search?${params}`, {
          credentials: "include",
          signal: controller.signal,
        });
        const result = (await response.json()) as PeopleSearchApiResponse;

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error?.message || "Failed to search People records");
        }

        setResults(result.data.results);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[PeoplePanel] Failed to search People records:", err);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [trimmedQuery]);

  const visibleGroups = useMemo(() => {
    if (!tree) return [];
    if ((tree.groups?.length ?? 0) > 0) {
      return tree.groups;
    }

    return tree.defaultGroup ? [tree.defaultGroup] : [];
  }, [tree]);
  const selectedGroupId = selection?.kind === "peopleGroup" ? selection.groupId : null;
  const selectedPersonId = selection?.kind === "person" ? selection.personId : null;
  const canCreateInSelectedGroup = Boolean(selectedGroupId) && !isLoadingTree && !error;

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!contextMenu) return;

    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", closeMenu);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!showAddMenu) return;
    const close = () => setShowAddMenu(false);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, [showAddMenu]);

  useEffect(() => {
    if (!showAddMenu || !addButtonRef.current || !addMenuRef.current) return;

    const buttonRect = addButtonRef.current.getBoundingClientRect();
    const menuRect = addMenuRef.current.getBoundingClientRect();

    const calculatedPosition = calculateMenuPosition({
      triggerPosition: {
        x: buttonRect.right,
        y: buttonRect.bottom + 4,
      },
      menuDimensions: {
        width: menuRect.width,
        height: menuRect.height,
      },
      viewportPadding: 8,
      preferredPlacementX: "left",
      preferredPlacementY: "bottom",
    });

    setAddMenuPosition(calculatedPosition);
  }, [showAddMenu]);

  useEffect(() => {
    if (!showAddMenu) {
      setAddMenuPosition(null);
    }
  }, [showAddMenu]);

  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;

    const menuRect = contextMenuRef.current.getBoundingClientRect();
    const calculatedPosition = calculateMenuPosition({
      triggerPosition: {
        x: contextMenu.x,
        y: contextMenu.y,
      },
      menuDimensions: {
        width: menuRect.width,
        height: menuRect.height,
      },
      viewportPadding: 8,
      preferredPlacementX: "right",
      preferredPlacementY: "bottom",
    });

    setContextMenuPosition(calculatedPosition);
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) {
      setContextMenuPosition(null);
    }
  }, [contextMenu]);

  const refreshViews = useCallback(async () => {
    await fetchTree();
    window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
  }, [fetchTree]);

  const openPersonWorkspace = useCallback((person: { personId: string; label: string }) => {
    setSelectedContentId(`person:${person.personId}`, {
      title: person.label,
      contentType: "person-profile",
      pin: true,
    });
  }, [setSelectedContentId]);

  const openContentWorkspace = useCallback((content: PeopleTreeContentNode) => {
    setSelectedContentId(content.contentId, {
      title: content.title,
      contentType: content.contentType,
      pin: true,
    });
  }, [setSelectedContentId]);

  const movePeopleRecord = useCallback(async (payload: PeopleDragPayload, targetGroupId: string | null) => {
    try {
      const response = await fetch("/api/people/move", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: payload,
          targetGroupId,
        }),
      });
      const result = (await response.json()) as {
        success?: boolean;
        error?: { message?: string };
      };

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || "Failed to move People record");
      }

      toast.success("People record moved", {
        description: `${payload.label} was moved.`,
      });
      await refreshViews();
    } catch (err) {
      console.error("[PeoplePanel] Failed to move People record:", err);
      toast.error("Move failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setDragOverGroupId(null);
    }
  }, [refreshViews]);

  const resolveAssignment = useCallback((target: PeopleSelection) => {
    if (target.kind === "peopleGroup") {
      return {
        peopleGroupId: target.groupId,
        personId: null,
        parentId: null,
      };
    }

    if (target.kind === "person") {
      return {
        peopleGroupId: null,
        personId: target.personId,
        parentId: null,
      };
    }

    return {
      peopleGroupId: target.peopleGroupId,
      personId: target.personId,
      parentId: target.contentType === "folder" ? target.contentId : target.parentId,
    };
  }, []);

  const createPeopleContent = useCallback(async (type: "note" | "folder", target = selection) => {
    if (!target) {
      toast.info("Select a People record", {
        description: "Select one group, contact, or People folder before adding content.",
      });
      return;
    }

    const title = type === "folder" ? "Untitled Folder" : "Untitled Note";
    const assignment = resolveAssignment(target);

    try {
      const response = await fetch("/api/content/content", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          parentId: assignment.parentId,
          peopleGroupId: assignment.peopleGroupId,
          personId: assignment.personId,
          ...(type === "folder"
            ? { isFolder: true }
            : {
                tiptapJson: {
                  type: "doc",
                  content: [{ type: "paragraph" }],
                },
              }),
        }),
      });
      const result = (await response.json()) as ContentCreateApiResponse;

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || `Failed to create ${type}`);
      }

      toast.success(type === "folder" ? "Folder added" : "Note added", {
        description: `${title} was assigned to ${target.label}.`,
      });
      await refreshViews();

      if (result.data?.id && type !== "folder") {
        setSelectedContentId(result.data.id, {
          title: result.data.title,
          contentType: "note",
          pin: true,
        });
      }
    } catch (err) {
      console.error("[PeoplePanel] Failed to create People content:", err);
      toast.error(type === "folder" ? "Failed to add folder" : "Failed to add note", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [refreshViews, resolveAssignment, selection, setSelectedContentId]);

  const handleCreateDocument = useCallback(async (
    fileType: "docx" | "xlsx" | "json",
    target = selection
  ) => {
    if (!target) {
      toast.info("Select a People record", {
        description: "Select one group, contact, or People folder before adding a document.",
      });
      return;
    }

    const assignment = resolveAssignment(target);
    const fileName = fileType === "docx"
      ? "Untitled Document.docx"
      : fileType === "xlsx"
        ? "Untitled Spreadsheet.xlsx"
        : "Untitled Data.json";

    try {
      const response = await fetch("/api/content/content/create-document", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName,
          fileType,
          parentId: assignment.parentId,
          peopleGroupId: assignment.peopleGroupId,
          personId: assignment.personId,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || "Failed to create document");
      }

      toast.success("Document added", {
        description: `${result.data.fileName} was assigned to ${target.label}.`,
      });
      await refreshViews();
      if (result.data?.id) {
        setSelectedContentId(result.data.id, {
          title: result.data.fileName,
          contentType: "file",
          pin: true,
        });
      }
    } catch (err) {
      console.error("[PeoplePanel] Failed to create People document:", err);
      toast.error("Failed to add document", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [refreshViews, resolveAssignment, selection, setSelectedContentId]);

  const peopleContentMenuItems = useMemo(
    () =>
      getNewContentMenuItems(
        {
          onCreateNote: () => void createPeopleContent("note"),
          onCreateFolder: () => void createPeopleContent("folder"),
          onCreateFile: selection ? () => setUploadTarget(selection) : undefined,
          onCreateDocument: () => void handleCreateDocument("docx"),
          onCreateSpreadsheet: () => void handleCreateDocument("xlsx"),
          onCreateJson: () => void handleCreateDocument("json"),
        },
        null
      ).filter((item) => item.id !== "add-people-target"),
    [createPeopleContent, handleCreateDocument, selection]
  );

  const openProfile = useCallback((personId: string) => {
    setProfilePersonId(personId);
  }, []);

  const openRenameDialog = useCallback((target: PeopleSelection) => {
    setRenameTarget(target);
    setRenameValue(target.kind === "content" ? target.title : target.label);
    setContextMenu(null);
  }, []);

  const handleRenameSubmit = useCallback(async () => {
    if (!renameTarget || !renameValue.trim()) {
      return;
    }

    setIsSubmittingRename(true);
    try {
      if (renameTarget.kind === "content") {
        const response = await fetch(`/api/content/content/${renameTarget.contentId}`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: renameValue.trim(),
          }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error?.message || "Failed to rename content");
        }
      } else if (renameTarget.kind === "person") {
        const response = await fetch(`/api/people/persons/${renameTarget.personId}`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            displayName: renameValue.trim(),
          }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error?.message || "Failed to rename contact");
        }
      } else {
        const response = await fetch(`/api/people/groups/${renameTarget.groupId}`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: renameValue.trim(),
          }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error?.message || "Failed to rename group");
        }
      }

      const trimmedName = renameValue.trim();
      // Keep open tabs and sidebar tree in sync immediately — don't wait for refetch.
      if (renameTarget.kind === "content") {
        updateContentTab(renameTarget.contentId, { title: trimmedName });
        patchTreeContentTitle(renameTarget.contentId, trimmedName);
      }
      toast.success("Renamed", {
        description: trimmedName,
      });
      setRenameTarget(null);
      setRenameValue("");
      await refreshViews();
    } catch (err) {
      console.error("[PeoplePanel] Rename failed:", err);
      toast.error("Rename failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsSubmittingRename(false);
    }
  }, [refreshViews, renameTarget, renameValue, updateContentTab, patchTreeContentTitle]);

  const handleDeleteSelection = useCallback(async (target: PeopleSelection) => {
    const label = target.kind === "content" ? target.title : target.label;
    const confirmed = window.confirm(`Delete "${label}"?`);
    if (!confirmed) {
      return;
    }

    try {
      if (target.kind === "content") {
        const response = await fetch(`/api/content/content/${target.contentId}`, {
          method: "DELETE",
          credentials: "include",
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error?.message || "Failed to delete content");
        }
      } else if (target.kind === "person") {
        const response = await fetch(`/api/people/persons/${target.personId}`, {
          method: "DELETE",
          credentials: "include",
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error?.message || "Failed to delete contact");
        }
      } else {
        const response = await fetch(`/api/people/groups/${target.groupId}`, {
          method: "DELETE",
          credentials: "include",
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error?.message || "Failed to delete group");
        }
      }

      toast.success("Deleted", {
        description: label,
      });
      setSelection((current) => (current?.id === target.id ? null : current));
      if (target.kind === "person") {
        setSelectedContentId(null);
      }
      await refreshViews();
    } catch (err) {
      console.error("[PeoplePanel] Delete failed:", err);
      toast.error("Delete failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setContextMenu(null);
    }
  }, [refreshViews, setSelectedContentId]);

  useEffect(() => {
    const createContent = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: "note" | "folder" }>).detail;
      if (detail?.type === "note" || detail?.type === "folder") {
        void createPeopleContent(detail.type);
      }
    };
    const createPerson = () => {
      if (!canCreateInSelectedGroup) {
        toast.info("Select a group", {
          description: "Select one group before adding a contact.",
        });
        return;
      }
      setCreateMode("person");
    };
    const createGroup = () => {
      if (!canCreateInSelectedGroup) {
        toast.info("Select a group", {
          description: "Select one group before adding a subgroup.",
        });
        return;
      }
      setCreateMode("group");
    };
    const openUpload = () => {
      if (!selection) {
        toast.info("Select a People record", {
          description: "Select one group, contact, or People folder before uploading a file.",
        });
        return;
      }
      setUploadTarget(selection);
    };
    const createDocument = (event: Event) => {
      const detail = (event as CustomEvent<{ fileType?: "docx" | "xlsx" | "json" }>).detail;
      if (detail?.fileType === "docx" || detail?.fileType === "xlsx" || detail?.fileType === "json") {
        void handleCreateDocument(detail.fileType);
      }
    };
    const focusPerson = (event: Event) => {
      const detail = (event as CustomEvent<{ personId?: string; openProfile?: boolean }>).detail;
      if (!detail?.personId || !tree) {
        return;
      }

      const path = findPersonPath(tree.groups, detail.personId);
      if (!path) {
        return;
      }

      setSelection({
        kind: "person",
        id: `person:${detail.personId}`,
        personId: detail.personId,
        primaryGroupId: path.primaryGroupId,
        label: path.label,
      });
      setExpandedIds((current) => {
        const next = new Set(current);
        path.expandIds.forEach((id) => next.add(id));
        return next;
      });

      if (detail.openProfile) {
        setProfilePersonId(detail.personId);
      }
    };

    window.addEventListener("dg:people-create-content", createContent);
    window.addEventListener("dg:people-open-create-person", createPerson);
    window.addEventListener("dg:people-open-create-group", createGroup);
    window.addEventListener("dg:people-open-upload", openUpload);
    window.addEventListener("dg:people-create-document", createDocument);
    window.addEventListener("dg:people-focus", focusPerson);
    return () => {
      window.removeEventListener("dg:people-create-content", createContent);
      window.removeEventListener("dg:people-open-create-person", createPerson);
      window.removeEventListener("dg:people-open-create-group", createGroup);
      window.removeEventListener("dg:people-open-upload", openUpload);
      window.removeEventListener("dg:people-create-document", createDocument);
      window.removeEventListener("dg:people-focus", focusPerson);
    };
  }, [canCreateInSelectedGroup, createPeopleContent, handleCreateDocument, selection, tree]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-white/10 px-3 py-3">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-700">People</h3>
            <p className="mt-1 text-xs text-gray-500">Groups, subgroups, and contacts</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => selectedPersonId ? openProfile(selectedPersonId) : null}
              disabled={!selectedPersonId}
              className="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
              title={selectedPersonId ? "Edit selected contact" : "Select one contact to edit profile"}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <div className="relative">
              <button
                ref={addButtonRef}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setShowAddMenu((current) => !current);
                }}
                className="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
                title="Add to People"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              {isLoadingTree ? "Loading" : tree ? `${tree.stats.people} people` : "Loading"}
            </div>
          </div>
        </div>

        <label className="relative block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people or groups..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-500 focus:border-gold-primary/60"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {error ? (
          <PeopleStateMessage
            icon={<Users className="h-10 w-10 text-red-400/80" />}
            title="People failed to load"
            description={error}
            actionLabel="Retry"
            onAction={() => void fetchTree()}
          />
        ) : !tree || (isLoadingTree && visibleGroups.length === 0) ? (
          <PeopleLoadingSkeleton />
        ) : isSearchMode ? (
          <SearchResults results={results} isSearching={isSearching} />
        ) : visibleGroups.length === 0 ? (
          <PeopleStateMessage
            icon={<Users className="h-10 w-10 text-gray-500" />}
            title="No People groups yet"
            description="Your default People group will be created automatically."
          />
        ) : (
          <div
            className="space-y-1"
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                setInsertTarget(null);
                setIsDragOverRoot(false);
              }
            }}
            onDrop={() => {
              // If no group row captured it, clear states
              setInsertTarget(null);
              setIsDragOverRoot(false);
            }}
          >
            {visibleGroups.map((group) => (
              <PeopleGroupRow
                key={group.id}
                group={group}
                depth={0}
                dragOverGroupId={dragOverGroupId}
                insertTarget={insertTarget}
                selectedId={selection?.id ?? null}
                expandedIds={expandedIds}
                onSelect={setSelection}
                onToggleExpanded={toggleExpanded}
                onOpenContextMenu={setContextMenu}
                onOpenProfile={openProfile}
                onOpenPersonWorkspace={openPersonWorkspace}
                onOpenContent={openContentWorkspace}
                onDragOverGroup={(id) => {
                  setDragOverGroupId(id);
                  if (id) { setInsertTarget(null); setIsDragOverRoot(false); }
                }}
                onDragInsertNear={(groupId, position, parentGroupId) => {
                  setDragOverGroupId(null);
                  setInsertTarget(groupId ? { groupId, position, parentGroupId } : null);
                }}
                onDropOnGroup={(payload, targetGroupId) => void movePeopleRecord(payload, targetGroupId)}
                onDropInsertNear={(payload, parentGroupId) => void movePeopleRecord(payload, parentGroupId)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-white/10 px-3 py-2 text-[11px] leading-4 text-gray-500">
        Canonical People records. File-tree entries will mount these once.
      </div>

      {createMode ? (
        <PeopleCreateDialog
          mode={createMode}
          primaryGroupId={createMode === "person" ? selectedGroupId : null}
          parentGroupId={createMode === "group" ? selectedGroupId : null}
          onClose={() => setCreateMode(null)}
          onCreated={() => void refreshViews()}
        />
      ) : null}

      {profilePersonId ? (
        <PeopleProfileDialog
          personId={profilePersonId}
          onClose={() => setProfilePersonId(null)}
          onUpdated={() => void refreshViews()}
        />
      ) : null}

      {uploadTarget ? createPortal(
        <FileUploadDialog
          parentId={uploadTarget.kind === "content"
            ? uploadTarget.contentType === "folder"
              ? uploadTarget.contentId
              : uploadTarget.parentId
            : null}
          peopleGroupId={uploadTarget.kind === "peopleGroup" ? uploadTarget.groupId : uploadTarget.kind === "content" ? uploadTarget.peopleGroupId : null}
          personId={uploadTarget.kind === "person" ? uploadTarget.personId : uploadTarget.kind === "content" ? uploadTarget.personId : null}
          onSuccess={() => {
            setUploadTarget(null);
            void refreshViews();
          }}
          onCancel={() => setUploadTarget(null)}
        />,
        document.body
      ) : null}

      {renameTarget ? (
        <RenameDialog
          title={`Rename ${renameTarget.kind === "person" ? "Contact" : renameTarget.kind === "peopleGroup" ? "Group" : renameTarget.contentType === "folder" ? "Folder" : "File"}`}
          value={renameValue}
          onChange={setRenameValue}
          onCancel={() => {
            setRenameTarget(null);
            setRenameValue("");
          }}
          onSubmit={() => void handleRenameSubmit()}
          submitting={isSubmittingRename}
        />
      ) : null}

      {contextMenu ? createPortal(
        <PeopleContextMenu
          ref={contextMenuRef}
          menu={contextMenu}
          position={contextMenuPosition}
          contentItems={peopleContentMenuItems}
          onClose={() => setContextMenu(null)}
          onUpload={() => setUploadTarget(contextMenu.selection)}
          onCreateDocument={(fileType) => void handleCreateDocument(fileType, contextMenu.selection)}
          onCreatePerson={() => setCreateMode("person")}
          onCreateGroup={() => setCreateMode("group")}
          onEditProfile={() => contextMenu.selection.kind === "person" ? openProfile(contextMenu.selection.personId) : null}
          onRename={() => openRenameDialog(contextMenu.selection)}
          onDelete={() => void handleDeleteSelection(contextMenu.selection)}
        />,
        document.body
      ) : null}

      {showAddMenu ? createPortal(
        <>
          <div
            className="fixed inset-0 z-[180]"
            onClick={() => setShowAddMenu(false)}
          />
          <div
            ref={addMenuRef}
            className="fixed z-[190] min-w-52 overflow-visible rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
            style={
              addMenuPosition
                ? {
                    left: `${addMenuPosition.x}px`,
                    top: `${addMenuPosition.y}px`,
                    maxHeight: `${addMenuPosition.maxHeight}px`,
                  }
                : {
                    left: 0,
                    top: 0,
                    visibility: "hidden",
                  }
            }
            onClick={(event) => event.stopPropagation()}
          >
            <AddMenuButton
              disabled={!canCreateInSelectedGroup}
              icon={<User className="h-4 w-4" />}
              label="Contact"
              onClick={() => {
                setCreateMode("person");
                setShowAddMenu(false);
              }}
            />
            <AddMenuButton
              disabled={!canCreateInSelectedGroup}
              icon={<Users className="h-4 w-4" />}
              label="Group"
              onClick={() => {
                setCreateMode("group");
                setShowAddMenu(false);
              }}
            />
            <NestedAddMenuButton
              disabled={!selection}
              icon={<Folder className="h-4 w-4" />}
              label="Content"
              items={peopleContentMenuItems}
              onLeafAction={() => setShowAddMenu(false)}
            />
          </div>
        </>,
        document.body
      ) : null}
    </div>
  );
}

function SearchResults({
  results,
  isSearching,
}: {
  results: PeopleSearchResult[];
  isSearching: boolean;
}) {
  if (isSearching) {
    return (
      <PeopleStateMessage
        icon={<Search className="h-10 w-10 text-gray-500" />}
        title="Searching"
        description="Looking for matching people and groups."
      />
    );
  }

  if (results.length === 0) {
    return (
      <PeopleStateMessage
        icon={<Search className="h-10 w-10 text-gray-500" />}
        title="No matches"
        description="Try a different person, group, email, or phone search."
      />
    );
  }

  return (
    <div className="space-y-1">
      {results.map((result) => (
        <div key={result.id} className="group flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white/5">
          <PeopleIcon kind={result.treeNodeKind} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-gray-900">{result.label}</div>
            <div className="truncate text-xs text-gray-500">
              {result.treeNodeKind === "person"
                ? result.email || result.phone || "Person"
                : result.isDefault
                  ? "Default group"
                  : "Group"}
            </div>
          </div>
          <MountBadge mounted={Boolean(result.mount)} />
        </div>
      ))}
    </div>
  );
}

function PeopleGroupRow({
  group,
  depth,
  dragOverGroupId,
  insertTarget,
  selectedId,
  expandedIds,
  onSelect,
  onToggleExpanded,
  onOpenContextMenu,
  onOpenProfile,
  onOpenPersonWorkspace,
  onOpenContent,
  onDragOverGroup,
  onDragInsertNear,
  onDropOnGroup,
  onDropInsertNear,
}: {
  group: PeopleTreeGroupNode;
  depth: number;
  dragOverGroupId: string | null;
  insertTarget: { groupId: string; position: "before" | "after"; parentGroupId: string | null } | null;
  selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (selection: PeopleSelection) => void;
  onToggleExpanded: (id: string) => void;
  onOpenContextMenu: (menu: PeopleContextMenuState) => void;
  onOpenProfile: (personId: string) => void;
  onOpenPersonWorkspace: (person: { personId: string; label: string }) => void;
  onOpenContent: (content: PeopleTreeContentNode) => void;
  onDragOverGroup: (groupId: string | null) => void;
  onDragInsertNear: (groupId: string | null, position: "before" | "after", parentGroupId: string | null) => void;
  onDropOnGroup: (payload: PeopleDragPayload, targetGroupId: string | null) => void;
  onDropInsertNear: (payload: PeopleDragPayload, parentGroupId: string | null) => void;
}) {
  const isDragTarget = dragOverGroupId === group.groupId;
  const isSelected = selectedId === group.id;
  const selection: PeopleSelection = { kind: "peopleGroup", id: group.id, groupId: group.groupId, label: group.name };
  const isExpanded = expandedIds.has(group.id);
  const hasChildren = group.content.length > 0 || group.people.length > 0 || group.childGroups.length > 0;

  const isInsertBefore = insertTarget?.groupId === group.groupId && insertTarget.position === "before";
  const isInsertAfter = insertTarget?.groupId === group.groupId && insertTarget.position === "after";

  return (
    <div>
      {/* Insert-before indicator */}
      {isInsertBefore && (
        <div className="pointer-events-none mx-1 h-0.5 rounded-full bg-gold-primary/70" style={{ marginLeft: 8 + depth * 14 }} />
      )}
      <div
        role="treeitem"
        tabIndex={0}
        aria-selected={isSelected}
        draggable={!group.isDefault}
        onClick={() => {
          onSelect(selection);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onSelect(selection);
          onOpenContextMenu({ x: event.clientX, y: event.clientY, selection });
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(selection);
          }
        }}
        onDragStart={(event) => {
          if (group.isDefault) return;
          event.dataTransfer.setData(PEOPLE_DRAG_MIME, JSON.stringify({
            kind: "peopleGroup",
            groupId: group.groupId,
            label: group.name,
          } satisfies PeopleDragPayload));
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(event) => {
          if (!hasPeopleDrag(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";

          const rect = event.currentTarget.getBoundingClientRect();
          const relY = (event.clientY - rect.top) / rect.height;
          const edgeZone = 0.3;

          if (relY < edgeZone) {
            // Top edge → insert before (move to same parent)
            onDragInsertNear(group.groupId, "before", group.parentGroupId ?? null);
            onDragOverGroup(null);
          } else if (relY > 1 - edgeZone) {
            // Bottom edge → insert after (move to same parent)
            onDragInsertNear(group.groupId, "after", group.parentGroupId ?? null);
            onDragOverGroup(null);
          } else {
            // Center → drop into this group
            onDragInsertNear(null, "before", null);
            onDragOverGroup(group.groupId);
          }
        }}
        onDragLeave={() => {
          onDragOverGroup(null);
          onDragInsertNear(null, "before", null);
        }}
        onDrop={(event) => {
          const payload = getPeopleDragPayload(event);
          if (!payload) return;
          // Prevent dropping a group onto itself
          if (payload.kind === "peopleGroup" && payload.groupId === group.groupId) {
            event.preventDefault();
            return;
          }
          event.preventDefault();
          // If an insert indicator is active for this group, move to parent level
          if (insertTarget?.groupId === group.groupId) {
            onDropInsertNear(payload, group.parentGroupId ?? null);
          } else {
            onDropOnGroup(payload, group.groupId);
          }
        }}
        className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm outline-none transition-colors hover:bg-gray-50 focus:bg-gray-50 ${
          isSelected ? "bg-gold-primary/10 ring-1 ring-gold-primary/30" : ""
        } ${
          isDragTarget ? "bg-gold-primary/10 ring-1 ring-gold-primary/30" : ""
        } ${group.isDefault ? "" : "cursor-grab active:cursor-grabbing"}`}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <TreeDisclosure
          visible={hasChildren}
          expanded={isExpanded}
          onToggle={() => onToggleExpanded(group.id)}
        />
        <PeopleIcon kind="peopleGroup" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium text-gray-900">
              {group.name}
            </span>
            {group.isDefault ? <span className="shrink-0 text-[11px] font-normal text-gray-500">default</span> : null}
          </div>
          <div className="truncate text-xs text-gray-500">
            {formatGroupSummary(group)}
          </div>
        </div>
        <MountBadge mounted={Boolean(group.mount)} />
      </div>
      {/* Insert-after indicator */}
      {isInsertAfter && (
        <div className="pointer-events-none mx-1 h-0.5 rounded-full bg-gold-primary/70" style={{ marginLeft: 8 + depth * 14 }} />
      )}

      {isExpanded ? (
        <>
          {group.content.map((content) => (
            <PeopleContentRow
              key={content.id}
              content={content}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggleExpanded={onToggleExpanded}
              onOpenContextMenu={onOpenContextMenu}
              onOpenContent={onOpenContent}
            />
          ))}

          {group.people.map((person) => (
            <PeoplePersonRow
              key={person.id}
              person={person}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggleExpanded={onToggleExpanded}
              onOpenContextMenu={onOpenContextMenu}
              onOpenProfile={onOpenProfile}
              onOpenPersonWorkspace={onOpenPersonWorkspace}
              onOpenContent={onOpenContent}
            />
          ))}

          {group.childGroups.map((childGroup) => (
            <PeopleGroupRow
              key={childGroup.id}
              group={childGroup}
              depth={depth + 1}
              dragOverGroupId={dragOverGroupId}
              insertTarget={insertTarget}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggleExpanded={onToggleExpanded}
              onOpenContextMenu={onOpenContextMenu}
              onOpenProfile={onOpenProfile}
              onOpenPersonWorkspace={onOpenPersonWorkspace}
              onOpenContent={onOpenContent}
              onDragOverGroup={onDragOverGroup}
              onDragInsertNear={onDragInsertNear}
              onDropOnGroup={onDropOnGroup}
              onDropInsertNear={onDropInsertNear}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

function PeoplePersonRow({
  person,
  depth,
  selectedId,
  expandedIds,
  onSelect,
  onToggleExpanded,
  onOpenContextMenu,
  onOpenProfile,
  onOpenPersonWorkspace,
  onOpenContent,
}: {
  person: PeopleTreePersonNode;
  depth: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (selection: PeopleSelection) => void;
  onToggleExpanded: (id: string) => void;
  onOpenContextMenu: (menu: PeopleContextMenuState) => void;
  onOpenProfile: (personId: string) => void;
  onOpenPersonWorkspace: (person: { personId: string; label: string }) => void;
  onOpenContent: (content: PeopleTreeContentNode) => void;
}) {
  const isSelected = selectedId === person.id;
  const isExpanded = expandedIds.has(person.id);
  const hasChildren = person.content.length > 0;
  const selection: PeopleSelection = {
    kind: "person",
    id: person.id,
    personId: person.personId,
    primaryGroupId: person.primaryGroupId,
    label: person.displayName,
  };

  return (
    <>
      <div
        role="treeitem"
        tabIndex={0}
        aria-selected={isSelected}
        draggable
        onClick={() => {
          onSelect(selection);
          onOpenPersonWorkspace({
            personId: person.personId,
            label: person.displayName,
          });
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onSelect(selection);
          onOpenContextMenu({ x: event.clientX, y: event.clientY, selection });
        }}
        onDoubleClick={() => onOpenProfile(person.personId)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(selection);
            onOpenPersonWorkspace({
              personId: person.personId,
              label: person.displayName,
            });
          }
        }}
        onDragStart={(event) => {
          event.dataTransfer.setData(PEOPLE_DRAG_MIME, JSON.stringify({
            kind: "person",
            personId: person.personId,
            label: person.displayName,
          } satisfies PeopleDragPayload));
          event.dataTransfer.effectAllowed = "move";
        }}
        className={`flex cursor-grab items-center gap-2 rounded px-2 py-1.5 text-sm outline-none transition-colors hover:bg-gray-50 focus:bg-gray-50 active:cursor-grabbing ${
          isSelected ? "bg-blue-50 ring-1 ring-blue-200" : ""
        }`}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <TreeDisclosure
          visible={hasChildren}
          expanded={isExpanded}
          onToggle={() => onToggleExpanded(person.id)}
        />
        <PeopleIcon kind="person" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate font-medium text-gray-900">{person.displayName}</div>
          <div className="truncate text-xs text-gray-500">{person.email || person.phone || "Person"}</div>
        </div>
        <MountBadge mounted={Boolean(person.mount)} />
      </div>
      {isExpanded
        ? person.content.map((content) => (
          <PeopleContentRow
            key={content.id}
            content={content}
            depth={depth + 1}
            selectedId={selectedId}
            expandedIds={expandedIds}
            onSelect={onSelect}
            onToggleExpanded={onToggleExpanded}
            onOpenContextMenu={onOpenContextMenu}
            onOpenContent={onOpenContent}
          />
        ))
        : null}
    </>
  );
}

function PeopleContentRow({
  content,
  depth,
  selectedId,
  expandedIds,
  onSelect,
  onToggleExpanded,
  onOpenContextMenu,
  onOpenContent,
}: {
  content: PeopleTreeContentNode;
  depth: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (selection: PeopleSelection) => void;
  onToggleExpanded: (id: string) => void;
  onOpenContextMenu: (menu: PeopleContextMenuState) => void;
  onOpenContent: (content: PeopleTreeContentNode) => void;
}) {
  const isExpanded = expandedIds.has(content.id);
  const isSelected = selectedId === content.id;
  const hasChildren = content.children.length > 0;
  const selection: PeopleSelection = {
    kind: "content",
    id: content.id,
    contentId: content.contentId,
    contentType: content.contentType,
    title: content.title,
    parentId: content.parentId,
    peopleGroupId: content.peopleGroupId,
    personId: content.personId,
    label: content.title,
  };

  return (
    <div>
      <div
        className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 ${
          isSelected ? "bg-gray-100 ring-1 ring-gray-200" : ""
        }`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => {
          onSelect(selection);
          onOpenContent(content);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onSelect(selection);
          onOpenContextMenu({ x: event.clientX, y: event.clientY, selection });
        }}
      >
        <TreeDisclosure
          visible={hasChildren}
          expanded={isExpanded}
          onToggle={() => onToggleExpanded(content.id)}
        />
        {renderPeopleContentIcon(content, isExpanded)}
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate font-medium">{content.title}</div>
          <div className="truncate text-xs text-gray-500">{describePeopleContentType(content.contentType)}</div>
        </div>
      </div>

      {isExpanded
        ? content.children.map((child) => (
          <PeopleContentRow
            key={child.id}
            content={child}
            depth={depth + 1}
            selectedId={selectedId}
            expandedIds={expandedIds}
            onSelect={onSelect}
            onToggleExpanded={onToggleExpanded}
            onOpenContextMenu={onOpenContextMenu}
            onOpenContent={onOpenContent}
          />
        ))
        : null}
    </div>
  );
}

function TreeDisclosure({
  visible,
  expanded,
  onToggle,
}: {
  visible: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!visible) {
    return <div className="h-4 w-4 shrink-0" />;
  }

  return (
    <button
      type="button"
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      aria-label={expanded ? "Collapse" : "Expand"}
    >
      {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
    </button>
  );
}

function PeopleLoadingSkeleton() {
  return (
    <div className="space-y-2 p-2" aria-label="Loading People">
      <div className="h-7 animate-pulse rounded bg-gray-100" />
      <div className="ml-5 h-7 animate-pulse rounded bg-gray-100/80" />
      <div className="ml-5 h-7 animate-pulse rounded bg-gray-100/70" />
      <div className="mt-4 h-7 animate-pulse rounded bg-gray-100" />
      <div className="ml-5 h-7 animate-pulse rounded bg-gray-100/70" />
    </div>
  );
}

const PeopleContextMenu = forwardRef<HTMLDivElement, {
  menu: NonNullable<PeopleContextMenuState>;
  position: { x: number; y: number; maxHeight: number } | null;
  contentItems: NewContentMenuItem[];
  onClose: () => void;
  onUpload: () => void;
  onCreateDocument: (fileType: "docx" | "xlsx" | "json") => void;
  onCreatePerson: () => void;
  onCreateGroup: () => void;
  onEditProfile: () => void;
  onRename: () => void;
  onDelete: () => void;
}>(({
  menu,
  position,
  contentItems,
  onClose,
  onUpload,
  onCreateDocument,
  onCreatePerson,
  onCreateGroup,
  onEditProfile,
  onRename,
  onDelete,
}, ref) => {
  const canCreatePeopleRecords = menu.selection.kind === "peopleGroup";
  const isPerson = menu.selection.kind === "person";
  const contentMenuItems = contentItems.map((item) => {
    if (item.id === "add-file") {
      return {
        ...item,
        onClick: () => onUpload(),
      };
    }
    if (item.id === "add-document") {
      return {
        ...item,
        onClick: () => onCreateDocument("docx"),
      };
    }
    if (item.id === "add-spreadsheet") {
      return {
        ...item,
        onClick: () => onCreateDocument("xlsx"),
      };
    }
    if (item.id === "add-json") {
      return {
        ...item,
        onClick: () => onCreateDocument("json"),
      };
    }
    return item;
  });

  return (
    <div
      ref={ref}
      className="fixed z-[220] min-w-[180px] overflow-y-auto rounded-md border border-white/20 bg-white/95 py-1 text-sm shadow-lg backdrop-blur-sm dark:bg-gray-900/95"
      style={
        position
          ? {
              left: `${position.x}px`,
              top: `${position.y}px`,
              maxHeight: `${position.maxHeight}px`,
            }
          : {
              left: 0,
              top: 0,
              visibility: "hidden",
            }
      }
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <PeopleContextMenuButton
        disabled={!canCreatePeopleRecords}
        icon={<LucideIcons.UserPlus className="h-3.5 w-3.5" />}
        onClick={() => { onCreatePerson(); onClose(); }}
      >
        Add Contact
      </PeopleContextMenuButton>
      <PeopleContextMenuButton
        disabled={!canCreatePeopleRecords}
        icon={<LucideIcons.FolderPlus className="h-3.5 w-3.5" />}
        onClick={() => { onCreateGroup(); onClose(); }}
      >
        Add Subgroup
      </PeopleContextMenuButton>
      <NestedAddMenuButton
        disabled={false}
        icon={<Folder className="h-4 w-4" />}
        label="Add Content"
        items={contentMenuItems}
        onLeafAction={onClose}
      />
      <div className="my-0.5 border-t border-gray-200/50 dark:border-gray-700/50" />
      {isPerson ? (
        <PeopleContextMenuButton
          icon={<LucideIcons.UserCog className="h-3.5 w-3.5" />}
          onClick={() => { onEditProfile(); onClose(); }}
        >
          Edit Contact
        </PeopleContextMenuButton>
      ) : null}
      <PeopleContextMenuButton
        icon={<LucideIcons.PencilLine className="h-3.5 w-3.5" />}
        onClick={() => { onRename(); onClose(); }}
      >
        Rename
      </PeopleContextMenuButton>
      <PeopleContextMenuButton
        destructive
        icon={<LucideIcons.Trash2 className="h-3.5 w-3.5" />}
        onClick={() => { onDelete(); onClose(); }}
      >
        Delete
      </PeopleContextMenuButton>
    </div>
  );
});
PeopleContextMenu.displayName = "PeopleContextMenu";

function PeopleContextMenuButton({
  children,
  icon,
  disabled = false,
  destructive = false,
  onClick,
}: {
  children: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-2.5 py-1 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        destructive
          ? "text-gray-900 hover:bg-red-500/10 hover:text-red-600 dark:text-gray-100 dark:hover:text-red-400"
          : "text-gray-900 hover:bg-primary/10 hover:text-primary dark:text-gray-100"
      }`}
    >
      {icon && (
        <span className={`shrink-0 ${destructive ? "text-red-400" : "text-gray-400 dark:text-gray-500"}`}>
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}

function AddMenuButton({
  icon,
  label,
  disabled = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2 px-2.5 py-1 text-left text-sm text-gray-900 transition-colors hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-100"
    >
      <span className="shrink-0 text-gray-400 dark:text-gray-500">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function NestedAddMenuButton({
  icon,
  label,
  items,
  disabled = false,
  onLeafAction,
}: {
  icon: ReactNode;
  label: string;
  items: NewContentMenuItem[];
  disabled?: boolean;
  onLeafAction: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [submenuPos, setSubmenuPos] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleClose = () => {
    closeTimerRef.current = setTimeout(() => setOpen(false), 120);
  };

  const cancelClose = () => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openSubmenu = () => {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setSubmenuPos({ x: rect.right + 2, y: rect.top });
    }
    setOpen(true);
  };

  return (
    <div
      ref={triggerRef}
      className="relative"
      onMouseEnter={() => { cancelClose(); openSubmenu(); }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen((c) => { if (!c) openSubmenu(); return !c; }); }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-primary/8 hover:text-primary disabled:cursor-not-allowed disabled:text-gray-300 dark:text-gray-300 dark:hover:text-primary"
      >
        <span className="shrink-0 text-gray-400 dark:text-gray-500">{icon}</span>
        <span className="flex-1">{label}</span>
        <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
      </button>
      {open && submenuPos ? createPortal(
        <div
          className="fixed z-[250] min-w-52 rounded-md border border-white/20 bg-white/95 py-1 shadow-lg backdrop-blur-sm dark:bg-gray-900/95"
          style={{ left: submenuPos.x, top: submenuPos.y }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <RecursiveMenuItems items={items} onLeafAction={onLeafAction} />
        </div>,
        document.body
      ) : null}
    </div>
  );
}

function RecursiveMenuItems({
  items,
  onLeafAction,
}: {
  items: NewContentMenuItem[];
  onLeafAction: () => void;
}) {
  return (
    <>
      {items.map((item) =>
        item.submenu ? (
          <NestedAddMenuButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            items={item.submenu}
            disabled={item.disabled}
            onLeafAction={onLeafAction}
          />
        ) : (
          <AddMenuButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            disabled={item.disabled}
            onClick={() => {
              item.onClick?.();
              onLeafAction();
            }}
          />
        )
      )}
    </>
  );
}

function RenameDialog({
  title,
  value,
  onChange,
  onCancel,
  onSubmit,
  submitting,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-white shadow-2xl">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        </div>
        <div className="px-4 py-4">
          <input
            autoFocus
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSubmit();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
              }
            }}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-500 focus:border-gold-primary/60"
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!value.trim() || submitting}
            onClick={onSubmit}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function hasPeopleDrag(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes(PEOPLE_DRAG_MIME);
}

function getPeopleDragPayload(event: React.DragEvent): PeopleDragPayload | null {
  const rawPayload = event.dataTransfer.getData(PEOPLE_DRAG_MIME);
  if (!rawPayload) return null;

  try {
    const parsed = JSON.parse(rawPayload) as PeopleDragPayload;
    if (parsed.kind === "person" && parsed.personId) return parsed;
    if (parsed.kind === "peopleGroup" && parsed.groupId) return parsed;
    return null;
  } catch {
    return null;
  }
}

function PeopleIcon({ kind }: { kind: "peopleGroup" | "person" }) {
  if (kind === "peopleGroup") {
    return <Folder className="h-4 w-4 shrink-0 text-gold-primary" />;
  }

  return <User className="h-4 w-4 shrink-0 text-blue-500" />;
}

function MountBadge({ mounted }: { mounted: boolean }) {
  if (!mounted) return null;

  return (
    <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
      Tree
    </span>
  );
}

function formatGroupSummary(group: PeopleTreeGroupNode): string {
  const parts = [
    `${group.people.length} ${group.people.length === 1 ? "person" : "people"}`,
    `${group.childGroups.length} ${group.childGroups.length === 1 ? "subgroup" : "subgroups"}`,
    `${group.contentCount} ${group.contentCount === 1 ? "item" : "items"}`,
  ];

  return parts.join(" · ");
}

function PeopleStateMessage({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <div className="mb-4">{icon}</div>
      <h3 className="mb-2 text-sm font-semibold text-gray-900">{title}</h3>
      <p className="max-w-xs text-xs leading-5 text-gray-500">{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-50"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function renderPeopleContentIcon(content: PeopleTreeContentNode, isOpen = false) {
  const iconSize = "h-4 w-4 shrink-0";
  const iconColor = content.iconColor || "text-gray-500";

  if (content.customIcon) {
    if (content.customIcon.startsWith("emoji:")) {
      return <span className="shrink-0 text-base">{content.customIcon.replace("emoji:", "")}</span>;
    }

    if (content.customIcon.startsWith("lucide:")) {
      const iconName = content.customIcon.replace("lucide:", "");
      const LucideIcon = (
        LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>
      )[iconName];
      if (LucideIcon) {
        return <LucideIcon className={`${iconSize} ${iconColor}`} />;
      }
    }
  }

  if (content.contentType === "folder") {
    return isOpen
      ? <FolderOpen className={`${iconSize} ${iconColor}`} />
      : <Folder className={`${iconSize} ${iconColor}`} />;
  }

  if (content.contentType === "file" && content.fileMimeType) {
    const mimeType = content.fileMimeType.toLowerCase();
    if (mimeType.startsWith("video/")) return <FileVideo className={`${iconSize} ${iconColor}`} />;
    if (mimeType.startsWith("audio/")) return <FileAudio className={`${iconSize} ${iconColor}`} />;
    if (mimeType.startsWith("image/")) return <FileImage className={`${iconSize} ${iconColor}`} />;
    if (mimeType === "application/json") return <Braces className={`${iconSize} ${iconColor}`} />;
    if (
      mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mimeType === "application/vnd.ms-excel" ||
      mimeType === "text/csv"
    ) {
      return <FileSpreadsheet className={`${iconSize} ${iconColor}`} />;
    }
    if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType === "application/msword"
    ) {
      return <FileText className={`${iconSize} ${iconColor}`} />;
    }
    if (mimeType === "application/pdf") return <FileType className={`${iconSize} ${iconColor}`} />;
    if (
      mimeType === "application/zip" ||
      mimeType === "application/x-zip-compressed" ||
      mimeType === "application/x-rar-compressed" ||
      mimeType === "application/x-7z-compressed" ||
      mimeType === "application/gzip" ||
      mimeType === "application/x-tar"
    ) {
      return <Archive className={`${iconSize} ${iconColor}`} />;
    }
  }

  switch (content.contentType) {
    case "note":
      return <FileText className={`${iconSize} ${iconColor}`} />;
    case "file":
      return <File className={`${iconSize} ${iconColor}`} />;
    case "html":
    case "template":
      return <FileCode className={`${iconSize} ${iconColor}`} />;
    case "code":
      return <Code className={`${iconSize} ${iconColor}`} />;
    case "external":
      return <ExternalLink className={`${iconSize} ${iconColor}`} />;
    case "chat":
      return <MessageCircle className={`${iconSize} ${iconColor}`} />;
    case "visualization":
      return <BarChart3 className={`${iconSize} ${iconColor}`} />;
    case "workflow":
      return <Network className={`${iconSize} ${iconColor}`} />;
    default:
      return <File className={`${iconSize} ${iconColor}`} />;
  }
}

function describePeopleContentType(contentType: string) {
  switch (contentType) {
    case "folder":
      return "Folder";
    case "note":
      return "Note";
    case "file":
      return "File";
    case "html":
      return "HTML";
    case "code":
      return "Code";
    default:
      return "Document";
  }
}

function findPersonPath(
  groups: PeopleTreeGroupNode[],
  personId: string,
  expandIds: string[] = []
): { expandIds: string[]; primaryGroupId: string; label: string } | null {
  for (const group of groups) {
    const nextExpandIds = [...expandIds, group.id];

    const person = group.people.find((entry) => entry.personId === personId);
    if (person) {
      return {
        expandIds: nextExpandIds,
        primaryGroupId: person.primaryGroupId,
        label: person.displayName,
      };
    }

    const childPath = findPersonPath(group.childGroups, personId, nextExpandIds);
    if (childPath) {
      return childPath;
    }
  }

  return null;
}
