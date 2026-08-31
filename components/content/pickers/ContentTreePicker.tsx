"use client";

/**
 * ContentTreePicker — the canonical tree-browse content picker.
 *
 * Born as the Note Window's target picker (owner-endorsed as "the
 * cleanest design yet"); promoted to a shared home the moment a second
 * consumer arrived (the pane tab-strip "+"). Reuse THIS — do not build
 * new pickers. Both consumers (Note Window retarget, pane tab "+") use
 * the EXACT same affordances (owner decision 2026-08-15).
 *
 * Portaled to <body> with calculateMenuPosition so host overflow can't
 * clip it. Surface anatomy, top to bottom:
 *   - search: debounced server search replaces the tree while typing
 *     (flat — search bypasses collapse and view scope).
 *   - recents: optional caller-supplied list shown above the tree.
 *   - scope row: the file-tree-style root representation. Shows the
 *     current view scope ("Root" = everything, or a workspace view's
 *     name). Clicking it lists the available scopes — ordered with the
 *     DEFAULT scope first (the active workspace view when one is set,
 *     Root otherwise), then the alternatives — selecting one re-fetches
 *     the tree filtered to that view. Carries "+ New Note" for creating
 *     at the top of the current scope.
 *   - browse: lazy-fetched content tree, COLLAPSED by default. Rows with
 *     nested content show a chevron: single click toggles expansion,
 *     double-click picks the container itself (touch parity beats
 *     hover-to-expand). Leaf rows pick on single click.
 *
 * Create affordances (press-and-hold was tried and REMOVED 2026-08-15 —
 * its arming hint collided with click-to-toggle; per-file "+" was tried
 * and REMOVED the same day — a plus ON a row implies "inside", true only
 * for containers):
 *   - FOLDER rows and the scope row carry "+ New Note" (inside, at top).
 *   - Between sibling rows, hovering the boundary reveals an INSERTION
 *     GAP (line + plus) marking the exact slot the note will occupy.
 *   - Created notes get a DEFAULT title; renaming happens via the app's
 *     existing rename affordances.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLongPress } from "@/components/common/useLongPress";
import { createPortal } from "react-dom";
import {
  FileText,
  Folder,
  FolderOpen,
  Globe,
  FileCode,
  File as FileIcon,
  Table,
  MessageCircle,
  BarChart3,
  Target,
  GitBranch,
  Link as LinkIcon,
  Plus,
  History,
  ChevronRight,
  ChevronDown,
  Home,
  Layers,
} from "lucide-react";

import { cn } from "@/lib/core/utils";
import { calculateMenuPosition } from "@/lib/core/menu-positioning";
import { useWorkspaceStore } from "@/state/workspace-store";

const MENU_WIDTH = 300;
const MENU_MAX_HEIGHT = 420;
const SEARCH_DEBOUNCE_MS = 150;

/** Default: content types whose note content can be windowed/opened. */
export const DEFAULT_ELIGIBLE_TYPES = new Set([
  "note",
  "folder",
  "file",
  "external",
  "html",
  "code",
]);
/** Types we recurse into when flattening (containers of more content). */
const RECURSE_TYPES = new Set(["folder", "note"]);

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

interface TreeNodeLite {
  id: string;
  title: string;
  contentType: string;
  treeNodeKind?: string;
  note?: unknown;
  children?: TreeNodeLite[];
  /**
   * Referenced children, partitioned out of `children` by the tree API. They
   * have to be walked separately or attachments are invisible to browse —
   * which is what kept referenced content reachable by search only.
   */
  references?: TreeNodeLite[];
}

export interface PickerTarget {
  id: string;
  title: string;
  contentType: string;
}

/** A workspace view the picker can scope its tree to. */
export interface PickerViewOption {
  id: string;
  label: string;
  /** The view's root folder — the real parent of the scoped tree's top level. */
  rootContentId: string | null;
}

/**
 * Derive the picker's view options + default scope from the workspace
 * store (via the sanctioned core re-export seam — the same import
 * MainPanelHeader uses). Default = the active workspace's view when one
 * is set, Root (null) otherwise — per the owner's ordering rule.
 */
