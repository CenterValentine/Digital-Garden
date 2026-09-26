"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { useDrop } from "react-dnd";
import { FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTabDragStore, type DraggingTab } from "@/state/tab-drag-store";
import {
  useTreeDragStore,
  type DraggingTreeNode,
} from "@/state/tree-drag-store";
import { useWorkspaceStore } from "@/extensions/workplaces/state/workspace-store";
import {
  usePrefetchTabMoveTargets,
  useTabMoveTargets,
  type BenchTarget,
} from "./use-tab-move-targets";

/**
 * Drag a tab — or a file-tree node — onto the workplaces affordance and a
 * drop panel opens: a drop-only version of the selector listing every
 * destination the tab's context menu offers (workplaces, benches beneath,
 * the current workplace's own benches). A dropped TAB moves there; dropped
 * CONTENT opens there as a tab. Either way the user stays where they are.
 * Holding over one destination for HOLD_TO_OPEN_MS arms it: the row says
 * "Opens here", and the drop then also switches to that workplace. Moving
 * to a different row restarts the hold from zero.
 *
 * Kept outside `WorkspaceSelector` on purpose: the real dropdown is a Radix
 * menu built for pointer and keyboard, and HTML5 drags deliver neither —
 * no pointer events, no focus — so its dwell submenus and roving focus
 * cannot follow a drag. This panel speaks only `dragover`/`drop`.
 *
 * Two drag transports meet here. Tab drags are plain HTML5 drags, so hover
 * and drop are native events. Tree drags are react-dnd drags; their native
 * `dragover` still reaches us (hover tracking stays native for both), but
 * the HTML5 backend forces `dropEffect = "none"` over anything that is not
 * a registered react-dnd target, so a native `drop` would never fire — the
 * tree drop goes through `useDrop` instead, resolved against the row the
 * native hover last recorded.
 */

/** Hover this long over one destination before a drop also opens it. */
export const HOLD_TO_OPEN_MS = 2000;
/** Dwell over the trigger before the panel opens — a pass-through drag must not flash it. */
const OPEN_DWELL_MS = 150;
/**
 * `dragover` fires continuously while the pointer is over the trigger or the
 * panel; when it stops for this long the drag has left both. Replaces
 * `dragleave`, which also fires on every child boundary.
 */
const LEAVE_GRACE_MS = 300;
const PANEL_WIDTH = 272;
// react-arborist's react-dnd item type (same constant the overlay corner
// targets and the chat composer accept).
const NODE_DRAG_TYPE = "NODE";

type DragPayload =
  | { kind: "tab"; tab: DraggingTab }
  | { kind: "content"; nodes: DraggingTreeNode[] };

type DropTarget =
  | { key: string; kind: "workspace"; workspaceId: string; name: string }
  | {
      key: string;
      kind: "bench";
      parentWorkspaceId: string;
      bench: BenchTarget;
      name: string;
    };

interface PanelPlacement {
  left: number;
  top: number;
  maxHeight: number;
}

const TARGET_ATTR = "data-move-target";

function targetKeyFromEvent(event: DragEvent<HTMLElement>) {
  const row = (event.target as HTMLElement | null)?.closest?.(
    `[${TARGET_ATTR}]`,
  );
  return row?.getAttribute(TARGET_ATTR) ?? null;
}

function payloadLabel(payload: DragPayload) {
  if (payload.kind === "tab") return `“${payload.tab.title || "Untitled"}”`;
  return payload.nodes.length === 1
    ? `“${payload.nodes[0].title || "Untitled"}”`
    : `${payload.nodes.length} items`;
}

