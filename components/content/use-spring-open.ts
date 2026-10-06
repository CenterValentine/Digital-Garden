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
import type { TreeApi } from "react-arborist";
import type { TreeNode } from "@/lib/domain/content/types";
import {
  SPRING_IDLE,
  SPRING_OPEN_DELAY_MS,
  inMiddleBand,
  springStep,
  type SpringEvent,
  type SpringState,
} from "@/lib/features/content/spring-open";

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

    // Displayed bounds: the row itself or any row shown inside it.
    const within = (rowId: string, ancestorId: string): boolean => {
      for (let node = treeRef.current?.get(rowId) ?? null; node; node = node.parent) {
        if (node.id === ancestorId) return true;
      }
      return false;
    };

    const run = (event: SpringEvent) => {
      const next = springStep(state, event, within);
      state = next.state;
      const { close, open, wait } = next.effects;
      const tree = treeRef.current;
      // Like a chevron click: react-arborist's open state AND the persisted
      // expansion (which builds a shortcut's contents) — the explicit set
      // comes last, so it wins over onToggle's read of expandedIds.
      for (const id of close) {
        tree?.get(id)?.close();
        setExpanded(id, false);
      }
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
      const target = event.target;
      const row =
        target instanceof Element && container.contains(target)
          ? (target.closest("[data-tree-node-id]") as HTMLElement | null)
          : null;
      const rowId = row?.dataset.treeNodeId ?? null;
      let opensHere = false;
      if (row && rowId && row.getAttribute("aria-expanded") === "false") {
        const dragged = treeRef.current?.dragNodes.some((node) => node.id === rowId) ?? false;
        // The band is measured on react-arborist's row box — what its drop
        // zones are computed from.
        const box = (row.closest('[role="treeitem"]') ?? row).getBoundingClientRect();
        opensHere = !dragged && inMiddleBand(event.clientY, box.top, box.height);
      }
      run({ kind: "over", rowId, opensHere });
    };
    // Off the edge of the window: no more dragover arrives, so treat it as
    // leaving the tree.
    const onLeave = (event: DragEvent) => {
      const offWindow =
        event.clientX <= 0 ||
        event.clientY <= 0 ||
        event.clientX >= window.innerWidth ||
        event.clientY >= window.innerHeight;
      if (offWindow) run({ kind: "over", rowId: null, opensHere: false });
    };
    const onDrop = (event: DragEvent) => {
      const target = event.target;
      run({ kind: "drop", inTree: target instanceof Node && container.contains(target) });
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