export function useWorkspaceViewOptions(): {
  views: PickerViewOption[];
  defaultViewId: string | null;
} {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  return useMemo(() => {
    const views = workspaces
      .filter((w) => w.status === "active" && w.viewRootContentId)
      .map((w) => ({
        id: w.id,
        label: w.name,
        rootContentId: w.viewRootContentId,
      }));
    const active = views.find((v) => v.id === activeWorkspaceId);
    return { views, defaultViewId: active?.id ?? null };
  }, [workspaces, activeWorkspaceId]);
}

interface FlatRow {
  id: string;
  title: string;
  contentType: string;
  depth: number;
  hasNote: boolean;
  /** Real parent id — for scoped trees, top-level rows' parent is the view root. */
  parentId: string | null;
  /** Index among content-kind siblings in tree order — the move route's splice index space. */
  siblingIndex: number;
  /** True when this row has renderable nested content (expand affordance). */
  hasChildren: boolean;
  /**
   * Row came from a parent's `references` array — an attachment or generated
   * deliverable rather than authored content. Marked so it can carry the same
   * link badge the file tree uses, and so the "insert after" gap is
   * suppressed: references occupy a separate index space from primary
   * children, so `siblingIndex + 1` would not mean what it means elsewhere.
   */
  isReference: boolean;
}

function flattenEligible(
  nodes: TreeNodeLite[],
  eligibleTypes: ReadonlySet<string>,
  parentId: string | null,
  depth = 0,
  out: FlatRow[] = [],
  asReference = false,
): FlatRow[] {
  let siblingIndex = 0;
  for (const node of nodes) {
    // Synthetic people rows (peopleGroup:/person:) are not real content —
    // offering them would present un-createable / un-windowable parents.
    // They also don't occupy displayOrder slots, so they don't advance
    // the sibling index.
    if (node.treeNodeKind && node.treeNodeKind !== "content") continue;
    const eligible = eligibleTypes.has(node.contentType);
    if (eligible) {
      const row: FlatRow = {
        id: node.id,
        title: node.title,
        contentType: node.contentType,
        depth,
        hasNote: Boolean(node.note),
        parentId,
        siblingIndex,
        hasChildren: false,
        isReference: asReference,
      };
      out.push(row);
      if (RECURSE_TYPES.has(node.contentType)) {
        const before = out.length;
        if (node.children?.length) {
          flattenEligible(node.children, eligibleTypes, node.id, depth + 1, out);
        }
        // Second pass for the parent's reference block. Listed after primary
        // children, matching the file tree's default placement, and flagged so
        // the rows read as attachments rather than authored content.
        if (node.references?.length) {
          flattenEligible(
            node.references,
            eligibleTypes,
            node.id,
            depth + 1,
            out,
            true,
          );
        }
        row.hasChildren = out.length > before;
      }
    }
    siblingIndex += 1;
  }
  return out;
}

function TypeIcon({
  contentType,
  className,
}: {
  contentType: string;
  className?: string;
}) {
  switch (contentType) {
    case "folder":
      return <Folder className={className} />;
    case "external":
      return <Globe className={className} />;
    case "code":
    case "html":
      return <FileCode className={className} />;
    case "note":
      return <FileText className={className} />;
    // Types the picker gained when callers started using it to address content
    // rather than to window it. Without these a database, chat or diagram all
    // rendered as the same generic file, which reads as "unknown thing" — the
    // one thing a picker row must never say.
    case "data":
      return <Table className={className} />;
    case "chat":
      return <MessageCircle className={className} />;
    case "visualization":
      return <BarChart3 className={className} />;
    case "hope":
      return <Target className={className} />;
    case "workflow":
      return <GitBranch className={className} />;
    default:
      return <FileIcon className={className} />;
  }
}

export interface QuickCreateConfig {
  /** Title given to the blank item (user renames later via existing affordances). */
  defaultTitle: string;
  /** Fires after the item is created and placed. */
  onCreated: (target: PickerTarget) => void;
  /** What the create affordances make. Default "note". */
  kind?: "note" | "data";
  /** Noun for labels/tooltips ("Note", "Database"). Default "Note". */
  noun?: string;
  /**
   * Create-targeting mode (the databases rail): PICKING a row creates
   * inside it instead of returning it, so every create — pick, folder "+",
   * insertion gap, scope row — flows through the same placement code.
   * Pair with a containers-only eligibleTypes so leaf picks don't exist.
   */
  pickCreatesInside?: boolean;
}

