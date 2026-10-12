/**
 * The half of a row the pointer was last over during a tree drag.
 *
 * react-arborist reports a drop released over the middle of a row as "inside
 * that row" with no position, so when the row can't take the drop FileTree
 * places it beside the row instead (drop-rules.ts) — and needs to know which
 * side. The row's own `dragover` handler (FileNode) records it here, the same
 * value the row uses to draw its line, so the preview and the result agree.
 */
import type { DropEdge } from "./drop-rules";

let last: { rowId: string; edge: DropEdge } | null = null;

export function noteDropEdge(rowId: string, edge: DropEdge): void {
  if (last?.rowId === rowId && last.edge === edge) return;
  last = { rowId, edge };
}

/** The edge last seen over `rowId`; "below" if the pointer never registered there. */
export function dropEdgeFor(rowId: string): DropEdge {
  return last?.rowId === rowId ? last.edge : "below";
}
