"use client";

import { createElement, useEffect, useState, type ReactNode } from "react";
import { Allotment } from "allotment";
import {
  BOTTOM_LEFT_PANE_ID,
  BOTTOM_RIGHT_PANE_ID,
  TOP_LEFT_PANE_ID,
  TOP_RIGHT_PANE_ID,
  getVisiblePaneIds,
  useContentStore,
  type WorkspaceLayoutMode,
  type WorkspacePaneId,
} from "@/state/content-store";
import { MainPanelNavigation } from "./MainPanelNavigation";
import { MainPanelHeader } from "./headers/MainPanelHeader";
import { MainPanelContent } from "./content/MainPanelContent";
import { useExtensionShellControllers } from "@/lib/extensions/client-registry";

interface TabDropRequest {
  paneId: WorkspacePaneId;
  beforeTabId?: string | null;
  placementMode?: "layout-aware" | "explicit";
  requestedLayoutMode?: WorkspaceLayoutMode;
  complementPaneId?: WorkspacePaneId | null;
}

interface DragIndicatorPosition {
  x: number;
  y: number;
  side: "left" | "right";
}

function WorkspacePane({
  paneId,
  draggedTabId,
  onTabDragStart,
  onTabDragEnd,
  onTabDrop,
}: {
  paneId: WorkspacePaneId;
  draggedTabId: string | null;
  onTabDragStart: (tabId: string, paneId: WorkspacePaneId) => void;
  onTabDragEnd: () => void;
  onTabDrop: (request: TabDropRequest) => void;
}) {
  const layoutMode = useContentStore((state) => state.layoutMode);
  const activePaneId = useContentStore((state) => state.activePaneId);
  const focusPane = useContentStore((state) => state.focusPane);
  const isDropTarget = Boolean(draggedTabId) && layoutMode !== "single";

  return (
    <div
      className={`relative flex h-full min-h-0 flex-col overflow-hidden ${
        getVisiblePaneIds(layoutMode).length > 1 && activePaneId === paneId
          ? "bg-black/[0.015] shadow-[inset_0_0_0_1px_rgba(201,168,108,0.25)]"
          : ""
      }`}
      onPointerDownCapture={() => focusPane(paneId)}
      onFocusCapture={() => focusPane(paneId)}
      onDragOver={(event) => {
        if (!draggedTabId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        if (!draggedTabId) return;
        event.preventDefault();
        onTabDrop({
          paneId,
          placementMode: "layout-aware",
        });
      }}
    >
      <MainPanelHeader
        paneId={paneId}
        draggedTabId={draggedTabId}
        onTabDragStart={onTabDragStart}
        onTabDragEnd={onTabDragEnd}
        onTabDrop={(targetPaneId, beforeTabId) =>
          onTabDrop({
            paneId: targetPaneId,
            beforeTabId,
            placementMode: "layout-aware",
          })
        }
      />
      {isDropTarget && (
        <div className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_0_1px_rgba(201,168,108,0.18)]" />
      )}
      <MainPanelContent paneId={paneId} />
    </div>
  );
}

