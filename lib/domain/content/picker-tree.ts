/**
 * Picker tree — the pure walk that turns the content-tree API's nested nodes
 * into the flat, depth-annotated rows `ContentTreePicker` renders.
 *
 * Kept out of the component (which pulls in React, lucide and the Zustand
 * stores) so the walk can be exercised on its own — see
 * `scripts/validate-picker-tree.ts`.
 *
 * THE RULE THAT BROKE (owner report, 2026-10-05): the walk used to descend
 * into a container only when the container was itself a pickable type. A
 * picker that wants notes only (Move to Note: `eligibleTypes = {note}`) never
 * entered a folder, so choosing a scope listed only the notes sitting at its
 * top level — "root — show all files" showed ONE item. Every other consumer
 * hid the flaw by listing "folder" as pickable. Eligibility now decides what
 * can be PICKED, never what can be BROWSED: folders are always rows and are
 * always walked, flagged `pickable: false` when their type isn't eligible.
 */

/** Types we recurse into when flattening (containers of more content). */
const RECURSE_TYPES = new Set(["folder", "note"]);

/** Folders are the browse structure; they appear whether or not they can be picked. */
const NAVIGABLE_TYPES = new Set(["folder"]);

export interface TreeNodeLite {
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

export interface FlatRow {
  id: string;
  title: string;
  contentType: string;
  depth: number;
  hasNote: boolean;
  /**
   * Can this row be PICKED (click / double-click / hold commits it)? False for
   * a folder shown only so its contents can be reached under a picker that
   * doesn't accept folders: it expands, offers "+ New", and nothing else.
   */
  pickable: boolean;
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
  /** When the content was created (ms), when the tree said — orders a folder's newest items. */
  createdAt?: number;
}

export function flattenEligible(
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
    const pickable = eligibleTypes.has(node.contentType);
    // A row appears if it can be picked OR it is a folder to browse through.
    if (pickable || NAVIGABLE_TYPES.has(node.contentType)) {
      const row: FlatRow = {
        id: node.id,
        title: node.title,
        contentType: node.contentType,
        depth,
        hasNote: Boolean(node.note),
        pickable,
        parentId,
        siblingIndex,
        hasChildren: false,
        isReference: asReference,
      };
      const createdAt = node.createdAt ? new Date(node.createdAt).getTime() : NaN;
      if (!Number.isNaN(createdAt)) row.createdAt = createdAt;
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

/** A file named on a destination row's first line. */
export interface DestinationFile {
  id: string;
  title: string;
  contentType: string;
}

/**
 * The files to name on a "Recent" / "Open" destination row. A folder alone
 * confused people: they recognize the FILE they were in, and reach for it as
 * the point of reference rather than its parent (owner ask, 2026-10-08). The
 * destinations themselves are unchanged; this only says what lives there.
 *
 * Order, left to right: files viewed most recently first (`viewedAt`, the
 * in-memory navigation history), then `alsoFirst` ids not yet viewed (open
 * tabs), then the folder's newest creations — what made it a destination.
 * Direct children only, never folders; capped, since the line lets the rest
 * run out of view anyway.
 */
export function filesForDestination(
  rows: readonly FlatRow[],
  folderId: string | null,
  viewedAt: ReadonlyMap<string, number>,
  options: { alsoFirst?: ReadonlySet<string>; limit?: number } = {},
): DestinationFile[] {
  const limit = options.limit ?? 8;
  const files = rows.filter((row) => row.parentId === folderId && row.contentType !== "folder");
  const viewed = files
    .filter((row) => viewedAt.has(row.id))
    .sort((a, b) => (viewedAt.get(b.id) ?? 0) - (viewedAt.get(a.id) ?? 0));
  const seen = new Set(viewed.map((row) => row.id));
  const open = files.filter((row) => !seen.has(row.id) && options.alsoFirst?.has(row.id));
  for (const row of open) seen.add(row.id);
  const newest = files
    .filter((row) => !seen.has(row.id) && row.createdAt !== undefined)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return [...viewed, ...open, ...newest]
    .slice(0, limit)
    .map((row) => ({ id: row.id, title: row.title, contentType: row.contentType }));
}

/** Latest view time per content id across every pane's history. */
export function latestViewTimes(
  histories: ReadonlyArray<{ history: ReadonlyArray<{ contentId: string | null; timestamp: number }> }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const pane of histories) {
    for (const item of pane.history) {
      if (!item.contentId) continue;
      if (item.timestamp > (out.get(item.contentId) ?? 0)) out.set(item.contentId, item.timestamp);
    }
  }
  return out;
}
