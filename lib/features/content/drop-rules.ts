/**
 * What the file tree lets you drag, and what a row lets you drop INSIDE it.
 *
 * These rules used to live in a `canDrop` function FileTree handed to
 * react-arborist — a prop react-arborist 3.4 never reads (it reads only
 * `disableDrag` / `disableDrop`). None of them ever ran. Worse, every row
 * carries a `children` array, which react-arborist takes to mean "container":
 * the middle half of EVERY row — note, file, link — meant "drop inside it".
 * Released there, the row jumped under the note, the move route refused it
 * ("Cannot move content into a non-folder item"), and it snapped back with an
 * error. That is the "sometimes a drag doesn't stick" the owner reported,
 * long before databases existed.
 *
 * Now FileTree passes these rules through the props react-arborist reads, and
 * a drop over the middle of a row that can't take it lands BESIDE that row
 * (above or below, by which half of the row the pointer is in) instead of
 * being refused. The rules mirror what the move route accepts, so the tree
 * never sends a move the server is certain to refuse.
 *
 * Pure (no React, no react-arborist) so `tree:smooth:check` can pin them.
 */
import type { TreeNode } from "@/lib/domain/content/types";
import { isUuid } from "@/lib/domain/content/uuid";
import { resolveDropForwardTarget } from "./shortcut-mirror";

/** The fields of a row these rules read. */
export type DropRuleRow = Pick<
  TreeNode,
  | "id"
  | "contentType"
  | "role"
  | "isShortcutMirror"
  | "windowRef"
  | "mirrorOf"
  | "shortcut"
  | "treeNodeKind"
  | "promotedFromTableId"
>;

/**
 * Rows that can't be picked up at all: a note's window rows (derived from a
 * Note Window in the note — not content held in a folder), and a row still
 * being created (`temp-…`: there is nothing on the server to move yet).
 */
export function isUndraggableRow(row: Pick<DropRuleRow, "id" | "isShortcutMirror" | "windowRef">): boolean {
  return Boolean(row.isShortcutMirror && row.windowRef) || row.id.startsWith("temp-");
}

/**
 * Whether `parent` can take `drags` INSIDE it — the same rules the move route
 * enforces:
 *  - a folder takes anything;
 *  - a folder-shortcut, or a folder seen inside one, forwards to the real
 *    folder (FileTree rewrites the destination before anything is sent);
 *  - any other projection, pending or virtual row (mirror, window row,
 *    `temp-`, people mount) takes nothing — its id names no content;
 *  - a shortcut that isn't a live folder pointer takes nothing;
 *  - a shortcut may be stored under any content;
 *  - a note takes referenced content (attachments);
 *  - a database takes its own promoted rows back, and other databases.
 */
export function acceptsDropInto(parent: DropRuleRow, drags: readonly DropRuleRow[]): boolean {
  if (drags.length === 0 || drags.some(isUndraggableRow)) return false;
  if (resolveDropForwardTarget(parent as TreeNode)) return true;
  if (parent.treeNodeKind && parent.treeNodeKind !== "content") return false;
  if (parent.isShortcutMirror || !isUuid(parent.id)) return false;
  if (parent.contentType === "shortcut") return false;
  if (parent.contentType === "folder") return true;
  if (drags.every((drag) => drag.contentType === "shortcut")) return true;
  if (parent.contentType === "note") {
    return drags.every((drag) => drag.role === "referenced");
  }
  if (parent.contentType === "data") {
    return drags.every(
      (drag) => drag.promotedFromTableId === parent.id || drag.contentType === "data",
    );
  }
  return false;
}

/**
 * react-arborist's `disableDrop` question: refuse this drop? (`true` = no
 * line, no highlight, nothing sent.)
 *
 * - `target`: the row the drop goes inside, null for the top level.
 * - `holder`: that row's own parent, null for the top level.
 * - `insideRow`: react-arborist reported the drop as "inside the row" (the
 *   pointer is over the middle of it) rather than between rows.
 * - `holderWithinDrags`: the holder is one of the dragged rows or under one.
 *
 * A row that can't take the drag inside it still allows a drop over its
 * middle when the row's own list can take it: FileTree places that drop
 * BESIDE the row. A drop BETWEEN rows of a list that can't take it is refused.
 */
export function dropRefused(args: {
  target: DropRuleRow | null;
  holder: DropRuleRow | null;
  drags: readonly DropRuleRow[];
  insideRow: boolean;
  holderWithinDrags: boolean;
}): boolean {
  const { target, holder, drags, insideRow, holderWithinDrags } = args;
  if (drags.length === 0 || drags.some(isUndraggableRow)) return true;
  if (!target) return false;
  if (acceptsDropInto(target, drags)) return false;
  if (!insideRow) return true;
  if (!holder) return false;
  if (holderWithinDrags) return true;
  return !acceptsDropInto(holder, drags);
}

/** Which half of a row the pointer is over during a drag. */
export type DropEdge = "above" | "below";

/** The edge for a pointer at `clientY` over a row spanning `top`..`top+height`. */
export function dropEdgeAt(clientY: number, top: number, height: number): DropEdge {
  return clientY < top + height / 2 ? "above" : "below";
}

/**
 * Where a drop released over the middle of a row that can't take it lands:
 * among that row's own siblings, at the row's position (`above`) or just
 * after it (`below`). The index is in the same space react-arborist uses —
 * the rendered children of the row's parent.
 */
export function besideRowIndex(rowIndex: number, edge: DropEdge): number {
  return edge === "above" ? rowIndex : rowIndex + 1;
}
