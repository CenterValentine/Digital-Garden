"use client";

/**
 * Spring-loaded rows for the file tree: DOM drag events in, opens and closes
 * out. The rules live in lib/features/content/spring-open.ts.
 *
 * Listens on the document in the capture phase, so it sees every drag — tree
 * rows, drags from other surfaces, files from the OS — and where the pointer
 * goes outside the tree. It never prevents or stops an event.
 *
 * Which rows open is read from the rows themselves: FileNode marks a row that
 * opens with `aria-expanded` (collapsed = "false"), so the rule for "has
 * something inside" — children, or a shortcut that projects a folder — stays
 * in one place.
 */
import { useEffect, type RefObject } from "react";
import type { NodeApi, TreeApi } from "react-arborist";
import type { TreeNode } from "@/lib/domain/content/types";
import {
  SPRING_IDLE,
  SPRING_OPEN_DELAY_MS,
  inMiddleBand,
  springStep,
  type RowPlace,
  type SpringEvent,
  type SpringState,
} from "@/lib/features/content/spring-open";

/**
 * The row under a drag event's target. Hit-tested on react-arborist's row
 * box (`role="treeitem"`), which tiles the list with no gaps — FileNode's own
 * element is shorter than the row, and the strip between them used to read
 * as "not over any row", which closed everything the drag had opened the
 * moment the pointer moved onto the next row (owner report, 2026-10-06).
 */
function rowUnder(
  container: HTMLElement,
  target: EventTarget | null,
): { inTree: boolean; row: HTMLElement | null; box: Element | null } {
  if (!(target instanceof Element) || !container.contains(target)) {
    return { inTree: false, row: null, box: null };
  }
  const box = target.closest('[role="treeitem"]');
  const row = (box?.querySelector("[data-tree-node-id]") ??
    target.closest("[data-tree-node-id]")) as HTMLElement | null;
  return { inTree: true, row, box: box ?? row };
}

export function useSpringOpen(
  treeRef: RefObject<TreeApi<TreeNode> | null>,
  containerRef: RefObject<HTMLElement | null>,
  setExpanded: (id: string, expanded: boolean) => void,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let state: SpringState = SPRING_IDLE;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Inside a row's displayed bounds (that row, or shown inside it), else
    // above or below them by position in the list. A row not on screen is
    // left alone ("below") — it closes when the drag leaves or ends.
    const placeOf = (rowId: string, openedId: string): RowPlace => {
      const tree = treeRef.current;
      const row = tree?.get(rowId) ?? null;
      const opened = tree?.get(openedId) ?? null;
      if (!row || !opened) return "below";
      for (let node: NodeApi<TreeNode> | null = row; node; node = node.parent) {
        if (node.id === openedId) return "inside";
      }
      return (row.rowIndex ?? 0) < (opened.rowIndex ?? 0) ? "above" : "below";
    };

    // Like a chevron click: react-arborist's open state AND the persisted
    // expansion (which builds a shortcut's contents) — the explicit set comes
    // last, so it wins over onToggle's read of expandedIds.
    const closeRows = (ids: string[]) => {
      for (const id of ids) {
        treeRef.current?.get(id)?.close();
        setExpanded(id, false);
      }
    };

    const run = (event: SpringEvent) => {
      const next = springStep(state, event, placeOf);
      state = next.state;
      const { close, closeAfterDrop, open, wait } = next.effects;
      const tree = treeRef.current;
      closeRows(close);
      // After the drop is handled — react-arborist reads the drop target
      // from the rows as they were.
      if (closeAfterDrop.length > 0) setTimeout(() => closeRows(closeAfterDrop), 0);
      if (open) {
        const node = tree?.get(open);
        if (node && !node.isOpen) {
          node.open();
          setExpanded(open, true);
        }
      }
      if (wait !== undefined) {
        if (timer) clearTimeout(timer);
        timer = wait
          ? setTimeout(() => {
              timer = null;
              run({ kind: "elapsed", rowId: wait });
            }, SPRING_OPEN_DELAY_MS)
          : null;
      }
    };

    const onOver = (event: DragEvent) => {
      const { inTree, row, box } = rowUnder(container, event.target);
      const rowId = row?.dataset.treeNodeId ?? null;
      let opensHere = false;
      if (row && box && rowId && row.getAttribute("aria-expanded") === "false") {
        const dragged = treeRef.current?.dragNodes.some((node) => node.id === rowId) ?? false;
        // The band is measured on react-arborist's row box — what its drop
        // zones are computed from.
        const rect = box.getBoundingClientRect();
        opensHere = !dragged && inMiddleBand(event.clientY, rect.top, rect.height);
      }
      run({ kind: "over", inTree, rowId, opensHere });
    };
    // Off the edge of the window: no more dragover arrives, so treat it as
    // leaving the tree.
    const onLeave = (event: DragEvent) => {
      const offWindow =
        event.clientX <= 0 ||
        event.clientY <= 0 ||
        event.clientX >= window.innerWidth ||
        event.clientY >= window.innerHeight;
      if (offWindow) run({ kind: "over", inTree: false, rowId: null, opensHere: false });
    };
    const onDrop = (event: DragEvent) => {
      const { inTree, row } = rowUnder(container, event.target);
      run({ kind: "drop", inTree, rowId: row?.dataset.treeNodeId ?? null });
    };
    const onEnd = () => run({ kind: "end" });

    document.addEventListener("dragover", onOver, true);
    document.addEventListener("dragleave", onLeave, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("dragend", onEnd, true);
    return () => {
      document.removeEventListener("dragover", onOver, true);
      document.removeEventListener("dragleave", onLeave, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("dragend", onEnd, true);
      if (timer) clearTimeout(timer);
    };
  }, [treeRef, containerRef, setExpanded]);
}
