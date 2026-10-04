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
 *   - recent destinations (quickCreate consumers only): ONE collapsible
 *     row naming the folder that last received a create, unfolding to
 *     the last few. Each carries "+" (create inside it, whatever the
 *     picker's scope) and click-to-jump (reveal it in the browse tree).
 *     Backed by `state/create-destination-store.ts`, fed by every create
 *     that goes through this picker or the file tree (owner ask,
 *     2026-10-02: "the last selection the user made, especially if it
 *     was somewhere different than they are targeting in the file tree").
 *   - recents: optional caller-supplied list shown above the tree.
 *   - scope header: the file-tree-style root representation, styled as
 *     a HEADER (border, tint, bold title, count chip) so it reads as the
 *     tree's frame rather than its first row — mirroring RootNodeHeader.
 *     Shows the current view scope ("Root" = everything, or a workspace
 *     view's name). Clicking it lists the available scopes — ordered
 *     with the DEFAULT scope first (the active workspace view when one
 *     is set, Root otherwise), then the alternatives — selecting one
 *     re-fetches the tree filtered to that view. Carries "+ New Note"
 *     for creating at the top of the current scope.
 *   - browse: lazy-fetched content tree. Opens at the FILE TREE'S
 *     perspective: the folders the tree has expanded are expanded here,
 *     the tree's selected row is highlighted and scrolled into view, and
 *     its ancestors are unfolded so it is visible. Same engine as the
 *     tree's own create rule (`resolveCreateParent` reads the same
 *     `useTreeStateStore` selection) — the user adds or loads content
 *     from the place they already see, and lands elsewhere from that
 *     point of reference. Rows with nested content show a chevron:
 *     single click toggles expansion, double-click picks the container
 *     itself (touch parity beats hover-to-expand). Leaf rows pick on
 *     single click.
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
  Eye,
  Upload,
  FolderInput,
} from "lucide-react";

import { cn } from "@/lib/core/utils";
import { calculateMenuPosition } from "@/lib/core/menu-positioning";
import { useWorkspaceStore } from "@/state/workspace-store";
import { useTreeStateStore } from "@/state/tree-state-store";
import { useContentStore } from "@/state/content-store";
import {
  recordCreateDestination,
  useCreateDestinationStore,
  type CreateDestination,
} from "@/state/create-destination-store";

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
  /** ISO string over the wire — read to derive "where you last created". */
  createdAt?: string | Date;
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

/**
 * Every node in the raw tree, children recursed — the same count the file
 * tree's header chip shows (`countTotalNodes` in LeftSidebarContent), so
 * the picker's header reads "295 files" when the tree does, not the
 * smaller number of rows that survived `eligibleTypes`.
 */
function countTreeNodes(nodes: TreeNodeLite[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1;
    if (node.children?.length) count += countTreeNodes(node.children);
  }
  return count;
}

/**
 * Destinations the tree itself proves: for every parent (null = the scope's
 * top, remapped to the view root by the caller), the newest `createdAt`
 * among its direct content children. This is what makes the "Recent
 * destinations" row useful from the FIRST open — before any create has been
 * recorded on this device — by projecting what the user already did rather
 * than waiting to observe it. Recorded creates merge on top by time.
 */
function deriveDestinations(
  nodes: TreeNodeLite[],
  parentId: string | null,
  out: Map<string | null, number> = new Map(),
): Map<string | null, number> {
  for (const node of nodes) {
    if (node.treeNodeKind && node.treeNodeKind !== "content") continue;
    const at = node.createdAt ? new Date(node.createdAt).getTime() : NaN;
    if (!Number.isNaN(at) && at > (out.get(parentId) ?? 0)) out.set(parentId, at);
    if (node.children?.length) deriveDestinations(node.children, node.id, out);
  }
  return out;
}

/** Ids of every in-tree ancestor of `id`, nearest-first. */
function ancestorIds(
  id: string,
  parentById: ReadonlyMap<string, string | null>,
): string[] {
  const out: string[] = [];
  let cursor = parentById.get(id) ?? null;
  while (cursor && parentById.has(cursor)) {
    out.push(cursor);
    cursor = parentById.get(cursor) ?? null;
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
  /**
   * Optional action row pinned under the search box — for a consumer's
   * out-of-tree alternative (e.g. the File cell's "Upload from device").
   * The picker stays a picker; the action's behavior is the caller's.
   */
  headerAction?: { label: string; onClick: () => void };
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
  headerAction,
}: ContentTreePickerProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  // The scrolling list (below the search box) — see the open-position effect.
  const listRef = useRef<HTMLDivElement | null>(null);
  // A destination to unfold + reveal once the NEXT tree loads (a jump to a
  // folder outside the current scope widens to Root first).
  const pendingRevealRef = useRef<string | null>(null);
  const [tree, setTree] = useState<FlatRow[] | null>(null);
  // Raw node count for the scope header's chip (see countTreeNodes).
  const [totalCount, setTotalCount] = useState(0);
  // Expansion starts as the FILE TREE'S expansion (seeded when a tree
  // loads — see the fetch effect) and then belongs to the picker: single
  // click toggles; double-click picks the container itself. Rows the
  // tree has collapsed stay collapsed, so a user who keeps the tree tidy
  // gets a tidy picker.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // The row to highlight + scroll to once a tree holds it. Starts as the
  // tree's single selection (the row the user is looking at); a click on
  // a recent destination re-aims it. `nonce` lets the same id be revealed
  // twice in a row (the user scrolled away and clicked it again).
  const [reveal, setReveal] = useState<{ id: string; nonce: number } | null>(
    () => {
      // Where the user is: the tree's single selection, else the content
      // open in the main panel (a Note Window's host note, a tab opened
      // from search — anything the tree isn't selecting).
      const ids = useTreeStateStore.getState().selectedIds;
      const only =
        ids.length === 1
          ? ids[0]
          : useContentStore.getState().selectedContentId;
      return only && !only.startsWith("temp-") ? { id: only, nonce: 0 } : null;
    },
  );
  // The content open in the main panel — drawn in the tree's deep gold so
  // the picker and the tree say the same thing: gold = open, grey = selected.
  const activeContentId = useContentStore((s) => s.selectedContentId);
  // Recent create destinations — the "last place you created something"
  // row. Only meaningful to consumers that can create (quickCreate).
  const recentDestinations = useCreateDestinationStore(
    (s) => s.recentDestinations,
  );
  const forgetDestination = useCreateDestinationStore((s) => s.forgetDestination);
  const [destinationsOpen, setDestinationsOpen] = useState(false);
  // Destinations the loaded tree proves (see deriveDestinations), keyed by
  // server-space parent id. Merged with the recorded ones below.
  const [derivedDestinations, setDerivedDestinations] = useState<
    Array<{ id: string | null; at: number }>
  >([]);
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
          const flat = flattenEligible(nodes, eligibleTypes, scopeRootParentId);
          // Open at the file tree's perspective. Read the store once here
          // (not subscribed): the seed is taken when a tree arrives, and
          // from then on the expansion is the picker's own — the user's
          // clicks in either surface must not fight the other's.
          const treeState = useTreeStateStore.getState();
          const idsInTree = new Set(flat.map((r) => r.id));
          const parentById = new Map<string, string | null>();
          for (const row of flat) parentById.set(row.id, row.parentId);
          const seed = new Set<string>();
          for (const id of treeState.expandedIds) {
            if (idsInTree.has(id)) seed.add(id);
          }
          // The selected row must be VISIBLE, whatever the tree has
          // collapsed above it — unfold its ancestors.
          const selectedOnly =
            treeState.selectedIds.length === 1
              ? treeState.selectedIds[0]
              : useContentStore.getState().selectedContentId;
          if (selectedOnly && idsInTree.has(selectedOnly)) {
            for (const id of ancestorIds(selectedOnly, parentById)) seed.add(id);
          }
          // A jump that had to widen the scope finishes here.
          const pending = pendingRevealRef.current;
          if (pending) {
            pendingRevealRef.current = null;
            if (idsInTree.has(pending)) {
              for (const id of ancestorIds(pending, parentById)) seed.add(id);
              seed.add(pending);
              setReveal((prev) => ({ id: pending, nonce: (prev?.nonce ?? 0) + 1 }));
            } else {
              // Gone at Root too — the folder was trashed.
              useCreateDestinationStore.getState().forgetDestination(pending);
            }
          }
          setExpandedIds(seed);
          setTotalCount(countTreeNodes(nodes));
          // Top-level creates in a scoped tree live under the view root —
          // record them by its real id, as every create path does.
          setDerivedDestinations(
            Array.from(deriveDestinations(nodes, scopeRootParentId)).map(
              ([id, at]) => ({ id, at }),
            ),
          );
          setTree(flat);
        }
      } catch {
        if (!cancelled) setTree(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eligibleTypes, viewId, scopeRootParentId]);

  // Lookup over the loaded tree for recording destinations + refreshing
  // destination titles. The scope root's own row is hidden in a scoped
  // tree, so it resolves to the view's label.
  const lookupNode = useCallback(
    (id: string): { title: string; parentId: string | null } | null => {
      if (currentView && id === currentView.rootContentId) {
        return { title: currentView.label, parentId: null };
      }
      const row = tree?.find((r) => r.id === id);
      return row ? { title: row.title, parentId: row.parentId } : null;
    },
    [tree, currentView],
  );

  // The "Recent destinations" list: recorded creates (this device, exact)
  // merged with what the loaded tree proves (any device, by createdAt),
  // newest first, one row per folder, capped like the store.
  const destinations = useMemo<CreateDestination[]>(() => {
    const byId = new Map<string | null, CreateDestination>();
    for (const d of recentDestinations) byId.set(d.id, d);
    for (const { id, at } of derivedDestinations) {
      const existing = byId.get(id);
      if (existing && existing.at >= at) continue;
      const node = id ? lookupNode(id) : null;
      const parentPath: string[] = [];
      let cursor = node?.parentId ?? null;
      while (cursor && parentPath.length < 2) {
        const ancestor = lookupNode(cursor);
        if (!ancestor) break;
        parentPath.unshift(ancestor.title);
        cursor = ancestor.parentId;
      }
      byId.set(id, {
        id,
        title: id === null ? "Root" : (node?.title ?? existing?.title ?? "Folder"),
        parentPath: node ? parentPath : (existing?.parentPath ?? []),
        at,
      });
    }
    return Array.from(byId.values())
      .sort((a, b) => b.at - a.at)
      .slice(0, 6);
  }, [recentDestinations, derivedDestinations, lookupNode]);

  // Where the list opens: ON THE USER'S PERSPECTIVE. The first time a tree is
  // on screen, the row where the user is (tree selection, else the active
  // content) is centred, so the picker opens at the place they already see.
  // With nothing to focus, the scope HEADER goes to the top instead (recents
  // one scroll-up above). Later reveals (a destination jump) re-centre the
  // target. Rows carry scroll-mt so a row scrolled to the edge clears the
  // sticky header. Runs after paint (rows must exist) and reads the DOM
  // through refs — never during render.
  const didAlignRef = useRef(false);
  useEffect(() => {
    if (!tree) return;
    const list = listRef.current;
    if (!list) return;
    const target = reveal
      ? list.querySelector<HTMLElement>(
          `[data-row-id="${CSS.escape(reveal.id)}"]`,
        )
      : null;
    if (target) {
      didAlignRef.current = true;
      target.scrollIntoView({ block: "center" });
      return;
    }
    if (!didAlignRef.current) {
      didAlignRef.current = true;
      const header = list.querySelector<HTMLElement>("[data-scope-header]");
      if (header) {
        list.scrollTop +=
          header.getBoundingClientRect().top - list.getBoundingClientRect().top;
      }
    }
  }, [reveal, tree]);

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

  // Every create funnels through here: one POST path, one error message,
  // and ONE place that remembers the destination for next time. The
  // parent is SERVER space (the view root's real id, never tree-space
  // null) — exactly what the destination store expects.
  const runCreate = useCallback(
    async (parentId: string | null, newDisplayOrder: number) => {
      if (!quickCreate) return;
      setCreateError(null);
      const created = await createContent(
        createKind,
        quickCreate.defaultTitle,
        parentId,
        newDisplayOrder,
      );
      if (!created) {
        setCreateError(`Couldn't create the ${createNoun.toLowerCase()}.`);
        return;
      }
      recordCreateDestination(parentId, lookupNode);
      quickCreate.onCreated(created);
    },
    [quickCreate, createKind, createNoun, lookupNode],
  );

  // "Inside" — top of a container (by id), or top of the current scope (null).
  const quickCreateInside = useCallback(
    (parentContentId: string | null) =>
      runCreate(parentContentId ?? scopeRootParentId, 0),
    [runCreate, scopeRootParentId],
  );

  // "Between" — the insertion gap under a row: sibling slot right after it.
  const quickCreateAfter = useCallback(
    (row: FlatRow) => runCreate(row.parentId, row.siblingIndex + 1),
    [runCreate],
  );

  // "Beginning" — the leading gap above a sibling group's first row:
  // the very top slot of that group (top of an expanded folder, or top
  // of root / the scoped view).
  const quickCreateAtStart = useCallback(
    (row: FlatRow) => runCreate(row.parentId, 0),
    [runCreate],
  );

  // "There again" — a recent destination's "+". The id is already server
  // space, so no scope remap: it creates in that folder even when the
  // picker is scoped to a view that can't see it.
  const quickCreateAtDestination = useCallback(
    (destination: CreateDestination) => runCreate(destination.id, 0),
    [runCreate],
  );

  // Click on a recent destination: go THERE in the browse tree. In scope →
  // unfold its ancestors and itself, highlight, scroll. Out of scope →
  // widen to Root and finish once that tree arrives (pendingRevealRef).
  // Absent even at Root → the folder is gone; forget it.
  const jumpToDestination = useCallback(
    (destination: CreateDestination) => {
      setDestinationsOpen(false);
      if (destination.id === null) {
        // Root: the top of the tree. Scroll to the top, nothing to unfold.
        if (viewId !== null) selectScope(null);
        menuRef.current
          ?.querySelector<HTMLElement>("[data-scope-header]")
          ?.scrollIntoView({ block: "start" });
        return;
      }
      const id = destination.id;
      const inTree = tree?.some((r) => r.id === id) ?? false;
      if (inTree && tree) {
        const parentById = new Map<string, string | null>();
        for (const row of tree) parentById.set(row.id, row.parentId);
        setExpandedIds((prev) => {
          const next = new Set(prev);
          for (const a of ancestorIds(id, parentById)) next.add(a);
          next.add(id);
          return next;
        });
        setReveal((prev) => ({ id, nonce: (prev?.nonce ?? 0) + 1 }));
        return;
      }
      if (viewId !== null) {
        pendingRevealRef.current = id;
        selectScope(null);
        return;
      }
      if (tree) forgetDestination(id);
    },
    [tree, viewId, selectScope, forgetDestination],
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

      {headerAction ? (
        <button
          type="button"
          onClick={headerAction.onClick}
          className="flex w-full items-center gap-2 border-b border-black/5 px-3 py-1.5 text-left text-xs text-emerald-700 transition-colors hover:bg-black/[0.04] dark:border-white/5 dark:text-emerald-300 dark:hover:bg-white/5"
        >
          <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {headerAction.label}
        </button>
      ) : null}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-1">
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
            {quickCreate && destinations.length > 0 ? (
              <RecentDestinations
                destinations={destinations}
                open={destinationsOpen}
                onToggle={() => setDestinationsOpen((o) => !o)}
                noun={createNoun}
                lookupTitle={(id) => (id ? (lookupNode(id)?.title ?? null) : null)}
                onJump={jumpToDestination}
                onCreate={(d) => void quickCreateAtDestination(d)}
              />
            ) : null}

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

            {/* z-20: above the insertion gaps' z-10 buttons, which are later in the DOM and
                would otherwise paint over this sticky header as rows scroll under it. */}
            {/* Scope HEADER — the root representation, framed like the file
                tree's RootNodeHeader (border, tint, bold title, gold view
                icon, count chip) so it reads as the tree's header rather
                than its first row. Click the title to unfold the view list
                beneath it; "+ New Note" creates at the top of the current
                scope. */}
            <div
              ref={scopeRowRef}
              data-scope-header
              className={cn(
                "sticky top-0 z-20 flex w-full items-center gap-2 border-y border-black/10 bg-[#f7f7f7] py-1.5 pl-3 pr-2 text-xs transition-colors dark:border-white/10 dark:bg-[#222]",
                scopeAnchor && "bg-black/[0.06] dark:bg-white/[0.08]",
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
                  "-ml-1 flex min-w-0 items-center gap-2 rounded px-1 py-0.5 text-left outline-none",
                  views.length > 0
                    ? "cursor-pointer hover:bg-black/[0.05] dark:hover:bg-white/10"
                    : "cursor-default",
                )}
              >
                {currentView ? (
                  <Eye className="h-3.5 w-3.5 shrink-0 text-gold-primary" />
                ) : (
                  <Home className="h-3.5 w-3.5 shrink-0 text-gray-600 dark:text-gray-400" />
                )}
                <span className="truncate font-medium text-gray-900 dark:text-white">
                  {currentView ? currentView.label : "root"}
                </span>
                {views.length > 0 ? (
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 shrink-0 text-gray-500 opacity-70 transition-transform",
                      scopeAnchor && "rotate-180",
                    )}
                  />
                ) : null}
              </button>
              {tree ? (
                <span className="ml-auto shrink-0 rounded-full bg-black/[0.05] px-2 py-px text-[10px] text-gray-500 dark:bg-white/[0.08] dark:text-gray-400">
                  {totalCount} {totalCount === 1 ? "file" : "files"}
                </span>
              ) : null}
              {quickCreate ? (
                <QuickCreateButton
                  noun={createNoun}
                  onClick={() => void quickCreateInside(null)}
                  className={tree ? "ml-0" : undefined}
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
                      isCurrent={reveal?.id === row.id}
                      isActive={activeContentId === row.id}
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
            <Home className="h-3.5 w-3.5 shrink-0 text-gray-600 dark:text-gray-400" />
          ) : (
            <Eye className="h-3.5 w-3.5 shrink-0 text-gold-primary" />
          )}
          <span className="truncate">
            {opt.id === null ? "root — show all files" : opt.label}
          </span>
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
  title,
  className,
}: {
  noun: string;
  onClick: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title ?? `New ${noun.toLowerCase()}`}
      title={title ?? `+ New ${noun}`}
      className={cn(
        "ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200",
        className,
      )}
    >
      <Plus className="h-3 w-3" aria-hidden="true" />
    </button>
  );
}

