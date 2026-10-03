"use client";

import { traceWorkspace } from "@/lib/core/workspace-trace";
import { createElement, useEffect, useRef, useState, type ReactNode } from "react";
import {
  PANE_HOTKEY_GRID,
  clearHeldPaneHotkey,
  ensurePaneHotkeyTracker,
  heldPaneHotkeyCell,
  placementForHotkeyCell,
  type PaneHotkeyCell,
} from "@/lib/features/content/pane-hotkeys";
import { KeyGlyph } from "@/components/content/context-menu/PaneKeyGrid";
import { Allotment } from "allotment";
import { usePathname } from "next/navigation";
import {
  BOTTOM_LEFT_PANE_ID,
  BOTTOM_RIGHT_PANE_ID,
  TOP_LEFT_PANE_ID,
  TOP_RIGHT_PANE_ID,
  getVisiblePaneIds,
  useContentStore,
  markLocalOpenIntents,
  type WorkspaceLayoutMode,
  type WorkspacePaneId,
} from "@/state/content-store";
import { useMobileUiStore } from "@/state/mobile-ui-store";
import { useProjectedLayout } from "@/components/common/useProjectedLayout";
import { MainPanelNavigation } from "./MainPanelNavigation";
import { PanelOverlayCornerTargets } from "./PanelOverlayCornerTargets";
import { MainPanelHeader } from "./headers/MainPanelHeader";
import { MainPanelContent } from "./content/MainPanelContent";
import { useExtensionShellControllers } from "@/lib/extensions/client-registry";
import type { ContentDetailResponse } from "@/lib/domain/content/api-types";

// Initial content from server-side cache hit (page-level SSR). When the URL
// names a content id that the server already had in its cache, the page
// pre-fetches and inlines the response so the client mounts with content
// in props — skipping the post-hydration round trip on warm reloads.
type InitialContent = ContentDetailResponse | null;

interface TabDropRequest {
  paneId: WorkspacePaneId;
  beforeTabId?: string | null;
  placementMode?: "layout-aware" | "explicit";
  requestedLayoutMode?: WorkspaceLayoutMode;
  complementPaneId?: WorkspacePaneId | null;
}

function WorkspacePane({
  paneId,
  draggedTabId,
  onTabDragStart,
  onTabDragEnd,
  onTabDrop,
  initialContent,
}: {
  paneId: WorkspacePaneId;
  draggedTabId: string | null;
  onTabDragStart: (tabId: string, paneId: WorkspacePaneId) => void;
  onTabDragEnd: () => void;
  onTabDrop: (request: TabDropRequest) => void;
  initialContent: InitialContent;
}) {
  // Render from the PROJECTED layout (intent stays in the store untouched —
  // layout-intent spec: projections are rendering, never state).
  const intentLayoutMode = useContentStore((state) => state.layoutMode);
  const layoutMode = useProjectedLayout(intentLayoutMode);
  const activePaneId = useContentStore((state) => state.activePaneId);
  const focusPane = useContentStore((state) => state.focusPane);
  // Hide the per-pane tab strip in the mobile focus toggle (the grab handle
  // brings it back). Route focus already runs single-tab, so this mainly
  // affects the in-place toggle.
  const mobileFocus = useMobileUiStore((state) => state.focusMode);
  const pathname = usePathname();
  // Chrome suppression applies to the single-content overlay embed only.
  // The side-panel embed (/embed/panel) is a full mini-DG shell and needs
  // the tab strip + workspace navigation (BROWSER-REACH B1).
  const isEmbedMode = pathname?.startsWith("/embed/content") ?? false;
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
      {!isEmbedMode && !mobileFocus && (
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
      )}
      {isDropTarget && (
        <div className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_0_1px_rgba(201,168,108,0.18)]" />
      )}
      <MainPanelContent paneId={paneId} initialContent={initialContent} />
    </div>
  );
}

/**
 * Where a dragged tab can go, drawn as the direction-key map — the same 3×3
 * the context menu's Open In Pane shows and the held-key open uses, so one
 * picture answers "where can this go" everywhere. Each cell is a drop zone:
 * dropping takes the layout the key MEANS (a corner → a quad corner, A/D → a
 * side-by-side split, W/X → a stacked split, S → one pane), exactly as the
 * old reshape targets did with their six boxes. Replaces those: they offered
 * different boxes per layout and none in a quad.
 *
 * Keys during a drag: a native drag swallows keyboard events for its whole
 * duration (the browser owns the pointer and the keyboard until drop), so a
 * letter pressed MID-drag is invisible to the page. A letter held BEFORE the
 * tab is picked up is not — the parent reads it at dragstart and applies it
 * at dragend — and the map says so in its footer.
 */