export interface ContentTreePickerProps {
  anchorEl: HTMLElement;
  onPick: (target: PickerTarget) => void;
  onClose: () => void;
  /** Rows to disable (e.g. the Note Window's host note). */
  disabledIds?: ReadonlyArray<string>;
  disabledReason?: string;
  recents?: Array<{ id: string; title: string }>;
  recentsLabel?: string;
  /** Folder/scope "+ New Note" buttons + insertion gaps (default-name create). */
  quickCreate?: QuickCreateConfig;
  /** Workspace views the scope row offers (from useWorkspaceViewOptions). */
  views?: PickerViewOption[];
  /** Initial scope: a view id, or null for Root. */
  defaultViewId?: string | null;
  eligibleTypes?: ReadonlySet<string>;
  searchPlaceholder?: string;
}

async function createContent(
  kind: "note" | "data",
  title: string,
  parentId: string | null,
  newDisplayOrder: number,
): Promise<PickerTarget | null> {
  // Notes seed an empty doc; databases send contentType and let the server
  // seed the Name column + default view (the same POST the databases rail
  // used before its quick-add moved here).
  const res = await fetch("/api/content/content", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      kind === "data"
        ? { title, parentId, contentType: "data" }
        : { title, parentId, tiptapJson: EMPTY_DOC },
    ),
  });
  const body = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: { id?: string };
  } | null;
  if (!res.ok || !body?.success || !body.data?.id) return null;
  const newId = body.data.id;
  // Exact placement: the move route renumbers siblings in one
  // transaction. Non-fatal on failure — the note exists either way.
  await fetch("/api/content/content/move", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contentId: newId,
      targetParentId: parentId,
      newDisplayOrder,
    }),
  }).catch(() => {});
  window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
  return { id: newId, title, contentType: kind };
}

