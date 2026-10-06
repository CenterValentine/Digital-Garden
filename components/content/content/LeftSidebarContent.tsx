/**
 * Left Sidebar Content (Client Component)
 *
 * Loads file tree data and renders interactive tree.
 * M6: Conditionally shows SearchPanel when search is active.
 */

"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import { FileTreeWithDropZone } from "../FileTreeWithDropZone";
import { FileTreeSkeleton } from "../skeletons/FileTreeSkeleton";
import { SearchPanel } from "../SearchPanel";
import { ConfirmDialog } from "../ConfirmDialog";
import { ExternalLinkDialog } from "../external/ExternalLinkDialog";
import { FileUploadDialog } from "../dialogs/FileUploadDialog";
import { IconSelector } from "../IconSelector";
import { LeftSidebarStatusBar } from "../LeftSidebarStatusBar";
import { RootNodeHeader, type RootScopeOption } from "../file-tree/RootNodeHeader";
import {
  useContentStore,
  resolveOpenDestinationPane,
  resolveLayoutModeForPane,
  type WorkspacePaneId,
} from "@/state/content-store";
import {
  ensurePaneHotkeyTracker,
  heldPaneTarget,
  PANE_HOTKEY_SINGLE,
} from "@/lib/features/content/pane-hotkeys";
import { useSettingsStore } from "@/state/settings-store";
import { useSearchStore } from "@/state/search-store";
import { useTreeStateStore } from "@/state/tree-state-store";
import { useCharterIdsStore } from "@/state/charter-ids-store";
import { useWorkspaceStore } from "@/extensions/workplaces/state/workspace-store";
import { useContextMenuStore } from "@/state/context-menu-store";
import { usePageTemplateStore } from "@/state/page-template-store";
import type { TreeNode, ContentType } from "@/lib/domain/content/types";
import { findTreeNodeById } from "@/lib/domain/content/tree-drop-target";
import { recordCreateDestination } from "@/state/create-destination-store";
import { useTreeRevealStore } from "@/state/tree-reveal-store";
import {
  registerCreateTargetResolver,
  resolveCreateParent,
  toServerParent,
  type TreeLevelTarget,
} from "@/lib/domain/content/create-target";
import {
  deleteTargetsOfRowIds,
  resolveDropForwardTarget,
  shortcutIdOfMirrorRowId,
  targetRowOfSelection,
} from "@/lib/features/content/shortcut-mirror";
import { ContentTreePicker } from "@/components/content/pickers/ContentTreePicker";

/**
 * What a shortcut may point at: every real content type.
 *
 * The picker's DEFAULT_ELIGIBLE_TYPES is tuned for "content that can be
 * windowed", which leaves out databases, chats and the rest — reasonable
 * there, wrong here, since a shortcut only has to REACH something, not render
 * it inline. Databases were invisible to the picker because of that default.
 *
 * `shortcut` is deliberately absent: the server dereferences a
 * shortcut-to-shortcut anyway, so offering one would promise a chain it will
 * not build. `template` is absent because it is a authoring construct, not a
 * place. Module scope so the Set identity is stable across renders.
 */
const SHORTCUT_ELIGIBLE_TYPES = new Set([
  "note",
  "folder",
  "file",
  "external",
  "html",
  "code",
  "data",
  "chat",
  "visualization",
  "hope",
  "workflow",
]);
import type { PickerTarget } from "@/components/content/pickers/ContentTreePicker";
import { clientLogger } from "@/lib/core/logger/client";
import { warmUpMobileKeyboard } from "@/lib/core/mobile-keyboard";
import {
  TREE_OPTIMISTIC_EVENT,
  TREE_SYNC_EVENT,
  type OptimisticTreeRow,
  type TreeOptimisticDetail,
} from "@/lib/features/content/tree-optimistic";
import {
  IN_TEXT_FETCH_MS,
  IN_TEXT_RECONCILE_MS,
  NO_IN_TEXT_EDITS,
  missingInTextMedia,
  settleInTextEdits,
} from "@/lib/features/content/in-text-media";
import { useInTextMediaStore } from "@/state/in-text-media-store";
import { patchTreeNodeTitle } from "@/lib/domain/content/tree-patch";
import {
  collectRemovedIds,
  removeNodesFromTree,
  withoutIds,
} from "@/lib/domain/content/tree-remove";
import {
  refreshIsQuiet,
  responseStillApplies,
  treeResponseApplies,
  treeScopeKey,
} from "@/lib/domain/content/tree-refresh";
import {
  type KeptSort,
  isFolderLike,
  moveAcrossForests,
  moveTouchesCarried,
  placeAmongSiblings,
  sortedInsertIndex,
} from "@/lib/domain/content/sibling-order";
import { clearKeptSort, orderKeptLevel } from "@/lib/features/content/kept-sort-display";
import { useTreeTargetStore } from "@/state/tree-target-store";
import { inTextElsewhere } from "@/lib/features/content/drop-rules";
import { resolveTreeRow } from "@/lib/features/content/tree-stand-in";
import { useTreeStandInStore } from "@/state/tree-stand-in-store";

interface TreeApiResponse {
  success: boolean;
  data: {
    tree: TreeNode[];
    /** Out-of-view folders that shortcuts in this view point at (shortcut-targets.ts). */
    shortcutTargets?: TreeNode[];
    /** The view root's kept sort (its own row isn't in the tree). */
    rootTreeSort?: KeptSort | null;
    /** The view root, then its ancestors (empty when unscoped). */
    rootAncestry?: string[];
    stats: {
      totalNodes: number;
      rootNodes: number;
      maxDepth: number;
      byType: Record<string, number>;
    };
  };
  error?: {
    code: string;
    message: string;
  };
}

interface LeftSidebarContentProps {
  refreshTrigger: number;
  createTrigger?: {
    type: "folder" | "note" | "docx" | "xlsx" | "json" | "code" | "html" | "external" | "shortcut" | "chat" | "visualization" | "data" | "hope" | "workflow" | "n8n-workflow";
    timestamp: number;
    engine?: "diagrams-net" | "excalidraw" | "mermaid"; // For visualization type
    dataMode?: "query"; // For data type — query databases
  } | null;
  onSelectionChange?: (hasMultipleSelections: boolean) => void;
  /** `parentId` is the folder the files were dropped into (`null` = root). */
  onFileDrop?: (files: File[], parentId: string | null) => void;
  onAddPeopleTarget?: (parentId: string | null) => void;
  /** Opens the AI image generation dialog targeting the given parent folder. */
  onCreateAiImage?: (parentId: string | null) => void;
}

type CreateTarget = {
  treeParentId: string | null;
  requestParentId: string | null;
  peopleGroupId: string | null;
  personId: string | null;
};

function parsePeopleVirtualParentId(parentId: string | null): Pick<CreateTarget, "peopleGroupId" | "personId"> {
  if (parentId?.startsWith("peopleGroup:")) {
    return {
      peopleGroupId: parentId.replace("peopleGroup:", ""),
      personId: null,
    };
  }

  if (parentId?.startsWith("person:")) {
    return {
      peopleGroupId: null,
      personId: parentId.replace("person:", ""),
    };
  }

  return {
    peopleGroupId: null,
    personId: null,
  };
}

function treeContainsId(nodes: TreeNode[], id: string): boolean {
  return nodes.some((node) => node.id === id || treeContainsId(node.children ?? [], id));
}

function removeTreeNodeById(nodes: TreeNode[], id: string): TreeNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => (node.children?.length ? { ...node, children: removeTreeNodeById(node.children, id) } : node));
}

function renameTreeNodeId(nodes: TreeNode[], fromId: string, toId: string): TreeNode[] {
  return nodes.map((node) =>
    node.id === fromId
      ? { ...node, id: toId }
      : node.children?.length
        ? { ...node, children: renameTreeNodeId(node.children, fromId, toId) }
        : node
  );
}

/**
 * Placeholder row for a create made outside the tree (tree-optimistic.ts).
 * `displayOrder: 0` is the server's default, which those creates store — it
 * is what places the row correctly (see the sorted insert in the handler).
 */
function optimisticTreeNode(tempId: string, row: OptimisticTreeRow, treeParentId: string | null): TreeNode {
  const now = new Date();
  return {
    id: tempId,
    title: row.title,
    slug: "",
    contentType: row.contentType,
    parentId: treeParentId,
    displayOrder: 0,
    customIcon: null,
    iconColor: null,
    isPublished: false,
    children: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    file: row.mimeType
      ? { fileName: row.title, mimeType: row.mimeType, fileSize: "0", uploadStatus: "uploading" }
      : undefined,
    shortcut: row.shortcutTarget
      ? {
          targetId: row.shortcutTarget.id,
          targetContentType: row.shortcutTarget.contentType,
          targetTitle: row.shortcutTarget.title,
          targetDeleted: false,
        }
      : undefined,
  };
}


/**
 * Tree-space parent for a "+" create (null = top of the current tree). The one
 * rule every create path shares — see lib/domain/content/create-target.ts.
 */
function resolveTreeParent(
  explicitParentId: string | null | undefined,
  treeData: TreeNode[] | null | undefined,
  viewRootId: string | null
): string | null {
  return resolveCreateParent({
    explicitParentId,
    // A row inside a shortcut (or a note's window row) stands for its
    // shortcut (or note): its own id names nothing in the tree data, and used
    // to fall through to the top level.
    selectedIds: useTreeStateStore.getState().selectedIds.map(targetRowOfSelection),
    findNode: (id) => (treeData ? findTreeNodeById(treeData, id) : null),
    viewRootId,
  });
}

function getCreateTarget(parentId: string | null, treeData: TreeNode[]): CreateTarget {
  const virtualAssignment = parsePeopleVirtualParentId(parentId);
  if (virtualAssignment.peopleGroupId || virtualAssignment.personId) {
    return {
      treeParentId: parentId,
      requestParentId: null,
      ...virtualAssignment,
    };
  }

  const parentNode = parentId ? findTreeNodeById(treeData, parentId) : null;

  return {
    treeParentId: parentId,
    requestParentId: parentId,
    peopleGroupId: parentNode?.peopleGroupId ?? null,
    personId: parentNode?.personId ?? null,
  };
}

function isPeopleTreeNode(node: TreeNode | null): node is TreeNode & {
  treeNodeKind: "person" | "peopleGroup";
} {
  return Boolean(node && (node.treeNodeKind === "person" || node.treeNodeKind === "peopleGroup"));
}

function toPeopleMountTarget(node: TreeNode) {
  if (node.treeNodeKind === "person" && node.personId) {
    return {
      kind: "person" as const,
      personId: node.personId,
    };
  }

  if (node.treeNodeKind === "peopleGroup" && node.peopleGroupId) {
    return {
      kind: "peopleGroup" as const,
      groupId: node.peopleGroupId,
    };
  }

  throw new Error("Invalid People mount target");
}

