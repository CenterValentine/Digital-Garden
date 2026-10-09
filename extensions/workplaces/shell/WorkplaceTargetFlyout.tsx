"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Layers, Loader2 } from "lucide-react";
import { PickRow } from "@/components/content/pickers/ContentTreePicker";
import type { FlatRow } from "@/lib/domain/content/picker-tree";
import type { BenchTarget, TabMoveTargetGroup } from "./use-tab-move-targets";

/** Where a tab goes: a top-level workplace, or a workbench under one. */
export type WorkplaceTarget =
  | { kind: "workspace"; workspaceId: string }
  | { kind: "bench"; parentWorkspaceId: string; bench: BenchTarget };

const FLYOUT_WIDTH = 260;
const FLYOUT_MAX_HEIGHT = 380;
const GAP = 4;

function row(id: string, title: string, depth: number, hasChildren: boolean): FlatRow {
  return {
    id,
    title,
    contentType: depth === 0 ? "workspace" : "folder",
    depth,
    hasNote: false,
    pickable: true,
    parentId: null,
    siblingIndex: 0,
    hasChildren,
    isReference: false,
  };
}

/**
 * The tab menu's "Move tab to" / "Duplicate tab to" destination picker: the
 * file picker's design (ContentTreePicker rows — chevron, indent, click to
 * expand, double-click or hold to pick a row that expands), but it lists only
 * workplaces and their workbenches. Opens beside the menu row that asked for
 * it, flipping to the other side at the viewport edge.
 *
 * The workplace the tab is in is not a destination; its workbenches are (the
 * most common move), so that group opens unfolded. Others start folded —
 * the old menu listed every bench of every workplace in one locked block.
 */
export function WorkplaceTargetFlyout({
  anchor,
  label,
  groups,
  activeWorkspaceId,
  onPick,
  onPointerEnter,
}: {
  /** The menu row it belongs to. */
  anchor: HTMLElement;
  label: string;
  groups: TabMoveTargetGroup[];
  activeWorkspaceId: string | null;
  onPick: (target: WorkplaceTarget) => void;
  onPointerEnter?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(groups.filter((group) => group.isCurrent).map((group) => group.workspace.id)),
  );

  // Placed after measuring, straight on the element (layout is the DOM's
  // business, not React state): beside the menu, flipped at the edge.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = anchor.getBoundingClientRect();
    const menu = anchor.closest<HTMLElement>("[data-tab-menu]")?.getBoundingClientRect() ?? rect;
    const height = Math.min(panel.offsetHeight, FLYOUT_MAX_HEIGHT);
    const right = menu.right + GAP;
    const left = right + FLYOUT_WIDTH <= window.innerWidth - 8 ? right : Math.max(8, menu.left - GAP - FLYOUT_WIDTH);
    const top = Math.max(8, Math.min(rect.top - 4, window.innerHeight - height - 8));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.visibility = "visible";
  }, [anchor, groups, expanded]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const visible = useMemo(
    () => groups.filter((group) => !(group.isCurrent && group.benches.length === 0 && !group.isLoadingBenches)),
    [groups],
  );

  return createPortal(
    <div
      ref={panelRef}
      data-tab-menu-flyout=""
      onPointerEnter={onPointerEnter}
      onClick={(event) => event.stopPropagation()}
      className="fixed z-[121] flex flex-col overflow-hidden rounded-md border border-white/10 bg-white/95 text-sm text-gray-900 shadow-lg backdrop-blur-sm dark:bg-gray-900/95 dark:text-gray-100"
      style={{ width: FLYOUT_WIDTH, maxHeight: FLYOUT_MAX_HEIGHT, left: 0, top: 0, visibility: "hidden" }}
    >
      <div className="shrink-0 border-b border-black/10 bg-black/[0.03] px-3 py-1.5 text-[11px] font-semibold text-gray-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300">
        {label}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {visible.length === 0 ? (
          <div className="px-3 py-2 text-xs text-gray-500">Create another workplace first.</div>
        ) : (
          visible.map((group) => {
            const id = group.workspace.id;
            const hasBenches = group.benches.length > 0 || group.isLoadingBenches;
            const isOpen = expanded.has(id);
            return (
              <div key={id}>
                <PickRow
                  row={row(id, group.workspace.name, 0, hasBenches)}
                  icon={<Layers className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
                  showPickDot={false}
                  isExpanded={isOpen}
                  isCurrent={group.isCurrent}
                  disabled={group.isCurrent && !hasBenches}
                  disabledReason={group.isCurrent ? "current" : undefined}
                  commitLabel={label.toLowerCase().startsWith("duplicate") ? "duplicate here" : "move here"}
                  onToggle={toggle}
                  onPick={() => {
                    if (group.isCurrent) return; // the tab is already here
                    onPick({ kind: "workspace", workspaceId: id });
                  }}
                />
                {isOpen
                  ? group.benches.map((bench) => {
                      const here = bench.workbenchId !== null && bench.workbenchId === activeWorkspaceId;
                      return (
                        <PickRow
                          key={`${id}:${bench.folderId}`}
                          row={row(`${id}:${bench.folderId}`, bench.title, 1, false)}
                          showPickDot={false}
                          disabled={here}
                          disabledReason={here ? "current" : undefined}
                          commitLabel={label.toLowerCase().startsWith("duplicate") ? "duplicate here" : "move here"}
                          onPick={() => onPick({ kind: "bench", parentWorkspaceId: id, bench })}
                        />
                      );
                    })
                  : null}
                {isOpen && group.isLoadingBenches && group.benches.length === 0 ? (
                  <div className="flex items-center gap-2 py-1 pl-9 pr-2 text-xs text-gray-500">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    Loading workbenches…
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>,
    document.body,
  );
}