function WorkspaceReshapeTargets({
  layoutMode,
  draggedTabId,
  sourcePaneId,
  hoveredTargetId,
  dragIndicatorPosition,
  onDragPreviewMove,
  onTargetHover,
  onTargetDrop,
}: {
  layoutMode: WorkspaceLayoutMode;
  draggedTabId: string | null;
  sourcePaneId: WorkspacePaneId | null;
  hoveredTargetId: string | null;
  dragIndicatorPosition: DragIndicatorPosition | null;
  onDragPreviewMove: (position: DragIndicatorPosition) => void;
  onTargetHover: (targetId: string | null) => void;
  onTargetDrop: (request: TabDropRequest) => void;
}) {
  if (!draggedTabId) return null;

  const allEdgeTargets: Array<{
    id: string;
    paneId: WorkspacePaneId;
    complementPaneId: WorkspacePaneId;
    requestedLayoutMode: WorkspaceLayoutMode;
    label: string;
    className: string;
  }> = [
    {
      id: "split-left",
      paneId: TOP_LEFT_PANE_ID,
      complementPaneId: TOP_RIGHT_PANE_ID,
      requestedLayoutMode: "dual-vertical",
      label: "V. Split Left",
      className: "left-0 top-0 bottom-0 w-[80px]",
    },
    {
      id: "split-right",
      paneId: TOP_RIGHT_PANE_ID,
      complementPaneId: TOP_LEFT_PANE_ID,
      requestedLayoutMode: "dual-vertical",
      label: "V. Split Right",
      className: "right-0 top-0 bottom-0 w-[80px]",
    },
    {
      id: "split-top",
      paneId: TOP_LEFT_PANE_ID,
      complementPaneId: BOTTOM_LEFT_PANE_ID,
      requestedLayoutMode: "dual-horizontal",
      label: "H. Split Top",
      className: "left-[80px] right-[80px] top-0 h-[72px]",
    },
    {
      id: "split-bottom",
      paneId: BOTTOM_LEFT_PANE_ID,
      complementPaneId: TOP_LEFT_PANE_ID,
      requestedLayoutMode: "dual-horizontal",
      label: "H. Split Bottom",
      className: "bottom-0 left-[80px] right-[80px] h-[72px]",
    },
  ];

  const edgeTargets = allEdgeTargets.filter((target) => {
    if (layoutMode === "single") return true;
    if (layoutMode === "dual-horizontal") {
      return target.requestedLayoutMode === "dual-vertical";
    }
    if (layoutMode === "dual-vertical") {
      return target.requestedLayoutMode === "dual-horizontal";
    }
    return false;
  });

  const quadTargets: Array<{
    id: string;
    paneId: WorkspacePaneId;
    complementPaneId: WorkspacePaneId;
    label: string;
    className: string;
  }> = [
    {
      id: "quad-top-left",
      paneId: TOP_LEFT_PANE_ID,
      complementPaneId: TOP_RIGHT_PANE_ID,
      label: "Top Left",
      className: "left-0 top-0",
    },
    {
      id: "quad-top-right",
      paneId: TOP_RIGHT_PANE_ID,
      complementPaneId: TOP_LEFT_PANE_ID,
      label: "Top Right",
      className: "right-0 top-0",
    },
    {
      id: "quad-bottom-left",
      paneId: BOTTOM_LEFT_PANE_ID,
      complementPaneId: TOP_LEFT_PANE_ID,
      label: "Bottom Left",
      className: "bottom-0 left-0",
    },
    {
      id: "quad-bottom-right",
      paneId: BOTTOM_RIGHT_PANE_ID,
      complementPaneId: TOP_LEFT_PANE_ID,
      label: "Bottom Right",
      className: "bottom-0 right-0",
    },
  ];

  const compactOverlayClass =
    layoutMode === "dual-horizontal"
      ? sourcePaneId === BOTTOM_LEFT_PANE_ID
        ? "left-4 top-[calc(50%+44px)] w-[260px]"
        : "left-4 top-[56px] w-[260px]"
      : layoutMode === "dual-vertical"
        ? sourcePaneId === TOP_RIGHT_PANE_ID
          ? "left-[calc(50%+12px)] top-[56px] w-[260px]"
          : "left-4 top-[56px] w-[260px]"
        : null;

  const dragIndicator = dragIndicatorPosition ? (
    layoutMode === "single" ? (
      <div
        className="pointer-events-none fixed z-40 rounded-full border border-gold-primary/18 bg-white/88 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-gold-primary/75 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm"
        style={{
          left: dragIndicatorPosition.x,
          top: dragIndicatorPosition.y,
          transform:
            dragIndicatorPosition.side === "left"
              ? "translate(calc(-100% - 14px), calc(-100% - 12px))"
              : "translate(14px, calc(-100% - 12px))",
        }}
      >
        Drag To Reshape Workspace
      </div>
    ) : null
  ) : null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30"
      onDragOverCapture={(event) => {
        const rootTop = event.currentTarget.getBoundingClientRect().top;
        const selectionZonesTop =
          layoutMode === "single"
            ? rootTop + 52
            : layoutMode === "dual-horizontal" && sourcePaneId === BOTTOM_LEFT_PANE_ID
              ? rootTop + window.innerHeight * 0.5
              : rootTop + 52;

        if (event.clientY < selectionZonesTop) {
          onTargetHover(null);
          return;
        }

        onDragPreviewMove({
          x: event.clientX,
          y: event.clientY,
          side: event.clientX > window.innerWidth * 0.6 ? "left" : "right",
        });
      }}
    >
      {dragIndicator}

      {layoutMode === "single" ? (
        <div className="absolute inset-x-3 bottom-3 top-[52px]">
          {edgeTargets.map((target) => (
            <div
              key={target.id}
              className={`pointer-events-auto absolute overflow-hidden rounded-2xl border border-dashed transition-colors ${
                hoveredTargetId === target.id
                  ? "border-gold-primary/55 bg-gold-primary/[0.09] shadow-[inset_0_0_0_1px_rgba(201,168,108,0.18)]"
                  : "border-gold-primary/26 bg-gold-primary/[0.025]"
              } ${target.className}`}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                onTargetHover(target.id);
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onTargetDrop({
                  paneId: target.paneId,
                  placementMode: "explicit",
                  requestedLayoutMode: target.requestedLayoutMode,
                  complementPaneId: target.complementPaneId,
                });
              }}
            >
              <div className="absolute left-2.5 top-2.5 rounded-full border border-gold-primary/14 bg-white/55 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-gold-primary/70 backdrop-blur-sm">
                {target.label}
              </div>
            </div>
          ))}

          <div className="pointer-events-none absolute bottom-[76px] left-[84px] right-[84px] top-[76px]">
            <div className="absolute inset-0 rounded-[26px] border border-dashed border-gold-primary/24 bg-gold-primary/[0.018]" />
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 border-l border-dashed border-gold-primary/26" />
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-gold-primary/26" />

            {quadTargets.map((target) => (
              <div
                key={target.id}
                className={`pointer-events-auto absolute flex h-1/2 w-1/2 items-start justify-start rounded-[22px] border border-dashed p-4 transition-colors ${
                  hoveredTargetId === target.id
                    ? "border-gold-primary/55 bg-gold-primary/[0.09] shadow-[inset_0_0_0_1px_rgba(201,168,108,0.18)]"
                    : "border-transparent bg-transparent"
                } ${target.className}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  onTargetHover(target.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onTargetDrop({
                    paneId: target.paneId,
                    placementMode: "explicit",
                    requestedLayoutMode: "quad",
                    complementPaneId: target.complementPaneId,
                  });
                }}
              >
                <div className="rounded-full border border-gold-primary/16 bg-white/55 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-gold-primary/70 backdrop-blur-sm">
                  {target.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : compactOverlayClass ? (
        <div
          className={`pointer-events-none absolute rounded-[24px] border border-white/30 bg-white/72 p-3 shadow-[0_12px_34px_rgba(15,23,42,0.12)] backdrop-blur-md ${compactOverlayClass}`}
        >
          <div className="mb-2 rounded-full border border-gold-primary/14 bg-white/55 px-2.5 py-1 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-gold-primary/75">
            Drag To Reshape Workspace
          </div>
          <div className="grid grid-cols-2 gap-2">
            {edgeTargets.map((target) => (
              <div
                key={target.id}
                className={`pointer-events-auto relative min-h-16 overflow-hidden rounded-2xl border border-dashed transition-colors ${
                  hoveredTargetId === target.id
                    ? "border-gold-primary/55 bg-gold-primary/[0.09] shadow-[inset_0_0_0_1px_rgba(201,168,108,0.18)]"
                    : "border-gold-primary/26 bg-gold-primary/[0.025]"
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  onTargetHover(target.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onTargetDrop({
                    paneId: target.paneId,
                    placementMode: "explicit",
                    requestedLayoutMode: target.requestedLayoutMode,
                    complementPaneId: target.complementPaneId,
                  });
                }}
              >
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-gold-primary/75">
                  {target.label}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {quadTargets.map((target) => (
              <div
                key={target.id}
                className={`pointer-events-auto relative min-h-14 overflow-hidden rounded-2xl border border-dashed transition-colors ${
                  hoveredTargetId === target.id
                    ? "border-gold-primary/55 bg-gold-primary/[0.09] shadow-[inset_0_0_0_1px_rgba(201,168,108,0.18)]"
                    : "border-gold-primary/22 bg-gold-primary/[0.02]"
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  onTargetHover(target.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onTargetDrop({
                    paneId: target.paneId,
                    placementMode: "explicit",
                    requestedLayoutMode: "quad",
                    complementPaneId: target.complementPaneId,
                  });
                }}
              >
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-gold-primary/75">
                  {target.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MainPanelWorkspace() {
  const layoutMode = useContentStore((state) => state.layoutMode);
  const activePaneId = useContentStore((state) => state.activePaneId);
  const openContentIds = useContentStore((state) => state.openContentIds);
  const moveContentTabToPane = useContentStore((state) => state.moveContentTabToPane);
  const restoreWorkspace = useContentStore((state) => state.restoreWorkspace);
  const setSelectedContentId = useContentStore((state) => state.setSelectedContentId);
  const shellControllers = useExtensionShellControllers();
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [draggedFromPaneId, setDraggedFromPaneId] = useState<WorkspacePaneId | null>(null);
  const [hoveredSinglePaneTargetId, setHoveredSinglePaneTargetId] = useState<string | null>(null);
  const [dragIndicatorPosition, setDragIndicatorPosition] =
    useState<DragIndicatorPosition | null>(null);

  const handleTabDragStart = (tabId: string, paneId: WorkspacePaneId) => {
    setDraggedTabId(tabId);
    setDraggedFromPaneId(paneId);
    setHoveredSinglePaneTargetId(null);
    setDragIndicatorPosition(null);
  };

  const resetDragState = () => {
    setDraggedTabId(null);
    setDraggedFromPaneId(null);
    setHoveredSinglePaneTargetId(null);
    setDragIndicatorPosition(null);
  };

  const handleTabDrop = ({
    paneId,
    beforeTabId,
    placementMode = "layout-aware",
    requestedLayoutMode,
    complementPaneId,
  }: TabDropRequest) => {
    if (!draggedTabId) return;
    moveContentTabToPane(draggedTabId, paneId, {
      beforeTabId,
      placementMode,
      requestedLayoutMode,
      complementPaneId,
    });
    resetDragState();
  };

  useEffect(() => {
    if (openContentIds.length > 0) return;

    const urlParams = new URLSearchParams(window.location.search);
    const workspaceIdFromUrl = urlParams.get("workspace");
    const contentIdFromUrl = urlParams.get("content");
    const layoutModeFromUrl = urlParams.get("layout");
    const activePaneIdFromUrl = urlParams.get("pane");
    const paneTabContentIds = {
      [TOP_LEFT_PANE_ID]: urlParams
        .get("tabs_top_left")
        ?.split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      [TOP_RIGHT_PANE_ID]: urlParams
        .get("tabs_top_right")
        ?.split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      [BOTTOM_LEFT_PANE_ID]: urlParams
        .get("tabs_bottom_left")
        ?.split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      [BOTTOM_RIGHT_PANE_ID]: urlParams
        .get("tabs_bottom_right")
        ?.split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    };
    const tabsFromUrl = urlParams
      .get("tabs")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const secondaryTabsFromUrl = urlParams
      .get("tabs_secondary")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const splitModeFromUrl = urlParams.get("split");

    const hasPaneTabs = Object.values(paneTabContentIds).some(
      (contentIds) => contentIds && contentIds.length > 0
    );

    if (
      workspaceIdFromUrl &&
      !contentIdFromUrl &&
      !hasPaneTabs &&
      (!tabsFromUrl || tabsFromUrl.length === 0) &&
      (!secondaryTabsFromUrl || secondaryTabsFromUrl.length === 0)
    ) {
      return;
    }

    if (
      contentIdFromUrl ||
      hasPaneTabs ||
      (tabsFromUrl && tabsFromUrl.length > 0) ||
      (secondaryTabsFromUrl && secondaryTabsFromUrl.length > 0)
    ) {
      restoreWorkspace({
        activeContentId: contentIdFromUrl,
        paneTabContentIds: hasPaneTabs ? paneTabContentIds : undefined,
        tabContentIds: tabsFromUrl ?? [],
        secondaryTabContentIds: secondaryTabsFromUrl ?? [],
        activePaneId:
          activePaneIdFromUrl === TOP_RIGHT_PANE_ID ||
          activePaneIdFromUrl === BOTTOM_LEFT_PANE_ID ||
          activePaneIdFromUrl === BOTTOM_RIGHT_PANE_ID
            ? activePaneIdFromUrl
            : TOP_LEFT_PANE_ID,
        layoutMode:
          layoutModeFromUrl === "dual-vertical" ||
          layoutModeFromUrl === "dual-horizontal" ||
          layoutModeFromUrl === "quad"
            ? layoutModeFromUrl
            : splitModeFromUrl === "dual" ||
                (secondaryTabsFromUrl && secondaryTabsFromUrl.length > 0)
              ? "dual-vertical"
              : "single",
      });
      return;
    }

    const lastSelectedId = localStorage.getItem("lastSelectedContentId");
    if (lastSelectedId) {
      setSelectedContentId(lastSelectedId);
    }
  }, [openContentIds.length, restoreWorkspace, setSelectedContentId]);

  let paneLayout: ReactNode;

  if (layoutMode === "quad") {
    paneLayout = (
      <Allotment defaultSizes={[50, 50]}>
        <Allotment.Pane minSize={360}>
          <Allotment vertical defaultSizes={[50, 50]}>
            <Allotment.Pane minSize={220}>
              <WorkspacePane
                paneId={TOP_LEFT_PANE_ID}
                draggedTabId={draggedTabId}
                onTabDragStart={handleTabDragStart}
                onTabDragEnd={resetDragState}
                onTabDrop={handleTabDrop}
              />
            </Allotment.Pane>
            <Allotment.Pane minSize={220}>
              <WorkspacePane
                paneId={BOTTOM_LEFT_PANE_ID}
                draggedTabId={draggedTabId}
                onTabDragStart={handleTabDragStart}
                onTabDragEnd={resetDragState}
                onTabDrop={handleTabDrop}
              />
            </Allotment.Pane>
          </Allotment>
        </Allotment.Pane>
        <Allotment.Pane minSize={360}>
          <Allotment vertical defaultSizes={[50, 50]}>
            <Allotment.Pane minSize={220}>
              <WorkspacePane
                paneId={TOP_RIGHT_PANE_ID}
                draggedTabId={draggedTabId}
                onTabDragStart={handleTabDragStart}
                onTabDragEnd={resetDragState}
                onTabDrop={handleTabDrop}
              />
            </Allotment.Pane>
            <Allotment.Pane minSize={220}>
              <WorkspacePane
                paneId={BOTTOM_RIGHT_PANE_ID}
                draggedTabId={draggedTabId}
                onTabDragStart={handleTabDragStart}
                onTabDragEnd={resetDragState}
                onTabDrop={handleTabDrop}
              />
            </Allotment.Pane>
          </Allotment>
        </Allotment.Pane>
      </Allotment>
    );
  } else if (layoutMode === "dual-vertical") {
    paneLayout = (
      <Allotment defaultSizes={[50, 50]}>
        <Allotment.Pane minSize={320}>
          <WorkspacePane
            paneId={TOP_LEFT_PANE_ID}
            draggedTabId={draggedTabId}
            onTabDragStart={handleTabDragStart}
            onTabDragEnd={resetDragState}
            onTabDrop={handleTabDrop}
          />
        </Allotment.Pane>
        <Allotment.Pane minSize={320}>
          <WorkspacePane
            paneId={TOP_RIGHT_PANE_ID}
            draggedTabId={draggedTabId}
            onTabDragStart={handleTabDragStart}
            onTabDragEnd={resetDragState}
            onTabDrop={handleTabDrop}
          />
        </Allotment.Pane>
      </Allotment>
    );
  } else if (layoutMode === "dual-horizontal") {
    paneLayout = (
      <Allotment vertical defaultSizes={[50, 50]}>
        <Allotment.Pane minSize={220}>
          <WorkspacePane
            paneId={TOP_LEFT_PANE_ID}
            draggedTabId={draggedTabId}
            onTabDragStart={handleTabDragStart}
            onTabDragEnd={resetDragState}
            onTabDrop={handleTabDrop}
          />
        </Allotment.Pane>
        <Allotment.Pane minSize={220}>
          <WorkspacePane
            paneId={BOTTOM_LEFT_PANE_ID}
            draggedTabId={draggedTabId}
            onTabDragStart={handleTabDragStart}
            onTabDragEnd={resetDragState}
            onTabDrop={handleTabDrop}
          />
        </Allotment.Pane>
      </Allotment>
    );
  } else {
    paneLayout = (
      <WorkspacePane
        paneId={TOP_LEFT_PANE_ID}
        draggedTabId={draggedTabId}
        onTabDragStart={handleTabDragStart}
        onTabDragEnd={resetDragState}
        onTabDrop={handleTabDrop}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <MainPanelNavigation paneId={activePaneId} />
      <div key={layoutMode} className="relative flex-1 min-h-0">
        {paneLayout}
        {layoutMode !== "quad" && (
          <WorkspaceReshapeTargets
            layoutMode={layoutMode}
            draggedTabId={draggedTabId}
            sourcePaneId={draggedFromPaneId}
            hoveredTargetId={hoveredSinglePaneTargetId}
            dragIndicatorPosition={dragIndicatorPosition}
            onDragPreviewMove={setDragIndicatorPosition}
            onTargetHover={setHoveredSinglePaneTargetId}
            onTargetDrop={handleTabDrop}
          />
        )}
      </div>
      {shellControllers.map((Controller) =>
        createElement(Controller, {
          key: Controller.displayName ?? Controller.name,
        })
      )}
    </div>
  );
}