export function LeftSidebarContent({
  refreshTrigger,
  createTrigger,
  onSelectionChange,
  onFileDrop,
  onAddPeopleTarget,
  onCreateAiImage,
}: LeftSidebarContentProps) {
  const [treeData, setTreeData] = useState<TreeNode[] | null>(null);
  // What shortcuts in a view-scoped tree mirror when their target folder is
  // outside the view (tree API `shortcutTargets`). Applied with the tree, by
  // the same guarded load, so the two can never disagree about freshness.
  const [shortcutTargetTrees, setShortcutTargetTrees] = useState<TreeNode[]>([]);
  // The sort the top of a view keeps — the view root's own (a folder can
  // remember its sort; the vault's top level can't). Loaded with the tree.
  const [rootTreeSort, setRootTreeSort] = useState<KeptSort | null>(null);
  // The view root and its ancestors — for refusing a drop that would put a
  // folder inside itself when a shortcut shows a folder that contains the view.
  const [rootAncestry, setRootAncestry] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [creatingItem, setCreatingItem] = useState<{
    type: "folder" | "note" | "file" | "code" | "html" | "docx" | "xlsx" | "json" | "external" | "shortcut" | "chat" | "visualization" | "data" | "hope" | "workflow";
    parentId: string | null;
    tempId: string; // Temporary ID for the placeholder node
    fromTemplateId?: string;
  } | null>(null);
  const [expandNodeId, setExpandNodeId] = useState<string | null>(null);
  // Reveal requests (toolbar "show in file tree", breadcrumb, and the tree
  // following the active content) live in a store so they survive the tree
  // not being mounted or not yet holding the item — state/tree-reveal-store.ts.
  const revealRequest = useTreeRevealStore((s) => s.request);
  const consumeReveal = useTreeRevealStore((s) => s.consumeReveal);
  const requestReveal = useTreeRevealStore((s) => s.requestReveal);
  // The id the tree itself just opened (a row click). The follow-the-active-
  // content reveal skips it: the user is already looking at that row, and a
  // shortcut click must not drag the tree off to the target's real home.
  const treeOpenedIdRef = useRef<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    ids: string[];
    title: string;
    message: string;
    hasChildren: boolean;
    /** Drive copies found by the probe that runs while the dialog is open. */
    googleDriveFiles: Array<{ contentId: string; fileId: string }>;
    /** Which probe this dialog belongs to — a slow answer from an earlier one is dropped. */
    driveProbeToken: number;
  } | null>(null);
  const driveProbeTokenRef = useRef(0);
  const [externalLinkDialog, setExternalLinkDialog] = useState<{
    open: boolean;
    mode: "create" | "edit";
    initialName: string;
    initialUrl: string;
    editingId: string | null; // ID of external link being edited (null for create)
    /** Create destination. null = derive from tree selection at save time. */
    parentId: string | null;
  }>({ open: false, mode: "create", initialName: "", initialUrl: "https://", editingId: null, parentId: null });

  /**
   * Shortcut target picker. Like External Link, a shortcut cannot exist until
   * the user has chosen what it points at, so it takes the dialog-first fork
   * rather than the inline temp-node path — there is nothing to optimistically
   * render.
   *
   * `anchorEl` comes from a fixed invisible element (shortcutAnchorRef) rather
   * than the launching control, which has already unmounted by the time the
   * picker renders. null parentId keeps the derive-from-selection behaviour.
   */
  const [shortcutPicker, setShortcutPicker] = useState<{
    open: boolean;
    parentId: string | null;
    anchorEl: HTMLElement | null;
  }>({ open: false, parentId: null, anchorEl: null });

  /**
   * A fixed, always-mounted anchor for the shortcut picker.
   *
   * ContentTreePicker positions against a real element, but neither entry
   * point can supply one: the header + menu and the row context menu both
   * unmount on click, and `handleCreate(parentId, type)` carries no element.
   * A stable invisible anchor sidesteps that entirely, and gives both entry
   * points the same predictable placement.
   */
  const shortcutAnchorRef = useRef<HTMLDivElement | null>(null);

  // Ref to temporarily store visualization engine when creating from context menu
  const pendingVisualizationEngine = useRef<"diagrams-net" | "excalidraw" | "mermaid" | null>(null);

  // Measure tree container height for the virtualized tree. This MUST use a
  // callback ref, not useRef + a mount-time useEffect: the tree container only
  // renders after data loads (isLoading → false), so at first mount the ref is
  // null, the effect bails, and the observer is never attached — leaving
  // treeHeight pinned at its default. In the main app the data is usually warm
  // so the ref happens to exist by mount; the side panel loads fresh every time
  // (always async), so the effect approach left the tree stuck at 600px and
  // unable to scroll. A callback ref attaches the observer whenever the element
  // mounts, whatever the load timing.
  const [treeHeight, setTreeHeight] = useState(600);
  const treeResizeObserverRef = useRef<ResizeObserver | null>(null);
  const treeContainerRef = useCallback((el: HTMLDivElement | null) => {
    treeResizeObserverRef.current?.disconnect();
    treeResizeObserverRef.current = null;
    if (!el) return;
    const ro = new ResizeObserver(() => setTreeHeight(el.clientHeight));
    ro.observe(el);
    setTreeHeight(el.clientHeight);
    treeResizeObserverRef.current = ro;
  }, []);
  const [iconSelector, setIconSelector] = useState<{
    open: boolean;
    contentId: string;
    currentIcon: string | null;
    triggerPosition: { x: number; y: number };
  }>({ open: false, contentId: "", currentIcon: null, triggerPosition: { x: 0, y: 0 } });
  const [errorDialog, setErrorDialog] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [uploadDialog, setUploadDialog] = useState<{
    open: boolean;
    parentId: string | null;
  }>({ open: false, parentId: null });
  const [hasGoogleAuth, setHasGoogleAuth] = useState(false);
  const [deleteFromGoogleDrive, setDeleteFromGoogleDrive] = useState(true); // Default to true

  // Content selection store
  const selectedContentId = useContentStore((state) => state.selectedContentId);
  const setSelectedContentId = useContentStore((state) => state.setSelectedContentId);
  const replaceContentTab = useContentStore((state) => state.replaceContentTab);
  const closeContentTabs = useContentStore((state) => state.closeContentTabs);
  const { setSelectedIds } = useTreeStateStore();

  // Direction-key aiming for tree opens. Installed on mount, not lazily at
  // click time the way the Alt tracker is: the keydown we need to have seen
  // happens BEFORE the click, so a tracker installed by the click is already
  // too late to have recorded anything.
  useEffect(() => {
    ensurePaneHotkeyTracker();
  }, []);

  // Search store - conditionally show search panel
  const isSearchOpen = useSearchStore((state) => state.isSearchOpen);

  // Active workspace — used to scope the file tree when workspace is a view.
  // `workspaceStoreReady` gates the FIRST fetchTree fire so we don't
  // burn a request on stale defaults (activeWorkspaceId=null,
  // activeViewRootContentId=null) only to immediately re-fetch when
  // the store hydrates from /api/content/workspaces. Pre-hydration the
  // tree shows skeleton; post-hydration it fetches once with the right
  // workspace context. Tracked via the store's hasLoadedOnce flag.
  const workspaceStoreReady = useWorkspaceStore((state) => state.hasLoadedOnce);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const activeWorkspaceIsView = useWorkspaceStore((state) => {
    const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
    return ws?.isView ?? false;
  });
  const activeViewRootContentId = useWorkspaceStore((state) => {
    const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
    return ws?.isView ? (ws.viewRootContentId ?? null) : null;
  });
  const activeViewRootTitle = useWorkspaceStore((state) => {
    const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
    return ws?.isView ? (ws.viewRoot?.title ?? null) : null;
  });
  // Workbench support: when the active workspace is a workbench (child of a
  // view workspace), its PARENT's view is offered as a middle scope between
  // the workbench folder and the whole tree.
  const activeWorkspaceIsWorkbench = useWorkspaceStore((state) => {
    const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
    return Boolean(ws?.parentWorkspaceId);
  });
  const activeParentViewRootContentId = useWorkspaceStore((state) => {
    const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
    if (!ws?.parentWorkspaceId) return null;
    const parent = state.workspaces.find((w) => w.id === ws.parentWorkspaceId);
    return parent?.viewRootContentId ?? null;
  });
  const activeParentViewRootTitle = useWorkspaceStore((state) => {
    const ws = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
    if (!ws?.parentWorkspaceId) return null;
    const parent = state.workspaces.find((w) => w.id === ws.parentWorkspaceId);
    return parent?.viewRoot?.title ?? parent?.name ?? null;
  });

  // Transient scope override for the view filter. `null` = the workspace's own
  // scope (view root, or the workbench's folder); "parentView" (workbench only)
  // = the parent workspace's view; "root" = the whole tree. Deliberately
  // EPHEMERAL — it never persists and resets on ANY workspace change
  // (including leaving and coming back), so a workspace's scope always
  // re-applies fresh.
  const [scopeOverride, setScopeOverride] = useState<
    "parentView" | "root" | null
  >(null);
  useEffect(() => {
    setScopeOverride(null);
  }, [activeWorkspaceId]);

  // The folder the tree is actually scoped to right now (null = whole tree).
  const effectiveViewRootContentId =
    !activeWorkspaceIsView || scopeOverride === "root"
      ? null
      : scopeOverride === "parentView"
        ? activeParentViewRootContentId
        : activeViewRootContentId;
  const scopedRootTitle =
    scopeOverride === "parentView"
      ? activeParentViewRootTitle
      : activeViewRootTitle;

  // In a view-scoped tree the view root's own row is gone — its children ARE
  // the top level — so tree-space "null parent" (top level) must be remapped
  // to the view root for every server write. Without this, creates/moves/
  // drops aimed at the top of a filtered tree land at the real vault root,
  // invisibly outside the view the user is looking at.
  const scopedRootParentId = effectiveViewRootContentId;

  // Remember where a create landed (server-space parent) so the pane "+"
  // picker can offer "the last place you created something" at its top.
  // Titles come from the tree already in hand; the hidden view root resolves
  // to the view's own title.
  const rememberDestination = useCallback(
    (serverParentId: string | null) => {
      recordCreateDestination(serverParentId, (id) => {
        if (id === scopedRootParentId && scopedRootTitle) {
          return { title: scopedRootTitle, parentId: null };
        }
        const node = treeData ? findTreeNodeById(treeData, id) : null;
        return node ? { title: node.title, parentId: node.parentId } : null;
      });
    },
    [treeData, scopedRootParentId, scopedRootTitle],
  );
  // Surfaces outside the tree (the reader's bookshelf, …) resolve "+" targets
  // with the tree's live rule.
  useEffect(() => {
    registerCreateTargetResolver((explicitParentId) =>
      toServerParent(
        resolveTreeParent(explicitParentId, treeData, scopedRootParentId),
        scopedRootParentId
      )
    );
    return () => registerCreateTargetResolver(null);
  }, [treeData, scopedRootParentId]);
  // …and publishes it for the header's "+" and sort menu, which name it in
  // their tooltips and show the sort it keeps (state/tree-target-store.ts).
  const treeSelectedIds = useTreeStateStore((state) => state.selectedIds);
  const shortcutSorts = useSettingsStore((state) => state.ui?.shortcutSorts);
  useEffect(() => {
    const treeParentId = resolveTreeParent(null, treeData, scopedRootParentId);
    const virtual =
      !!treeParentId &&
      (treeParentId.startsWith("peopleGroup:") ||
        treeParentId.startsWith("person:") ||
        treeParentId.startsWith("temp-"));
    const holder = treeParentId && treeData ? findTreeNodeById(treeData, treeParentId) : null;
    const level = (treeParentId ? holder?.children : treeData) ?? [];
    const serverParentId = toServerParent(treeParentId, scopedRootParentId);
    const addTarget: TreeLevelTarget = {
      kind: "folder",
      serverParentId,
      label: holder
        ? `“${holder.title}”`
        : !treeParentId && scopedRootTitle
          ? `“${scopedRootTitle}”`
          : "the top level",
      sortable: !virtual,
      // A folder can remember a sort; the vault's top level has no folder.
      remembers: !virtual && serverParentId !== null,
      kept: holder ? (holder.folder?.treeSort ?? null) : treeParentId ? null : rootTreeSort,
      rows: level
        .filter((row) => !isPeopleTreeNode(row))
        .map((row) => ({
          id: row.id,
          title: row.title,
          displayOrder: row.displayOrder ?? 0,
          folderLike: isFolderLike(row),
          nested: (row.children?.length ?? 0) > 0,
        })),
    };
    // A shortcut to a folder selected (or a row inside one): the sort menu
    // sorts THAT SHORTCUT's view — kept in user settings, never written to
    // the folder (owner, 2026-10-06). "+" still adds beside the shortcut.
    const selected = treeSelectedIds.length === 1 ? targetRowOfSelection(treeSelectedIds[0]) : null;
    const selectedRow = selected && treeData ? findTreeNodeById(treeData, selected) : null;
    const sortTarget: TreeLevelTarget =
      selectedRow && selectedRow.contentType === "shortcut" && isFolderLike(selectedRow)
        ? {
            kind: "shortcut",
            shortcutId: selectedRow.id,
            serverParentId: null,
            label: `shortcut “${selectedRow.title}”`,
            sortable: true,
            remembers: true,
            kept: shortcutSorts?.[selectedRow.id] ?? null,
            rows: [],
          }
        : addTarget;
    useTreeTargetStore.getState().setTargets({ addTarget, sortTarget });
  }, [treeData, treeSelectedIds, scopedRootParentId, scopedRootTitle, rootTreeSort, shortcutSorts]);
  useEffect(() => () => useTreeTargetStore.getState().setTargets({ addTarget: null, sortTarget: null }), []);

  const rootDropTarget = useMemo(
    () =>
      scopedRootParentId
        ? {
            parentId: scopedRootParentId,
            label: scopedRootTitle ?? "view",
            source: "root" as const,
          }
        : undefined,
    [scopedRootParentId, scopedRootTitle],
  );

  // Scope options for the RootNodeHeader dropdown: [own scope, (parent view),
  // root]. Absent (undefined) on non-view workspaces — no dropdown.
  const scopeOptions = useMemo<RootScopeOption[] | undefined>(() => {
    if (!activeWorkspaceIsView) return undefined;
    const options: RootScopeOption[] = [
      {
        key: "default",
        label: activeViewRootTitle ?? "view",
        kind: activeWorkspaceIsWorkbench ? "workbench" : "view",
      },
    ];
    if (activeWorkspaceIsWorkbench && activeParentViewRootContentId) {
      options.push({
        key: "parentView",
        label: activeParentViewRootTitle ?? "view",
        kind: "view",
      });
    }
    options.push({ key: "root", label: "root — show all files", kind: "root" });
    return options;
  }, [
    activeWorkspaceIsView,
    activeWorkspaceIsWorkbench,
    activeViewRootTitle,
    activeParentViewRootContentId,
    activeParentViewRootTitle,
  ]);
  const handleSelectScope = (key: string) => {
    setScopeOverride(key === "parentView" || key === "root" ? key : null);
  };

  // What the tree is showing (workspace + view root), the scope whose tree is
  // actually on screen, and the scope a finishing request must still match.
  // See lib/domain/content/tree-refresh.ts for the rule they implement.
  const treeScope = treeScopeKey(activeWorkspaceId, effectiveViewRootContentId);
  const loadedScopeRef = useRef<string | null>(null);
  const currentScopeRef = useRef(treeScope);
  // Local optimistic edits (move, delete): a counter bumped when one starts
  // and the number still writing. See treeResponseApplies.
  const treeEditGenRef = useRef(0);
  const pendingTreeEditsRef = useRef(0);
  const loadTreeRef = useRef<((quiet: boolean) => Promise<void>) | null>(null);
  // Declared before the fetch effect below, so the scope is current by the
  // time a scope change's own fetch is issued (effects run in order).
  useEffect(() => {
    currentScopeRef.current = treeScope;
  }, [treeScope]);

  // Fetch tree data. `quiet` keeps the current tree on screen (no skeleton)
  // while the refetch runs.
  const loadTree = useCallback(async (quiet: boolean) => {
    const requestScope = treeScope;
    const startedEditGen = treeEditGenRef.current;
    try {
      if (!quiet) setIsLoading(true);
      setError(null);

      const url = new URL("/api/content/content/tree", window.location.origin);
      if (effectiveViewRootContentId) {
        url.searchParams.set("viewRootContentId", effectiveViewRootContentId);
      }
      const response = await fetch(url.toString(), {
        credentials: "include",
      });

      // Handle non-OK status before parsing JSON
      if (!response.ok) {
        // Try to parse error response
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const result: TreeApiResponse = await response.json();
          throw new Error(result.error?.message || "Failed to fetch tree");
        } else {
          // HTML error page
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      }

      const result: TreeApiResponse = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || "Failed to fetch tree");
      }

      // Left this scope while the request was out, or a local edit started /
      // is still writing: this response predates it — drop it rather than
      // paint the old order (or the previous workspace's files) over it.
      if (
        !treeResponseApplies({
          requestScope,
          currentScope: currentScopeRef.current,
          firstLoad: !quiet,
          startedEditGen,
          currentEditGen: treeEditGenRef.current,
          pendingEdits: pendingTreeEditsRef.current,
        })
      ) {
        // Evidence for "the tree stopped updating": an edit that never ended
        // would drop every quiet refresh after it (owner report, 2026-10-06
        // — creates and renames from the main panel didn't reach the tree).
        if (pendingTreeEditsRef.current > 0) {
          clientLogger.warn({
            layer: "ui",
            event: "tree_fetch:dropped_pending_edit",
            summary: "tree refresh dropped: a local tree edit is still pending",
            attrs: {
              pending_edits: pendingTreeEditsRef.current,
              edit_gen: treeEditGenRef.current,
            },
          });
        }
        return;
      }
      setTreeData(result.data.tree);
      setShortcutTargetTrees(result.data.shortcutTargets ?? []);
      setRootTreeSort(result.data.rootTreeSort ?? null);
      setRootAncestry(result.data.rootAncestry ?? []);
      loadedScopeRef.current = requestScope;
      // Feed the charter-id cache so metadata-less surfaces (workspace
      // tabs) can render the ScrollText identity consistently.
      useCharterIdsStore.getState().setFromTree(result.data.tree);
    } catch (err) {
      clientLogger.error({
        layer: "ui",
        event: "tree_fetch:failed",
        summary: "left sidebar tree fetch failed",
        attrs: { workspace_id: activeWorkspaceId ?? "none" },
        error: err,
      });
      // A quiet reconcile that fails keeps the tree it already shows.
      if (!quiet && responseStillApplies(requestScope, currentScopeRef.current)) {
        setError(err instanceof Error ? err.message : "Failed to load file tree");
      }
    } finally {
      // A superseded scope's request must not drop the skeleton the CURRENT
      // scope's first load is still showing.
      if (!quiet && responseStillApplies(requestScope, currentScopeRef.current)) {
        setIsLoading(false);
      }
    }
  }, [activeWorkspaceId, effectiveViewRootContentId, treeScope]);
  // Every refresh goes through here — post-mutation calls, the header's
  // refresh button, `dg:tree-refresh` (via refreshTrigger). The skeleton is
  // shown only for a scope's FIRST load; once its tree is on screen a refresh
  // swaps the data in place, so react-arborist stays mounted and the user
  // keeps their place.
  const fetchTree = useCallback(
    () => loadTree(refreshIsQuiet(loadedScopeRef.current, treeScope)),
    [loadTree, treeScope]
  );
  useEffect(() => {
    loadTreeRef.current = loadTree;
  }, [loadTree]);

  // Press-and-hold on the refresh button: reload from scratch, skeleton and
  // all (owner, 2026-10-06 — "a hard refresh that flashes"). The only
  // deliberate skeleton load of a tree already on screen: react-arborist
  // remounts (open state and scroll come back from the persisted store), and
  // the in-text overlay is dropped, so what shows is exactly what the server
  // has. A click stays the quiet refresh.
  const hardReloadTree = useCallback(() => {
    useInTextMediaStore.getState().settle(NO_IN_TEXT_EDITS);
    void loadTree(false);
  }, [loadTree]);

  // Bracket every optimistic tree edit: begin before the tree is touched, end
  // in a `finally` — a missed end would drop every refresh after it. The end
  // of the last pending edit reconciles quietly with the CURRENT scope's
  // loader (not a stale closure from before a workspace switch).
  const beginTreeEdit = () => {
    treeEditGenRef.current += 1;
    pendingTreeEditsRef.current += 1;
  };
  const endTreeEdit = () => {
    pendingTreeEditsRef.current = Math.max(0, pendingTreeEditsRef.current - 1);
    if (pendingTreeEditsRef.current === 0) void loadTreeRef.current?.(true);
  };

  // Initial load and refresh when trigger or active workspace changes.
  // Gated on `workspaceStoreReady` so we don't double-fetch (once for
  // the pre-hydration null workspace, once for the real one). The tree
  // skeleton stays up while we wait for hydration, which is typically
  // <500ms and overlaps with other in-flight requests.
  useEffect(() => {
    if (!workspaceStoreReady) return;
    fetchTree();
  }, [fetchTree, refreshTrigger, workspaceStoreReady]);

  // Check if user has Google authentication
  useEffect(() => {
    async function checkGoogleAuth() {
      try {
        const response = await fetch("/api/auth/provider");
        const data = await response.json();
        setHasGoogleAuth(data.success && data.data.hasGoogleAuth);
      } catch (err) {
        clientLogger.error({
          layer: "ui",
          event: "google_auth_check:failed",
          summary: "google auth probe failed",
          error: err,
        });
        setHasGoogleAuth(false);
      }
    }
    checkGoogleAuth();
  }, []);

  useEffect(() => {
    const pageTemplateStore = usePageTemplateStore.getState();
    if (!pageTemplateStore.isLoaded && !pageTemplateStore.isLoading) {
      pageTemplateStore.fetchCategories();
      pageTemplateStore.fetchTemplates();
    }
  }, []);

  // Load and save checkbox preference to/from localStorage
  useEffect(() => {
    // Load from localStorage on mount
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("deleteFromGoogleDrive");
      if (saved !== null) {
        setDeleteFromGoogleDrive(saved === "true");
      }
    }
  }, []); // Run once on mount

  // Save to localStorage when value changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("deleteFromGoogleDrive", String(deleteFromGoogleDrive));
    }
  }, [deleteFromGoogleDrive]);


  // Watch for create trigger from + button
  // n8n Flow create is a heavier server op (creates the n8n workflow +
  // callback credential), so it uses its own endpoint rather than the
  // optimistic content-create machinery. Refresh + select on success.
  const createN8nFlow = useCallback(async () => {
    try {
      const res = await fetch("/api/workflows/n8n/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "n8n Flow" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to create n8n Flow");
      }
      await fetchTree();
      setSelectedContentId(json.data.contentId, {
        title: "n8n Flow",
        contentType: "workflow",
      });
      toast.success("Created n8n Flow — open it in n8n's editor");
    } catch (err) {
      setErrorDialog({
        title: "Failed to create n8n Flow",
        message: err instanceof Error ? err.message : "Unknown error occurred.",
      });
    }
  }, [fetchTree, setSelectedContentId]);

  useEffect(() => {
    if (createTrigger) {
      // For external links, show dialog for name and URL
      if (createTrigger.type === "external") {
        setExternalLinkDialog({
          open: true,
          mode: "create",
          initialName: "",
          initialUrl: "https://",
          editingId: null,
          parentId: null,
        });
      } else if (createTrigger.type === "n8n-workflow") {
        void createN8nFlow();
      } else {
        // Pass the actual type from createTrigger (folder, note, docx, or xlsx)
        // parentId will be determined in handleCreate based on current selection
        handleCreate(null, createTrigger.type);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createTrigger]);

  // The tree follows the active content (tabs, search, backlinks, the pane
  // "+" picker, …): select it AND reveal it — open its ancestors (adding to
  // what the user has open, never collapsing) and scroll only if it is out
  // of view. Setting selectedIds alone was not enough: FileTree applies an
  // external selection only to VISIBLE rows, so an item inside a folder the
  // tree had collapsed stayed hidden while the picker showed it unfolded
  // (owner report, 2026-10-02). A row the tree itself just opened is skipped.
  //
  // It points at the row that STANDS FOR the content (tree-stand-in.ts): the
  // shortcut — or row inside one — you opened it from, else its own row, else
  // a shortcut leading to it. Opening through a shortcut used to move the
  // selection to the original's row (and ⌥D then acted on the original).
  // Tree data is read through refs: this follows the CONTENT, not refreshes
  // (a refresh must not drag the selection back from wherever you moved it).
  const treeDataRef = useRef(treeData);
  const shortcutTargetTreesRef = useRef(shortcutTargetTrees);
  useEffect(() => {
    treeDataRef.current = treeData;
    shortcutTargetTreesRef.current = shortcutTargetTrees;
  }, [treeData, shortcutTargetTrees]);
  const pointTreeAt = useCallback(
    (contentId: string, reveal: boolean, onlyIfFound = false): void => {
      const standIns = useTreeStandInStore.getState();
      const standIn = treeDataRef.current
        ? resolveTreeRow(
            contentId,
            treeDataRef.current,
            shortcutTargetTreesRef.current,
            standIns.standIns[contentId] ?? null,
          )
        : null;
      // A retry that finds nothing leaves the selection alone — the user may
      // have selected something else since.
      if (!standIn && onlyIfFound) return;
      const rowId = standIn?.rowId ?? contentId;
      standIns.setActiveRow(standIn ? rowId : null);
      // A row inside a shortcut exists only while the shortcut (and each
      // folder on the way) is open.
      for (const id of standIn?.expand ?? []) useTreeStateStore.getState().setExpanded(id, true);
      setSelectedIds([rowId]);
      if (reveal) requestReveal(rowId, { align: "auto", flash: false, explicit: false });
    },
    [setSelectedIds, requestReveal],
  );
  useEffect(() => {
    if (!selectedContentId) {
      useTreeStandInStore.getState().setActiveRow(null);
      return;
    }
    if (selectedContentId.startsWith("temp-")) return;
    const openedHere = treeOpenedIdRef.current === selectedContentId;
    if (openedHere) treeOpenedIdRef.current = null;
    pointTreeAt(selectedContentId, !openedHere);
  }, [selectedContentId, pointTreeAt]);
  // The tree arrived (or changed scope) while the open content had no row to
  // point at: try again. Only then — never re-pointing a row the user has
  // since moved away from.
  useEffect(() => {
    if (!treeData || !selectedContentId || selectedContentId.startsWith("temp-")) return;
    if (useTreeStandInStore.getState().activeRowId !== null) return;
    pointTreeAt(selectedContentId, true, true);
  }, [treeData, selectedContentId, pointTreeAt]);

  // A reveal is handed to the tree only once the tree HOLDS the item: a
  // request for a row the fetched tree lacks would make react-arborist's
  // scrollTo wait ~1s and give up. Implicit requests simply wait for a tree
  // that has it (the picker-created note arrives with the next refetch).
  const activeReveal = useMemo(() => {
    if (!revealRequest || !treeData) return null;
    // A row inside a shortcut isn't in the tree's data (it is built while the
    // shortcut is open): it is held when its shortcut is.
    const heldId = shortcutIdOfMirrorRowId(revealRequest.id) ?? revealRequest.id;
    return findTreeNodeById(treeData, heldId) ? revealRequest : null;
  }, [revealRequest, treeData]);
  const handleRevealComplete = useCallback(() => {
    const current = useTreeRevealStore.getState().request;
    if (current) consumeReveal(current.nonce);
  }, [consumeReveal]);

  // An EXPLICIT reveal ("show in file tree") for an item this tree can't
  // see: in a scoped view, widen to root — the root tree then carries it
  // and the pending request completes there. Nowhere at root → say so.
  useEffect(() => {
    if (!revealRequest?.explicit || !treeData) return;
    if (findTreeNodeById(treeData, revealRequest.id)) return;
    if (effectiveViewRootContentId) {
      setScopeOverride("root");
      return;
    }
    toast.info("This item isn't in the file tree");
    consumeReveal(revealRequest.nonce);
  }, [revealRequest, treeData, effectiveViewRootContentId, consumeReveal]);

  useEffect(() => {
    const handleContentUpdate = (
      event: CustomEvent<{
        contentId: string;
        updates: { title?: string };
      }>,
    ) => {
      const { contentId, updates } = event.detail;
      if (!updates.title) return;

      setTreeData((current) =>
        current ? patchTreeNodeTitle(current, contentId, updates.title!) : current,
      );
      // Rows shown through a shortcut whose folder lives outside the view.
      setShortcutTargetTrees((current) => patchTreeNodeTitle(current, contentId, updates.title!));
    };

    window.addEventListener(
      "content-updated",
      handleContentUpdate as EventListener,
    );

    return () => {
      window.removeEventListener(
        "content-updated",
        handleContentUpdate as EventListener,
      );
    };
  }, []);

  // Listen for edit-external-link events from context menu
  useEffect(() => {
    const handleEditExternal = async (event: CustomEvent<{ id: string }>) => {
      const { id } = event.detail;

      try {
        // Fetch external link data
        const response = await fetch(`/api/content/content/${id}`, {
          credentials: "include",
        });

        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error?.message || "Failed to fetch external link");
        }

        const result = await response.json();
        const externalData = result.data;

        // Open dialog in edit mode
        setExternalLinkDialog({
          open: true,
          mode: "edit",
          initialName: externalData.title,
          initialUrl: externalData.external?.url || "https://",
          editingId: id,
          parentId: null,
        });
      } catch (err) {
        clientLogger.error({
          layer: "ui",
          event: "external_link_load:failed",
          summary: "external link load failed (edit dialog)",
          error: err,
        });
        toast.error("Failed to load external link", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    };

    window.addEventListener('edit-external-link', handleEditExternal as EventListener);
    return () => {
      window.removeEventListener('edit-external-link', handleEditExternal as EventListener);
    };
  }, []);

  // Imperative expand request from outside the tree (e.g. after an upload
  // lands in a collapsed folder). react-arborist only reads initialOpenState
  // on mount, so persisting to the store isn't enough — the tree needs the
  // same expandNodeId path inline creation uses.
  useEffect(() => {
    const handleExpandRequest = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string | null }>).detail?.id;
      if (id) setExpandNodeId(id);
    };

    window.addEventListener("dg:tree-expand", handleExpandRequest);
    return () => window.removeEventListener("dg:tree-expand", handleExpandRequest);
  }, []);

  // Optimistic rows for creates made outside the tree (the reader's Library
  // and bookshelf): show the row now, swap in the real id when the server
  // answers, then reconcile quietly — no skeleton flash.
  useEffect(() => {
    const handleOptimistic = (event: Event) => {
      const detail = (event as CustomEvent<TreeOptimisticDetail>).detail;
      if (!detail) return;
      if (detail.action === "insert") {
        const serverParent = detail.row.parentId;
        const treeParentId =
          !serverParent || serverParent === scopedRootParentId ? null : serverParent;
        setTreeData((current) => {
          if (!current) return current;
          // A parent outside the visible tree: nothing to show until it's opened.
          if (treeParentId && !treeContainsId(current, treeParentId)) return current;
          const node = optimisticTreeNode(detail.tempId, detail.row, treeParentId);
          // Where the create puts it, when the caller says (the picker: top,
          // or right after a sibling). Otherwise where the server will sort
          // it, not on top: those creates store the default displayOrder (0),
          // so the real row lands by title among the other zeros — a
          // placeholder pinned to the top jumped there on resolve.
          // sortedInsertIndex is the tree API's own comparator.
          const place = detail.row.place;
          const insertSorted = (list: TreeNode[]): TreeNode[] => {
            const anchor =
              place && place !== "top" ? list.findIndex((row) => row.id === place.afterId) : -1;
            const at =
              place === "top" ? 0 : anchor !== -1 ? anchor + 1 : sortedInsertIndex(list, node);
            return [...list.slice(0, at), node, ...list.slice(at)];
          };
          if (!treeParentId) return insertSorted(current);
          const insertUnder = (nodes: TreeNode[]): TreeNode[] =>
            nodes.map((candidate) =>
              candidate.id === treeParentId
                ? { ...candidate, children: insertSorted(candidate.children ?? []) }
                : candidate.children?.length
                  ? { ...candidate, children: insertUnder(candidate.children) }
                  : candidate
            );
          return insertUnder(current);
        });
        if (treeParentId) setExpandNodeId(treeParentId);
        return;
      }
      if (detail.action === "remove") {
        setTreeData((current) => (current ? removeTreeNodeById(current, detail.tempId) : current));
        return;
      }
      const { tempId, realId } = detail;
      setTreeData((current) => {
        if (!current) return current;
        // Nothing new (duplicate), or the real row already arrived: drop the placeholder.
        if (!realId || treeContainsId(current, realId)) return removeTreeNodeById(current, tempId);
        return renameTreeNodeId(current, tempId, realId);
      });
      void loadTree(true);
    };

    // `dg:tree-sync`: a quiet refetch for outside writes that don't need a
    // placeholder row (unlike `dg:tree-refresh`, no skeleton).
    const handleSync = () => void loadTree(true);
    window.addEventListener(TREE_OPTIMISTIC_EVENT, handleOptimistic);
    window.addEventListener(TREE_SYNC_EVENT, handleSync);
    return () => {
      window.removeEventListener(TREE_OPTIMISTIC_EVENT, handleOptimistic);
      window.removeEventListener(TREE_SYNC_EVENT, handleSync);
    };
  }, [scopedRootParentId, loadTree]);

  // Media a note's text just gained or lost is shown with that note at once
  // (FileTree, in-text-media.ts); these keep that honest. An edit the data
  // already shows is dropped whenever the data changes — and only then does
  // an old one expire, so the tree never falls back on its own to data from
  // before the edit.
  const inTextEdits = useInTextMediaStore((state) => state.edits);
  const inTextRecordedAt = useInTextMediaStore((state) => state.recordedAt);
  useEffect(() => {
    if (!treeData) return;
    const settled = settleInTextEdits([treeData, shortcutTargetTrees], inTextEdits, Date.now());
    if (settled !== inTextEdits) useInTextMediaStore.getState().settle(settled);
  }, [treeData, shortcutTargetTrees, inTextEdits]);
  // On each new edit: fetch at once a row the tree hasn't loaded (a fresh
  // upload — the edit can't show it until it is here), and reconcile once
  // the save has had time to land (Hocuspocus stores 2–10 s after an edit),
  // so the edits settle and media a note let go of shows where it is kept.
  useEffect(() => {
    if (inTextRecordedAt === 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const missing = missingInTextMedia(
      [treeDataRef.current ?? [], shortcutTargetTreesRef.current],
      useInTextMediaStore.getState().edits,
    );
    if (missing.length > 0) {
      timers.push(setTimeout(() => void loadTreeRef.current?.(true), IN_TEXT_FETCH_MS));
    }
    timers.push(setTimeout(() => void loadTreeRef.current?.(true), IN_TEXT_RECONCILE_MS));
    return () => timers.forEach(clearTimeout);
  }, [inTextRecordedAt]);

  // Imperative reveal request from outside the tree (main-panel path
  // breadcrumb): open the node's ancestors, scroll to it, and select it —
  // the tree-side half of "select this node as if clicked in the tree".
  // Routed through the reveal store like the toolbar button.
  useEffect(() => {
    const handleRevealRequest = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string | null }>).detail?.id;
      if (id) requestReveal(id, { align: "center", flash: true, explicit: true });
    };

    window.addEventListener("dg:tree-reveal", handleRevealRequest);
    return () => window.removeEventListener("dg:tree-reveal", handleRevealRequest);
  }, [requestReveal]);

  useEffect(() => {
    const handleCreateFromTemplate = (
      event: CustomEvent<{
        parentId: string | null;
        templateId: string;
        defaultTitle?: string;
      }>
    ) => {
      const { parentId: requestedParentId, templateId, defaultTitle } =
        event.detail;
      if (!treeData) return;

      const parentId = resolveTreeParent(requestedParentId, treeData, scopedRootParentId);

      const tempId = `temp-${Date.now()}-${Math.random()}`;
      const tempNode: TreeNode = {
        id: tempId,
        title: defaultTitle || "",
        slug: "",
        contentType: "note",
        parentId,
        displayOrder: 0,
        customIcon: null,
        iconColor: null,
        isPublished: false,
        children: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      const insertTempNode = (nodes: TreeNode[]): TreeNode[] => {
        if (parentId === null) {
          return [tempNode, ...nodes];
        }

        return nodes.map((node) => {
          if (node.id === parentId) {
            return {
              ...node,
              children: [tempNode, ...(node.children || [])],
            };
          }
          if (node.children) {
            return {
              ...node,
              children: insertTempNode(node.children),
            };
          }
          return node;
        });
      };

      setTreeData(insertTempNode(treeData));
      // iOS: raise the keyboard now, inside the tap's user-activation window —
      // the rename input mounts asynchronously and its autoFocus alone can't
      // summon the keyboard (see lib/core/mobile-keyboard.ts).
      warmUpMobileKeyboard();
      setCreatingItem({
        type: "note",
        parentId,
        tempId,
        fromTemplateId: templateId,
      });

      if (parentId !== null) {
        setExpandNodeId(parentId);
      }
    };

    window.addEventListener(
      "dg:create-from-template",
      handleCreateFromTemplate as EventListener,
    );
    return () => {
      window.removeEventListener(
        "dg:create-from-template",
        handleCreateFromTemplate as EventListener,
      );
    };
  }, [treeData, scopedRootParentId]);


  // Apply move operation to tree structure (for optimistic updates)
  const applyMoveToTree = (
    tree: TreeNode[],
    nodeId: string,
    newParentId: string | null,
    newIndex: number,
    // The anchor from the drop (see sibling-order.ts). When present, the row
    // is placed by placeAmongSiblings — the same function the move route
    // uses — so the optimistic tree and the server agree. `undefined` keeps
    // the index path for callers without one.
    afterId?: string | null
  ): TreeNode[] => {
    // Find and remove the node from its current location
    let movedNode: TreeNode | null = null;
    let originalParentId: string | null = null;
    let originalIndex: number = -1;

    // Both arrays have to be walked. Referenced children are partitioned out
    // of `children` into `references` by the tree API, so a node dragged out
    // of a reference block is only findable there — searching `children`
    // alone left `movedNode` null and silently no-op'd the whole optimistic
    // update, leaving the drop invisible until a reload.
    const removeNode = (nodes: TreeNode[], parentId: string | null = null): TreeNode[] => {
      return nodes
        .map((node, index): TreeNode | null => {
          if (node.id === nodeId) {
            movedNode = node;
            originalParentId = parentId;
            originalIndex = index;
            return null; // Remove this node
          }
          return {
            ...node,
            children:
              node.children && node.children.length > 0
                ? removeNode(node.children, node.id)
                : (node.children ?? []),
            references:
              node.references && node.references.length > 0
                ? removeNode(node.references, node.id)
                : node.references,
          };
        })
        .filter((node): node is TreeNode => node !== null);
    };

    const treeCopy = removeNode(JSON.parse(JSON.stringify(tree)));

    if (!movedNode) return tree; // Node not found, return original

    // Adjust index if moving within the same parent
    // When we remove the node, indices shift down for items after it
    let adjustedIndex = newIndex;
    const isSameParent = originalParentId === newParentId;

    if (isSameParent && originalIndex !== -1 && originalIndex < newIndex) {
      // If we're moving down in the same parent, the index needs to be decreased by 1
      // because we removed the item, shifting everything down
      adjustedIndex = newIndex - 1;
    }


    // Mirror the server's partition: a referenced node lands in the target's
    // `references`, not its `children`. Inserting into `children` rendered the
    // drop as an ordinary row and left the parent's count chip stale until a
    // reload re-fetched the partitioned tree.
    //
    // Root is the exception on purpose — the API never partitions the root
    // array, because there is no row there to host a block. A reference
    // dropped at root is meant to sit ungrouped, which is the "unassigned"
    // state the root drop deliberately produces.
    const relocated = movedNode as TreeNode;
    const landsInReferences =
      newParentId !== null && relocated.role === "referenced";

    // Insert the node at its new location
    const insertNode = (nodes: TreeNode[]): TreeNode[] => {
      // If this is the target parent (or root if newParentId is null)
      if (newParentId === null) {
        if (afterId !== undefined) {
          return placeAmongSiblings(nodes, relocated, { afterId, index: adjustedIndex });
        }
        // Insert at root level
        const newNodes = [...nodes];
        newNodes.splice(adjustedIndex, 0, relocated);
        return newNodes;
      }

      return nodes.map((node) => {
        if (node.id === newParentId) {
          const landing = { ...relocated, parentId: newParentId };
          if (landsInReferences && afterId !== undefined) {
            return {
              ...node,
              references: placeAmongSiblings(node.references ?? [], landing, {
                afterId,
                index: adjustedIndex,
              }),
            };
          }
          if (landsInReferences) {
            const newReferences = [...(node.references ?? [])];
            // react-arborist's index counts rendered rows (primary children
            // plus any spliced-in references), so it can overshoot this
            // array. Clamp rather than relying on splice's silent append —
            // the server re-sorts by displayOrder on the next fetch anyway.
            newReferences.splice(
              Math.min(adjustedIndex, newReferences.length),
              0,
              landing,
            );
            return { ...node, references: newReferences };
          }
          if (afterId !== undefined) {
            return {
              ...node,
              children: placeAmongSiblings(node.children ?? [], landing, {
                afterId,
                index: adjustedIndex,
              }),
            };
          }
          // Found the target parent, insert into its children
          const newChildren = [...(node.children || [])];
          newChildren.splice(adjustedIndex, 0, landing);
          return {
            ...node,
            children: newChildren,
          };
        }
        // Recurse through both arrays — the target may itself be a reference
        // (a side chat inside a block that owns its own deliverables).
        return {
          ...node,
          children:
            node.children && node.children.length > 0
              ? insertNode(node.children)
              : (node.children ?? []),
          references:
            node.references && node.references.length > 0
              ? insertNode(node.references)
              : node.references,
        };
      });
    };

    return insertNode(treeCopy);
  };

  // Handle node move (drag-and-drop)
  // The tail of every move request sent so far (see handleMove).
  const moveRequestChainRef = useRef<Promise<unknown>>(Promise.resolve());

  const handleMove = async (args: {
    dragIds: string[];
    parentId: string | null;
    index: number;
    /** From FileTree: the row the drop landed after, read off the screen. */
    afterId?: string | null;
  }) => {
    const { dragIds, index, afterId } = args;
    let { parentId } = args;

    // Store original tree state for rollback if any move fails
    const originalTree = treeData;
    const targetTreesBefore = shortcutTargetTrees;
    const rootTreeSortBefore = rootTreeSort;

    if (!originalTree || dragIds.length === 0) return;

    // Dropping onto a folder-shortcut — or onto a folder inside a shortcut's
    // mirror — means "put this in the folder it points at". Rewriting the
    // destination here, before anything optimistic or networked happens, is
    // what keeps the rule "nothing is ever stored under a shortcut" true
    // without the rest of the move path needing to know shortcuts exist.
    // The row the drop landed on, before forwarding — a shortcut's own row
    // when the drop went among its contents.
    const dropRowId = parentId;
    if (parentId) {
      const dropRow = findTreeNodeById(originalTree, parentId);
      const forwardTo = dropRow ? resolveDropForwardTarget(dropRow) : null;
      if (forwardTo) parentId = forwardTo;
    }

    // Find each dragged node's current position. Computed up-front so
    // we don't re-traverse the tree N times in the loop, and so the
    // displayOrder math below can correctly adjust for each item's
    // own pre-move location (different items may live in different
    // parents under a multi-select drag).
    const positions = new Map<
      string,
      { currentParentId: string | null; currentIndex: number }
    >();
    // Walks both arrays: a row inside a parent's reference block is a
    // perfectly ordinary drag source, and skipping `references` left it
    // without a recorded position. The index it yields is within whichever
    // array held it — only consulted for same-parent reordering, where the
    // server re-sorts by displayOrder anyway.
    const findPositions = (nodes: TreeNode[], parent: string | null = null) => {
      for (let i = 0; i < nodes.length; i++) {
        if (dragIds.includes(nodes[i].id)) {
          positions.set(nodes[i].id, { currentParentId: parent, currentIndex: i });
        }
        if (nodes[i].children && nodes[i].children.length > 0) {
          findPositions(nodes[i].children, nodes[i].id);
        }
        if (nodes[i].references && nodes[i].references.length > 0) {
          findPositions(nodes[i].references, nodes[i].id);
        }
      }
    };
    findPositions(originalTree);
    // A shortcut's row moves its real item, which in a view may live only in
    // the carried out-of-view targets (shortcutTargetTrees).
    findPositions(targetTreesBefore);

    // Resolve every dragged node, dropping any id that no longer names a live
    // row rather than aborting the whole drag.
    //
    // react-arborist reports drag ids from its internal selection set, and it
    // does NOT prune that set when `data` changes — its `selectedNodes` getter
    // filters on read, but the drag hook reads the raw `selectedIds`. So a dead
    // id can ride along in `dragIds` even though the user only grabbed live
    // rows: a `temp-…` placeholder swapped for its real id after inline
    // creation, or a node a refetch removed while it was selected. The row the
    // user actually grabbed is always live (you can only drag a visible row),
    // so keeping the resolvable ids and moving those matches how react-arborist
    // itself treats the selection. Before this, one stale companion id aborted
    // the entire drag with "could not be found in the current tree" — a freshly
    // created item was unmovable until the tree was refetched (which cleared the
    // stale id as a side effect). Only bail when nothing at all resolves.
    const dragged = dragIds
      .map((id) => ({
        id,
        node: findTreeNodeById(originalTree, id) ?? findTreeNodeById(targetTreesBefore, id),
      }))
      .filter((x): x is { id: string; node: TreeNode } => x.node !== null);
    if (dragged.length === 0) {
      toast.error("Failed to move item", {
        description: "The dragged item could not be found in the current tree.",
      });
      return;
    }

    // People-mount drags are routed through a different endpoint and
    // cannot be batched. Reject any multi-drag that includes one.
    const peopleDragged = dragged.filter((d) => isPeopleTreeNode(d.node));
    if (peopleDragged.length > 0 && dragged.length > 1) {
      toast.error("Failed to move item", {
        description: "People mounts can only be moved one at a time.",
      });
      return;
    }

    // For the people single-drag path: reject placement into virtual
    // people parents (only real folders or root are allowed).
    if (
      peopleDragged.length === 1 &&
      (parentId?.startsWith("peopleGroup:") || parentId?.startsWith("person:"))
    ) {
      toast.error("Failed to move item", {
        description:
          "Contacts and groups can only be placed at the root or inside real folders. Use the People view to change group membership.",
      });
      return;
    }

    // Referenced content IN another note's text stays with that note (owner,
    // 2026-10-06): dropping it onto a different note is refused with the
    // reason, before anything moves — the same message a drop into a folder
    // gives when it snaps back. The move route refuses it too.
    if (parentId && findTreeNodeById(originalTree, parentId)?.contentType === "note") {
      for (const { node } of dragged) {
        const holder = inTextElsewhere(node, parentId);
        if (holder) {
          toast.warning("Unable to move referenced content", {
            description: `This content is still embedded in “${holder.title}”. Remove it from that note's text to move it.`,
          });
          return;
        }
      }
    }

    // Skip no-op drops: every dragged item is already at its target
    // position (same parent, adjacent index). React-arborist sometimes
    // fires `onMove` even when the user just released without changing
    // anything.
    // Each dragged row's anchor: the first goes after the drop's anchor, each
    // next one after the row before it, so the group keeps its drag order.
    const anchorFor = (i: number): string | null | undefined =>
      afterId === undefined ? undefined : i === 0 ? afterId : dragged[i - 1].id;

    // With an anchor, "no-op" means the placement leaves the list exactly as
    // it is. The index comparison below can't be trusted then: `index` counts
    // the rows on screen (an open reference block included) and
    // `currentIndex` the data array, so with a block open at the start a real
    // move to the top read as a no-op and was silently dropped.
    const listHolding = (id: string): TreeNode[] | null => {
      const pos = positions.get(id);
      if (!pos) return null;
      if (pos.currentParentId === null) return originalTree;
      const holder =
        findTreeNodeById(originalTree, pos.currentParentId) ??
        findTreeNodeById(targetTreesBefore, pos.currentParentId);
      if (!holder) return null;
      if (holder.children?.some((c) => c.id === id)) return holder.children;
      if (holder.references?.some((c) => c.id === id)) return holder.references ?? null;
      return null;
    };
    const everyDragIsNoop =
      afterId !== undefined
        ? (() => {
            const list = listHolding(dragged[0].id);
            if (!list) return false;
            const allHere = dragged.every(
              ({ id }) => positions.get(id)?.currentParentId === parentId && listHolding(id) === list
            );
            if (!allHere) return false;
            let order: TreeNode[] = list;
            dragged.forEach(({ node }, i) => {
              order = placeAmongSiblings(order, node, { afterId: anchorFor(i), index: index + i });
            });
            return order.map((n) => n.id).join("\n") === list.map((n) => n.id).join("\n");
          })()
        : dragged.every(({ id }) => {
            const pos = positions.get(id);
            if (!pos) return false;
            const isSameParent = pos.currentParentId === parentId;
            return (
              isSameParent &&
              (pos.currentIndex === index || pos.currentIndex === index - 1)
            );
          });
    if (everyDragIsNoop) return;

    // Reordering inside a shortcut that keeps its OWN sort (a view-only
    // setting): the shortcut has no hand-set order of its own, so the drop
    // goes to its folder like any shortcut drag, and the shortcut's sort
    // turns off — your order wins, as in a sorted folder. Undone if the
    // move fails.
    const sortedShortcutId =
      dropRowId && dropRowId !== parentId && shortcutSorts?.[dropRowId] &&
      dragged.every(({ id }) => positions.get(id)?.currentParentId === parentId)
        ? dropRowId
        : null;
    const shortcutSortsBefore = shortcutSorts;
    if (sortedShortcutId && shortcutSortsBefore) {
      const without = { ...shortcutSortsBefore };
      delete without[sortedShortcutId];
      void useSettingsStore.getState().setUISettings({ shortcutSorts: without });
    }
    const restoreShortcutSort = () => {
      if (sortedShortcutId && shortcutSortsBefore) {
        void useSettingsStore.getState().setUISettings({ shortcutSorts: shortcutSortsBefore });
      }
    };

    beginTreeEdit();

    try {
      // OPTIMISTIC UPDATE: walk every dragged id and apply each move to
      // the working tree, offsetting the index by i so items keep their
      // drag-order in the destination.
      // A move that touches the carried out-of-view shortcut targets — a
      // shortcut's row dragged (its real item lives there), or a drop onto an
      // out-of-view shortcut — moves rows ACROSS the two collections, so the
      // shortcut's contents and the view both show the result now rather
      // than after the reconcile. Everything else keeps the visible-tree path.
      if (
        moveTouchesCarried(
          { main: originalTree, carried: targetTreesBefore },
          dragged.map(({ id }) => id),
          parentId,
        )
      ) {
        const moved = moveAcrossForests(
          { main: originalTree, carried: targetTreesBefore },
          dragged.map(({ node }, i) => ({
            node,
            placement: { afterId: anchorFor(i), index: index + i },
          })),
          parentId,
        );
        setTreeData(moved.main);
        setShortcutTargetTrees(moved.carried);
      } else {
        // Reordering inside a folder that keeps a sort turns its sort off —
        // your order wins (the move route does the same). Fix its rows in the
        // order the sort showed first, so the drop lands among them as seen.
        const destinationKept =
          parentId === null
            ? rootTreeSort
            : (findTreeNodeById(originalTree, parentId)?.folder?.treeSort ?? null);
        const reordersSortedFolder =
          !!destinationKept &&
          dragged.every(({ id }) => positions.get(id)?.currentParentId === parentId);
        let optimisticTree = originalTree;
        if (reordersSortedFolder) {
          if (parentId === null) {
            optimisticTree = orderKeptLevel(optimisticTree, destinationKept);
            setRootTreeSort(null);
          } else {
            optimisticTree = clearKeptSort(optimisticTree, parentId);
          }
        }
        for (let i = 0; i < dragged.length; i++) {
          optimisticTree = applyMoveToTree(
            optimisticTree,
            dragged[i].id,
            parentId,
            index + i,
            anchorFor(i),
          );
        }
        setTreeData(optimisticTree);
      }

      // Fire the moves sequentially — and after every earlier drag's moves.
      // Each POST re-reads the destination's siblings and renumbers them all,
      // so two drags made in quick succession used to overlap: the second
      // read the list before the first had written, and its renumbering
      // undid the first drag ("the drag didn't stick" after the refresh).
      // The server now also locks a folder's order while it places a row;
      // this chain additionally keeps the moves in the order they were made,
      // which the optimistic tree already assumes.
      const failures: Array<{ id: string; message: string }> = [];
      // A detached reference that's still embedded in a note will re-nest
      // under it on the next tree fetch (embed-graph ownership). Capture the
      // server's flag so the snap-back happens visibly after a beat, with an
      // explanation — not silently on some later refresh.
      let snapBackTo: { id: string; title: string } | null = null;
      // The server turned a folder's sort off because this drag reordered it.
      let sortCleared = false;
      const sendMoves = async () => {
        for (let i = 0; i < dragged.length; i++) {
          const { id, node } = dragged[i];
          const pos = positions.get(id);
          const isSameParent = pos?.currentParentId === parentId;
          const insertionIndex = index + i;
          // react-arborist gives the insertion point; the server expects
          // the final visual position. When moving DOWN within the same
          // parent, subtract 1 to account for the item's own removal
          // shifting everything left.
          const apiIndex =
            isSameParent && pos && pos.currentIndex < insertionIndex
              ? insertionIndex - 1
              : insertionIndex;

          const response = isPeopleTreeNode(node)
            ? await fetch("/api/people/mounts", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  target: toPeopleMountTarget(node),
                  contentParentId: parentId ?? scopedRootParentId,
                  displayOrder: apiIndex,
                  allowRemount: true,
                }),
              })
            : await fetch("/api/content/content/move", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contentId: id,
                  targetParentId: parentId ?? scopedRootParentId,
                  newDisplayOrder: apiIndex,
                  // The placement that actually decides it (see sibling-order.ts);
                  // newDisplayOrder stays as the server's fallback.
                  afterId: anchorFor(i),
                }),
              });

          const result = await response.json().catch(() => ({}) as { error?: { message?: string; code?: string }; success?: boolean });
          if (!response.ok || !result.success) {
            failures.push({
              id,
              message: result.error?.message ?? `HTTP ${response.status}`,
            });
          } else {
            const moved = (
              result as {
                data?: {
                  stillReferencedBy?: { id: string; title: string } | null;
                  sortCleared?: boolean;
                };
              }
            ).data;
            if (moved?.stillReferencedBy) snapBackTo = moved.stillReferencedBy;
            if (moved?.sortCleared) sortCleared = true;
          }
        }
      };
      const queued = moveRequestChainRef.current.then(sendMoves);
      moveRequestChainRef.current = queued.catch(() => undefined);
      await queued;

      if (failures.length > 0) {
        clientLogger.error({
          layer: "ui",
          event: "tree_move:failed",
          summary: `tree move api rejected ${failures.length}/${dragged.length} item(s)`,
          attrs: {
            target_parent_id: parentId ?? "root",
            failure_count: failures.length,
            total_count: dragged.length,
            first_failure: failures[0]?.message ?? "unknown",
          },
        });
        // Rollback to original tree state so the UI matches truth.
        setTreeData(originalTree);
        setShortcutTargetTrees(targetTreesBefore);
        setRootTreeSort(rootTreeSortBefore);
        restoreShortcutSort();
        const desc =
          failures.length === dragged.length
            ? failures[0].message
            : `${failures.length} of ${dragged.length} items could not be moved (${failures[0].message}).`;
        toast.error("Failed to move item", { description: desc });
        throw new Error(desc);
      }

      // Drag-moves refresh the tree locally (optimistic update above), so
      // outside listeners — the main-panel path breadcrumb — need their own
      // signal that ancestry may have changed. Reports the ids that actually
      // moved (resolved), not the raw drag ids, which may carry a stale entry.
      window.dispatchEvent(
        new CustomEvent("dg:content-moved", {
          detail: { ids: dragged.map((d) => d.id) },
        }),
      );

      if (peopleDragged.length > 0) {
        window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
        window.dispatchEvent(new CustomEvent("dg:people-refresh"));
      }

      if (sortedShortcutId) {
        const shortcutTitle = findTreeNodeById(originalTree, sortedShortcutId)?.title ?? "this shortcut";
        toast(`Sorting turned off for shortcut “${shortcutTitle}”`, {
          description: "Your drop went to its folder, so the shortcut now shows the folder's own order.",
        });
      }

      if (sortCleared) {
        const folderTitle =
          parentId === null
            ? (scopedRootTitle ?? "this level")
            : (findTreeNodeById(originalTree, parentId)?.title ?? "this folder");
        toast(`Sorting turned off for “${folderTitle}”`, {
          description: "You reordered it by hand, so your order is kept. Sort it again from the ⇅ menu.",
        });
      }

      if (snapBackTo) {
        const owner = snapBackTo;
        // Let the drop land visibly, then snap back with the reason. The
        // refetched tree re-nests via the embed-graph ownership fallback.
        setTimeout(() => {
          void fetchTree();
          // No "remove the embed to move it freely" advice here: removing
          // the LAST embed garbage-collects the media to trash (see
          // syncImageReferences ref-counting), which isn't "freeing" it.
          toast.warning("Unable to move referenced content", {
            description: `This content is still embedded in "${owner.title}".`,
          });
        }, 2500);
      }
    } catch (err) {
      clientLogger.error({
        layer: "ui",
        event: "tree_move:caught",
        summary: "tree move handler caught",
        attrs: {
          content_id: dragIds[0] ?? "unknown",
          drag_count: dragIds.length,
        },
        error: err,
      });
      // Rollback to original tree state on any error
      setTreeData(originalTree);
      setShortcutTargetTrees(targetTreesBefore);
      setRootTreeSort(rootTreeSortBefore);
      restoreShortcutSort();

      // Show user-friendly error notification
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      if (!errorMessage.includes("Failed to move content")) {
        // Only show toast if we haven't already shown one above
        toast.error("Failed to move item", {
          description: errorMessage,
        });
      }

      throw err;
    } finally {
      // Reconcile once the writes are in — a refresh that started during the
      // drag was dropped (treeResponseApplies), so this is the one that lands.
      endTreeEdit();
    }
  };

  // Count total nodes in tree (including nested)
  const countTotalNodes = (nodes: TreeNode[]): number => {
    let count = 0;
    for (const node of nodes) {
      count += 1;
      if (node.children && node.children.length > 0) {
        count += countTotalNodes(node.children);
      }
    }
    return count;
  };

  // Handle node selection
  const handleSelect = (
    nodes: TreeNode[],
    options: { openContent: boolean } = { openContent: true },
  ) => {
    // Update selection count for status bar
    setSelectedCount(nodes.length);

    // Notify parent about multi-selection state (for disabling create button)
    const hasMultiple = nodes.length > 1;
    if (onSelectionChange) {
      onSelectionChange(hasMultiple);
    }

    // Shift-click is a bulk-selection gesture, not navigation. Keep every
    // selection/status update above, but leave the active pane untouched.
    if (!options.openContent) return;

    // Open content in main panel - use first selected.
    // An EMPTY selection must NOT clear the open content: react-arborist fires
    // onSelect([]) when the freshly-loaded tree mounts (and on stray
    // deselects), which would otherwise null the global selection ~after load
    // and collapse the right sidebar to backlinks. The open content is closed
    // via tab-close or the explicit root-node click, never via a tree deselect.
    const firstNode = nodes[0];
    if (!firstNode) return;

    // Opening from a tree click: remember the id so the follow-the-active-
    // content reveal leaves the tree where the user clicked (see the
    // selectedContentId effect) — a shortcut click must not scroll off to
    // the target's real home.
    const openFromTree = (
      id: string,
      meta: Parameters<typeof setSelectedContentId>[1],
      /** The row clicked — a shortcut or a row inside one opens another id. */
      viaRowId: string = id,
    ) => {
      treeOpenedIdRef.current = id;
      // Opened through a shortcut: that row stands in for the content while
      // you work through it (tree-stand-in.ts); opened from its own row: the
      // stand-in is forgotten. The tree keeps pointing where you clicked.
      const standIns = useTreeStandInStore.getState();
      if (viaRowId !== id) standIns.remember(id, viaRowId);
      else standIns.forget(id);
      standIns.setActiveRow(viaRowId);
      setSelectedContentId(id, meta);
    };

    // Side-by-side open (owner call, 2026-10-02). In a split layout a tree
    // click puts content in the pane OPPOSITE the one you are working in,
    // instead of replacing what you are reading — the complaint was that
    // opening a second document cost you the first.
    //
    // `focusPane: false` is the other half: see ContentSelectionOptions, but
    // in short, taking focus would move activePaneId to the target, so the
    // NEXT tree click would compute "opposite" from there and land back on the
    // document we just protected.
    //
    // In `single` the opposite IS the active pane, so we send nothing and the
    // behavior is exactly what it was. Read imperatively — this is an event
    // handler, and a reactive layoutMode would only add a stale-closure risk.
    const { layoutMode, activePaneId, panes } = useContentStore.getState();
    // Read the preference even though nothing can change it yet: the seam is
    // the point. When the settings control lands it has nowhere new to reach.
    const destinationPaneId = resolveOpenDestinationPane(
      layoutMode,
      activePaneId,
      (paneId) => (panes[paneId]?.tabIds.length ?? 0) === 0,
      useSettingsStore.getState().ui?.openDestination,
    );
    // A held direction key (lib/features/content/pane-hotkeys.ts) is an
    // explicit aim and outranks the automatic rule — you said where it goes,
    // so nothing should second-guess it. It also TAKES focus, unlike the
    // automatic placement: naming a pane is a decision to work there, where
    // the automatic one is a decision to keep working where you are.
    const aimed = heldPaneTarget();
    let sideBySide: {
      paneId?: WorkspacePaneId;
      focusPane?: boolean;
      pin?: boolean;
    };

    if (aimed === PANE_HOTKEY_SINGLE) {
      // S collapses to one pane and the clicked content becomes the live one,
      // so focus is exactly what is wanted here — nothing to send.
      useContentStore.getState().setLayoutMode("single");
      sideBySide = {};
    } else if (aimed) {
      // Grow the layout to reach a pane that isn't on screen yet, the same way
      // the context menu's "(expand layout)" entries do — pressing Z in a
      // vertical split opens a quad rather than silently landing elsewhere.
      const neededLayout = resolveLayoutModeForPane(layoutMode, aimed);
      if (neededLayout !== layoutMode) {
        useContentStore.getState().setLayoutMode(neededLayout);
      }
      // An aimed open is PINNED. Holding a key and naming a pane is placing,
      // not browsing — the next casual click must land beside it, not over
      // it. This matches the context menu's "Open In Pane", the other
      // deliberate path, which already pins; before this the two disagreed.
      // The automatic placement stays a preview on purpose: when the rule
      // chose the pane for you, you have committed to nothing yet.
      sideBySide = { paneId: aimed, pin: true };
    } else {
      sideBySide =
        destinationPaneId === activePaneId
          ? {}
          : { paneId: destinationPaneId, focusPane: false };
    }

    // A mirror row is a projection of content that lives elsewhere. Its own id
    // is synthetic and path-scoped, so opening it means opening the REAL id —
    // otherwise the tab would hold an id no fetch can resolve.
    if (firstNode.isShortcutMirror && firstNode.mirrorOf) {
      openFromTree(
        firstNode.mirrorOf,
        {
          title: firstNode.title,
          contentType: firstNode.contentType,
          ...sideBySide,
        },
        firstNode.id,
      );
      return;
    }

    // A shortcut is a pointer: opening it opens what it points at, and the
    // shortcut's own id never enters a workspace tab. A BROKEN one is the
    // exception — there is nothing to open, so we select the shortcut itself
    // and let the viewer explain (and offer to remove it).
    if (firstNode.contentType === "shortcut") {
      const target = firstNode.shortcut;
      if (target?.targetId && !target.targetDeleted) {
        openFromTree(
          target.targetId,
          {
            title: target.targetTitle ?? firstNode.title,
            contentType: target.targetContentType ?? undefined,
            ...sideBySide,
          },
          firstNode.id,
        );
      } else {
        openFromTree(firstNode.id, {
          title: firstNode.title,
          contentType: "shortcut",
          ...sideBySide,
        });
      }
      return;
    }

    if (firstNode.treeNodeKind === "person") {
      openFromTree(firstNode.id, {
        title: firstNode.title,
        contentType: "person-profile",
        ...sideBySide,
      });
      return;
    }

    if (firstNode.treeNodeKind === "peopleGroup") {
      return;
    }

    openFromTree(firstNode.id, {
      title: firstNode.title,
      contentType: firstNode.contentType,
      ...sideBySide,
    });
  };

  /**
   * Create a shortcut once the picker has supplied a target.
   *
   * Destination follows the External Link rules: context-menu creates carry an
   * explicit parent, header creates derive one from the tree selection, and in
   * a view-scoped tree an unselected create belongs to the view root rather
   * than the vault root. One addition — if that lands on a shortcut, we use
   * ITS parent, because nothing is ever stored under a shortcut.
   *
   * Opens the TARGET afterwards, not the new row: the user asked for a way to
   * reach that content, so reaching it is the natural end of the gesture.
   */
  const handleShortcutCreate = async (
    target: PickerTarget,
    explicitParentId: string | null,
  ) => {
    // Same rule as every other create (lib/domain/content/create-target.ts);
    // a shortcut target resolves to its parent, an orphaned parent to the top
    // of the current tree (the view root in a scoped view).
    const parentId = toServerParent(
      resolveTreeParent(explicitParentId, treeData, scopedRootParentId),
      scopedRootParentId
    );

    try {
      const response = await fetch("/api/content/content", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: target.title,
          parentId,
          shortcutTargetId: target.id,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        clientLogger.error({
          layer: "ui",
          event: "shortcut_create:failed",
          summary: "shortcut create api rejected",
          attrs: { error_code: result.error?.code ?? "unknown" },
        });
        setErrorDialog({
          title: "Failed to create shortcut",
          message:
            result.error?.message || "Unknown error occurred. Please try again.",
        });
        return;
      }

      rememberDestination(parentId);
      await fetchTree();
      setSelectedContentId(target.id, {
        title: target.title,
        contentType: target.contentType,
      });
      toast.success(`Shortcut to "${target.title}" created`);
    } catch (error) {
      clientLogger.error({
        layer: "ui",
        event: "shortcut_create:caught",
        summary: "shortcut create threw",
        error,
      });
      setErrorDialog({
        title: "Failed to create shortcut",
        message: "Could not reach the server. Please try again.",
      });
    }
  };

  // Handler: Create or edit external link from dialog
  const handleExternalLinkCreate = async (data: { name: string; url: string }) => {
    try {
      const isEditing = externalLinkDialog.mode === "edit" && externalLinkDialog.editingId;

      if (isEditing) {
        // Edit existing external link
        const response = await fetch(`/api/content/content/${externalLinkDialog.editingId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: data.name.trim(),
            url: data.url,
          }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          clientLogger.error({
            layer: "ui",
            event: "external_link_update:failed",
            summary: "external link update api rejected",
            attrs: {
              content_id: externalLinkDialog.editingId ?? "unknown",
              error_code: result.error?.code ?? "unknown",
            },
          });
          setErrorDialog({
            title: "Failed to update external link",
            message: result.error?.message || "Unknown error occurred. Please try again.",
          });
          return;
        }

        // Success! Refresh tree
        await fetchTree();
        toast.success(`Updated external link "${data.name}"`);

        // Notify MainPanel to refetch content (to update URL in viewer)
        window.dispatchEvent(new CustomEvent('content-updated', {
          detail: {
            contentId: externalLinkDialog.editingId,
            updates: { title: data.name.trim(), url: data.url }
          }
        }));
      } else {
        // Create new external link
        // Context-menu creates carry an explicit destination; header
        // creates (parentId null) derive it from the tree selection, and
        // in a view-scoped tree an unselected create belongs to the view
        // root rather than the vault root.
        // One create rule (lib/domain/content/create-target.ts): explicit
        // target, else the selection, else the top of the current tree — the
        // view root in a scoped view, never a trashed folder's id.
        const parentId = toServerParent(
          resolveTreeParent(externalLinkDialog.parentId, treeData, scopedRootParentId),
          scopedRootParentId
        );

        // Create via API
        const response = await fetch("/api/content/content", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: data.name.trim(),
            parentId,
            url: data.url,
            subtype: "website",
          }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          clientLogger.error({
            layer: "ui",
            event: "external_link_create:failed",
            summary: "external link create api rejected",
            attrs: { error_code: result.error?.code ?? "unknown" },
          });
          setErrorDialog({
            title: "Failed to create external link",
            message: result.error?.message || "Unknown error occurred. Please try again.",
          });
          return;
        }

        // Success! Refresh tree and navigate to new link
        rememberDestination(parentId);
        await fetchTree();
        setSelectedContentId(result.data.id, {
          title: result.data.title,
          contentType: result.data.contentType ?? "external",
        });
        toast.success(`Created external link "${data.name}"`);
      }
    } catch (err) {
      clientLogger.error({
        layer: "ui",
        event: "external_link_save:caught",
        summary: "external link save handler caught",
        attrs: { mode: externalLinkDialog.mode },
        error: err,
      });
      setErrorDialog({
        title: `Failed to ${externalLinkDialog.mode === "edit" ? "update" : "create"} external link`,
        message: "An unexpected error occurred. Please try again.",
      });
    }
  };

  // Handler: Submit inline creation (when user presses Enter on temp node)
  const handleCreateSubmit = async (title: string) => {
    if (!creatingItem || !title.trim()) {
      // User submitted empty name - cancel creation
      handleCreateCancel();
      return;
    }

    const { type, parentId, tempId, fromTemplateId } = creatingItem;
    const createTarget = treeData ? getCreateTarget(parentId, treeData) : {
      treeParentId: parentId,
      requestParentId: parentId,
      ...parsePeopleVirtualParentId(parentId),
    };

    // Race guard: if the resolved server-side parent is still a `temp-…`
    // placeholder, the parent's optimistic insert hasn't been confirmed
    // by the server yet. Sending this would surface the raw Prisma
    // "invalid input syntax for type uuid" error (server now translates
    // it to PARENT_NOT_READY, but skipping the round-trip is friendlier).
    // The user can retry in a moment once the parent's real UUID lands.
    // View-scope remap: with the view root's row gone, a top-level create in
    // a scoped tree belongs to the view root, not the vault root. People
    // virtual parents keep their null requestParentId — the people ids carry
    // the placement.
    const requestParentId =
      createTarget.peopleGroupId || createTarget.personId
        ? createTarget.requestParentId
        : (createTarget.requestParentId ?? scopedRootParentId);
    const reqParent = createTarget.requestParentId;
    if (typeof reqParent === "string" && reqParent.startsWith("temp-")) {
      setErrorDialog({
        title: "Parent still being created",
        message:
          "The parent folder hasn't finished saving yet. Wait a moment and try again.",
      });
      handleCreateCancel();
      return;
    }
    const optimisticContentType: ContentType =
      type === "docx" || type === "xlsx" || type === "json"
        ? "file"
        : (type as ContentType);

    // Optimistically navigate to new file (not folders) immediately
    if (type !== "folder") {
      setSelectedContentId(tempId, {
        title: title.trim() || "Untitled",
        contentType: optimisticContentType,
        temporary: true,
      });
    }

    // Auto-add .md extension to note files if not present

    try {
      // Prepare payload based on content type
      const defaults: Record<string, { title: string; payload?: Record<string, unknown>; fileType?: "docx" | "xlsx" | "json" }> = {
        folder: { title: title.trim() },
        note: {
          title: title.trim(),
          payload: {
            tiptapJson: {
              type: "doc",
              content: [{ type: "paragraph" }],
            },
          },
        },
        code: {
          title: title.trim(),
          payload: {
            code: "// Your code here",
            language: "javascript",
          },
        },
        html: {
          title: title.trim(),
          payload: {
            html: "<h1>Hello World</h1>",
          },
        },
        file: {
          title: title.trim(),
          // File type requires upload flow - should not reach here
        },
        docx: {
          title: title.trim(), // API will add .docx extension
          fileType: "docx",
        },
        xlsx: {
          title: title.trim(), // API will add .xlsx extension
          fileType: "xlsx",
        },
        json: {
          title: title.trim(), // API will add .json extension
          fileType: "json",
        },
        // Phase 2: New content types (external handled separately via dialog)
        chat: {
          title: title.trim(),
          payload: {
            messages: [],
          },
        },
        visualization: {
          title: title.trim(),
          payload: {
            engine: createTrigger?.engine || pendingVisualizationEngine.current || "mermaid", // Default to mermaid if not specified
            config: {}, // Engine-specific configuration
            data: {}, // Engine-specific data
          },
        },
        data: {
          title: title.trim(),
          payload: {
            mode: "inline",
            source: {},
          },
        },
        hope: {
          title: title.trim(),
          payload: {
            kind: "goal",
            status: "active",
            description: "",
          },
        },
        workflow: {
          title: title.trim(),
          payload: {
            engine: "placeholder",
            definition: {},
            enabled: false,
          },
        },
      };

      const config = defaults[type];
      if (!config) {
        throw new Error(`Unknown content type: ${type}`);
      }

      // Build request body — keys vary per content type (payload spread later)
      const requestBody: Record<string, unknown> = {
        title: config.title,
        parentId: requestParentId,
        // Where the placeholder row already is (insertTempNode puts it first),
        // so the real row doesn't jump to its alphabetical spot on reconcile.
        position: "top",
      };
      if (createTarget.peopleGroupId) {
        requestBody.peopleGroupId = createTarget.peopleGroupId;
      }
      if (createTarget.personId) {
        requestBody.personId = createTarget.personId;
      }

      // Add type-specific payloads or use special endpoints
      if (type === "docx" || type === "xlsx" || type === "json") {
        // Office documents and JSON files use dedicated creation endpoint
        const response = await fetch("/api/content/content/create-document", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: config.title,
            fileType: config.fileType,
            parentId: requestParentId,
          }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          clientLogger.error({
            layer: "ui",
            event: "create_document:failed",
            summary: "create-document api rejected",
            attrs: {
              file_type: config.fileType ?? "unknown",
              error_code: result.error?.code ?? "unknown",
            },
          });

          // Remove temp node on error
          if (treeData) {
            const removeTempNode = (nodes: TreeNode[]): TreeNode[] => {
              return nodes
                .filter((node) => node.id !== tempId)
                .map((node) => ({
                  ...node,
                  children: node.children ? removeTempNode(node.children) : [],
                }));
            };
            setTreeData(removeTempNode(treeData));
          }
          setCreatingItem(null);
          closeContentTabs([tempId]);

          setErrorDialog({
            title: "Failed to create document",
            message: result.error?.message || "Unknown error occurred. Please try again.",
          });
          return;
        }

        // Success! Refresh tree to show new document
        fetchTree();
        setCreatingItem(null);
        rememberDestination(requestParentId ?? null);
        replaceContentTab(`tab:${tempId}`, result.data.id, {
          title: result.data.title,
          contentType: result.data.contentType ?? "file",
          temporary: false,
          pin: true,
        });
        return;
      }

      if (fromTemplateId) {
        requestBody.fromTemplateId = fromTemplateId;
      }

      if (type === "folder") {
        requestBody.isFolder = true;
      } else if (type === "note" && !fromTemplateId) {
        requestBody.tiptapJson = config.payload?.tiptapJson;
      } else if (type === "code") {
        requestBody.code = config.payload?.code;
        requestBody.language = config.payload?.language;
      } else if (type === "html") {
        requestBody.html = config.payload?.html;
      } else if (type === "chat") {
        requestBody.contentType = "chat";
        requestBody.chatMessages = config.payload?.messages || [];
        requestBody.chatMetadata = {};
      } else if (type === "workflow") {
        requestBody.contentType = "workflow";
      } else if (type === "data") {
        // The server seeds the column + view; the client sends only the intent.
        requestBody.contentType = "data";
        if (createTrigger?.dataMode) {
          requestBody.dataMode = createTrigger.dataMode;
        }
      } else if (type === "visualization") {
        requestBody.engine = config.payload?.engine;
        requestBody.chartConfig = config.payload?.config || {};
        requestBody.chartData = config.payload?.data || {};
      }
      // Note: external type handled separately via handleExternalLinkCreate

      // Create via API
      const response = await fetch("/api/content/content", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        clientLogger.error({
          layer: "ui",
          event: "content_create:failed",
          summary: "content create api rejected",
          attrs: {
            content_type: type,
            error_code: result.error?.code ?? "unknown",
          },
        });

        // Remove temp node on error
        if (treeData) {
          const removeTempNode = (nodes: TreeNode[]): TreeNode[] => {
            return nodes
              .filter((node) => node.id !== tempId)
              .map((node) => ({
                ...node,
                children: node.children ? removeTempNode(node.children) : [],
              }));
          };
          setTreeData(removeTempNode(treeData));
        }
        setCreatingItem(null);

        // Clear optimistic navigation
        if (type !== "folder") {
          closeContentTabs([tempId]);
        }

        setErrorDialog({
          title: "Failed to create",
          message: result.error?.message || "Unknown error occurred. Please try again.",
        });
        return;
      }

      // Success! Replace temporary node with real node from server
      if (!createTarget.peopleGroupId && !createTarget.personId) {
        rememberDestination(requestParentId ?? null);
      }
      if (treeData && result.data) {
        const apiResponse = result.data;

        // Convert API response to TreeNode format
        const realNode: TreeNode = {
          id: apiResponse.id,
          title: apiResponse.title,
          slug: apiResponse.slug,
          parentId: createTarget.treeParentId,
          peopleGroupId: apiResponse.peopleGroupId ?? createTarget.peopleGroupId,
          personId: apiResponse.personId ?? createTarget.personId,
          displayOrder: apiResponse.displayOrder,
          customIcon: apiResponse.customIcon,
          iconColor: apiResponse.iconColor,
          isPublished: apiResponse.isPublished,
          contentType: apiResponse.contentType,
          children: type === "folder" ? [] : [],
          createdAt: new Date(apiResponse.createdAt),
          updatedAt: new Date(apiResponse.updatedAt),
          deletedAt: apiResponse.deletedAt ? new Date(apiResponse.deletedAt) : null,
        };

        // Add payload summaries if present
        if (apiResponse.note) {
          realNode.note = {
            wordCount: apiResponse.note.metadata?.wordCount,
            characterCount: apiResponse.note.metadata?.characterCount,
            readingTime: apiResponse.note.metadata?.readingTime,
          };
        }
        if (apiResponse.code) {
          realNode.code = {
            language: apiResponse.code.language,
          };
        }
        if (apiResponse.html) {
          realNode.html = {
            isTemplate: apiResponse.html.isTemplate,
          };
        }

        const replaceTempNode = (nodes: TreeNode[]): TreeNode[] => {
          return nodes.map((node) => {
            if (node.id === tempId) {
              // Replace temp node with real node from API
              return realNode;
            }
            if (node.children) {
              return { ...node, children: replaceTempNode(node.children) };
            }
            return node;
          });
        };

        setTreeData(replaceTempNode(treeData));
        setCreatingItem(null);

        // Clear pending visualization engine if it was set from context menu
        if (type === "visualization") {
          pendingVisualizationEngine.current = null;
        }

        // Reconcile the optimistic tab → the real id. For files this is the
        // navigate-to-new-file. For folders it's normally a no-op (folders
        // aren't auto-opened) — but if the user OPENED the folder while it was
        // still a `temp-` placeholder, its tab/selection is stuck on the temp
        // id and the folder never loads (ListView can't fetch a temp parent's
        // children). Swapping unconditionally reconciles that stuck selection
        // to the real id so the folder loads. replaceContentTab no-ops when no
        // tab exists for the temp id.
        replaceContentTab(`tab:${tempId}`, apiResponse.id, {
          title: apiResponse.title,
          contentType: apiResponse.contentType,
          temporary: false,
          pin: true,
        });
      } else {
        // Fallback: If API doesn't return expected data, refresh tree
        setCreatingItem(null);
        await fetchTree();
      }
    } catch (err) {
      clientLogger.error({
        layer: "ui",
        event: "content_create:caught",
        summary: "content create handler caught",
        attrs: { content_type: type },
        error: err,
      });

      // Clear pending visualization engine on error
      pendingVisualizationEngine.current = null;

      // Remove temp node on error
      if (treeData) {
        const removeTempNode = (nodes: TreeNode[]): TreeNode[] => {
          return nodes
            .filter((node) => node.id !== tempId)
            .map((node) => ({
              ...node,
              children: node.children ? removeTempNode(node.children) : [],
            }));
        };
        setTreeData(removeTempNode(treeData));
      }
      setCreatingItem(null);

      // Clear optimistic navigation
      if (type !== "folder") {
        closeContentTabs([tempId]);
      }

      setErrorDialog({
        title: "Failed to create",
        message: "An unexpected error occurred. Please try again.",
      });
    }
  };

  // Handler: Cancel inline creation (Escape key or empty submission)
  const handleCreateCancel = () => {
    if (!creatingItem || !treeData) return;

    const { tempId } = creatingItem;

    // Remove temporary node from tree
    const removeTempNode = (nodes: TreeNode[]): TreeNode[] => {
      return nodes
        .filter((node) => node.id !== tempId)
        .map((node) => ({
          ...node,
          children: node.children ? removeTempNode(node.children) : [],
        }));
    };

    const newTreeData = removeTempNode(treeData);
    setTreeData(newTreeData);
    closeContentTabs([tempId]);

    // Clear creating state
    setCreatingItem(null);
  };

  // Handler: Rename content node (or create if it's a temporary node)
  const handleRename = async (id: string, newName: string) => {
    // Check if this is a temporary node being created
    if (creatingItem && id === creatingItem.tempId) {
      // OPTIMISTIC: Update temp node title immediately to avoid flash
      if (treeData) {
        const updateTempTitle = (nodes: TreeNode[]): TreeNode[] => {
          return nodes.map((node) => {
            if (node.id === id) {
              return { ...node, title: newName.trim() };
            }
            if (node.children) {
              return { ...node, children: updateTempTitle(node.children) };
            }
            return node;
          });
        };
        setTreeData(updateTempTitle(treeData));
      }

      // This is inline creation - create the actual file/folder
      await handleCreateSubmit(newName.trim());
      return;
    }

    // Regular rename flow
    if (!newName.trim()) return;

    // OPTIMISTIC UPDATE: Immediately update the local tree
    const originalTreeData = treeData;
    if (treeData) {
      const updateNodeTitle = (nodes: TreeNode[]): TreeNode[] => {
        return nodes.map((node) => {
          if (node.id === id) {
            return { ...node, title: newName.trim() };
          }
          if (node.children) {
            return { ...node, children: updateNodeTitle(node.children) };
          }
          return node;
        });
      };

      setTreeData(updateNodeTitle(treeData));
    }

    try {
      const response = await fetch(`/api/content/content/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newName.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        clientLogger.error({
          layer: "ui",
          event: "content_rename:failed",
          summary: "content rename api rejected",
          attrs: {
            content_id: id,
            error_code: result.error?.code ?? "unknown",
          },
        });
        // Rollback to original tree data on failure
        setTreeData(originalTreeData);
        setErrorDialog({
          title: "Failed to rename",
          message: result.error?.message || "Unknown error occurred. Please try again.",
        });
        return;
      }

      // Success! The optimistic update is already visible.
      // Notify other components (e.g., MainPanel) that content was updated
      window.dispatchEvent(new CustomEvent('content-updated', {
        detail: {
          contentId: id,
          updates: { title: newName.trim() }
        }
      }));
      // Optionally refresh to sync with server (slug, updatedAt, etc.)
      // For now, skip refresh to keep it snappy
    } catch (err) {
      clientLogger.error({
        layer: "ui",
        event: "content_rename:caught",
        summary: "content rename handler caught",
        attrs: { content_id: id },
        error: err,
      });
      // Rollback to original tree data on error
      setTreeData(originalTreeData);
      setErrorDialog({
        title: "Failed to rename",
        message: "An unexpected error occurred. Please try again.",
      });
    }
  };

  // A shortcut removed from inside its own mirror. The row the user acted on
  // stood for content elsewhere, so the toast names the shortcut that went,
  // says the original stayed, and offers it back: removal is a soft delete,
  // and restoring keeps its parent and order.
  const announceShortcutRemoval = (removedIds: string[], nodes: TreeNode[]) => {
    const titles = nodes
      .filter((node) => removedIds.includes(node.id))
      .map((node) => node.title);
    toast.success(
      titles.length === 1
        ? `Removed the shortcut “${titles[0]}”`
        : `Removed ${removedIds.length} shortcuts`,
      {
        description: "The original is untouched.",
        action: {
          label: "Undo",
          onClick: () => {
            void (async () => {
              const restored = await Promise.all(
                removedIds.map((id) =>
                  fetch("/api/trash/restore", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ kind: "content", id }),
                  })
                    .then((response) => response.ok)
                    .catch(() => false)
                )
              );
              if (restored.some((ok) => !ok)) {
                toast.error("Couldn't put the shortcut back", {
                  description: "It's in the trash — restore it from there.",
                });
              }
              await fetchTree();
            })();
          },
        },
      }
    );
  };

  // Handler: Delete content nodes (soft delete) - supports batch delete
  const handleDelete = async (idsToDelete: string | string[]) => {
    // Normalize to array
    const rowIds = Array.isArray(idsToDelete) ? idsToDelete : [idsToDelete];

    // Row ids → what actually goes. Here rather than in the menu because ⌥D
    // arrives here too: a row seen through a shortcut removes the SHORTCUT,
    // never the original it mirrors, and a window row removes nothing.
    const ids = deleteTargetsOfRowIds(rowIds);
    const viaShortcut = rowIds.some((id) => shortcutIdOfMirrorRowId(id) !== null);

    if (ids.length === 0) {
      if (rowIds.length > 0) {
        toast("Nothing to delete here", {
          description:
            "This row shows a note's window. Remove the window in that note to remove the row.",
        });
      }
      return;
    }

    // Find all nodes to show titles in confirmation dialog
    const findNode = (nodes: TreeNode[], targetId: string): TreeNode | null => {
      for (const node of nodes) {
        if (node.id === targetId) return node;
        if (node.children) {
          const found = findNode(node.children, targetId);
          if (found) return found;
        }
      }
      return null;
    };

    const nodesToDelete = ids
      .map(id => (treeData ? findNode(treeData, id) : null))
      .filter((node): node is TreeNode => node !== null);

    // Count total items including nested children
    const countNestedItems = (node: TreeNode): number => {
      let count = 1; // Count the node itself
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          count += countNestedItems(child);
        }
      }
      return count;
    };

    const totalItemCount = nodesToDelete.reduce((sum, node) => sum + countNestedItems(node), 0);

    // Build confirmation title (shown in dialog title)
    let confirmTitle: string;
    if (nodesToDelete.length === 1) {
      const node = nodesToDelete[0];
      const nestedCount = countNestedItems(node) - 1; // Exclude the node itself
      if (nestedCount > 0) {
        confirmTitle = `"${node.title}" (${nestedCount + 1} items total)`;
      } else {
        confirmTitle = `"${node.title}"`;
      }
    } else {
      confirmTitle = `${nodesToDelete.length} items (${totalItemCount} total)`;
    }

    // Build confirmation message (shown in dialog body)
    let confirmMessage: string;
    if (nodesToDelete.length === 1) {
      const node = nodesToDelete[0];
      const nestedCount = countNestedItems(node) - 1;
      if (nestedCount > 0) {
        confirmMessage = `This folder contains ${nestedCount} nested item${nestedCount === 1 ? '' : 's'}.`;
      } else {
        confirmMessage = "";
      }
    } else if (nodesToDelete.length <= 5) {
      // 2-5 items: show bulleted list with nested counts.
      // Shortcuts are called out because the row carries the TARGET's title:
      // "Workflows" in this list would otherwise read as the folder itself
      // being trashed, when only a pointer to it is going.
      const itemList = nodesToDelete
        .map(n => {
          if (n.contentType === "shortcut") {
            return `• ${n.title} — shortcut only, the original stays`;
          }
          const nestedCount = countNestedItems(n) - 1;
          if (nestedCount > 0) {
            return `• ${n.title} (${nestedCount + 1} items)`;
          }
          return `• ${n.title}`;
        })
        .join("\n");
      confirmMessage = itemList;
    } else {
      // 6+ items: show count with first 3 examples
      const examples = nodesToDelete
        .slice(0, 3)
        .map(n => {
          const nestedCount = countNestedItems(n) - 1;
          if (nestedCount > 0) {
            return `• ${n.title} (${nestedCount + 1} items)`;
          }
          return `• ${n.title}`;
        })
        .join("\n");
      const remaining = nodesToDelete.length - 3;
      confirmMessage = `${examples}\n• ...and ${remaining} more`;
    }

    // Workbench warning (owner requirement): deleting a folder that backs a
    // workbench — directly or anywhere in the deleted subtree — also archives
    // that workbench. Say exactly which, and flag the currently-open one.
    const collectDeletedIds = (node: TreeNode, into: Set<string>) => {
      into.add(node.id);
      for (const child of node.children ?? []) collectDeletedIds(child, into);
      for (const child of node.references ?? []) collectDeletedIds(child, into);
    };
    const deletedSubtreeIds = new Set<string>();
    for (const node of nodesToDelete) collectDeletedIds(node, deletedSubtreeIds);
    const workspaceState = useWorkspaceStore.getState();
    const affectedWorkbenches = workspaceState.workspaces.filter(
      (workspace) =>
        workspace.parentWorkspaceId !== null &&
        workspace.status === "active" &&
        workspace.viewRootContentId !== null &&
        deletedSubtreeIds.has(workspace.viewRootContentId),
    );
    if (affectedWorkbenches.length > 0) {
      const names = affectedWorkbenches
        .map((workspace) =>
          workspace.id === workspaceState.activeWorkspaceId
            ? `"${workspace.name}" (currently open)`
            : `"${workspace.name}"`,
        )
        .join(", ");
      const workbenchWarning =
        affectedWorkbenches.length === 1
          ? `Also archives the workbench ${names}.`
          : `Also archives ${affectedWorkbenches.length} workbenches: ${names}.`;
      confirmMessage = confirmMessage
        ? `${confirmMessage}

${workbenchWarning}`
        : workbenchWarning;
    }

    // Check if any items have children
    const hasChildren = nodesToDelete.some(node =>
      node.children && node.children.length > 0
    );

    // Removing a shortcut destroys nothing: it is a pointer, its target is
    // untouched, and neither delete cascade in the API can reach anything from
    // it (both walk ownedByNoteId / ContentLink, which a shortcut never has).
    // So a shortcut-only removal skips the dialog entirely — a "move to trash"
    // warning naming the target folder actively misreports what will happen.
    //
    // A MIXED selection still confirms, with the shortcuts counted in the
    // total: the real content in it is what the warning is for.
    if (
      nodesToDelete.length > 0 &&
      nodesToDelete.every((node) => node.contentType === "shortcut")
    ) {
      const removed = await handleDeleteConfirmed(ids);
      // From inside a shortcut, the row clicked is not the row that goes —
      // say which did, that the original stayed, and offer it back.
      if (viaShortcut && removed.length > 0) announceShortcutRemoval(removed, nodesToDelete);
      return;
    }

    // Show the dialog NOW. The Google Drive check used to run first — one full
    // content GET per selected item, awaited — so with Google connected, ⌥D sat
    // there until every request came back. It runs behind the open dialog
    // instead, only for file rows (Drive copies live in a FilePayload's
    // storage metadata; notes and folders never have one), and the "Also
    // delete from Google Drive" box appears when it finds something.
    const driveProbeToken = ++driveProbeTokenRef.current;
    setDeleteConfirm({
      ids,
      title: confirmTitle,
      message: confirmMessage,
      hasChildren,
      googleDriveFiles: [],
      driveProbeToken,
    });

    const fileIds = nodesToDelete.filter((node) => node.file).map((node) => node.id);
    if (!hasGoogleAuth || fileIds.length === 0) return;
    const found = await Promise.all(
      fileIds.map(async (id) => {
        try {
          const response = await fetch(`/api/content/content/${id}`, {
            credentials: "include",
          });
          if (!response.ok) return null;
          const data = await response.json();
          const fileId: unknown =
            data.data?.file?.storageMetadata?.externalProviders?.googleDrive?.fileId;
          return typeof fileId === "string" && fileId
            ? { contentId: id, fileId }
            : null;
        } catch (err) {
          clientLogger.error({
            layer: "ui",
            event: "delete_gdrive_probe:caught",
            summary: "google drive metadata probe failed (dialog open)",
            attrs: { content_id: id },
            error: err,
          });
          return null;
        }
      })
    );
    const googleDriveFiles = found.filter(
      (entry): entry is { contentId: string; fileId: string } => entry !== null
    );
    if (googleDriveFiles.length === 0) return;
    // Only into the dialog it was started for — not a later one, not a closed one.
    setDeleteConfirm((current) =>
      current && current.driveProbeToken === driveProbeToken
        ? { ...current, googleDriveFiles }
        : current
    );
  };

  // Handler: Perform actual delete after confirmation (supports batch delete)
  //
  // OPTIMISTIC. The rows leave the tree the moment the delete is confirmed,
  // and the tree reconciles QUIETLY afterwards (`loadTree(true)`). It used to
  // wait for every request and then `fetchTree()`, whose skeleton unmounted
  // react-arborist: each delete flashed the whole tree and dropped the user
  // back at the top. A failure puts the failed rows back where they were,
  // rebuilt from the pre-delete snapshot.
  //
  // `googleDriveFiles`: the Drive copies to delete as well — only ever what the
  // dialog SHOWED the user (its probe's findings, with the box ticked). If they
  // confirmed before the probe answered, nothing leaves Drive, whatever the
  // saved preference says: deleting someone's Google data needs the choice to
  // have been on screen.
  // Resolves to the ids the server actually deleted.
  const handleDeleteConfirmed = async (
    ids: string[],
    googleDriveFiles: Array<{ contentId: string; fileId: string }> = []
  ): Promise<string[]> => {
    const treeBefore = treeData;
    const requested = new Set(ids);
    setTreeData((current) =>
      current ? removeNodesFromTree(current, requested) : current
    );
    // Without the remount, nothing else prunes selection: FileTree only drops
    // vanished ids on its first mount.
    if (treeBefore) {
      const removed = collectRemovedIds(treeBefore, requested);
      const treeState = useTreeStateStore.getState();
      const keptTreeSelection = withoutIds(treeState.selectedIds, removed);
      if (keptTreeSelection !== treeState.selectedIds) {
        treeState.setSelectedIds([...keptTreeSelection]);
      }
      const contentState = useContentStore.getState();
      const keptMultiSelection = withoutIds(contentState.multiSelectedIds, removed);
      if (keptMultiSelection !== contentState.multiSelectedIds) {
        contentState.setMultiSelect([...keptMultiSelection]);
      }
    }
    // Tabs close with their rows. Only the requested ids: the server trashes
    // the node itself, and its descendants stay readable (restored with it).
    closeContentTabs(ids);

    // Immediately before the try whose `finally` ends it (no await between,
    // so a refresh already in flight still sees the bump before it lands).
    beginTreeEdit();
    try {
      // Node titles, for the error message if anything fails
      const findNode = (nodes: TreeNode[], targetId: string): TreeNode | null => {
        for (const node of nodes) {
          if (node.id === targetId) return node;
          if (node.children) {
            const found = findNode(node.children, targetId);
            if (found) return found;
          }
        }
        return null;
      };

      const nodeMap = new Map<string, string>();
      if (treeBefore) {
        for (const id of ids) {
          const node = findNode(treeBefore, id);
          if (node) nodeMap.set(id, node.title);
        }
      }

      // Delete from Google Drive first (if applicable)
      if (googleDriveFiles.length > 0) {
        clientLogger.info({
          layer: "ui",
          event: "delete_gdrive:started",
          summary: "deleting files from google drive",
          attrs: { file_count: googleDriveFiles.length },
        });
        const googleDeletePromises = googleDriveFiles.map(async ({ contentId, fileId }) => {
          try {
            const response = await fetch("/api/google-drive/delete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ fileId, contentId }),
            });

            if (!response.ok) {
              clientLogger.error({
                layer: "ui",
                event: "delete_gdrive:failed",
                summary: "google drive delete returned non-ok",
                attrs: { content_id: contentId, status: response.status },
              });
            }
          } catch (err) {
            clientLogger.error({
              layer: "ui",
              event: "delete_gdrive:caught",
              summary: "google drive delete threw",
              attrs: { content_id: contentId },
              error: err,
            });
          }
        });

        // Wait for Google Drive deletes (but don't fail if they error)
        await Promise.all(googleDeletePromises);
      }

      // Delete all items in parallel with enhanced error tracking
      const deletePromises = ids.map(id =>
        fetch(`/api/content/content/${id}`, {
          method: "DELETE",
          credentials: "include",
        }).then(async (response) => {
          const result = await response.json();
          if (!response.ok || !result.success) {
            throw new Error(result.error?.message || "Failed to delete");
          }
          return { id, success: true, title: nodeMap.get(id) || id };
        }).catch((error) => {
          // Capture both ID and title for failed items
          return { id, success: false, title: nodeMap.get(id) || id, error: error.message };
        })
      );

      // Wait for all deletes to complete
      const results = await Promise.all(deletePromises);

      // Separate successes and failures
      const failures = results.filter(r => !r.success);
      const successes = results.filter(r => r.success);

      if (failures.length > 0) {
        clientLogger.error({
          layer: "ui",
          event: "content_delete:failed",
          summary: "some deletes failed in batch",
          attrs: {
            failure_count: failures.length,
            total_count: ids.length,
          },
        });

        // Build detailed error message with item names
        let errorMessage: string;
        if (failures.length <= 3) {
          // Show all failed item names if 3 or fewer
          const failedNames = failures.map(f => `"${f.title}"`).join(", ");
          errorMessage = `Failed to delete: ${failedNames}`;
        } else {
          // Show first 3 + count if more than 3
          const firstThree = failures.slice(0, 3).map(f => `"${f.title}"`).join(", ");
          const remaining = failures.length - 3;
          errorMessage = `Failed to delete: ${firstThree}, and ${remaining} more item${remaining === 1 ? '' : 's'}`;
        }

        // If some succeeded, mention that too
        if (successes.length > 0) {
          errorMessage += `\n\n${successes.length} item${successes.length === 1 ? ' was' : 's were'} deleted successfully.`;
        }

        setErrorDialog({
          title: `Failed to delete ${failures.length} of ${ids.length} items`,
          message: errorMessage,
        });

        // Put the failed rows back where they were: the snapshot minus only
        // what the server actually deleted. Their tabs stay closed (reopen
        // from the tree) — the row coming back is the signal.
        if (treeBefore) {
          setTreeData(
            removeNodesFromTree(treeBefore, new Set(successes.map((item) => item.id)))
          );
        }
      }
      return successes.map((item) => item.id);
    } catch (err) {
      clientLogger.error({
        layer: "ui",
        event: "content_delete:caught",
        summary: "content delete handler caught",
        error: err,
      });
      setErrorDialog({
        title: "Failed to delete",
        message: "An unexpected error occurred. Please try again.",
      });
      // Nothing is known to have been deleted: show the tree as it was.
      if (treeBefore) setTreeData(treeBefore);
      return [];
    } finally {
      // Settle against the server without the skeleton — the tree stays
      // mounted, so scroll position and expansion are untouched.
      endTreeEdit();
    }
  };

  // Handler: Download file(s) (single or batch)
  const handleDownload = async (idsToDownload: string[]) => {
    if (idsToDownload.length === 0) return;

    try {
      // Download each file
      for (const id of idsToDownload) {
        // Use direct download endpoint with download=true to force download
        // This prevents text files from opening in browser
        const downloadUrl = `/api/content/content/${id}/download?download=true`;

        // Trigger download
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Show success toast for single file
        if (idsToDownload.length === 1) {
          toast.success("Download started");
        }
      }

      // Show success toast for batch downloads
      if (idsToDownload.length > 1) {
        toast.success(`Started downloading ${idsToDownload.length} files`);
      }
    } catch (err) {
      clientLogger.error({
        layer: "ui",
        event: "content_download:caught",
        summary: "content download handler caught",
        error: err,
      });
      toast.error("Download failed", {
        description: "An unexpected error occurred. Please try again.",
      });
    }
  };

  // Handler: Duplicate content node(s) (supports batch duplicate)
  const handleDuplicate = async (idsToDuplicate: string[]) => {
    if (idsToDuplicate.length === 0) return;

    try {
      const response = await fetch("/api/content/content/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: idsToDuplicate }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || "Failed to duplicate content");
      }

      const duplicatedCount = result.data.duplicated.length;

      // Show success toast
      if (duplicatedCount === 1) {
        toast.success(`Duplicated "${result.data.duplicated[0].title}"`);
      } else {
        toast.success(`Duplicated ${duplicatedCount} items`);
      }

      // Refresh tree to show duplicated items
      fetchTree();
    } catch (err) {
      clientLogger.error({
        layer: "ui",
        event: "content_duplicate:caught",
        summary: "content duplicate handler caught",
        attrs: { count: idsToDuplicate.length },
        error: err,
      });
      toast.error("Failed to duplicate", {
        description: err instanceof Error ? err.message : "An unexpected error occurred. Please try again.",
      });
    }
  };

  /** Phase 2: Handler for changing folder view mode */
  const handleSetFolderView = async (
    id: string,
    viewMode: "list" | "gallery" | "kanban" | "dashboard" | "canvas"
  ) => {
    try {
      // Call API to persist view mode
      const response = await fetch(`/api/content/folder/${id}/view`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ viewMode }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Failed to update folder view");
      }

      await response.json();

      // Show success toast
      toast.success(`Folder view changed to ${viewMode}`, {
        description: "Folder view mode has been saved",
      });

      // Refresh tree to reflect changes in main panel
      await fetchTree();
    } catch (err) {
      clientLogger.error({
        layer: "ui",
        event: "folder_view_set:caught",
        summary: "set folder view handler caught",
        attrs: { content_id: id, view_mode: viewMode },
        error: err,
      });
      toast.error("Failed to change folder view", {
        description: err instanceof Error ? err.message : "An unexpected error occurred. Please try again.",
      });
    }
  };

  // Handler: Change icon for content
  const handleChangeIcon = (id: string) => {
    // Find node to get current icon
    const findNode = (nodes: TreeNode[]): TreeNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
          const found = findNode(node.children);
          if (found) return found;
        }
      }
      return null;
    };

    const node = treeData ? findNode(treeData) : null;

    // Try to get position from context menu store (if triggered from context menu)
    const contextMenuState = useContextMenuStore.getState();
    const contextMenuPosition = contextMenuState.position;

    // Get file node position (fallback to icon position if available)
    const fileRow = document.querySelector(`[data-node-id="${id}"]`);
    const iconElement = fileRow?.querySelector('[data-file-icon]');

    let triggerPosition: { x: number; y: number };

    if (contextMenuPosition) {
      // Use context menu click position (most accurate)
      triggerPosition = { x: contextMenuPosition.x, y: contextMenuPosition.y };
    } else if (iconElement) {
      // Use icon position (second best)
      const iconRect = iconElement.getBoundingClientRect();
      triggerPosition = { x: iconRect.right + 4, y: iconRect.top };
    } else if (fileRow) {
      // Fallback to file row position
      const rect = fileRow.getBoundingClientRect();
      triggerPosition = { x: rect.left + 40, y: rect.top };
    } else {
      // Last resort: center of screen
      triggerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }

    setIconSelector({
      open: true,
      contentId: id,
      currentIcon: node?.customIcon || null,
      triggerPosition,
    });
  };

  const handleIconSelect = async (icon: string) => {
    const contentId = iconSelector.contentId;
    const previousIcon = iconSelector.currentIcon;

    // OPTIMISTIC UPDATE: Update icon in tree immediately
    if (treeData) {
      const updateIconInTree = (nodes: TreeNode[]): TreeNode[] => {
        return nodes.map((node) => {
          if (node.id === contentId) {
            return { ...node, customIcon: icon };
          }
          if (node.children) {
            return { ...node, children: updateIconInTree(node.children) };
          }
          return node;
        });
      };

      setTreeData(updateIconInTree(treeData));
    }

    // Close icon selector immediately
    setIconSelector({ open: false, contentId: "", currentIcon: null, triggerPosition: { x: 0, y: 0 } });

    // Make API call in background
    try {
      const response = await fetch(`/api/content/content/${contentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customIcon: icon }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Failed to update icon");
      }

      toast.success("Icon updated");
    } catch (err) {
      clientLogger.error({
        layer: "ui",
        event: "icon_update:caught",
        summary: "icon update handler caught",
        attrs: { content_id: contentId },
        error: err,
      });
      toast.error("Failed to update icon", {
        description: err instanceof Error ? err.message : "An unexpected error occurred",
      });

      // REVERT: Restore previous icon on error
      if (treeData) {
        const revertIconInTree = (nodes: TreeNode[]): TreeNode[] => {
          return nodes.map((node) => {
            if (node.id === contentId) {
              return { ...node, customIcon: previousIcon };
            }
            if (node.children) {
              return { ...node, children: revertIconInTree(node.children) };
            }
            return node;
          });
        };

        setTreeData(revertIconInTree(treeData));
      }
    }
  };

  // Handler: Create new content node (all types)
  // This creates a temporary placeholder node in the tree for inline naming
  const handleCreate = async (
    requestedParentId: string | null,
    type: "folder" | "note" | "file" | "code" | "html" | "docx" | "xlsx" | "json" | "external" | "shortcut" | "chat" | "visualization" | "data" | "hope" | "workflow"
  ) => {
    // File upload requires special two-phase flow - open upload dialog
    if (type === "file") {
      // Scoped views default the upload destination to the view root.
      setUploadDialog({ open: true, parentId: requestedParentId ?? scopedRootParentId });
      return;
    }

    // External links need a URL, so they get the dialog, never the inline
    // temp-node flow — whose body map has no "external" entry, which is why
    // the context menu's Add → External Link threw "Failed to create"
    // (owner report, 2026-08-27; the header + menu always rerouted, this
    // path never did). null parentId keeps the dialog's derive-from-
    // selection behavior for the header trigger.
    if (type === "external") {
      setExternalLinkDialog({
        open: true,
        mode: "create",
        initialName: "",
        initialUrl: "https://",
        editingId: null,
        parentId: requestedParentId,
      });
      return;
    }

    // Same reasoning as External Link above: a shortcut needs a target before
    // it can be created, so it never takes the inline temp-node path.
    if (type === "shortcut") {
      setShortcutPicker({
        open: true,
        parentId: requestedParentId,
        anchorEl: shortcutAnchorRef.current,
      });
      return;
    }

    // Office documents (docx, xlsx) now support inline naming (changed from immediate creation)

    if (!treeData) return;

    // Explicit target, else the selection (folder → inside, item → beside),
    // else the top of the current tree. Tree space: server writes remap null
    // to the view root below.
    const parentId = resolveTreeParent(requestedParentId, treeData, scopedRootParentId);

    const createTarget = getCreateTarget(parentId, treeData);
    if ((createTarget.peopleGroupId || createTarget.personId) && !["folder", "note"].includes(type)) {
      toast.info("People content", {
        description: "Only notes and folders can be added under People records in this phase.",
      });
      return;
    }

    // Generate temporary ID for the placeholder node
    const tempId = `temp-${Date.now()}-${Math.random()}`;

    // Create temporary placeholder node
    // Note: docx/xlsx types use contentType="file" since they're FilePayload
    // Phase 2 types (external, chat, visualization, data, hope, workflow) map directly to their contentType
    const contentType: ContentType = (type === "docx" || type === "xlsx") ? "file" : type as ContentType;

    const tempNode: TreeNode = {
      id: tempId,
      title: "", // Empty - user will type the name
      slug: "",
      contentType,
      parentId: createTarget.treeParentId,
      peopleGroupId: createTarget.peopleGroupId,
      personId: createTarget.personId,
      displayOrder: 0,
      customIcon: null,
      iconColor: null,
      isPublished: false,
      children: type === "folder" ? [] : [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      // Add minimal file metadata for extension display during inline editing
      file: (type === "docx" || type === "xlsx" || type === "json") ? {
        fileName: "",
        mimeType:
          type === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : type === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/json",
        fileSize: "0",
        uploadStatus: "ready" as const,
      } : undefined,
    };

    // Insert temporary node into tree data
    const insertTempNode = (nodes: TreeNode[]): TreeNode[] => {
      if (createTarget.treeParentId === null) {
        // Insert at root level (at the beginning)
        return [tempNode, ...nodes];
      }

      return nodes.map((node) => {
        if (node.id === createTarget.treeParentId) {
          // Found parent - insert temp node as first child
          return {
            ...node,
            children: [tempNode, ...(node.children || [])],
          };
        }
        if (node.children) {
          return {
            ...node,
            children: insertTempNode(node.children),
          };
        }
        return node;
      });
    };

    // Update tree with temporary node
    const newTreeData = insertTempNode(treeData);
    setTreeData(newTreeData);

    // iOS: raise the keyboard now, inside the tap's user-activation window —
    // the rename input mounts asynchronously and its autoFocus alone can't
    // summon the keyboard (see lib/core/mobile-keyboard.ts).
    warmUpMobileKeyboard();

    // Set creating state to track the temporary node
    setCreatingItem({
      type,
      parentId: createTarget.treeParentId,
      tempId,
    });

    // IMPORTANT: If creating inside a folder, we need to auto-expand it
    // so the temporary node becomes visible and can enter edit mode
    if (createTarget.treeParentId !== null) {
      // Signal FileTree to expand this node imperatively
      setExpandNodeId(createTarget.treeParentId);
    }

    // Note: The actual API call happens in handleCreateSubmit when user presses Enter
  };

  // Visualization engine-specific handlers for context menu
  // These are called from the context menu and need to trigger the inline creation flow
  // with the correct engine stored temporarily for handleCreate to use
  const handleCreateVisualizationMermaid = async (parentId: string | null) => {
    // Temporarily set create trigger with engine, which will be picked up by useEffect
    // This mirrors how the + button works from LeftSidebar
    // Note: We can't call setCreateTrigger here as it doesn't exist in this component
    // Instead, we'll store the engine in a ref and call handleCreate
    pendingVisualizationEngine.current = "mermaid";
    await handleCreate(parentId, "visualization");
  };

  const handleCreateVisualizationExcalidraw = async (parentId: string | null) => {
    pendingVisualizationEngine.current = "excalidraw";
    await handleCreate(parentId, "visualization");
  };

  const handleCreateVisualizationDiagramsNet = async (parentId: string | null) => {
    pendingVisualizationEngine.current = "diagrams-net";
    await handleCreate(parentId, "visualization");
  };

  // Show search panel when search is active
  if (isSearchOpen) {
    return <SearchPanel />;
  }

  // Loading state
  if (isLoading) {
    return <FileTreeSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center">
        <div className="text-sm text-red-400 mb-2">Failed to load file tree</div>
        <div className="text-xs text-gray-500 mb-4">{error}</div>
        <button
          onClick={fetchTree}
          className="px-4 py-2 text-sm bg-primary/10 hover:bg-primary/20 rounded transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state. A view-scoped workspace keeps its RootNodeHeader even when
  // the view root has no children: the header carries the view-filter
  // dropdown ("root — show all files"), without which an empty view would
  // strand the user with no way back to the full tree.
  if (!treeData || treeData.length === 0) {
    if (treeData && effectiveViewRootContentId) {
      return (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <RootNodeHeader
            workspaceName="root"
            totalFiles={0}
            isSelected={!selectedContentId}
            isView={activeWorkspaceIsView}
            viewRootTitle={scopedRootTitle}
            scopeOptions={scopeOptions}
            activeScopeKey={scopeOverride ?? "default"}
            onSelectScope={handleSelectScope}
            onRefresh={() => {
              void fetchTree();
            }}
            onHardRefresh={hardReloadTree}
            onClick={() => {
              setSelectedContentId(null);
              setSelectedIds([]);
            }}
          />
          <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
            <div className="text-sm text-gray-400 mb-2">This view is empty</div>
            <div className="text-xs text-gray-500">
              Create something here, or switch to root to see all files
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center">
        <div className="text-sm text-gray-400 mb-2">No files yet</div>
        <div className="text-xs text-gray-500">
          Create your first note or folder to get started
        </div>
      </div>
    );
  }

  // Render tree
  return (
    <>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* File tree with drag-and-drop zone — single scroll plane via measured height */}
        <div ref={treeContainerRef} className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <RootNodeHeader
            workspaceName="root"
            totalFiles={countTotalNodes(treeData)}
            isSelected={!selectedContentId}
            isView={activeWorkspaceIsView}
            viewRootTitle={scopedRootTitle}
            scopeOptions={scopeOptions}
            activeScopeKey={scopeOverride ?? "default"}
            onSelectScope={handleSelectScope}
            onRefresh={() => {
              void fetchTree();
            }}
            onHardRefresh={hardReloadTree}
            onClick={() => {
              setSelectedContentId(null);
              setSelectedIds([]);
            }}
          />
          <FileTreeWithDropZone
            data={treeData}
            shortcutTargets={shortcutTargetTrees}
            rootTreeSort={rootTreeSort}
            rootAncestry={rootAncestry}
            rootDropTarget={rootDropTarget}
            onMove={handleMove}
            onSelect={handleSelect}
            onRename={handleRename}
            onCreate={handleCreate}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
            onDownload={handleDownload}
            onChangeIcon={handleChangeIcon}
            onSetFolderView={handleSetFolderView}
            onCreateVisualizationMermaid={handleCreateVisualizationMermaid}
            onCreateVisualizationExcalidraw={handleCreateVisualizationExcalidraw}
            onCreateVisualizationDiagramsNet={handleCreateVisualizationDiagramsNet}
            onCreateAiImage={onCreateAiImage ? async (parentId) => onCreateAiImage(parentId) : undefined}
            onAddPeopleTarget={onAddPeopleTarget ? async (parentId) => onAddPeopleTarget(parentId) : undefined}
            height={Math.max(treeHeight - 36, 100)}
            editingNodeId={creatingItem?.tempId}
            expandNodeId={expandNodeId}
            onExpandComplete={() => setExpandNodeId(null)}
            revealRequest={activeReveal}
            onRevealComplete={handleRevealComplete}
            onFileDrop={onFileDrop}
          />
        </div>

        {/* The "N referenced items hidden · Show" hint lived here. It's gone
            with the global filter: nothing is hidden tree-wide any more, and
            each parent reports its own references on its count chip. */}

        {/* Status bar */}
        {/* <LeftSidebarStatusBar
          selectedCount={selectedCount}
          totalCount={countTotalNodes(treeData)}
        /> */}
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title={`Delete ${deleteConfirm?.title}?`}
        description={
          deleteConfirm?.message
            ? `${deleteConfirm.message}\n\n${
                deleteConfirm.hasChildren
                  ? "This will move the selected item(s) and all nested content to trash."
                  : "This will move the selected item(s) to trash."
              }`
            : deleteConfirm?.hasChildren
            ? "This will move the selected item(s) and all nested content to trash."
            : "This will move the selected item(s) to trash."
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() =>
          deleteConfirm &&
          handleDeleteConfirmed(
            deleteConfirm.ids,
            hasGoogleAuth && deleteFromGoogleDrive ? deleteConfirm.googleDriveFiles : []
          )
        }
        checkbox={hasGoogleAuth && (deleteConfirm?.googleDriveFiles.length ?? 0) > 0 ? {
          label: "Also delete from Google Drive",
          checked: deleteFromGoogleDrive,
          onChange: setDeleteFromGoogleDrive,
        } : undefined}
      />

      {/* External link dialog */}
      <ExternalLinkDialog
        open={externalLinkDialog.open}
        onOpenChange={(open) =>
          setExternalLinkDialog((prev) => ({ ...prev, open }))
        }
        onConfirm={handleExternalLinkCreate}
        initialName={externalLinkDialog.initialName}
        initialUrl={externalLinkDialog.initialUrl}
        mode={externalLinkDialog.mode}
      />

      {/* Anchor for the shortcut picker — see shortcutAnchorRef. */}
      <div
        ref={shortcutAnchorRef}
        aria-hidden
        className="pointer-events-none fixed left-4 top-28 h-0 w-0"
      />

      {/* Shortcut target picker. The canonical tree-browse picker, unmodified:
          eligibleTypes excludes `shortcut` by default, so a shortcut can never
          point at another shortcut from here. */}
      {shortcutPicker.open && shortcutPicker.anchorEl && (
        <ContentTreePicker
          anchorEl={shortcutPicker.anchorEl}
          onPick={(target) => {
            setShortcutPicker({ open: false, parentId: null, anchorEl: null });
            void handleShortcutCreate(target, shortcutPicker.parentId);
          }}
          onClose={() =>
            setShortcutPicker({ open: false, parentId: null, anchorEl: null })
          }
          disabledIds={
            shortcutPicker.parentId ? [shortcutPicker.parentId] : undefined
          }
          disabledReason="the folder you are adding to"
          eligibleTypes={SHORTCUT_ELIGIBLE_TYPES}
          searchPlaceholder="Select shortcut target…"
          recentsLabel="Recent targets"
        />
      )}

      {/* Icon Selector */}
      <IconSelector
        isOpen={iconSelector.open}
        onClose={() => setIconSelector({ open: false, contentId: "", currentIcon: null, triggerPosition: { x: 0, y: 0 } })}
        onSelectIcon={handleIconSelect}
        currentIcon={iconSelector.currentIcon}
        triggerPosition={iconSelector.triggerPosition}
      />

      {/* File upload dialog */}
      {uploadDialog.open && (
        <FileUploadDialog
          parentId={uploadDialog.parentId}
          onSuccess={async (fileId) => {
            setUploadDialog({ open: false, parentId: null });
            await fetchTree();
            setSelectedContentId(fileId);
          }}
          onCancel={() => setUploadDialog({ open: false, parentId: null })}
        />
      )}

      {/* Error dialog */}
      {errorDialog && (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => !open && setErrorDialog(null)}
          title={errorDialog.title}
          description={errorDialog.message}
          confirmLabel="OK"
          confirmVariant="primary"
          onConfirm={() => setErrorDialog(null)}
        />
      )}
    </>
  );
}