export function WorkspaceDropTarget({ children }: { children: ReactNode }) {
  const draggingTab = useTabDragStore((state) => state.draggingTab);
  const draggingNode = useTreeDragStore((state) => state.draggingNode);
  const draggingNodes = useTreeDragStore((state) => state.draggingNodes);
  const payload = useMemo<DragPayload | null>(() => {
    if (draggingTab) return { kind: "tab", tab: draggingTab };
    if (draggingNode) return { kind: "content", nodes: draggingNodes };
    return null;
  }, [draggingNode, draggingNodes, draggingTab]);

  // Fetch bench folders the moment a drag starts, not when the panel opens:
  // rows arriving under an already-hovering pointer shift the destinations.
  usePrefetchTabMoveTargets(payload !== null);

  const triggerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<PanelPlacement | null>(null);

  // Open after a short dwell over the trigger; close when dragover stops
  // reaching either the trigger or the panel for LEAVE_GRACE_MS. Every way
  // a drag can end (drop, Escape, release elsewhere) stops the dragover
  // stream, so the leave timer is the single close path — no effect needed.
  const openTimerRef = useRef<number | null>(null);
  const leaveTimerRef = useRef<number | null>(null);

  const keepAlive = useCallback(() => {
    if (leaveTimerRef.current !== null) window.clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = window.setTimeout(() => {
      leaveTimerRef.current = null;
      setOpen(false);
    }, LEAVE_GRACE_MS);
  }, []);

  const handleTriggerDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!payload) return;
    // Claim the trigger as a drag area so the cursor does not flash
    // "not allowed" over it; the trigger itself accepts no drop.
    event.preventDefault();
    event.dataTransfer.dropEffect = "none";
    keepAlive();
    if (open || openTimerRef.current !== null) return;
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const top = rect.bottom + 6;
      setPlacement({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8)),
        top,
        maxHeight: Math.max(160, window.innerHeight - top - 12),
      });
      setOpen(true);
    }, OPEN_DWELL_MS);
  };

  useEffect(
    () => () => {
      if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
      if (leaveTimerRef.current !== null) window.clearTimeout(leaveTimerRef.current);
    },
    [],
  );

  return (
    <>
      <div
        ref={triggerRef}
        className="flex items-center"
        onDragEnter={handleTriggerDragOver}
        onDragOver={handleTriggerDragOver}
      >
        {children}
      </div>
      {open && payload && placement && typeof document !== "undefined"
        ? createPortal(
            <DropPanel
              payload={payload}
              placement={placement}
              keepAlive={keepAlive}
              close={() => setOpen(false)}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function DropPanel({
  payload,
  placement,
  keepAlive,
  close,
}: {
  payload: DragPayload;
  placement: PanelPlacement;
  keepAlive: () => void;
  close: () => void;
}) {
  const isTab = payload.kind === "tab";
  // Content can be SENT to where the user already is (it simply opens
  // there); a tab cannot be moved to where it already is.
  const { groups, hasAnyTarget } = useTabMoveTargets(true, {
    excludeActive: isTab,
  });
  const moveTabToWorkspace = useWorkspaceStore(
    (state) => state.moveTabToWorkspace,
  );
  const sendContentToWorkspace = useWorkspaceStore(
    (state) => state.sendContentToWorkspace,
  );
  const ensureWorkbench = useWorkspaceStore((state) => state.ensureWorkbench);
  const setDraggingTab = useTabDragStore((state) => state.setDraggingTab);
  const setDraggingNode = useTreeDragStore((state) => state.setDraggingNode);

  const targets = useMemo(() => {
    const map = new Map<string, DropTarget>();
    for (const group of groups) {
      if (!group.isCurrent || !isTab) {
        const key = `ws:${group.workspace.id}`;
        map.set(key, {
          key,
          kind: "workspace",
          workspaceId: group.workspace.id,
          name: group.workspace.name,
        });
      }
      for (const bench of group.benches) {
        const key = `bench:${group.workspace.id}:${bench.folderId}`;
        map.set(key, {
          key,
          kind: "bench",
          parentWorkspaceId: group.workspace.id,
          bench,
          name: bench.title,
        });
      }
    }
    return map;
  }, [groups, isTab]);

  // The hold: hovering one destination for HOLD_TO_OPEN_MS arms it. The
  // timer is keyed on the hovered row, so moving to another row (or off all
  // rows) cancels it and restarts from zero there. Event-driven, not an
  // effect: dragover is the only clock the drag gives us. Refs mirror the
  // state for the react-dnd drop callback, which must read the latest.
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const hoveredKeyRef = useRef<string | null>(null);
  const armedKeyRef = useRef<string | null>(null);
  const holdTimerRef = useRef<number | null>(null);

  const hover = (key: string | null) => {
    if (hoveredKeyRef.current === key) return;
    hoveredKeyRef.current = key;
    setHoveredKey(key);
    armedKeyRef.current = null;
    setArmedKey(null);
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = key
      ? window.setTimeout(() => {
          holdTimerRef.current = null;
          armedKeyRef.current = key;
          setArmedKey(key);
        }, HOLD_TO_OPEN_MS)
      : null;
  };

  useEffect(
    () => () => {
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    },
    [],
  );

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    keepAlive();
    const key = targetKeyFromEvent(event);
    const valid = key !== null && targets.has(key);
    if (valid) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
    hover(valid ? key : null);
  };

  const performDrop = useCallback(
    (key: string | null) => {
      const target = key ? targets.get(key) : undefined;
      if (!target) return false;
      const openTarget = armedKeyRef.current === key;
      close();
      setDraggingTab(null);
      setDraggingNode(null);

      // Defer the action past this event: a tab move closes the dragged
      // tab, and a source element removed inside the drop handler never
      // receives its `dragend` — leaving the strip's own drag state
      // (reshape overlays) stuck on. One tick later the source has cleaned
      // up. Content sends get the same treatment for symmetry.
      window.setTimeout(() => {
        void (async () => {
          try {
            const workspaceId =
              target.kind === "workspace"
                ? target.workspaceId
                : (target.bench.workbenchId ??
                  (
                    await ensureWorkbench(
                      target.parentWorkspaceId,
                      target.bench.folderId,
                    )
                  ).id);
            if (payload.kind === "tab") {
              await moveTabToWorkspace(
                workspaceId,
                {
                  id: payload.tab.id,
                  contentId: payload.tab.contentId,
                  title: payload.tab.title,
                },
                { openTarget },
              );
            } else {
              await sendContentToWorkspace(workspaceId, payload.nodes, {
                openTarget,
              });
            }
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "Failed to move here",
            );
          }
        })();
      }, 0);
      return true;
    },
    [
      close,
      ensureWorkbench,
      moveTabToWorkspace,
      payload,
      sendContentToWorkspace,
      setDraggingNode,
      setDraggingTab,
      targets,
    ],
  );

  // Native drop: tab drags only. A tree drag's drop arrives through
  // react-dnd below; its native `drop` is the backend's to handle.
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (payload.kind !== "tab") return;
    const key = targetKeyFromEvent(event);
    if (!targets.has(key ?? "")) return;
    event.preventDefault();
    event.stopPropagation();
    performDrop(key);
  };

  const [, dropRef] = useDrop(
    () => ({
      accept: NODE_DRAG_TYPE,
      canDrop: () => hoveredKeyRef.current !== null,
      drop: () => {
        performDrop(hoveredKeyRef.current);
      },
    }),
    [performDrop],
  );

  const rowClass = (key: string) =>
    [
      "relative flex w-full items-center gap-2 overflow-hidden rounded px-2 py-1.5 text-left transition-colors",
      armedKey === key
        ? "bg-emerald-500/15 ring-1 ring-inset ring-emerald-500/60"
        : hoveredKey === key
          ? "bg-black/5 dark:bg-white/10"
          : "",
    ].join(" ");

  // Fills across the row over HOLD_TO_OPEN_MS while it is hovered — the hold
  // made visible — and snaps back to zero the moment the hover moves on.
  const renderHoldBar = (key: string) => {
    const hovered = hoveredKey === key;
    return (
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-emerald-500/70"
        style={{
          width: hovered ? "100%" : "0%",
          transition: hovered ? `width ${HOLD_TO_OPEN_MS}ms linear` : "none",
        }}
      />
    );
  };

  const renderArmedPill = (key: string) =>
    armedKey === key ? (
      <span className="ml-auto shrink-0 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
        Opens here
      </span>
    ) : null;

  return (
    <div
      ref={dropRef as unknown as Ref<HTMLDivElement>}
      role="dialog"
      aria-label={isTab ? "Move tab to a workplace" : "Send to a workplace"}
      className="fixed z-[120] overflow-y-auto rounded-md border border-white/10 bg-white/95 p-1 text-sm text-gray-900 shadow-lg backdrop-blur-sm dark:bg-gray-900/95 dark:text-gray-100"
      style={{
        left: placement.left,
        top: placement.top,
        width: PANEL_WIDTH,
        maxHeight: placement.maxHeight,
      }}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
        <span className="block truncate">
          {isTab ? "Move" : "Send"} {payloadLabel(payload)} to
        </span>
      </div>
      {!hasAnyTarget && isTab ? (
        <div className="px-2 py-1.5 text-xs text-gray-500">
          Create another workplace first.
        </div>
      ) : (
        groups.map((group) => {
          const wsKey = `ws:${group.workspace.id}`;
          const workspaceIsTarget = targets.has(wsKey);
          if (
            !workspaceIsTarget &&
            group.benches.length === 0 &&
            !group.isLoadingBenches
          ) {
            return null;
          }
          return (
            <div key={wsKey}>
              {workspaceIsTarget ? (
                <div {...{ [TARGET_ATTR]: wsKey }} className={rowClass(wsKey)}>
                  <span className="truncate">{group.workspace.name}</span>
                  {group.isCurrent ? (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      current
                    </span>
                  ) : null}
                  {renderArmedPill(wsKey)}
                  {renderHoldBar(wsKey)}
                </div>
              ) : (
                <div className="flex items-center gap-2 px-2 py-1.5 text-gray-400 dark:text-gray-500">
                  <span className="truncate">{group.workspace.name}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide">
                    current
                  </span>
                </div>
              )}
              {group.benches.map((bench) => {
                const key = `bench:${group.workspace.id}:${bench.folderId}`;
                return (
                  <div
                    key={key}
                    {...{ [TARGET_ATTR]: key }}
                    className={`${rowClass(key)} pl-6`}
                  >
                    <FolderOpen
                      className="h-3.5 w-3.5 shrink-0 text-gray-400"
                      aria-hidden="true"
                    />
                    <span className="truncate">{bench.title}</span>
                    {renderArmedPill(key)}
                    {renderHoldBar(key)}
                  </div>
                );
              })}
              {group.isLoadingBenches && group.benches.length === 0 ? (
                <div className="flex items-center gap-2 py-1 pl-6 pr-2 text-xs text-gray-500">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  Loading workbenches…
                </div>
              ) : null}
            </div>
          );
        })
      )}
      <div className="mt-1 border-t border-black/10 px-2 pb-0.5 pt-1.5 text-[10px] text-gray-500 dark:border-white/10">
        {isTab ? "Drop moves · hold opens" : "Drop sends · hold opens"}
      </div>
    </div>
  );
}