/**
 * Recent destinations — ONE row at the top of the picker naming the folder
 * that last received a create, with a "+" that creates there again. Click
 * the row (chevron) to unfold the last few IN PLACE, pushing the list down.
 * (A hover sub-menu flyout was tried 2026-10-04 and REMOVED: the picker sits
 * at the screen edge, so a flyout beside it has nowhere good to go.) Each
 * destination: click = go there in the browse tree, "+" = create inside it.
 * The owner's framing: "a single item that is expanded to several parent
 * locations the user created content for before" — promoted above the tree
 * because it is most useful exactly when it differs from where the file
 * tree is pointing.
 */
function RecentDestinations({
  destinations,
  open,
  onToggle,
  noun,
  lookupTitle,
  onJump,
  onCreate,
}: {
  destinations: CreateDestination[];
  open: boolean;
  onToggle: () => void;
  noun: string;
  /** Live title from the loaded tree, when it can see the folder. */
  lookupTitle: (id: string | null) => string | null;
  onJump: (destination: CreateDestination) => void;
  onCreate: (destination: CreateDestination) => void;
}) {
  const latest = destinations[0];
  const titleOf = (d: CreateDestination) =>
    d.id === null ? "Root" : (lookupTitle(d.id) ?? d.title);
  const pathOf = (d: CreateDestination) =>
    d.parentPath.length > 0 ? d.parentPath.join(" / ") : null;
  // A plain render helper, not a nested component: a component declared
  // inside render remounts on every render (react/no-unstable-nested-components).
  const destIcon = (d: CreateDestination, className: string) =>
    d.id === null ? <Home className={className} /> : <Folder className={className} />;

  return (
    <div className="border-b border-black/5 dark:border-white/5 pb-1 mb-1">
      {/* Summary row: the LATEST destination, one click from creating there. */}
      <div
        className={cn(
          "group flex w-full items-center gap-2 py-1.5 pl-3 pr-2 text-xs transition-colors hover:bg-black/[0.04] dark:hover:bg-white/5",
          open && "bg-black/[0.03] dark:bg-white/[0.04]",
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          title={
            open
              ? "Hide recent destinations"
              : `Where you last created: ${titleOf(latest)} — click for more`
          }
          className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none"
        >
          {open ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-gray-400" />
          )}
          <FolderInput className="h-3.5 w-3.5 shrink-0 text-emerald-600/80 dark:text-emerald-400/80" />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
              Recent destinations
            </span>
            {!open ? (
              <span className="truncate text-gray-700 dark:text-gray-300">
                {titleOf(latest)}
                {pathOf(latest) ? (
                  <span className="ml-1 text-gray-400 dark:text-gray-500">
                    · {pathOf(latest)}
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
        </button>
        {!open ? (
          <QuickCreateButton
            noun={noun}
            title={`+ New ${noun} in ${titleOf(latest)}`}
            onClick={() => onCreate(latest)}
          />
        ) : null}
      </div>

      {open
        ? destinations.map((d) => (
            <div
              key={d.id ?? "root"}
              className="group flex w-full items-center gap-2 py-1.5 pr-2 pl-3 text-xs transition-colors hover:bg-black/[0.04] dark:hover:bg-white/5"
            >
              <button
                type="button"
                onClick={() => onJump(d)}
                title="Go there in the tree"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="w-3 shrink-0" aria-hidden />
                {destIcon(d, "h-3.5 w-3.5 shrink-0 text-yellow-500/80")}
                <span className="truncate text-gray-700 dark:text-gray-300">
                  {titleOf(d)}
                </span>
                {pathOf(d) ? (
                  <span className="truncate text-[10px] text-gray-400 dark:text-gray-500">
                    {pathOf(d)}
                  </span>
                ) : null}
              </button>
              <QuickCreateButton
                noun={noun}
                title={`+ New ${noun} in ${titleOf(d)}`}
                onClick={() => onCreate(d)}
              />
            </div>
          ))
        : null}
    </div>
  );
}

function PickRow({
  row,
  disabled,
  disabledReason,
  isExpanded = false,
  isCurrent = false,
  isActive = false,
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
  /**
   * The row the file tree has SELECTED (or a destination just jumped to):
   * the tree's grey selection tone, so the picker visibly opens where the
   * user is targeting.
   */
  isCurrent?: boolean;
  /** The content OPEN in the main panel: the tree's deep gold + rail. */
  isActive?: boolean;
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
      data-row-id={row.id}
      className={cn(
        "scroll-mt-9 group flex w-full items-center gap-2 pr-2 py-1.5 text-left text-xs transition-colors",
        // A disabled row dims its CONTENT (the button below), never the row
        // itself — dimming the wrapper washed the active-note gold into mud
        // in the Note Window picker, where the host note is both.
        !disabled && "hover:bg-black/[0.04] dark:hover:bg-white/5",
        // Same scheme as FileNode: gold = open in the pane, grey = selected.
        isActive
          ? "bg-gold-primary/[0.22] shadow-[inset_2px_0_0_0_var(--gold-primary)] dark:bg-gold-primary/[0.28]"
          : isCurrent && "bg-black/[0.07] dark:bg-white/[0.10]",
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
          // The active note keeps full strength: "(this note)" already says
          // why it can't be picked, and the gold must read like the pane "+".
          disabled && !isActive && "opacity-50",
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
            isActive
              ? "text-gold-primary font-medium"
              : isCurrent
                ? "font-medium text-gray-800 dark:text-gray-100"
                : row.isReference
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