export function ContentTreePicker({
  anchorEl,
  onPick,
  onClose,
  disabledIds,
  disabledReason,
  recents = [],
  recentsLabel = "Recent",
  quickCreate,
  views = [],
  defaultViewId = null,
  eligibleTypes = DEFAULT_ELIGIBLE_TYPES,
  searchPlaceholder = "Search… or browse below",
}: ContentTreePickerProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [tree, setTree] = useState<FlatRow[] | null>(null);
  // Collapsed by default (owner decision): only top-level rows visible
  // until expanded. Single click toggles; double-click picks the
  // container itself.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // View scope: null = Root (everything). Switching re-fetches the tree.
  const [viewId, setViewId] = useState<string | null>(defaultViewId);
  // The scope list is a floating dropdown (no layout shift). Anchor is
  // captured from the click event (render-time ref reads are forbidden);
  // non-null doubles as the open flag.
  const [scopeAnchor, setScopeAnchor] = useState<HTMLElement | null>(null);
  const scopeMenuRef = useRef<HTMLDivElement | null>(null);
  // The dropdown anchors to the whole ROW (not the label button) so it
  // unfolds flush beneath it at the row's exact width — reading as an
  // extension of the row rather than a detached card.
  const scopeRowRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  // Search results are stored WITH the query that produced them; "still
  // searching" is derived from a query mismatch instead of clearing
  // state inside the effect (react-hooks/set-state-in-effect).
  const [searchState, setSearchState] = useState<{
    q: string;
    items: PickerTarget[];
  } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const disabledSet = useMemo(() => new Set(disabledIds ?? []), [disabledIds]);

  const currentView = useMemo(
    () => views.find((v) => v.id === viewId) ?? null,
    [views, viewId],
  );
  // The real parent of the scoped tree's top level — placement math for
  // "create at top of scope" and top-level sibling gaps must use it.
  const scopeRootParentId = currentView?.rootContentId ?? null;

  // Scope list ordering (owner rule): the DEFAULT scope first — the
  // active workspace view when one is set, Root otherwise — then the
  // alternatives. The CURRENT selection is excluded: the row itself
  // already shows it, so listing it again (with a check) is redundant —
  // a selection just switches the view.
  const scopeOptions = useMemo(() => {
    const root = { id: null as string | null, label: "Root" };
    const defaultView = views.find((v) => v.id === defaultViewId) ?? null;
    const ordered = defaultView
      ? [
          { id: defaultView.id as string | null, label: defaultView.label },
          root,
          ...views
            .filter((v) => v.id !== defaultView.id)
            .map((v) => ({ id: v.id as string | null, label: v.label })),
        ]
      : [root, ...views.map((v) => ({ id: v.id as string | null, label: v.label }))];
    return ordered.filter((opt) => (opt.id ?? null) !== (viewId ?? null));
  }, [views, defaultViewId, viewId]);

  const menuPos = useMemo(() => {
    const rect = anchorEl.getBoundingClientRect();
    return calculateMenuPosition({
      triggerPosition: { x: rect.left, y: rect.bottom + 4 },
      menuDimensions: { width: MENU_WIDTH, height: MENU_MAX_HEIGHT },
      preferredPlacementX: "right",
      preferredPlacementY: "bottom",
    });
  }, [anchorEl]);

  // Lazy tree fetch — re-fetched when the view scope changes. The tree
  // route resolves workspaceId → viewRootContentId server-side.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const params = new URLSearchParams();
        if (viewId) params.set("workspaceId", viewId);
        const qs = params.toString();
        const res = await fetch(`/api/content/content/tree${qs ? `?${qs}` : ""}`, {
          credentials: "include",
        });
        const body = (await res.json()) as {
          data?: { tree?: TreeNodeLite[] } | TreeNodeLite[];
        };
        const raw = body?.data;
        const nodes = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.tree)
            ? raw.tree
            : [];
        if (!cancelled) {
          setTree(flattenEligible(nodes, eligibleTypes, scopeRootParentId));
        }
      } catch {
        if (!cancelled) setTree(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eligibleTypes, viewId, scopeRootParentId]);

  // Debounced server search while typing.
  const activeQuery = query.trim();
  useEffect(() => {
    if (!activeQuery) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/content/content?search=${encodeURIComponent(activeQuery)}`,
            { credentials: "include" },
          );
          const result = (await res.json()) as {
            success?: boolean;
            data?: {
              items?: Array<{ id: string; title: string; contentType: string }>;
            };
          };
          if (cancelled) return;
          const items = (result.data?.items ?? []).filter((it) =>
            eligibleTypes.has(it.contentType),
          );
          setSearchState({ q: activeQuery, items });
        } catch {
          if (!cancelled) setSearchState({ q: activeQuery, items: [] });
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeQuery, eligibleTypes]);

  // null = still searching (debounce or fetch in flight); only meaningful
  // while a query is active.
  const searchResults: PickerTarget[] | null =
    activeQuery && searchState?.q === activeQuery ? searchState.items : null;

  // Click-away + Escape close. The scope dropdown is portaled OUTSIDE
  // menuRef, so it counts as "inside" for the picker's click-away; when
  // it's open, Escape and outside clicks close IT first, the picker next.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (scopeMenuRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t) || anchorEl.contains(t)) {
        if (scopeAnchor && !scopeAnchor.contains(t)) setScopeAnchor(null);
        return;
      }
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (scopeAnchor) {
        setScopeAnchor(null);
        return;
      }
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchorEl, onClose, scopeAnchor]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectScope = useCallback((id: string | null) => {
    setScopeAnchor(null);
    setViewId(id);
    // A different view is a different tree — start collapsed again.
    setExpandedIds(new Set());
    setTree(null);
  }, []);

  const createKind = quickCreate?.kind ?? "note";
  const createNoun = quickCreate?.noun ?? "Note";

  // "Inside" — top of a container (by id), or top of the current scope (null).
  const quickCreateInside = useCallback(
    async (parentContentId: string | null) => {
      if (!quickCreate) return;
      setCreateError(null);
      const created = await createContent(
        createKind,
        quickCreate.defaultTitle,
        parentContentId ?? scopeRootParentId,
        0,
      );
      if (!created) {
        setCreateError(`Couldn't create the ${createNoun.toLowerCase()}.`);
        return;
      }
      quickCreate.onCreated(created);
    },
    [quickCreate, createKind, createNoun, scopeRootParentId],
  );

  // "Between" — the insertion gap under a row: sibling slot right after it.
  const quickCreateAfter = useCallback(
    async (row: FlatRow) => {
      if (!quickCreate) return;
      setCreateError(null);
      const created = await createContent(
        createKind,
        quickCreate.defaultTitle,
        row.parentId,
        row.siblingIndex + 1,
      );
      if (!created) {
        setCreateError(`Couldn't create the ${createNoun.toLowerCase()}.`);
        return;
      }
      quickCreate.onCreated(created);
    },
    [quickCreate, createKind, createNoun],
  );

  // "Beginning" — the leading gap above a sibling group's first row:
  // the very top slot of that group (top of an expanded folder, or top
  // of root / the scoped view).
  const quickCreateAtStart = useCallback(
    async (row: FlatRow) => {
      if (!quickCreate) return;
      setCreateError(null);
      const created = await createContent(
        createKind,
        quickCreate.defaultTitle,
        row.parentId,
        0,
      );
      if (!created) {
        setCreateError(`Couldn't create the ${createNoun.toLowerCase()}.`);
        return;
      }
      quickCreate.onCreated(created);
    },
    [quickCreate, createKind, createNoun],
  );

  // Create-targeting mode: a pick IS "create inside the picked container",
  // flowing through the same placement code as the "+" affordances — one
  // code path for every create.
  const effectiveOnPick = useCallback(
    (target: PickerTarget) => {
      if (quickCreate?.pickCreatesInside) {
        void quickCreateInside(target.id);
        return;
      }
      onPick(target);
    },
    [quickCreate, quickCreateInside, onPick],
  );

  // What committing a row DOES, for the row tooltips.
  const pickCommitLabel = quickCreate?.pickCreatesInside
    ? `create a ${createNoun.toLowerCase()} here`
    : "open";

  // Collapse filter: a row renders only when every ancestor is expanded.
  const visibleRows = useMemo(() => {
    if (!tree) return [];
    const idsInTree = new Set(tree.map((r) => r.id));
    const parentById = new Map<string, string | null>();
    for (const row of tree) parentById.set(row.id, row.parentId);
    return tree.filter((row) => {
      // Walk up via the parent map; every IN-TREE ancestor must be
      // expanded (the scope root itself is not a row).
      let parent = row.parentId;
      while (parent && idsInTree.has(parent)) {
        if (!expandedIds.has(parent)) return false;
        parent = parentById.get(parent) ?? null;
      }
      return true;
    });
  }, [tree, expandedIds]);

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: menuPos.x,
        top: menuPos.y,
        width: MENU_WIDTH,
        maxHeight: menuPos.maxHeight ?? MENU_MAX_HEIGHT,
      }}
      className="z-[130] flex flex-col rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-[#1a1a1a] shadow-xl overflow-hidden"
    >
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={searchPlaceholder}
        autoFocus
        className="w-full bg-transparent px-3 py-2 text-xs outline-none placeholder:text-gray-500 border-b border-black/5 dark:border-white/5"
      />

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {createError ? (
          <div className="px-3 py-1 text-[11px] text-red-500">{createError}</div>
        ) : null}

        {activeQuery ? (
          searchResults === null ? (
            <div className="px-3 py-2 text-[11px] text-gray-500">Searching…</div>
          ) : searchResults.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-gray-500">No matches</div>
          ) : (
            searchResults.map((item) => (
              <PickRow
                key={item.id}
                row={{
                  ...item,
                  depth: 0,
                  hasNote: item.contentType === "note",
                  parentId: null,
                  siblingIndex: 0,
                  hasChildren: false,
                  // Search hits come back as PickerTarget (id/title/type) with
                  // no role, so they render unbadged even when referenced.
                  isReference: false,
                }}
                disabled={disabledSet.has(item.id)}
                disabledReason={disabledReason}
                onPick={effectiveOnPick}
                commitLabel={pickCommitLabel}
                // Placement math needs tree context — quick create is
                // browse-only; search rows open on click like recents.
              />
            ))
          )
        ) : (
          <>
            {recents.length > 0 ? (
              <>
                <div className="px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-gray-500 font-medium flex items-center gap-1">
                  <History className="h-3 w-3" /> {recentsLabel}
                </div>
                {recents.map((r) => (
                  <PickRow
                    key={`recent-${r.id}`}
                    row={{
                      id: r.id,
                      title: r.title,
                      contentType: "note",
                      depth: 0,
                      hasNote: true,
                      parentId: null,
                      siblingIndex: 0,
                      hasChildren: false,
                      isReference: false,
                    }}
                    disabled={disabledSet.has(r.id)}
                    disabledReason={disabledReason}
                    onPick={effectiveOnPick}
                    commitLabel={pickCommitLabel}
                  />
                ))}
                <div className="mx-2 my-1 border-t border-black/5 dark:border-white/5" />
              </>
            ) : null}

            {/* Scope row — the root representation. Click to unfold the
                view list beneath it; "+ New Note" creates at the top of
                the current scope. */}
            <div
              ref={scopeRowRef}
              className={cn(
                "flex w-full items-center gap-2 py-1.5 pl-3 pr-2 text-xs text-gray-500 dark:text-gray-400 transition-colors",
                scopeAnchor && "bg-black/[0.04] dark:bg-white/[0.06]",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  if (views.length === 0) return;
                  setScopeAnchor((current) =>
                    current ? null : scopeRowRef.current,
                  );
                }}
                disabled={views.length === 0}
                title={
                  views.length > 0
                    ? "Choose the view this picker browses"
                    : "Root"
                }
                className={cn(
                  // outline-none: the row's open-state tint is the designed
                  // affordance; the browser's focus ring read as foreign.
                  "flex min-w-0 flex-1 items-center gap-2 text-left outline-none",
                  views.length > 0 ? "cursor-pointer" : "cursor-default",
                )}
              >
                {views.length > 0 ? (
                  scopeAnchor ? (
                    <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0 text-gray-400" />
                  )
                ) : (
                  <span className="w-3 shrink-0" aria-hidden />
                )}
                {currentView ? (
                  <Layers className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                ) : (
                  <Home className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                )}
                <span className="truncate italic">
                  {currentView ? currentView.label : "Root"}
                </span>
              </button>
              {quickCreate ? (
                <QuickCreateButton
                  noun={createNoun}
                  onClick={() => void quickCreateInside(null)}
                />
              ) : null}
            </div>

            {scopeAnchor ? (
              <ScopeMenu
                anchorEl={scopeAnchor}
                menuRef={scopeMenuRef}
                options={scopeOptions}
                onSelect={selectScope}
              />
            ) : null}

            {tree === null ? (
              <div className="px-3 py-2 text-[11px] text-gray-500">Loading…</div>
            ) : visibleRows.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-gray-500">
                Nothing here yet
              </div>
            ) : (
              visibleRows.map((row, index) => {
                const prev = visibleRows[index - 1];
                const next = visibleRows[index + 1];
                // A gap renders only where the visual boundary is a TRUE
                // sibling boundary: under an expanded container the next
                // visible row is its child, and a note created "after"
                // the container would land below the whole subtree —
                // visually elsewhere than the gap. Skip those.
                // Reference rows are excluded: they occupy a separate index
                // space from primary children, so "create after this one"
                // would splice at a slot that means something else.
                const gapEligible =
                  Boolean(quickCreate) &&
                  !row.isReference &&
                  (!next || next.depth <= row.depth);
                // A LEADING gap marks the top slot of a sibling group:
                // above the first top-level row, and between an expanded
                // container and its first child ("beginning of folder").
                const leadingGapEligible =
                  Boolean(quickCreate) &&
                  (index === 0 || (prev ? prev.depth < row.depth : false));
                return (
                  <div key={row.id}>
                    {leadingGapEligible ? (
                      <InsertGap
                        depth={row.depth}
                        noun={createNoun}
                        onClick={() => void quickCreateAtStart(row)}
                      />
                    ) : null}
                    <PickRow
                      row={row}
                      disabled={disabledSet.has(row.id)}
                      disabledReason={disabledReason}
                      isExpanded={expandedIds.has(row.id)}
                      onToggle={toggleExpanded}
                      onPick={effectiveOnPick}
                      commitLabel={pickCommitLabel}
                      createNoun={createNoun}
                      onQuickCreateInside={
                        quickCreate && row.contentType === "folder"
                          ? (r) => void quickCreateInside(r.id)
                          : undefined
                      }
                    />
                    {gapEligible ? (
                      <InsertGap
                        depth={row.depth}
                        noun={createNoun}
                        onClick={() => void quickCreateAfter(row)}
                      />
                    ) : null}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Scope dropdown — unfolds FLUSH beneath the scope row at the row's
 * exact width (portaled + fixed, so the tree rows below never shift).
 * Squared top corners + no top border + the row's open-state tint make
 * row + menu read as one expanded surface, not a detached card.
 */
function ScopeMenu({
  anchorEl,
  menuRef,
  options,
  onSelect,
}: {
  anchorEl: HTMLElement;
  menuRef: React.RefObject<HTMLDivElement | null>;
  options: Array<{ id: string | null; label: string }>;
  onSelect: (id: string | null) => void;
}) {
  const pos = useMemo(() => {
    const rect = anchorEl.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.bottom,
      width: rect.width,
      // Never taller than the space to the viewport bottom.
      maxHeight: Math.min(260, window.innerHeight - rect.bottom - 8),
    };
  }, [anchorEl]);

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        width: pos.width,
        maxHeight: pos.maxHeight,
      }}
      className="z-[140] flex flex-col overflow-y-auto rounded-b-lg border border-t-0 border-black/10 dark:border-white/10 bg-white dark:bg-[#1a1a1a] pb-1 shadow-xl"
    >
      {options.map((opt) => (
        <button
          key={opt.id ?? "root"}
          type="button"
          onClick={() => onSelect(opt.id)}
          className="flex w-full items-center gap-2 py-1.5 pl-3 pr-2 text-left text-xs text-gray-600 dark:text-gray-300 hover:bg-black/[0.04] dark:hover:bg-white/5"
        >
          {opt.id === null ? (
            <Home className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          ) : (
            <Layers className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          )}
          <span className="truncate">{opt.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}

/**
 * Insertion gap — the between-rows create affordance. Hovering the
 * boundary between two sibling rows reveals a line + plus marking the
 * exact slot the new note will occupy; clicking creates it there.
 * Slightly visible on touch devices (no hover to reveal it).
 */
function InsertGap({
  depth,
  noun,
  onClick,
}: {
  depth: number;
  noun: string;
  onClick: () => void;
}) {
  return (
    <div
      className="group/gap relative h-2 -my-1"
      style={{ marginLeft: `${12 + depth * 12}px`, marginRight: "8px" }}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={`New ${noun.toLowerCase()} here`}
        title={`+ New ${noun} (here)`}
        className="absolute inset-x-0 top-1/2 z-10 flex h-4 -translate-y-1/2 items-center opacity-0 transition-opacity group-hover/gap:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-40"
      >
        <span className="h-px flex-1 bg-emerald-500/70" />
        <span className="mx-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-emerald-500/70 bg-white text-[10px] leading-none text-emerald-600 dark:bg-[#1a1a1a] dark:text-emerald-400">
          +
        </span>
        <span className="h-px flex-1 bg-emerald-500/70" />
      </button>
    </div>
  );
}

/** The "+ New <noun>" button — folders and the scope row only ("inside" semantics). */
function QuickCreateButton({
  noun,
  onClick,
}: {
  noun: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`New ${noun.toLowerCase()}`}
      title={`+ New ${noun}`}
      className="ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
    >
      <Plus className="h-3 w-3" aria-hidden="true" />
    </button>
  );
}

function PickRow({
  row,
  disabled,
  disabledReason,
  isExpanded = false,
  onToggle,
  onPick,
  commitLabel = "open",
  createNoun = "Note",
  onQuickCreateInside,
}: {
  row: FlatRow;
  disabled?: boolean;
  disabledReason?: string;
  isExpanded?: boolean;
  onToggle?: (id: string) => void;
  onPick: (target: PickerTarget) => void;
  /** What committing this row does, for tooltips ("open" / "create a database here"). */
  commitLabel?: string;
  createNoun?: string;
  onQuickCreateInside?: (row: FlatRow) => void;
}) {
  const expandable = Boolean(row.hasChildren && onToggle);
  const pick = () =>
    onPick({ id: row.id, title: row.title, contentType: row.contentType });

  /**
   * Press and hold to pick a container, matching the file tree's gesture.
   *
   * The tree teaches "hold to open" on exactly these rows; arriving in the
   * picker and finding the gesture inert is the kind of inconsistency that
   * makes a learned gesture feel unreliable everywhere. Here "open" means
   * "pick", which is this surface's commit.
   *
   * All pointer types, unlike the tree: a long press there is already spoken
   * for by the context menu on touch, and the picker has no context menu to
   * compete with. No arming hint — a hint is what got press-and-hold pulled
   * from this component in 2026-08-15, since it flashed on every ordinary
   * folder click.
   */
  const suppressNextToggleRef = useRef(false);
  const longPress = useLongPress(
    () => {
      if (disabled || !expandable) return;
      suppressNextToggleRef.current = true;
      pick();
    },
    { pointerTypes: ["touch", "mouse", "pen"] },
  );

  const tooltip = disabled
    ? (disabledReason ?? "Not selectable here")
    : expandable
      ? `Click to expand · Double-click or hold to ${commitLabel}`
      : `Click to ${commitLabel}`;

  return (
    <div
      className={cn(
        "group flex w-full items-center gap-2 pr-2 py-1.5 text-left text-xs transition-colors",
        disabled ? "opacity-50" : "hover:bg-black/[0.04] dark:hover:bg-white/5",
      )}
      style={{ paddingLeft: `${12 + row.depth * 12}px` }}
    >
      <button
        type="button"
        disabled={disabled}
        {...longPress}
        onClick={() => {
          // The click that ends a hold must not also toggle — the hold has
          // already picked, and toggling on release makes the row move as the
          // user lets go.
          if (suppressNextToggleRef.current) {
            suppressNextToggleRef.current = false;
            return;
          }
          if (expandable) {
            onToggle?.(row.id);
            return;
          }
          pick();
        }}
        onDoubleClick={() => {
          // Reverse the first click's toggle, as the file tree does: without
          // this a double-click expands the row on its way to picking it, so
          // the list shifts under the cursor at the moment of commit.
          if (expandable) {
            onToggle?.(row.id);
            pick();
          }
        }}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 text-left",
          disabled ? "cursor-default" : "cursor-pointer",
        )}
        title={tooltip}
      >
        {expandable ? (
          isExpanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-gray-400" />
          )
        ) : (
          // Keeps leaf labels aligned with expandable siblings.
          <span className="w-3 shrink-0" aria-hidden />
        )}
        {/* Reference rows carry the same corner badge the file tree uses, so
            an attachment reads as one here too rather than as a plain child. */}
        <span
          className={cn("relative inline-flex shrink-0", row.isReference && "mr-0.5")}
        >
          {row.contentType === "folder" ? (
            isExpanded ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-yellow-500/80" />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-yellow-500/80" />
            )
          ) : (
            <TypeIcon
              contentType={row.contentType}
              className="h-3.5 w-3.5 shrink-0 text-gray-400"
            />
          )}
          {row.isReference ? (
            <span
              aria-hidden
              className="absolute -bottom-1 -right-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-white text-gray-500 ring-1 ring-black/10 dark:bg-gray-800 dark:text-gray-400 dark:ring-white/15"
            >
              <LinkIcon className="h-1.5 w-1.5" />
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "truncate",
            row.isReference
              ? "text-gray-500 dark:text-gray-400"
              : "text-gray-700 dark:text-gray-300",
          )}
        >
          {row.title}
        </span>
        {disabled && disabledReason ? (
          <span className="text-[10px] text-gray-500">({disabledReason})</span>
        ) : null}
        <span
          className={cn(
            "ml-auto h-1.5 w-1.5 shrink-0 rounded-full",
            row.hasNote
              ? "bg-emerald-500/80"
              : "border border-gray-400 dark:border-gray-500",
          )}
        />
      </button>
      {onQuickCreateInside && !disabled ? (
        <span title={`+ New ${createNoun} (inside this folder)`}>
          <QuickCreateButton
            noun={createNoun}
            onClick={() => onQuickCreateInside(row)}
          />
        </span>
      ) : null}
    </div>
  );
}