function WorkspaceReshapeTargets({
  draggedTabId,
  sourcePaneId,
  hoveredTargetId,
  heldLetter,
  onTargetHover,
  onTargetDrop,
}: {
  draggedTabId: string | null;
  sourcePaneId: WorkspacePaneId | null;
  hoveredTargetId: string | null;
  /** The letter held when the drag began, if any — shown as the armed cell. */
  heldLetter: string | null;
  onTargetHover: (targetId: string | null) => void;
  onTargetDrop: (request: TabDropRequest) => void;
}) {
  if (!draggedTabId) return null;

  // Sit at the top of the pane the tab came from, out from under the cursor.
  const fromRight =
    sourcePaneId === TOP_RIGHT_PANE_ID || sourcePaneId === BOTTOM_RIGHT_PANE_ID;
  const fromBottom =
    sourcePaneId === BOTTOM_LEFT_PANE_ID || sourcePaneId === BOTTOM_RIGHT_PANE_ID;
  const overlayClass = `${fromRight ? "left-[calc(50%+12px)]" : "left-4"} ${
    fromBottom ? "top-[calc(50%+44px)]" : "top-[56px]"
  }`;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div
        className={`pointer-events-auto absolute w-[232px] rounded-[20px] border border-white/30 dark:border-white/15 bg-white/80 dark:bg-black/60 p-2 shadow-[0_12px_34px_rgba(15,23,42,0.12)] backdrop-blur-md ${overlayClass}`}
        onDragLeave={(event) => {
          // Leaving the card (not moving between its cells) clears the hover.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            onTargetHover(null);
          }
        }}
      >
        <div className="mb-1.5 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-gold-primary/75">
          Drop to place
        </div>
        <div className="grid grid-cols-3 gap-1">
          {PANE_HOTKEY_GRID.flat().map((cellDef) => {
            const placement = placementForHotkeyCell(cellDef);
            const hovered = hoveredTargetId === cellDef.code;
            const armed = heldLetter === cellDef.letter;
            return (
              <div
                key={cellDef.code}
                title={`${cellDef.letter} — ${cellDef.description}`}
                className={`flex min-h-[58px] flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed px-1 py-1 transition-colors ${
                  hovered || armed
                    ? "border-gold-primary/55 bg-gold-primary/[0.09] text-gold-primary shadow-[inset_0_0_0_1px_rgba(201,168,108,0.18)]"
                    : "border-gold-primary/24 bg-gold-primary/[0.025] text-gold-primary/75"
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  onTargetHover(cellDef.code);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onTargetDrop({
                    paneId: placement.paneId,
                    placementMode: "explicit",
                    requestedLayoutMode: placement.requestedLayoutMode,
                    complementPaneId: placement.complementPaneId,
                  });
                }}
              >
                <span className="text-[12px] font-semibold leading-none">{cellDef.letter}</span>
                <KeyGlyph glyph={cellDef.glyph} />
                <span className="text-[9px] uppercase tracking-[0.12em] opacity-80">
                  {cellDef.caption}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 text-center text-[9px] leading-tight text-gold-primary/60">
          {heldLetter
            ? `Holding ${heldLetter} — release anywhere to place`
            : "Or hold a letter before you pick a tab up"}
        </div>
      </div>
    </div>
  );
}

export function MainPanelWorkspace({
  initialContent = null,
}: { initialContent?: InitialContent } = {}) {
  const pathname = usePathname();
  // Render from the PROJECTED layout; the store keeps intent (spec §8-P3).
  // Intent writes (layout picker, tab-drop requestedLayoutMode) still go
  // through the store — projection only shapes what THIS surface draws.
  const intentLayoutMode = useContentStore((state) => state.layoutMode);
  const layoutMode = useProjectedLayout(intentLayoutMode);
  const activePaneId = useContentStore((state) => state.activePaneId);
  const openContentIds = useContentStore((state) => state.openContentIds);
  const moveContentTabToPane = useContentStore((state) => state.moveContentTabToPane);
  const restoreWorkspace = useContentStore((state) => state.restoreWorkspace);
  const setSelectedContentId = useContentStore((state) => state.setSelectedContentId);
  const shellControllers = useExtensionShellControllers();
  // Route focus (/content/focus/) OR the in-place mobile focus toggle both hide
  // the workspace bar + shell controllers below.
  const mobileFocus = useMobileUiStore((state) => state.focusMode);
  const isFocusMode = (pathname?.includes("/content/focus/") ?? false) || mobileFocus;
  // Chrome suppression applies to the single-content overlay embed only.
  // The side-panel embed (/embed/panel) is a full mini-DG shell and needs
  // the tab strip + workspace navigation (BROWSER-REACH B1).
  const isEmbedMode = pathname?.startsWith("/embed/content") ?? false;
  const isPanelEmbedSurfacePath = pathname?.startsWith("/embed/panel") ?? false;
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [draggedFromPaneId, setDraggedFromPaneId] = useState<WorkspacePaneId | null>(null);
  const [hoveredSinglePaneTargetId, setHoveredSinglePaneTargetId] = useState<string | null>(null);
  // The direction key held when the tab was picked up. Read at dragstart —
  // the only moment the page can see the keyboard around a native drag — and
  // applied at dragend if the tab was dropped nowhere in particular.
  const [heldCellAtDragStart, setHeldCellAtDragStart] = useState<PaneHotkeyCell | null>(null);
  const dropHandledRef = useRef(false);

  useEffect(() => {
    ensurePaneHotkeyTracker();
  }, []);

  const handleTabDragStart = (tabId: string, paneId: WorkspacePaneId) => {
    setDraggedTabId(tabId);
    setDraggedFromPaneId(paneId);
    setHoveredSinglePaneTargetId(null);
    setHeldCellAtDragStart(heldPaneHotkeyCell());
    dropHandledRef.current = false;
  };

  const resetDragState = () => {
    setDraggedTabId(null);
    setDraggedFromPaneId(null);
    setHoveredSinglePaneTargetId(null);
    setHeldCellAtDragStart(null);
  };

  const handleTabDrop = ({
    paneId,
    beforeTabId,
    placementMode = "layout-aware",
    requestedLayoutMode,
    complementPaneId,
  }: TabDropRequest) => {
    if (!draggedTabId) return;
    dropHandledRef.current = true;
    moveContentTabToPane(draggedTabId, paneId, {
      beforeTabId,
      placementMode,
      requestedLayoutMode,
      complementPaneId,
    });
    resetDragState();
  };

  // dragend fires after any drop. If no target took the tab and a letter was
  // held when it was picked up, the letter places it — the same request the
  // matching cell of the drop map would have made.
  const handleTabDragEnd = () => {
    if (draggedTabId && !dropHandledRef.current && heldCellAtDragStart) {
      const placement = placementForHotkeyCell(heldCellAtDragStart);
      moveContentTabToPane(draggedTabId, placement.paneId, {
        placementMode: "explicit",
        requestedLayoutMode: placement.requestedLayoutMode,
        complementPaneId: placement.complementPaneId,
      });
    }
    // The keyup for a letter released mid-drag never reached the page.
    clearHeldPaneHotkey();
    resetDragState();
  };

  useEffect(() => {
    if (openContentIds.length > 0) return;

    const urlParams = new URLSearchParams(window.location.search);
    const workspaceIdFromUrl = urlParams.get("workspace");
    // Defensively drop `temp-*` ids from any restore source: they're
    // optimistic placeholders for unsaved content and can't be loaded on a
    // fresh page (no real ContentNode → "failed to load content"). The write
    // side no longer persists them, but old URLs/links may still carry one.
    const isRealId = (value: string): boolean =>
      Boolean(value) && !value.startsWith("temp-");
    const parseTabParam = (name: string): string[] | undefined =>
      urlParams
        .get(name)
        ?.split(",")
        .map((value) => value.trim())
        .filter(isRealId);
    const rawContentId = urlParams.get("content");
    const contentIdFromUrl =
      rawContentId && isRealId(rawContentId) ? rawContentId : null;
    const layoutModeFromUrl = urlParams.get("layout");
    const activePaneIdFromUrl = urlParams.get("pane");
    const paneTabContentIds = {
      [TOP_LEFT_PANE_ID]: parseTabParam("tabs_top_left"),
      [TOP_RIGHT_PANE_ID]: parseTabParam("tabs_top_right"),
      [BOTTOM_LEFT_PANE_ID]: parseTabParam("tabs_bottom_left"),
      [BOTTOM_RIGHT_PANE_ID]: parseTabParam("tabs_bottom_right"),
    };
    const tabsFromUrl = parseTabParam("tabs");
    const secondaryTabsFromUrl = parseTabParam("tabs_secondary");
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
      // Deep-linked tabs are a LOCAL open that hasn't been published yet. Mark
      // the intent so a background reconcile arriving before the debounced
      // write can't erase them (see markLocalOpenIntents).
      traceWorkspace("url:restore", {
        contentIdFromUrl,
        tabsFromUrl,
        secondaryTabsFromUrl,
        paneTabContentIds: hasPaneTabs ? paneTabContentIds : null,
        href: window.location.href,
      });
      markLocalOpenIntents([
        contentIdFromUrl,
        ...Object.values(paneTabContentIds).flatMap((ids) => ids ?? []),
        ...(tabsFromUrl ?? []),
        ...(secondaryTabsFromUrl ?? []),
      ]);

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
                onTabDragEnd={handleTabDragEnd}
                onTabDrop={handleTabDrop}
                initialContent={initialContent}
              />
            </Allotment.Pane>
            <Allotment.Pane minSize={220}>
              <WorkspacePane
                paneId={BOTTOM_LEFT_PANE_ID}
                draggedTabId={draggedTabId}
                onTabDragStart={handleTabDragStart}
                onTabDragEnd={handleTabDragEnd}
                onTabDrop={handleTabDrop}
                initialContent={initialContent}
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
                onTabDragEnd={handleTabDragEnd}
                onTabDrop={handleTabDrop}
                initialContent={initialContent}
              />
            </Allotment.Pane>
            <Allotment.Pane minSize={220}>
              <WorkspacePane
                paneId={BOTTOM_RIGHT_PANE_ID}
                draggedTabId={draggedTabId}
                onTabDragStart={handleTabDragStart}
                onTabDragEnd={handleTabDragEnd}
                onTabDrop={handleTabDrop}
                initialContent={initialContent}
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
            initialContent={initialContent}
          />
        </Allotment.Pane>
        <Allotment.Pane minSize={320}>
          <WorkspacePane
            paneId={TOP_RIGHT_PANE_ID}
            draggedTabId={draggedTabId}
            onTabDragStart={handleTabDragStart}
            onTabDragEnd={resetDragState}
            onTabDrop={handleTabDrop}
            initialContent={initialContent}
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
            initialContent={initialContent}
          />
        </Allotment.Pane>
        <Allotment.Pane minSize={220}>
          <WorkspacePane
            paneId={BOTTOM_LEFT_PANE_ID}
            draggedTabId={draggedTabId}
            onTabDragStart={handleTabDragStart}
            onTabDragEnd={resetDragState}
            onTabDrop={handleTabDrop}
            initialContent={initialContent}
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
        initialContent={initialContent}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* The side-panel embed hides the whole navigation bar (no back/forward,
          no pane layout at panel width); the workspace chooser renders in the
          panel shell above the file tree instead (BROWSER-REACH B1). */}
      {!isFocusMode && !isEmbedMode && !(pathname?.startsWith("/embed/panel") ?? false) ? (
        <MainPanelNavigation paneId={activePaneId} />
      ) : null}
      <div key={layoutMode} className="relative flex-1 min-h-0">
        {paneLayout}
        {/* Side panel: pane-placement previews are meaningless at single-pane
            panel width, so the drag offers page corners instead — the panel
            can't be dragged onto, so it shows a miniature of the page. */}
        {isPanelEmbedSurfacePath ? (
          <PanelOverlayCornerTargets
            draggedTabId={draggedTabId}
            onDrop={resetDragState}
          />
        ) : (
          <WorkspaceReshapeTargets
            draggedTabId={draggedTabId}
            sourcePaneId={draggedFromPaneId}
            hoveredTargetId={hoveredSinglePaneTargetId}
            heldLetter={heldCellAtDragStart?.letter ?? null}
            onTargetHover={setHoveredSinglePaneTargetId}
            onTargetDrop={handleTabDrop}
          />
        )}
      </div>
      {!isFocusMode
        ? shellControllers.map((Controller) =>
            createElement(Controller, {
              key: Controller.displayName ?? Controller.name,
            })
          )
        : null}
    </div>
  );
}
