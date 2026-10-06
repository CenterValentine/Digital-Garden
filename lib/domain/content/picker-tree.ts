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
