"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Check,
  ChevronDown,
  Folder,
  GripVertical,
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
import { useContentStore } from "@/state/content-store";
import { useWorkspaceStore } from "@/state/workspace-store";
import type { TreeNode } from "@/lib/domain/content/types";
import type { ContentWorkspaceResponse } from "@/lib/domain/workspaces";

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

function toDatetimeLocalValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function fromDatetimeLocalValue(value: string) {
  return value ? new Date(value).toISOString() : null;
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
  return workspace?.name?.trim() || "Untitled Workspace";
}

function isClaimOpenFoldersEnabled(workspace: ContentWorkspaceResponse | null) {
  return workspace?.settings.claimOpenFolders === true;
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

export function WorkspaceSelector() {
  const openContentIds = useContentStore((state) => state.openContentIds);
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const activateWorkspace = useWorkspaceStore((state) => state.activateWorkspace);
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace);
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
  const [settingsTab, setSettingsTab] = useState<"general" | "claims">("general");
  const [createWarningOpen, setCreateWarningOpen] = useState(false);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftClaimOpenFolders, setDraftClaimOpenFolders] = useState(false);
  const [draftExpiresAt, setDraftExpiresAt] = useState("");
  const [folderOptions, setFolderOptions] = useState<FolderOption[]>([]);
  const [nodesById, setNodesById] = useState<Record<string, FolderOption>>({});
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [folderQuery, setFolderQuery] = useState("");
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [draggedWorkspaceId, setDraggedWorkspaceId] = useState<string | null>(null);
  const [dropTargetWorkspaceId, setDropTargetWorkspaceId] = useState<string | null>(null);

  const assignedOpenTabs = useMemo(() => {
    const openSet = new Set(openContentIds);
    return workspaces.flatMap((workspace) =>
      workspace.items
        .filter((item) => openSet.has(item.contentId))
        .map((item) => ({
          workspaceName: workspace.name,
          contentTitle: item.content.title,
        }))
    );
  }, [openContentIds, workspaces]);

  const recursiveFolderClaims = useMemo(
    () =>
      activeWorkspace?.items.filter((item) => item.scope === "recursive") ?? [],
    [activeWorkspace]
  );
  const manualClaimsDisabledReason = useMemo(() => {
    if (!activeWorkspace) return "No active workspace selected.";
    if (activeWorkspace.isMain) {
      return "Main Workspace is the catchall workspace and cannot reserve folders.";
    }
    if (draftClaimOpenFolders) {
      return "Turn off Claim open folders to manage manual assignments.";
    }
    if (foldersLoading) return "Folder list is still loading.";
    if (folderOptions.length === 0) return "No folders are available to claim.";
    return null;
  }, [activeWorkspace, draftClaimOpenFolders, folderOptions.length, foldersLoading]);
  const manualClaimsDisabled = Boolean(manualClaimsDisabledReason);
  const filteredFolderOptions = useMemo(() => {
    const query = normalizeSearchValue(folderQuery);
    return folderOptions
      .map((folder) => ({ folder, score: scoreFolderOption(folder, query) }))
      .filter((result) => result.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.folder.path.localeCompare(b.folder.path);
      })
      .map((result) => result.folder);
  }, [folderOptions, folderQuery]);
  const orderedWorkspaceIds = useMemo(
    () => workspaces.filter((workspace) => !workspace.isMain).map((workspace) => workspace.id),
    [workspaces]
  );

  useEffect(() => {
    if (!activeWorkspace) return;
    setDraftName(activeWorkspace.name);
    setDraftClaimOpenFolders(isClaimOpenFoldersEnabled(activeWorkspace));
    setDraftExpiresAt(toDatetimeLocalValue(activeWorkspace.expiresAt));
  }, [activeWorkspace]);

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

  const startInlineRename = (workspace: ContentWorkspaceResponse) => {
    setMenuOpen(true);
    setEditingWorkspaceId(workspace.id);
    setEditingName(workspace.name);
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
      const workspace = await createWorkspace("Untitled Workspace");
      setMenuOpen(true);
      startInlineRename(workspace);
      toast.success("Workspace created");
    } catch (error) {
      console.error("[WorkspaceSelector] Failed to create workspace:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create workspace"
      );
    }
  };

  const requestCreateWorkspace = () => {
    if (assignedOpenTabs.length > 0) {
      setCreateWarningOpen(true);
      return;
    }
    void handleCreateWorkspace();
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
    if (!activeWorkspace) return;
    try {
      await updateWorkspace(activeWorkspace.id, {
        name: draftName,
        expiresAt: fromDatetimeLocalValue(draftExpiresAt),
      });
      setSettingsOpen(false);
      toast.success("Workspace settings saved");
    } catch (error) {
      console.error("[WorkspaceSelector] Failed to save workspace settings:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save workspace settings"
      );
    }
  };

  const handleArchiveWorkspace = async () => {
    if (!activeWorkspace || activeWorkspace.isMain) return;
    try {
      await archiveWorkspace(activeWorkspace.id);
      setSettingsOpen(false);
      toast.success("Workspace disassembled");
    } catch (error) {
      console.error("[WorkspaceSelector] Failed to disassemble workspace:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to disassemble workspace"
      );
    }
  };

  const handleDeleteWorkspace = async (workspace: ContentWorkspaceResponse) => {
    if (workspace.isMain) return;
    const confirmed = window.confirm(
      `Delete "${workspace.name}"? This will release its workspace claims but will not delete any files.`
    );
    if (!confirmed) return;

    try {
      await archiveWorkspace(workspace.id);
      toast.success("Workspace deleted");
    } catch (error) {
      console.error("[WorkspaceSelector] Failed to delete workspace:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete workspace");
    }
  };

  const handleClaimFolder = async (folderId: string) => {
    if (!activeWorkspace || activeWorkspace.isMain || !folderId) return;
    await assignContentToWorkspace(activeWorkspace.id, folderId, {
      assignmentType: "primary",
      scope: "recursive",
    });
    await updateWorkspace(activeWorkspace.id, { isLocked: true });
  };

  const handleClaimOpenFileFolders = async () => {
    if (!activeWorkspace || activeWorkspace.isMain) return;
    if (foldersLoading) {
      toast.info("Folder list is still loading");
      return;
    }

    const folderIds = new Set<string>();
    openContentIds.forEach((contentId) => {
      const node = nodesById[contentId];
      if (!node) return;
      if (node.contentType === "folder") {
        folderIds.add(node.id);
      } else if (node.parentId) {
        folderIds.add(node.parentId);
      }
    });

    if (folderIds.size === 0) {
      toast.info("No open files with a parent folder to claim");
      return;
    }

    try {
      for (const folderId of folderIds) {
        await handleClaimFolder(folderId);
      }
      toast.success("Open file folders claimed");
    } catch (error) {
      console.error("[WorkspaceSelector] Failed to claim open file folders:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to claim open file folders"
      );
    }
  };

  const handleClaimOpenFoldersToggle = async (enabled: boolean) => {
    if (!activeWorkspace || activeWorkspace.isMain) return;
    const previousValue = draftClaimOpenFolders;
    setDraftClaimOpenFolders(enabled);

    try {
      await updateWorkspace(activeWorkspace.id, {
        isLocked: enabled || recursiveFolderClaims.length > 0,
        settings: {
          ...activeWorkspace.settings,
          claimOpenFolders: enabled,
        },
      });
      if (enabled) {
        await handleClaimOpenFileFolders();
      } else {
        toast.success("Manual claim assignments enabled");
      }
    } catch (error) {
      setDraftClaimOpenFolders(previousValue);
      console.error("[WorkspaceSelector] Failed to update claim setting:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update claim setting"
      );
    }
  };

  const handleAddManualFolderClaim = async (folderId = selectedFolderId) => {
    if (!folderId) return;
    try {
      await handleClaimFolder(folderId);
      toast.success("Folder claimed");
    } catch (error) {
      console.error("[WorkspaceSelector] Failed to claim folder:", error);
      toast.error(error instanceof Error ? error.message : "Failed to claim folder");
    }
  };

  const handleRemoveFolderClaim = async (folderId: string) => {
    if (!activeWorkspace) return;
    try {
      await unassignContentFromWorkspace(activeWorkspace.id, folderId);
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
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-black/5 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
            title="Choose workspace"
          >
            <Briefcase className="h-3.5 w-3.5" />
            <span className="max-w-36 truncate">
              {getWorkspaceDisplayName(activeWorkspace)}
            </span>
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
                onSelect={(event) => {
                  event.preventDefault();
                  if (isEditing) return;
                  void activateWorkspace(workspace.id).catch((error) => {
                    console.error("[WorkspaceSelector] Failed to switch workspace:", error);
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Failed to switch workspace"
                    );
                  });
                }}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  startInlineRename(workspace);
                }}
                className={`gap-2 ${
                  isActive ? "bg-gold-primary/10 text-gold-primary" : ""
                } ${isDragged ? "opacity-40" : ""} ${
                  isDropTarget ? "ring-1 ring-gold-primary/40" : ""
                } group`}
              >
                {isEditing ? (
                  <input
                    autoFocus
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
                    {workspace.isMain ? (
                      isActive ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Briefcase className="h-4 w-4" />
                      )
                    ) : (
                      <GripVertical className="h-4 w-4 cursor-grab text-gray-400 active:cursor-grabbing" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                    {!workspace.isMain && isActive ? <Check className="h-4 w-4" /> : null}
                    {workspace.isLocked ? <Lock className="h-3.5 w-3.5" /> : null}
                    {!workspace.isMain ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleDeleteWorkspace(workspace);
                        }}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        className="rounded p-0.5 text-gray-400 opacity-0 transition-colors hover:bg-red-500/10 hover:text-red-600 group-hover:opacity-100 group-focus:opacity-100"
                        aria-label={`Delete ${workspace.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
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
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setSettingsOpen(true);
            }}
          >
            <Settings className="h-4 w-4" />
            <span>Workspace settings</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createWarningOpen} onOpenChange={setCreateWarningOpen}>
        <DialogContent className="border-white/10 bg-white/95 text-gray-900 shadow-xl backdrop-blur-sm dark:bg-gray-950/95 dark:text-white">
          <DialogHeader>
            <DialogTitle>Open tabs already have workspace claims</DialogTitle>
            <DialogDescription>
              Creating another workspace is allowed, but these open tabs already belong to a workspace. If you add them to the new workspace, use borrow or share intentionally to avoid duplicate work.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-gold-primary/20 bg-gold-primary/10 px-3 py-2 text-xs text-gold-primary">
            {assignedOpenTabs.slice(0, 4).map((item) => (
              <div key={`${item.workspaceName}:${item.contentTitle}`}>
                {item.contentTitle} in {item.workspaceName}
              </div>
            ))}
            {assignedOpenTabs.length > 4 ? (
              <div>+{assignedOpenTabs.length - 4} more open claimed tabs</div>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setCreateWarningOpen(false)}
              className="rounded-md border border-black/10 px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setCreateWarningOpen(false);
                void handleCreateWorkspace();
              }}
              className="rounded-md border border-gold-primary/30 bg-gold-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-primary/90"
            >
              Create workspace
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-xl border-white/10 bg-white/95 text-gray-900 shadow-xl backdrop-blur-sm dark:bg-gray-950/95 dark:text-white">
          <DialogHeader>
            <DialogTitle>Workspace Settings</DialogTitle>
            <DialogDescription>
              Rename this workspace, set when it disassembles, and control folder claims.
            </DialogDescription>
          </DialogHeader>

          {activeWorkspace ? (
            <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
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
                  onClick={() => setSettingsTab("claims")}
                  className={`rounded px-3 py-2 transition-colors ${
                    settingsTab === "claims"
                      ? "bg-white text-gold-primary shadow-sm dark:bg-white/10"
                      : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  Claims
                </button>
              </div>

              {settingsTab === "general" ? (
                <div className="space-y-4">
                  <label className="block text-sm font-medium">
                    Name
                    <input
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      className="mt-1 w-full rounded-md border border-black/10 bg-white/70 px-3 py-2 text-sm outline-none focus:border-gold-primary dark:border-white/10 dark:bg-white/5"
                    />
                  </label>

                  <label className="block text-sm font-medium">
                    Expiration
                    <input
                      type="datetime-local"
                      value={draftExpiresAt}
                      disabled={activeWorkspace.isMain}
                      onChange={(event) => setDraftExpiresAt(event.target.value)}
                      className="mt-1 w-full rounded-md border border-black/10 bg-white/70 px-3 py-2 text-sm outline-none focus:border-gold-primary disabled:opacity-50 dark:border-white/10 dark:bg-white/5"
                    />
                  </label>

                  <div className="rounded-md border border-black/10 bg-black/[0.025] px-3 py-2 text-xs text-gray-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400">
                    Current layout: {activeWorkspace.layoutMode}. Main Workspace is permanent and cannot be archived or locked.
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-md border border-black/10 text-sm dark:border-white/10">
                  <div className="flex items-start justify-between gap-4 border-b border-black/10 p-3 dark:border-white/10">
                    <div>
                      <div className="font-medium">Claim open folders</div>
                      <div className="text-xs text-gray-500">
                        Automatically reserves the parent folders of open files for this workspace.
                      </div>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={draftClaimOpenFolders}
                        disabled={activeWorkspace.isMain}
                        onChange={(event) =>
                          void handleClaimOpenFoldersToggle(event.target.checked)
                        }
                        className="peer sr-only"
                      />
                      <span className="h-6 w-11 rounded-full bg-gray-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-gold-primary peer-checked:after:translate-x-5 peer-disabled:opacity-50 dark:bg-gray-700" />
                    </label>
                  </div>

                  {activeWorkspace.isMain ? (
                    <div className="border-b border-black/10 bg-black/[0.025] px-3 py-2 text-xs text-gray-500 dark:border-white/10 dark:bg-white/[0.04]">
                      Main Workspace is the catchall workspace, so it cannot reserve folders.
                    </div>
                  ) : null}

                  <div className="space-y-3 p-3">
                    <div>
                      <div className="font-medium">Manual Claim Assignments</div>
                      <div className="text-xs text-gray-500">
                        Assign specific folders to this workspace. Folder claims are recursive.
                      </div>
                    </div>

                    {manualClaimsDisabledReason ? (
                      <div className="rounded-md border border-gold-primary/20 bg-gold-primary/10 px-3 py-2 text-xs text-gold-primary">
                        {manualClaimsDisabledReason}
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <input
                        value={folderQuery}
                        disabled={manualClaimsDisabled}
                        title={manualClaimsDisabledReason ?? "Search folders"}
                        onChange={(event) => setFolderQuery(event.target.value)}
                        placeholder="Search folders..."
                        className="w-full rounded-md border border-black/10 bg-white/70 px-3 py-2 text-xs outline-none focus:border-gold-primary disabled:opacity-50 dark:border-white/10 dark:bg-white/5"
                      />
                    </div>

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
              )}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            {activeWorkspace && !activeWorkspace.isMain ? (
              <button
                type="button"
                onClick={() => void handleArchiveWorkspace()}
                className="rounded-md border border-red-500/30 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-500/10"
              >
                Disassemble
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="rounded-md border border-black/10 px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSaveSettings()}
              className="rounded-md border border-gold-primary/30 bg-gold-primary/10 px-3 py-2 text-sm font-medium text-gold-primary transition-colors hover:bg-gold-primary/15"
            >
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
