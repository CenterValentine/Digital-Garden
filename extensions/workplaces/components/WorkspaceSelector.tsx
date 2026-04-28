"use client";

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as LucideIcons from "lucide-react";
import {
  Briefcase,
  Check,
  ChevronDown,
  Copy,
  Eye,
  Folder,
  GripVertical,
  Loader2,
  Lock,
  Plus,
  Settings,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/client/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/client/ui/dialog";
import { IconSelector } from "@/components/content/IconSelector";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/client/ui/popover";
import { Switch } from "@/components/client/ui/switch";
import { useWorkspaceStore } from "@/extensions/workplaces/state/workspace-store";
import { triggerMenuOpenSync } from "@/extensions/workplaces/state/workspace-sync";
import type { TreeNode } from "@/lib/domain/content/types";
import type { ContentWorkspaceResponse } from "@/extensions/workplaces/server";

interface FolderOption {
  id: string;
  title: string;
  path: string;
  parentId: string | null;
  contentType: string;
}

interface TreeApiResponse {
  success: boolean;
  data?: {
    tree: TreeNode[];
  };
  error?: {
    message: string;
  };
}

interface ClaimConflictItem {
  workspaceId: string;
  workspaceName: string;
  contentId: string;
  contentTitle: string;
  assignmentType: string;
  scope: string;
}

type BorrowPreset = "1h" | "3h" | "eod" | "custom";

function toDatetimeLocalValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function toDatetimeLocalPresetValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function fromDatetimeLocalValue(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function toIso(value: string) {
  return new Date(value).toISOString();
}

function borrowUntilForPreset(preset: BorrowPreset) {
  const date = new Date();

  if (preset === "1h") {
    date.setHours(date.getHours() + 1);
    return toDatetimeLocalPresetValue(date);
  }

  if (preset === "3h") {
    date.setHours(date.getHours() + 3);
    return toDatetimeLocalPresetValue(date);
  }

  if (preset === "eod") {
    const endOfDay = new Date();
    endOfDay.setHours(17, 0, 0, 0);
    if (endOfDay <= date) {
      endOfDay.setHours(23, 59, 0, 0);
    }
    return toDatetimeLocalPresetValue(endOfDay);
  }

  date.setHours(date.getHours() + 24);
  return toDatetimeLocalPresetValue(date);
}

const WORKSPACE_EXPIRATION_WARNINGS_DISABLED_KEY =
  "workspace-expiration-warnings-disabled";
const WORKSPACE_EXPIRATION_WARNING_SEEN_KEY =
  "workspace-expiration-warning-seen";
const WORKSPACE_EXPIRATION_WARNING_WINDOW_MS = 15 * 60 * 1000;
const WORKSPACE_DISASSEMBLE_WARNINGS_DISABLED_KEY =
  "workspace-disassemble-warnings-disabled";

function expirationWarningsDisabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(WORKSPACE_EXPIRATION_WARNINGS_DISABLED_KEY) === "true";
}

function setExpirationWarningsDisabled() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKSPACE_EXPIRATION_WARNINGS_DISABLED_KEY, "true");
}

function disassembleWarningsDisabled() {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(WORKSPACE_DISASSEMBLE_WARNINGS_DISABLED_KEY) ===
    "true"
  );
}

function setDisassembleWarningsDisabled() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKSPACE_DISASSEMBLE_WARNINGS_DISABLED_KEY, "true");
}

function getSeenExpirationWarnings() {
  if (typeof window === "undefined") return {} as Record<string, string>;
  const rawValue = window.localStorage.getItem(WORKSPACE_EXPIRATION_WARNING_SEEN_KEY);
  if (!rawValue) return {};
  try {
    return JSON.parse(rawValue) as Record<string, string>;
  } catch {
    return {};
  }
}

function markExpirationWarningSeen(workspaceId: string, expiresAt: string) {
  if (typeof window === "undefined") return;
  const seen = getSeenExpirationWarnings();
  seen[workspaceId] = expiresAt;
  window.localStorage.setItem(
    WORKSPACE_EXPIRATION_WARNING_SEEN_KEY,
    JSON.stringify(seen)
  );
}

function collectFolderOptions(nodes: TreeNode[], parentPath = "") {
  const folders: FolderOption[] = [];
  const nodesById: Record<string, FolderOption> = {};

  function visit(node: TreeNode, pathPrefix: string) {
    const path = pathPrefix ? `${pathPrefix} / ${node.title}` : node.title;
    nodesById[node.id] = {
      id: node.id,
      title: node.title,
      path,
      parentId: node.parentId,
      contentType: node.contentType,
    };

    if (node.contentType === "folder") {
      folders.push(nodesById[node.id]);
    }

    node.children.forEach((child) => visit(child, path));
  }

  nodes.forEach((node) => visit(node, parentPath));
  return { folders, nodesById };
}

function getWorkspaceDisplayName(workspace: ContentWorkspaceResponse | null) {
  return workspace?.name?.trim() || "";
}

function isWorkspaceNamePending(workspace: ContentWorkspaceResponse | null) {
  const name = workspace?.name?.trim() ?? "";
  return name.length === 0 || name === "Untitled Workspace";
}

function getWorkspaceIconValue(workspace: ContentWorkspaceResponse | null) {
  const icon = workspace?.settings.workspaceIcon;
  return typeof icon === "string" && icon.trim() ? icon.trim() : null;
}

function getWorkspaceDescription(workspace: ContentWorkspaceResponse | null) {
  const description = workspace?.settings.workspaceDescription;
  return typeof description === "string" && description.trim()
    ? description.trim()
    : "";
}

function normalizeSearchValue(value: string) {
  return value.toLowerCase().trim();
}

function scoreFolderOption(folder: FolderOption, query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return 1;

  const title = normalizeSearchValue(folder.title);
  const path = normalizeSearchValue(folder.path);
  const pathSegments = path.split("/").map((segment) => segment.trim());
  const words = path.split(/[\s/_-]+/).filter(Boolean);

  if (title === normalizedQuery) return 120;
  if (path === normalizedQuery) return 110;
  if (title.startsWith(normalizedQuery)) return 95;
  if (pathSegments.some((segment) => segment.startsWith(normalizedQuery))) return 85;
  if (words.some((word) => word.startsWith(normalizedQuery))) return 75;
  if (title.includes(normalizedQuery)) return 60;
  if (path.includes(normalizedQuery)) return 45;

  const letters = normalizedQuery.split("");
  let index = 0;
  for (const letter of letters) {
    index = path.indexOf(letter, index);
    if (index === -1) return 0;
    index += 1;
  }
  return 20;
}

function renderWorkspaceIcon(iconValue: string | null, className = "h-4 w-4") {
  if (iconValue?.startsWith("emoji:")) {
    return (
      <span className={`inline-flex items-center justify-center ${className}`}>
        {iconValue.replace("emoji:", "")}
      </span>
    );
  }

  if (iconValue?.startsWith("lucide:")) {
    const iconName = iconValue.replace("lucide:", "");
    const Icon = (LucideIcons as unknown as Record<string, unknown>)[iconName];
    if (Icon) {
      return createElement(Icon as never, { className });
    }
  }

  return createElement(Briefcase, { className, "aria-hidden": true });
}

function workspaceStateHasContent(
  workspace: ContentWorkspaceResponse,
  contentId: string
) {
  if (workspace.paneState.activeContentId === contentId) return true;

  return Object.values(workspace.paneState.paneTabContentIds ?? {}).some((pane) => {
    if (!pane) return false;
    return (
      pane.activeContentId === contentId ||
      (pane.contentIds ?? []).includes(contentId)
    );
  });
}

