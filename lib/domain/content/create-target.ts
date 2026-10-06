/**
 * Where does a "+" create land? One rule for every create path.
 *
 * Tree space vs. server space: in a view-scoped tree (workspace / workbench
 * view) the view root's own row is hidden and its children are the top level.
 * Tree-space `null` therefore means "top of the tree being looked at", and
 * every server write must remap it to the view root (`toServerParent`) —
 * otherwise the item lands at the vault root, invisibly outside the view.
 *
 * Rule (tree space):
 *   1. An explicit target (a folder's own Add menu) wins. A shortcut target
 *      resolves to the shortcut's parent (nothing is stored under a
 *      shortcut); a non-folder target makes the new item its sibling.
 *   2. Otherwise the single tree selection: a folder → inside it; anything
 *      else → beside it (its parent).
 *   3. Otherwise — nothing selected, a stale/virtual selection, or a parent
 *      that no longer exists in the tree (orphan of a trashed folder) — the
 *      top of the current tree. Never a dangling id, never "nothing".
 */

export interface CreateTargetNode {
  id: string;
  contentType: string;
  parentId: string | null;
}

export interface ResolveCreateParentInput {
  explicitParentId: string | null | undefined;
  selectedIds: readonly string[];
  findNode: (id: string) => CreateTargetNode | null;
  /** Folder the tree is scoped to (null = whole tree). */
  viewRootId: string | null;
}

/** People mounts use virtual parents the create path understands as-is. */
function isVirtualParent(id: string): boolean {
  return id.startsWith("peopleGroup:") || id.startsWith("person:") || id.startsWith("temp-");
}

/** Normalize a candidate parent id into tree space (null = top level). */
function toTreeSpace(
  parentId: string | null,
  input: ResolveCreateParentInput
): string | null {
  if (!parentId || parentId === input.viewRootId) return null;
  if (isVirtualParent(parentId)) return parentId;
  const node = input.findNode(parentId);
  if (!node) return null; // orphaned parent (trashed folder) or outside the view
  if (node.contentType === "folder") return node.id;
  // Shortcuts and leaf items can't hold children: become a sibling.
  return toTreeSpace(node.parentId, input);
}

export function resolveCreateParent(input: ResolveCreateParentInput): string | null {
  if (input.explicitParentId) return toTreeSpace(input.explicitParentId, input);
  if (input.selectedIds.length !== 1) return null;
  const selectedId = input.selectedIds[0];
  if (isVirtualParent(selectedId)) return null;
  const node = input.findNode(selectedId);
  if (!node) return null;
  return node.contentType === "folder" ? node.id : toTreeSpace(node.parentId, input);
}

/** Tree-space parent → the parentId a server write should use. */
export function toServerParent(treeParentId: string | null, viewRootId: string | null): string | null {
  if (treeParentId && (treeParentId.startsWith("peopleGroup:") || treeParentId.startsWith("person:"))) {
    return treeParentId;
  }
  return treeParentId ?? viewRootId;
}

// ── Shared resolver for surfaces outside the tree (extensions) ─────────────

type ServerParentResolver = (explicitParentId: string | null) => string | null;

let activeResolver: ServerParentResolver | null = null;

/** The file tree registers its live resolver (tree data + view scope). */
export function registerCreateTargetResolver(resolver: ServerParentResolver | null): void {
  activeResolver = resolver;
}

/**
 * Server-space parent for a "+" action raised outside the tree component
 * (e.g. the reader's bookshelf). Falls back to the explicit id / root when
 * the tree isn't mounted.
 */
export function resolveServerCreateParent(explicitParentId: string | null): string | null {
  return activeResolver ? activeResolver(explicitParentId) : explicitParentId;
}

// ── What the header's "+" and sort act on, described for their tooltips ────

/**
 * The tree's current target: the folder a "+" adds to and the sort menu
 * reorders — `resolveCreateParent` with no explicit parent (a selected
 * folder, else the selected item's folder, else the top of the tree).
 */
export interface TreeLevelTarget {
  /** Server-space parent id (null = the vault's top level). */
  serverParentId: string | null;
  /** How to name it to the user: `“Career Pathways”`, or "the top level". */
  label: string;
  /** Whether it can be sorted (people groups and pending rows can't). */
  sortable: boolean;
  /** The level's rows as they stand, for previewing a sort (Name's direction). */
  rows: Array<{
    id: string;
    title: string;
    displayOrder: number;
    folderLike: boolean;
    nested: boolean;
  }>;
}

let activeTargetDescriber: (() => TreeLevelTarget | null) | null = null;

/** The file tree registers how to describe its live target. */
export function registerTreeTargetDescriber(describer: (() => TreeLevelTarget | null) | null): void {
  activeTargetDescriber = describer;
}

/** The current target, read at the moment it is needed (a hover, a menu opening). */
export function describeTreeTarget(): TreeLevelTarget | null {
  return activeTargetDescriber ? activeTargetDescriber() : null;
}
