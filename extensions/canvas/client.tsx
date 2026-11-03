"use client";

/**
 * Canvas extension — client runtime (CANVAS-ARCHIVE-PLAN.md §10).
 *
 * One "+" entry (header menu and right-click → New), one global dialog, and
 * the Canvas tab in the right sidebar for anything an import created. A
 * course is plain folders: there is no Canvas content type or viewer.
 */

import type { ExtensionCreateMenuItem, ExtensionRuntime } from "@/lib/extensions/types";
import { CanvasImportDialog } from "./components/CanvasImportDialog";
import { CanvasSidebarController } from "./components/CanvasSidebarController";
import { CanvasSidebarPanel } from "./components/CanvasSidebarPanel";
import { openCanvasImport } from "./lib/api";
import { CANVAS_EXTENSION_ID } from "./manifest";
import CanvasSettingsDialog from "./settings/CanvasSettingsDialog";

/** lucide graduation-cap, as a 24×24 stroke path for the sidebar rail. */
const CANVAS_SIDEBAR_SVG_PATH =
  "M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z M22 10v6 M6 12.5V16a6 3 0 0 0 12 0v-3.5";

const canvasMenu: ExtensionCreateMenuItem[] = [
  {
    id: "new-canvas-course",
    label: "Canvas Course…",
    iconName: "GraduationCap",
    title: "Import a course you've taken in Canvas: modules become folders",
    onSelect: ({ parentId }) => openCanvasImport(parentId),
  },
];

export const canvasExtensionRuntime: ExtensionRuntime = {
  id: CANVAS_EXTENSION_ID,
  createMenuItems: canvasMenu,
  globalDialogs: [CanvasImportDialog],
  shellControllers: [CanvasSidebarController],
  contentSidebarPanel: {
    label: "Canvas",
    svgPath: CANVAS_SIDEBAR_SVG_PATH,
    component: CanvasSidebarPanel,
  },
  settingsDialog: CanvasSettingsDialog,
};