export function WorkspaceSelector() {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const activateWorkspace = useWorkspaceStore((state) => state.activateWorkspace);
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace);
  const duplicateWorkspace = useWorkspaceStore((state) => state.duplicateWorkspace);
  const updateWorkspace = useWorkspaceStore((state) => state.updateWorkspace);
  const reorderWorkspaces = useWorkspaceStore((state) => state.reorderWorkspaces);
  const archiveWorkspace = useWorkspaceStore((state) => state.archiveWorkspace);
  const assignContentToWorkspace = useWorkspaceStore(
    (state) => state.assignContentToWorkspace
  );
  const unassignContentFromWorkspace = useWorkspaceStore(
    (state) => state.unassignContentFromWorkspace
  );

  const activeWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
      workspaces.find((workspace) => workspace.isMain) ??
      null,
    [activeWorkspaceId, workspaces]
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"general" | "view">("general");
  const [settingsWorkspaceId, setSettingsWorkspaceId] = useState<string | null>(null);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftWorkspaceIcon, setDraftWorkspaceIcon] = useState<string | null>(null);
  const [draftIsView, setDraftIsView] = useState(false);
  const [draftViewRootContentId, setDraftViewRootContentId] = useState<string | null>(null);
  const [viewRootFolderQuery, setViewRootFolderQuery] = useState("");
  const [draftExpiresAt, setDraftExpiresAt] = useState("");
  const [folderOptions, setFolderOptions] = useState<FolderOption[]>([]);
  const [nodesById, setNodesById] = useState<Record<string, FolderOption>>({});
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [folderQuery, setFolderQuery] = useState("");
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [draggedWorkspaceId, setDraggedWorkspaceId] = useState<string | null>(null);
  const [dropTargetWorkspaceId, setDropTargetWorkspaceId] = useState<string | null>(null);
  const [deleteWorkspaceTarget, setDeleteWorkspaceTarget] =
    useState<ContentWorkspaceResponse | null>(null);
  const [duplicateWorkspaceTarget, setDuplicateWorkspaceTarget] =
    useState<ContentWorkspaceResponse | null>(null);
  const [workspaceContextMenu, setWorkspaceContextMenu] = useState<{
    workspace: ContentWorkspaceResponse;
    x: number;
    y: number;
  } | null>(null);
  const [claimConflictState, setClaimConflictState] = useState<{
    folderIds: string[];
    conflicts: ClaimConflictItem[];
  } | null>(null);
  const [claimBorrowPreset, setClaimBorrowPreset] = useState<BorrowPreset>("3h");
  const [claimBorrowUntil, setClaimBorrowUntil] = useState(() =>
    borrowUntilForPreset("3h")
  );
  const [claimResolutionInFlight, setClaimResolutionInFlight] = useState(false);
  const [rowBorrowConflictId, setRowBorrowConflictId] = useState<string | null>(null);
  const [rowBorrowPreset, setRowBorrowPreset] = useState<BorrowPreset>("1h");
  const [rowBorrowUntil, setRowBorrowUntil] = useState(() =>
    borrowUntilForPreset("1h")
  );
  const [workspaceIconSelector, setWorkspaceIconSelector] = useState<{
    open: boolean;
    triggerPosition: { x: number; y: number };
  }>({
    open: false,
    triggerPosition: { x: 0, y: 0 },
  });
  const [expirationWarningOpen, setExpirationWarningOpen] = useState(false);
  const [expirationWarningPreset, setExpirationWarningPreset] =
    useState<BorrowPreset>("1h");
  const [expirationWarningValue, setExpirationWarningValue] = useState(() =>
    borrowUntilForPreset("1h")
  );
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [skipDisassembleWarnings, setSkipDisassembleWarnings] = useState(false);
  const [skipExpirationWarnings, setSkipExpirationWarnings] = useState(false);
  const pendingWorkspaceRowActionRef = useRef<{
    workspaceId: string;
    action: "settings" | "delete";
  } | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const settingsInitKeyRef = useRef("");

  // Imperatively focus the rename input after Radix has released focus management.
  // autoFocus alone is unreliable here because createWorkspace is async and the
  // dropdown may still be in Radix's open animation when the input first mounts.
  useEffect(() => {
    if (!editingWorkspaceId) return;
    const raf = requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [editingWorkspaceId]);

  const recursiveFolderClaims = useMemo(
    () =>
      (
        workspaces.find((workspace) => workspace.id === settingsWorkspaceId) ??
        activeWorkspace
      )?.items.filter((item) => item.scope === "recursive") ?? [],
    [activeWorkspace, settingsWorkspaceId, workspaces]
  );
  const settingsWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === settingsWorkspaceId) ??
      activeWorkspace,
    [activeWorkspace, settingsWorkspaceId, workspaces]
  );
  const settingsWorkspaceIsActive = settingsWorkspace?.id === activeWorkspace?.id;
  const recursiveClaimIds = useMemo(
    () => new Set(recursiveFolderClaims.map((item) => item.contentId)),
    [recursiveFolderClaims]
  );

  const manualClaimsDisabledReason = useMemo(() => {
    if (!settingsWorkspace) return "No workspace selected.";
    if (settingsWorkspace.isMain) {
      return "Main Workspace is the catchall workspace and cannot reserve folders.";
    }
    if (!draftIsView || !draftViewRootContentId) {
      return "Enable view and select a root folder before adding exceptions.";
    }
    if (foldersLoading) return "Folder list is still loading.";
    if (folderOptions.length === 0) return "No folders are available.";
    return null;
  }, [settingsWorkspace, draftIsView, draftViewRootContentId, folderOptions.length, foldersLoading]);

  const manualClaimsDisabled = Boolean(manualClaimsDisabledReason);

  const filteredFolderOptions = useMemo(() => {
    const query = normalizeSearchValue(folderQuery);
    return folderOptions
      .filter((folder) => !recursiveClaimIds.has(folder.id))
      .map((folder) => ({ folder, score: scoreFolderOption(folder, query) }))
      .filter((result) => result.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.folder.path.localeCompare(b.folder.path);
      })
      .map((result) => result.folder);
  }, [folderOptions, folderQuery, recursiveClaimIds]);

  const orderedWorkspaceIds = useMemo(
    () => workspaces.filter((workspace) => !workspace.isMain).map((workspace) => workspace.id),
    [workspaces]
  );

  useEffect(() => {
    if (!settingsOpen || !settingsWorkspace) return;
    // Re-initialize only when the dialog opens or the target workspace changes —
    // NOT when background sync refreshes the workspace object reference.
    const initKey = `${settingsWorkspace.id}:${String(settingsOpen)}`;
    if (settingsInitKeyRef.current === initKey) return;
    settingsInitKeyRef.current = initKey;

    const workspaceIcon = getWorkspaceIconValue(settingsWorkspace);
    setDraftName(settingsWorkspace.name);
    setDraftDescription(getWorkspaceDescription(settingsWorkspace));
    setDraftWorkspaceIcon(workspaceIcon);
    setDraftIsView(settingsWorkspace.isView);
    setDraftViewRootContentId(settingsWorkspace.viewRootContentId);
    setViewRootFolderQuery("");
    setDraftExpiresAt(toDatetimeLocalValue(settingsWorkspace.expiresAt));
  }, [settingsOpen, settingsWorkspace]);

  useEffect(() => {
    if (!activeWorkspace || activeWorkspace.isMain || !activeWorkspace.expiresAt) return;
    if (expirationWarningsDisabled()) return;

    const expiresAtMs = new Date(activeWorkspace.expiresAt).getTime();
    if (Number.isNaN(expiresAtMs)) return;

    const remainingMs = expiresAtMs - Date.now();
    if (remainingMs <= 0 || remainingMs > WORKSPACE_EXPIRATION_WARNING_WINDOW_MS) {
      return;
    }

    const seen = getSeenExpirationWarnings();
    if (seen[activeWorkspace.id] === activeWorkspace.expiresAt) {
      return;
    }

    setExpirationWarningPreset("1h");
    setExpirationWarningValue(borrowUntilForPreset("1h"));
    setExpirationWarningOpen(true);
    markExpirationWarningSeen(activeWorkspace.id, activeWorkspace.expiresAt);
  }, [activeWorkspace]);

  useEffect(() => {
    if (!workspaceContextMenu) return;

    const closeMenu = () => setWorkspaceContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("contextmenu", closeMenu);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("contextmenu", closeMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [workspaceContextMenu]);

  useEffect(() => {
    if (!settingsOpen || folderOptions.length > 0) return;

    let cancelled = false;
    setFoldersLoading(true);

    fetch("/api/content/content/tree", { credentials: "include" })
      .then(async (response) => {
        const result = (await response.json()) as TreeApiResponse;
        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error?.message ?? "Failed to load folders");
        }
        return collectFolderOptions(result.data.tree);
      })
      .then(({ folders, nodesById: nextNodesById }) => {
        if (cancelled) return;
        setFolderOptions(folders);
        setNodesById(nextNodesById);
        setSelectedFolderId((current) => current || folders[0]?.id || "");
      })
      .catch((error) => {
        console.error("[WorkspaceSelector] Failed to load folders:", error);
        toast.error(error instanceof Error ? error.message : "Failed to load folders");
      })
      .finally(() => {
        if (!cancelled) setFoldersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [folderOptions.length, settingsOpen]);

  useEffect(() => {
    if (!claimConflictState) return;
    if (claimResolutionInFlight) return;
    if (claimConflictState.conflicts.length === 0) {
      setRowBorrowConflictId(null);
      setClaimConflictState(null);
    }
  }, [claimConflictState, claimResolutionInFlight]);

  const closeClaimConflictDialog = () => {
    if (claimResolutionInFlight) return;
    setClaimConflictState(null);
  };

  const openWorkspaceSettings = (
    workspaceId: string,
    tab: "general" | "view" = "general"
  ) => {
    setMenuOpen(false);
    window.setTimeout(() => {
      setSettingsWorkspaceId(workspaceId);
      setSettingsTab(tab);
      setSettingsOpen(true);
    }, 0);
  };

  const buildWorkspaceTitle = (workspace: ContentWorkspaceResponse) => {
    const description = getWorkspaceDescription(workspace);
    return description ? `${workspace.name}\n${description}` : workspace.name;
  };

  const renderWorkspaceName = (
    workspace: ContentWorkspaceResponse | null,
    className: string
  ) => {
    if (!workspace || isWorkspaceNamePending(workspace)) {
      return (
        <span
          className={`inline-block h-[0.9em] rounded-full bg-black/10 animate-pulse dark:bg-white/10 ${className}`}
        />
      );
    }

    return <span className={className}>{getWorkspaceDisplayName(workspace)}</span>;
  };

  const openWorkspaceIconPicker = (target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    setWorkspaceIconSelector({
      open: true,
      triggerPosition: { x: rect.left, y: rect.bottom + 6 },
    });
  };

  const isNodeWithinFolder = useCallback((nodeId: string, folderId: string) => {
    let currentId: string | null = nodeId;
    while (currentId) {
      if (currentId === folderId) return true;
      currentId = nodesById[currentId]?.parentId ?? null;
    }
    return false;
  }, [nodesById]);

  const foldersOverlap = useCallback((
    existingContentId: string,
    existingScope: string,
    candidateFolderId: string
  ) => {
    if (isNodeWithinFolder(existingContentId, candidateFolderId)) return true;
    if (existingScope === "recursive" && isNodeWithinFolder(candidateFolderId, existingContentId)) {
      return true;
    }
    return false;
  }, [isNodeWithinFolder]);

  const buildClaimConflicts = useCallback((folderIds: string[]) => {
    if (!settingsWorkspace) return [];

    const currentWorkspaceItemIds = new Set(
      settingsWorkspace.items.map((item) => item.contentId)
    );
    const conflicts = new Map<string, ClaimConflictItem>();

    workspaces
      .filter((workspace) => workspace.id !== settingsWorkspace.id)
      .forEach((workspace) => {
        workspace.items.forEach((item) => {
          const isLivePrimaryItemClaim =
            item.assignmentType === "primary" &&
            item.scope === "item" &&
            workspaceStateHasContent(workspace, item.contentId);

          if (
            item.assignmentType === "primary" &&
            item.scope === "item" &&
            !isLivePrimaryItemClaim
          ) {
            return;
          }

          if (currentWorkspaceItemIds.has(item.contentId)) return;
          if (
            !folderIds.some((folderId) =>
              foldersOverlap(item.contentId, item.scope, folderId)
            )
          ) {
            return;
          }

          const key = `${workspace.id}:${item.contentId}`;
          if (!conflicts.has(key)) {
            conflicts.set(key, {
              workspaceId: workspace.id,
              workspaceName: workspace.name,
              contentId: item.contentId,
              contentTitle: item.content.title,
              assignmentType: item.assignmentType,
              scope: item.scope,
            });
          }
        });
      });

    return [...conflicts.values()].sort((a, b) => {
      const workspaceCompare = a.workspaceName.localeCompare(b.workspaceName);
      if (workspaceCompare !== 0) return workspaceCompare;
      return a.contentTitle.localeCompare(b.contentTitle);
    });
  }, [foldersOverlap, settingsWorkspace, workspaces]);

  useEffect(() => {
    if (!claimConflictState || !settingsWorkspace || claimResolutionInFlight) return;

    const nextConflicts = buildClaimConflicts(claimConflictState.folderIds);
    const currentSignature = claimConflictState.conflicts
      .map((conflict) => `${conflict.workspaceId}:${conflict.contentId}:${conflict.assignmentType}:${conflict.scope}`)
      .join("|");
    const nextSignature = nextConflicts
      .map((conflict) => `${conflict.workspaceId}:${conflict.contentId}:${conflict.assignmentType}:${conflict.scope}`)
      .join("|");

    if (currentSignature === nextSignature) return;

    if (nextConflicts.length === 0) {
      setClaimConflictState((current) =>
        current
          ? {
              ...current,
              conflicts: [],
            }
          : current
      );
      toast.success("Conflicts cleared. Apply the claim when you are ready.");
      return;
    }

    setClaimConflictState((current) =>
      current
        ? {
            ...current,
            conflicts: nextConflicts,
          }
        : current
    );
  }, [buildClaimConflicts, claimConflictState, claimResolutionInFlight, settingsWorkspace]);

  const applyFolderClaims = async (folderIds: string[]) => {
    if (!settingsWorkspace || settingsWorkspace.isMain) return;

    const uniqueFolderIds = Array.from(new Set(folderIds)).filter(Boolean);
    for (const folderId of uniqueFolderIds) {
      await assignContentToWorkspace(settingsWorkspace.id, folderId, {
        assignmentType: "primary",
        scope: "recursive",
      });
    }

    await updateWorkspace(settingsWorkspace.id, {
      isLocked: uniqueFolderIds.length > 0 || recursiveFolderClaims.length > 0,
    });
  };

  const queueClaimFlow = async (folderIds: string[]) => {
    if (!settingsWorkspace || settingsWorkspace.isMain) return false;

    const uniqueFolderIds = Array.from(new Set(folderIds)).filter(Boolean);
    if (uniqueFolderIds.length === 0) return false;

    const conflicts = buildClaimConflicts(uniqueFolderIds);
    if (conflicts.length > 0) {
      setClaimBorrowPreset("3h");
      setClaimBorrowUntil(borrowUntilForPreset("3h"));
      setClaimConflictState({
        folderIds: uniqueFolderIds,
        conflicts,
      });
      return false;
    }

    await applyFolderClaims(uniqueFolderIds);
    return true;
  };

  const resolveClaimConflicts = async (
    assignmentType: "shared" | "borrowed" | "primary"
  ) => {
    if (!settingsWorkspace || !claimConflictState || claimResolutionInFlight) return;

    setClaimResolutionInFlight(true);

    const expiresAt =
      assignmentType === "borrowed" ? toIso(claimBorrowUntil) : undefined;

    try {
      for (const conflict of claimConflictState.conflicts) {
        await assignContentToWorkspace(settingsWorkspace.id, conflict.contentId, {
          assignmentType,
          scope: conflict.scope === "recursive" ? "recursive" : "item",
          expiresAt,
          moveFromWorkspaceId:
            assignmentType === "primary" ? conflict.workspaceId : undefined,
        });
      }

      await applyFolderClaims(claimConflictState.folderIds);
      setClaimConflictState(null);
    } finally {
      setClaimResolutionInFlight(false);
    }
  };

  const resolveSingleClaimConflict = async (
    conflict: ClaimConflictItem,
    resolution: "split" | "reassign"
  ) => {
    if (!settingsWorkspace || claimResolutionInFlight) return;

    setClaimResolutionInFlight(true);
    try {
      await assignContentToWorkspace(settingsWorkspace.id, conflict.contentId, {
        assignmentType: resolution === "split" ? "shared" : "primary",
        scope: conflict.scope === "recursive" ? "recursive" : "item",
        moveFromWorkspaceId:
          resolution === "reassign" ? conflict.workspaceId : undefined,
      });

      toast.success(
        resolution === "split"
          ? `${conflict.contentTitle} is now shared`
          : `${conflict.contentTitle} was reassigned here`
      );
    } catch (error) {
      console.error("[WorkspaceSelector] Failed to resolve claim conflict:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to resolve claim conflict"
      );
    } finally {
      setClaimResolutionInFlight(false);
    }
  };

  const applyPendingClaimAfterResolution = async () => {
    if (!claimConflictState || claimResolutionInFlight) return;

    setClaimResolutionInFlight(true);
    try {
      await applyFolderClaims(claimConflictState.folderIds);
      setClaimConflictState(null);
      toast.success("Claim applied");
    } catch (error) {
      console.error("[WorkspaceSelector] Failed to apply claim after resolution:", error);
      toast.error(error instanceof Error ? error.message : "Failed to apply claim");
    } finally {
      setClaimResolutionInFlight(false);
    }
  };

  const handleRowBorrowPreset = (preset: BorrowPreset) => {
    setRowBorrowPreset(preset);
    if (preset !== "custom") {
      setRowBorrowUntil(borrowUntilForPreset(preset));
    }
  };

  const borrowSingleClaimConflict = async (conflict: ClaimConflictItem) => {
    if (!settingsWorkspace || claimResolutionInFlight) return;

    setClaimResolutionInFlight(true);
    try {
      await assignContentToWorkspace(settingsWorkspace.id, conflict.contentId, {
        assignmentType: "borrowed",
        scope: conflict.scope === "recursive" ? "recursive" : "item",
        expiresAt: toIso(rowBorrowUntil),
      });
      setRowBorrowConflictId(null);
      toast.success(`${conflict.contentTitle} was borrowed temporarily`);
    } catch (error) {
      console.error("[WorkspaceSelector] Failed to borrow claim conflict:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to borrow claim conflict"
      );
    } finally {
      setClaimResolutionInFlight(false);
    }
  };

  const startInlineRename = (workspace: ContentWorkspaceResponse) => {
    setMenuOpen(true);
    setEditingWorkspaceId(workspace.id);
    setEditingName(workspace.name === "Untitled Workspace" ? "" : workspace.name);
  };

  const commitInlineRename = async () => {
    if (!editingWorkspaceId) return;
    const workspace = workspaces.find((candidate) => candidate.id === editingWorkspaceId);
    const nextName = editingName.trim();
    setEditingWorkspaceId(null);
    if (!workspace || !nextName || nextName === workspace.name) return;

    try {
      await updateWorkspace(workspace.id, { name: nextName });
      toast.success("Workspace renamed");
    } catch (error) {
      console.error("[WorkspaceSelector] Failed to rename workspace:", error);
      toast.error(error instanceof Error ? error.message : "Failed to rename workspace");
    }
  };

  const handleCreateWorkspace = async () => {
    try {
      const workspace = await createWorkspace("");
      setMenuOpen(true);
      startInlineRename(workspace);
      toast.success("Workspace created");
    } catch (error) {
      console.error("[WorkspaceSelector] Failed to create workspace:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create workspace");
    }
  };

  const requestCreateWorkspace = () => {
    void handleCreateWorkspace();
  };

  const handleDuplicateWorkspace = async () => {
    if (!duplicateWorkspaceTarget) return;

    try {
      const workspace = await duplicateWorkspace(duplicateWorkspaceTarget.id);
      setDuplicateWorkspaceTarget(null);
      setMenuOpen(true);
      startInlineRename(workspace);
      toast.success("Workspace duplicated");
    } catch (error) {
      console.error("[WorkspaceSelector] Failed to duplicate workspace:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to duplicate workspace"
      );
    }
  };

  const handleExpirationWarningPreset = (preset: BorrowPreset) => {
    setExpirationWarningPreset(preset);
    if (preset !== "custom") {
      setExpirationWarningValue(borrowUntilForPreset(preset));
    }
  };

  const handleUpdateExpirationFromWarning = async (expiresAt: string | null) => {
    if (!activeWorkspace || activeWorkspace.isMain) return;

    try {
      await updateWorkspace(activeWorkspace.id, { expiresAt });
      setExpirationWarningOpen(false);
      toast.success(expiresAt ? "Workspace expiration updated" : "Workspace expiration cleared");
    } catch (error) {
      console.error("[WorkspaceSelector] Failed to update workspace expiration:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update expiration"
      );
    }
  };

  const handleWorkspaceDrop = (targetWorkspaceId: string) => {
    if (!draggedWorkspaceId || draggedWorkspaceId === targetWorkspaceId) {
      setDraggedWorkspaceId(null);
      setDropTargetWorkspaceId(null);
      return;
    }

    const nextOrder = [...orderedWorkspaceIds];
    const fromIndex = nextOrder.indexOf(draggedWorkspaceId);
    const toIndex = nextOrder.indexOf(targetWorkspaceId);
    if (fromIndex === -1 || toIndex === -1) return;

    const [movedWorkspaceId] = nextOrder.splice(fromIndex, 1);
    nextOrder.splice(toIndex, 0, movedWorkspaceId);
    setDraggedWorkspaceId(null);
    setDropTargetWorkspaceId(null);

    void reorderWorkspaces(nextOrder).catch((error) => {
      console.error("[WorkspaceSelector] Failed to reorder workspaces:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save workspace order"
      );
    });
  };

  const handleSaveSettings = async () => {
    if (!settingsWorkspace) return;
    if (draftIsView && !draftViewRootContentId) {
      toast.error("Select a view root folder before saving.");
      return;
    }
    setIsSavingSettings(true);
    try {
      await updateWorkspace(settingsWorkspace.id, {
        name: draftName,
        expiresAt: fromDatetimeLocalValue(draftExpiresAt),
        viewRootContentId: draftIsView ? draftViewRootContentId : null,
        settings: {
          ...settingsWorkspace.settings,
          workspaceDescription: draftDescription.trim() || null,
          workspaceIcon: draftWorkspaceIcon,
        },
      });
      setSettingsOpen(false);
      toast.success("Workspace settings saved");
    } catch (error) {
      console.error("[WorkspaceSelector] Failed to save workspace settings:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save workspace settings"
      );
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleArchiveWorkspace = async () => {
    if (!settingsWorkspace || settingsWorkspace.isMain) return;
    try {
      await archiveWorkspace(settingsWorkspace.id);
      setSettingsOpen(false);
      toast.success("Workspace disassembled");
    } catch (error) {
      console.error("[WorkspaceSelector] Failed to disassemble workspace:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to disassemble workspace"
      );
    }
  };

  const confirmArchiveWorkspace = async () => {
    if (!settingsWorkspace || settingsWorkspace.isMain) return;
    if (disassembleWarningsDisabled()) {
      await handleArchiveWorkspace();
      return;
    }
    setDeleteWorkspaceTarget(settingsWorkspace);
  };

  const handleAddManualFolderClaim = async (folderId = selectedFolderId) => {
    if (!folderId) return;
    if (recursiveClaimIds.has(folderId)) {
      toast.info("That folder is already claimed in this workspace");
      return;
    }
    try {
      const applied = await queueClaimFlow([folderId]);
      if (applied) {
        toast.success("Folder claimed");
      }
    } catch (error) {
      console.error("[WorkspaceSelector] Failed to claim folder:", error);
      toast.error(error instanceof Error ? error.message : "Failed to claim folder");
    }
  };

  const handleRemoveFolderClaim = async (folderId: string) => {
    if (!settingsWorkspace) return;
    try {
      await unassignContentFromWorkspace(settingsWorkspace.id, folderId);
      toast.success("Folder claim removed");
    } catch (error) {
      console.error("[WorkspaceSelector] Failed to remove folder claim:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to remove folder claim"
      );
    }
  };

  return (
    <>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open);
          if (open) triggerMenuOpenSync();
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-black/5 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
            title={getWorkspaceDescription(activeWorkspace) || "Choose workspace"}
          >
            {switchingWorkspaceId ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              renderWorkspaceIcon(getWorkspaceIconValue(activeWorkspace), "h-3.5 w-3.5")
            )}
            {renderWorkspaceName(activeWorkspace, "max-w-36 truncate")}
            {activeWorkspace?.isLocked ? <Lock className="h-3 w-3" /> : null}
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          className="min-w-72 border-white/10 bg-white/95 text-gray-900 shadow-lg backdrop-blur-sm dark:bg-gray-900/95 dark:text-gray-100"
        >
          <DropdownMenuLabel className="text-xs uppercase tracking-[0.18em] text-gray-500">
            Workspaces
          </DropdownMenuLabel>

          {workspaces.map((workspace) => {
            const isActive = workspace.id === activeWorkspace?.id;
            const isEditing = workspace.id === editingWorkspaceId;
            const isDragged = workspace.id === draggedWorkspaceId;
            const isDropTarget = workspace.id === dropTargetWorkspaceId;

            return (
              <DropdownMenuItem
                key={workspace.id}
                draggable={!workspace.isMain && !isEditing}
                title={buildWorkspaceTitle(workspace)}
                onDragStart={(event) => {
                  if (workspace.isMain || isEditing) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", workspace.id);
                  setDraggedWorkspaceId(workspace.id);
                }}
                onDragOver={(event) => {
                  if (workspace.isMain || !draggedWorkspaceId) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropTargetWorkspaceId(workspace.id);
                }}
                onDragLeave={() => {
                  if (dropTargetWorkspaceId === workspace.id) {
                    setDropTargetWorkspaceId(null);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!workspace.isMain) {
                    handleWorkspaceDrop(workspace.id);
                  }
                }}
                onDragEnd={() => {
                  setDraggedWorkspaceId(null);
                  setDropTargetWorkspaceId(null);
                }}
                onContextMenu={(event) => {
                  if (workspace.isMain || isEditing) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setWorkspaceContextMenu({
                    workspace,
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
                onSelect={(event) => {
                  event.preventDefault();
                  const pendingRowAction = pendingWorkspaceRowActionRef.current;
                  pendingWorkspaceRowActionRef.current = null;
                  if (
                    pendingRowAction &&
                    pendingRowAction.workspaceId === workspace.id
                  ) {
                    if (pendingRowAction.action === "settings") {
                      openWorkspaceSettings(workspace.id, "general");
                    }
                    if (pendingRowAction.action === "delete") {
                      setWorkspaceContextMenu(null);
                      setDeleteWorkspaceTarget(workspace);
                    }
                    return;
                  }
                  if (isEditing) return;
                  setWorkspaceContextMenu(null);
                  setSwitchingWorkspaceId(workspace.id);
                  setMenuOpen(false);
                  void activateWorkspace(workspace.id)
                    .catch((error) => {
                      console.error("[WorkspaceSelector] Failed to switch workspace:", error);
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Failed to switch workspace"
                      );
                    })
                    .finally(() => {
                      setSwitchingWorkspaceId((current) =>
                        current === workspace.id ? null : current
                      );
                    });
                }}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  startInlineRename(workspace);
                }}
                className={`group gap-2 pr-2 ${
                  workspace.isView
                    ? `border-l-2 pl-1 ${isActive ? "border-gold-primary" : "border-gold-primary/35"}`
                    : "pl-1.5"
                } ${
                  isActive ? "bg-gold-primary/10 text-gold-primary" : ""
                } ${isDragged ? "opacity-40" : ""} ${
                  isDropTarget ? "ring-1 ring-gold-primary/40" : ""
                }`}
              >
                {isEditing ? (
                  <input
                    ref={renameInputRef}
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onBlur={() => void commitInlineRename()}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void commitInlineRename();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setEditingWorkspaceId(null);
                      }
                    }}
                    className="min-w-0 flex-1 rounded border border-gold-primary/40 bg-white/80 px-2 py-1 text-sm outline-none dark:bg-white/10"
                  />
                ) : (
                  <>
                    <span className="inline-flex h-4 w-4 items-center justify-center">
                      {renderWorkspaceIcon(getWorkspaceIconValue(workspace), "h-4 w-4")}
                    </span>

                    {renderWorkspaceName(workspace, "min-w-0 flex-1 truncate")}
                    {workspace.isView ? (
                      <Eye className="h-3 w-3 shrink-0 text-gold-primary/70" />
                    ) : null}
                    {isActive ? <Check className="h-4 w-4 shrink-0" /> : null}
                    {workspace.isLocked ? (
                      <Lock className="h-3 w-3 shrink-0 text-gray-400/80" />
                    ) : null}
                    <button
                      type="button"
                      data-workspace-settings="true"
                      onPointerDown={(event) => {
                        pendingWorkspaceRowActionRef.current = {
                          workspaceId: workspace.id,
                          action: "settings",
                        };
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      className="rounded p-0.5 text-gray-400/80 transition-colors hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
                      aria-label={`Open ${workspace.name} settings`}
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </button>

                    {!workspace.isMain ? (
                      <>
                        <button
                          type="button"
                          data-workspace-delete="true"
                          onPointerDown={(event) => {
                            pendingWorkspaceRowActionRef.current = {
                              workspaceId: workspace.id,
                              action: "delete",
                            };
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          className={`rounded p-0.5 opacity-0 transition-colors group-hover:opacity-100 group-focus:opacity-100 ${
                            isActive
                              ? "text-white hover:bg-gold-primary/15 hover:text-white"
                              : "text-gray-500 hover:bg-red-500/10 hover:text-red-600"
                          }`}
                          aria-label={`Delete ${workspace.name}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <GripVertical className="ml-0.5 h-4 w-4 shrink-0 cursor-grab text-gray-400 active:cursor-grabbing" />
                      </>
                    ) : null}
                  </>
                )}
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              requestCreateWorkspace();
            }}
          >
            <Plus className="h-4 w-4" />
            <span>New workspace</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {workspaceContextMenu ? (
        <div
          data-workspace-context="true"
          className="fixed z-[70] min-w-52 overflow-hidden rounded-xl border border-white/10 bg-white/95 p-1 text-sm text-gray-900 shadow-2xl backdrop-blur-sm dark:bg-gray-950/95 dark:text-white"
          style={{
            left: workspaceContextMenu.x,
            top: workspaceContextMenu.y,
          }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => {
              setDuplicateWorkspaceTarget(workspaceContextMenu.workspace);
              setWorkspaceContextMenu(null);
            }}
          >
            <Copy className="h-4 w-4" />
            <span>Duplicate this workspace</span>
          </button>
        </div>
      ) : null}

      <Dialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) {
            setSettingsWorkspaceId(null);
            setWorkspaceIconSelector({
              open: false,
              triggerPosition: { x: 0, y: 0 },
            });
          }
        }}
      >
        <DialogContent className="max-w-xl border-white/10 bg-white/95 text-gray-900 shadow-xl backdrop-blur-sm dark:bg-gray-950/95 dark:text-white">
          <DialogHeader>
            <DialogTitle>Workspace Settings</DialogTitle>
            <DialogDescription>
              Rename this workspace, set when it disassembles, and configure view settings.
            </DialogDescription>
          </DialogHeader>

          {settingsWorkspace ? (
            <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={(event) => openWorkspaceIconPicker(event.currentTarget)}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white/70 text-gray-900 transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                    aria-label="Choose workspace icon"
                  >
                    {renderWorkspaceIcon(draftWorkspaceIcon, "h-5 w-5")}
                  </button>
                  <IconSelector
                    isOpen={workspaceIconSelector.open}
                    onClose={() =>
                      setWorkspaceIconSelector({
                        open: false,
                        triggerPosition: { x: 0, y: 0 },
                      })
                    }
                    onSelectIcon={(icon) => {
                      setDraftWorkspaceIcon(icon);
                      setWorkspaceIconSelector({
                        open: false,
                        triggerPosition: { x: 0, y: 0 },
                      });
                    }}
                    currentIcon={draftWorkspaceIcon}
                    triggerPosition={workspaceIconSelector.triggerPosition}
                    disablePortal
                    inlineAnchor
                  />
                </div>
                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-black/10 bg-white/70 px-3 py-2 text-sm outline-none focus:border-gold-primary dark:border-white/10 dark:bg-white/5"
                  aria-label="Workspace name"
                />
                {draftWorkspaceIcon ? (
                  <button
                    type="button"
                    onClick={() => setDraftWorkspaceIcon(null)}
                    className="rounded-md border border-black/10 px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-2 rounded-md border border-black/10 bg-black/[0.025] p-1 text-sm dark:border-white/10 dark:bg-white/[0.04]">
                <button
                  type="button"
                  onClick={() => setSettingsTab("general")}
                  className={`rounded px-3 py-2 transition-colors ${
                    settingsTab === "general"
                      ? "bg-white text-gold-primary shadow-sm dark:bg-white/10"
                      : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  Workspace
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsTab("view")}
                  className={`rounded px-3 py-2 transition-colors ${
                    settingsTab === "view"
                      ? "bg-white text-gold-primary shadow-sm dark:bg-white/10"
                      : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  View
                </button>
              </div>

              {settingsTab === "general" ? (
                <div className="space-y-4">
                  <label className="block text-sm font-medium">
                    Description
                    <textarea
                      value={draftDescription}
                      onChange={(event) => setDraftDescription(event.target.value)}
                      rows={3}
                      placeholder="Optional workspace description shown on hover."
                      className="mt-1 w-full rounded-md border border-black/10 bg-white/70 px-3 py-2 text-sm outline-none focus:border-gold-primary dark:border-white/10 dark:bg-white/5"
                    />
                  </label>

                  <label className="block text-sm font-medium">
                    Expiration (optional)
                    <input
                      type="datetime-local"
                      value={draftExpiresAt}
                      disabled={settingsWorkspace.isMain || isSavingSettings}
                      onChange={(event) => setDraftExpiresAt(event.target.value)}
                      className="mt-1 w-full rounded-md border border-black/10 bg-white/70 px-3 py-2 text-sm outline-none focus:border-gold-primary disabled:opacity-50 dark:border-white/10 dark:bg-white/5"
                    />
                  </label>

                  <div className="rounded-md border border-black/10 bg-black/[0.025] px-3 py-2 text-xs text-gray-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400">
                    Expiration closes out a workspace at the time of expiration. Workspace sessions cannot be recovered. You will be warned when a tab or workspace expires.
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {!settingsWorkspace.isMain && (
                    <div className="overflow-hidden rounded-md border border-black/10 dark:border-white/10 text-sm">
                      <div className="flex items-start justify-between gap-4 border-b border-black/10 p-3 dark:border-white/10">
                        <div>
                          <div className="font-medium">Enable as View</div>
                          <div className="text-xs text-gray-500">
                            Restricts the file tree to a specific folder. Opening files outside that tree will require a borrow or share decision.
                          </div>
                        </div>
                        <Switch
                          checked={draftIsView}
                          disabled={isSavingSettings}
                          onCheckedChange={(checked) => {
                            setDraftIsView(Boolean(checked));
                            if (!checked) setDraftViewRootContentId(null);
                          }}
                        />
                      </div>

                      {draftIsView && (
                        <div className="space-y-2 border-b border-black/10 p-3 dark:border-white/10">
                          <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                            View root folder
                          </div>
                          {draftViewRootContentId ? (
                            <div className="flex items-center justify-between gap-2 rounded-md border border-gold-primary/30 bg-gold-primary/5 px-3 py-2 text-xs">
                              <span className="truncate font-medium text-gold-primary">
                                {folderOptions.find((f) => f.id === draftViewRootContentId)?.path ??
                                  settingsWorkspace.viewRoot?.title ??
                                  "Selected folder"}
                              </span>
                              <button
                                type="button"
                                onClick={() => setDraftViewRootContentId(null)}
                                className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <input
                                type="text"
                                placeholder="Search folders…"
                                value={viewRootFolderQuery}
                                onChange={(e) => setViewRootFolderQuery(e.target.value)}
                                className="w-full rounded-md border border-black/10 bg-white/70 px-3 py-2 text-xs outline-none focus:border-gold-primary dark:border-white/10 dark:bg-white/5"
                              />
                              <div className="max-h-40 overflow-y-auto rounded-md border border-black/10 dark:border-white/10">
                                {folderOptions
                                  .filter(
                                    (f) =>
                                      !viewRootFolderQuery ||
                                      f.path.toLowerCase().includes(viewRootFolderQuery.toLowerCase())
                                  )
                                  .slice(0, 20)
                                  .map((folder) => (
                                    <button
                                      key={folder.id}
                                      type="button"
                                      onClick={() => {
                                        setDraftViewRootContentId(folder.id);
                                        setViewRootFolderQuery("");
                                      }}
                                      className="block w-full truncate px-3 py-2 text-left text-xs hover:bg-black/5 dark:hover:bg-white/5"
                                    >
                                      {folder.path}
                                    </button>
                                  ))}
                                {folderOptions.filter(
                                  (f) =>
                                    !viewRootFolderQuery ||
                                    f.path.toLowerCase().includes(viewRootFolderQuery.toLowerCase())
                                ).length === 0 && (
                                  <div className="px-3 py-2 text-xs text-gray-400">No folders found</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="overflow-hidden rounded-md border border-black/10 text-sm dark:border-white/10">
                    <div className="space-y-3 p-3">
                    <div>
                      <div className="font-medium">View Exceptions</div>
                      <div className="text-xs text-gray-500">
                        Assign specific folders that are excluded from the view root restriction. Exceptions are recursive.
                      </div>
                    </div>

                    {manualClaimsDisabledReason ? (
                      <div className="rounded-md border border-gold-primary/20 bg-gold-primary/10 px-3 py-2 text-xs text-gold-primary">
                        {manualClaimsDisabledReason}
                      </div>
                    ) : null}

                    <input
                      value={folderQuery}
                      disabled={manualClaimsDisabled}
                      title={manualClaimsDisabledReason ?? "Search folders"}
                      onChange={(event) => setFolderQuery(event.target.value)}
                      placeholder="Search folders..."
                      className="w-full rounded-md border border-black/10 bg-white/70 px-3 py-2 text-xs outline-none focus:border-gold-primary disabled:opacity-50 dark:border-white/10 dark:bg-white/5"
                    />

                    <div
                      className={`overflow-hidden rounded-md border border-black/10 bg-white/70 text-xs dark:border-white/10 dark:bg-white/5 ${
                        manualClaimsDisabled ? "opacity-50" : ""
                      }`}
                      title={manualClaimsDisabledReason ?? "Click a folder to add a claim"}
                    >
                      <div className="max-h-40 overflow-y-auto">
                        {filteredFolderOptions.length === 0 ? (
                          <div className="px-3 py-2 text-gray-500">
                            {folderOptions.length === 0
                              ? "No folders available"
                              : "No folders match your search"}
                          </div>
                        ) : (
                          filteredFolderOptions.slice(0, 30).map((folder) => {
                            const selected = folder.id === selectedFolderId;
                            return (
                              <button
                                key={folder.id}
                                type="button"
                                disabled={manualClaimsDisabled}
                                onMouseEnter={() => setSelectedFolderId(folder.id)}
                                onFocus={() => setSelectedFolderId(folder.id)}
                              onClick={() => {
                                setSelectedFolderId(folder.id);
                                void handleAddManualFolderClaim(folder.id);
                              }}
                                className={`group flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                                  selected
                                    ? "bg-gold-primary/10 text-gold-primary"
                                    : "hover:bg-black/5 dark:hover:bg-white/10"
                                }`}
                              >
                                <Folder className="h-3.5 w-3.5 shrink-0" />
                                <span className="min-w-0 flex-1 truncate">
                                  {folder.path}
                                </span>
                                <Plus className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100" />
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      {recursiveFolderClaims.length === 0 ? (
                        <div className="rounded-md border border-dashed border-black/10 px-3 py-2 text-xs text-gray-500 dark:border-white/10">
                          No folder claims yet.
                        </div>
                      ) : (
                        recursiveFolderClaims.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 rounded-md border border-black/10 px-3 py-2 text-xs dark:border-white/10"
                          >
                            <Folder className="h-3.5 w-3.5 text-gold-primary" />
                            <span className="min-w-0 flex-1 truncate">
                              {nodesById[item.contentId]?.path ?? item.content.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleRemoveFolderClaim(item.contentId)}
                              className="rounded p-1 text-gray-500 transition-colors hover:bg-black/5 hover:text-red-600 dark:hover:bg-white/10"
                              aria-label={`Remove ${item.content.title} claim`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
              )}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            {settingsWorkspace && !settingsWorkspace.isMain ? (
              <button
                type="button"
                onClick={() => void confirmArchiveWorkspace()}
                className="rounded-md border border-red-500/30 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-500/10"
              >
                Disassemble
              </button>
            ) : null}
            <button
              type="button"
              disabled={isSavingSettings}
              onClick={() => setSettingsOpen(false)}
              className="rounded-md border border-black/10 px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSavingSettings}
              onClick={() => void handleSaveSettings()}
              className="inline-flex items-center gap-2 rounded-md border border-gold-primary/30 bg-gold-primary/10 px-3 py-2 text-sm font-medium text-gold-primary transition-colors hover:bg-gold-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isSavingSettings ? "Saving..." : "Save"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteWorkspaceTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteWorkspaceTarget(null);
            setSkipDisassembleWarnings(false);
          }
        }}
      >
        <DialogContent className="max-w-md border-white/10 bg-white/95 text-gray-900 shadow-xl backdrop-blur-sm dark:bg-gray-950/95 dark:text-white">
          <DialogHeader>
            <DialogTitle>Disassemble workspace?</DialogTitle>
            <DialogDescription>
              {deleteWorkspaceTarget
                ? `Disassemble "${deleteWorkspaceTarget.name}"? All tabs in this workspace will be closed and cannot be recovered. Claims will be released, but files will not be deleted.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-gold-primary/20 bg-gold-primary/10 px-3 py-2 text-xs text-gold-primary">
            This closes the workspace session. The workspace state and open tabs will not be recoverable afterwards.
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={skipDisassembleWarnings}
              onChange={(event) => setSkipDisassembleWarnings(event.target.checked)}
              className="h-4 w-4 rounded border border-black/15 text-gold-primary focus:ring-gold-primary dark:border-white/15"
            />
            <span>Don&apos;t warn again</span>
          </label>

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setDeleteWorkspaceTarget(null)}
              className="rounded-md border border-black/10 px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!deleteWorkspaceTarget) return;
                if (skipDisassembleWarnings) {
                  setDisassembleWarningsDisabled();
                }
                void archiveWorkspace(deleteWorkspaceTarget.id)
                  .then(() => {
                    toast.success("Workspace deleted");
                    setDeleteWorkspaceTarget(null);
                    setSkipDisassembleWarnings(false);
                  })
                  .catch((error) => {
                    console.error("[WorkspaceSelector] Failed to delete workspace:", error);
                    toast.error(
                      error instanceof Error ? error.message : "Failed to delete workspace"
                    );
                  });
              }}
              className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/15"
            >
              Delete workspace
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(duplicateWorkspaceTarget)}
        onOpenChange={(open) => {
          if (!open) setDuplicateWorkspaceTarget(null);
        }}
      >
        <DialogContent className="max-w-md border-white/10 bg-white/95 text-gray-900 shadow-xl backdrop-blur-sm dark:bg-gray-950/95 dark:text-white">
          <DialogHeader>
            <DialogTitle>Duplicate workspace?</DialogTitle>
            <DialogDescription>
              {duplicateWorkspaceTarget
                ? `Duplicate "${duplicateWorkspaceTarget.name}"? This copies its layout, tabs, and existing claims into a new workspace.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-gold-primary/20 bg-gold-primary/10 px-3 py-2 text-xs text-gold-primary">
            Duplicating is intentional. Any current claims will be shared in the copied workspace until you change them.
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setDuplicateWorkspaceTarget(null)}
              className="rounded-md border border-black/10 px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDuplicateWorkspace()}
              className="rounded-md border border-gold-primary/30 bg-gold-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-primary/90"
            >
              Duplicate workspace
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={expirationWarningOpen}
        onOpenChange={(open) => {
          setExpirationWarningOpen(open);
          if (!open) {
            setSkipExpirationWarnings(false);
          }
        }}
      >
        <DialogContent className="max-w-lg border-white/10 bg-white/95 text-gray-900 shadow-xl backdrop-blur-sm dark:bg-gray-950/95 dark:text-white">
          <DialogHeader>
            <DialogTitle>Workspace expiration is approaching</DialogTitle>
            <DialogDescription>
              {activeWorkspace
                ? `${activeWorkspace.name} is close to its expiration. Extend it now to keep the session open, or clear expiration entirely.`
                : "This workspace is close to its expiration."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <div className="mb-2 text-sm font-medium">Extend by</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["1h", "3h", "eod", "custom"] as BorrowPreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleExpirationWarningPreset(preset)}
                    className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                      expirationWarningPreset === preset
                        ? "border-gold-primary/40 bg-gold-primary/10 text-gold-primary"
                        : "border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                    }`}
                  >
                    {preset === "1h"
                      ? "1 hour"
                      : preset === "3h"
                        ? "3 hours"
                        : preset === "eod"
                          ? "EOD"
                          : "Custom"}
                  </button>
                ))}
              </div>
            </div>

            {expirationWarningPreset === "custom" ? (
              <label className="block text-sm font-medium">
                Custom expiration
                <input
                  type="datetime-local"
                  value={expirationWarningValue}
                  onChange={(event) => setExpirationWarningValue(event.target.value)}
                  className="mt-1 w-full rounded-md border border-black/10 bg-white/70 px-3 py-2 text-sm outline-none focus:border-gold-primary dark:border-white/10 dark:bg-white/5"
                />
              </label>
            ) : null}
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={skipExpirationWarnings}
              onChange={(event) => setSkipExpirationWarnings(event.target.checked)}
              className="h-4 w-4 rounded border border-black/15 text-gold-primary focus:ring-gold-primary dark:border-white/15"
            />
            <span>Don&apos;t warn again</span>
          </label>

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => {
                if (skipExpirationWarnings) {
                  setExpirationWarningsDisabled();
                }
                void handleUpdateExpirationFromWarning(null);
              }}
              className="rounded-md border border-black/10 px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
            >
              Clear expiration
            </button>
            <button
              type="button"
              onClick={() => {
                if (skipExpirationWarnings) {
                  setExpirationWarningsDisabled();
                }
                void handleUpdateExpirationFromWarning(
                  fromDatetimeLocalValue(expirationWarningValue)
                );
              }}
              className="rounded-md border border-gold-primary/30 bg-gold-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-primary/90"
            >
              Update expiration
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(claimConflictState)}
        onOpenChange={(open) => {
          if (!open) closeClaimConflictDialog();
        }}
      >
        <DialogContent className="max-w-2xl border-white/10 bg-white/95 text-gray-900 shadow-xl backdrop-blur-sm dark:bg-gray-950/95 dark:text-white">
          <DialogHeader>
            <DialogTitle>Resolve workspace claim conflicts</DialogTitle>
            <DialogDescription>
              These files or folders are already in use by other workspaces. Resolve them before applying the new claim so content does not disappear without context.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="max-h-64 overflow-y-auto rounded-md border border-black/10 dark:border-white/10">
              <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.9fr)_auto_auto_auto] gap-2 border-b border-black/10 bg-black/[0.025] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-gray-500 dark:border-white/10 dark:bg-white/[0.04]">
                <span>Content</span>
                <span>Workspace</span>
                <span>Type</span>
                <span>Scope</span>
                <span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-black/10 dark:divide-white/10">
                {claimConflictState?.conflicts.map((conflict) => (
                  <div
                    key={`${conflict.workspaceId}:${conflict.contentId}`}
                    className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.9fr)_auto_auto_auto] gap-2 px-3 py-2 text-sm"
                  >
                    <span className="truncate">{conflict.contentTitle}</span>
                    <span className="truncate text-gray-500">{conflict.workspaceName}</span>
                    <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-xs capitalize dark:bg-white/[0.06]">
                      {conflict.assignmentType}
                    </span>
                    <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-xs capitalize dark:bg-white/[0.06]">
                      {conflict.scope}
                    </span>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={claimResolutionInFlight}
                        onClick={() => {
                          void resolveSingleClaimConflict(conflict, "split");
                        }}
                        className="rounded-md border border-gold-primary/25 bg-gold-primary/10 px-2 py-1 text-[11px] font-medium text-gold-primary transition-colors hover:bg-gold-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Split claim
                      </button>
                      <Popover
                        open={rowBorrowConflictId === `${conflict.workspaceId}:${conflict.contentId}`}
                        onOpenChange={(open) => {
                          if (open) {
                            setRowBorrowConflictId(
                              `${conflict.workspaceId}:${conflict.contentId}`
                            );
                            setRowBorrowPreset("1h");
                            setRowBorrowUntil(borrowUntilForPreset("1h"));
                          } else if (
                            rowBorrowConflictId === `${conflict.workspaceId}:${conflict.contentId}`
                          ) {
                            setRowBorrowConflictId(null);
                          }
                        }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            disabled={claimResolutionInFlight}
                            className="rounded-md border border-gold-primary/25 px-2 py-1 text-[11px] font-medium text-gold-primary transition-colors hover:bg-gold-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Borrow
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="end"
                          className="w-72 border-white/10 bg-white/95 p-3 text-gray-900 shadow-xl backdrop-blur-sm dark:bg-gray-950/95 dark:text-white"
                        >
                          <div className="space-y-3">
                            <div className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">
                              Borrow {conflict.contentTitle}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {(["1h", "3h", "eod", "custom"] as BorrowPreset[]).map(
                                (preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    onClick={() => handleRowBorrowPreset(preset)}
                                    className={`rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                                      rowBorrowPreset === preset
                                        ? "border-gold-primary/40 bg-gold-primary/10 text-gold-primary"
                                        : "border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                                    }`}
                                  >
                                    {preset === "1h"
                                      ? "1 hour"
                                      : preset === "3h"
                                        ? "3 hours"
                                        : preset === "eod"
                                          ? "EOD"
                                          : "Custom"}
                                  </button>
                                )
                              )}
                            </div>
                            {rowBorrowPreset === "custom" ? (
                              <input
                                type="datetime-local"
                                value={rowBorrowUntil}
                                onChange={(event) => setRowBorrowUntil(event.target.value)}
                                className="w-full rounded-md border border-black/10 bg-white/70 px-3 py-2 text-sm outline-none focus:border-gold-primary dark:border-white/10 dark:bg-white/5"
                              />
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void borrowSingleClaimConflict(conflict)}
                              className="w-full rounded-md border border-gold-primary/30 bg-gold-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-primary/90"
                            >
                              Borrow
                            </button>
                          </div>
                        </PopoverContent>
                      </Popover>
                      <button
                        type="button"
                        disabled={claimResolutionInFlight}
                        onClick={() => {
                          void resolveSingleClaimConflict(conflict, "reassign");
                        }}
                        className="rounded-md border border-black/10 px-2 py-1 text-[11px] font-medium transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10"
                      >
                        Reassign
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-md border border-gold-primary/20 bg-gold-primary/10 p-3">
              <div className="text-sm font-medium text-gold-primary">
                Borrow all claims temporarily
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["1h", "3h", "eod", "custom"] as BorrowPreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={claimResolutionInFlight}
                    onClick={() => {
                      setClaimBorrowPreset(preset);
                      if (preset !== "custom") {
                        setClaimBorrowUntil(borrowUntilForPreset(preset));
                      }
                    }}
                    className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                      claimBorrowPreset === preset
                        ? "border-gold-primary/40 bg-white/70 text-gold-primary dark:bg-black/20"
                        : "border-black/10 bg-white/70 hover:bg-white dark:border-white/10 dark:bg-black/10 dark:hover:bg-black/20"
                    }`}
                  >
                    {preset === "1h"
                      ? "1 hour"
                      : preset === "3h"
                        ? "3 hours"
                        : preset === "eod"
                          ? "EOD"
                          : "Custom"}
                  </button>
                ))}
              </div>
              {claimBorrowPreset === "custom" ? (
                <input
                  type="datetime-local"
                  value={claimBorrowUntil}
                  disabled={claimResolutionInFlight}
                  onChange={(event) => setClaimBorrowUntil(event.target.value)}
                  className="w-full rounded-md border border-black/10 bg-white/80 px-3 py-2 text-sm outline-none focus:border-gold-primary dark:border-white/10 dark:bg-black/10"
                />
              ) : null}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              disabled={claimResolutionInFlight}
              onClick={closeClaimConflictDialog}
              className="rounded-md border border-black/10 px-3 py-2 text-sm transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={claimResolutionInFlight}
              onClick={() => {
                void resolveClaimConflicts("shared")
                  .then(() => {
                    toast.success("All conflicts were split into shared claims");
                  })
                  .catch((error) => {
                    console.error("[WorkspaceSelector] Failed to split claim conflicts:", error);
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Failed to split conflicting workspace claims"
                    );
                  });
              }}
              className="rounded-md border border-gold-primary/30 bg-gold-primary/10 px-3 py-2 text-sm font-medium text-gold-primary transition-colors hover:bg-gold-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Split all
            </button>
            <button
              type="button"
              disabled={claimResolutionInFlight}
              onClick={() => {
                void resolveClaimConflicts("primary")
                  .then(() => {
                    toast.success("All conflicts were reassigned here");
                  })
                  .catch((error) => {
                    console.error("[WorkspaceSelector] Failed to reassign claim conflicts:", error);
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Failed to reassign conflicting workspace claims"
                    );
                  });
              }}
              className="rounded-md border border-black/10 px-3 py-2 text-sm font-medium transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10"
            >
              Reassign all
            </button>
            <button
              type="button"
              disabled={claimResolutionInFlight || (claimConflictState?.conflicts.length ?? 0) > 0}
              onClick={() => {
                void applyPendingClaimAfterResolution();
              }}
              className="rounded-md border border-gold-primary/30 bg-gold-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Apply claim
            </button>
            <button
              type="button"
              disabled={claimResolutionInFlight}
              onClick={() => {
                void resolveClaimConflicts("borrowed")
                  .then(() => {
                    toast.success("All conflicting claims were borrowed");
                  })
                  .catch((error) => {
                    console.error("[WorkspaceSelector] Failed to borrow claim conflicts:", error);
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Failed to borrow conflicting workspace items"
                    );
                  });
              }}
              className="rounded-md border border-gold-primary/30 bg-gold-primary/10 px-3 py-2 text-sm font-medium text-gold-primary transition-colors hover:bg-gold-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Borrow all
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
