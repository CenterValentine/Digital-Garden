import type { ExtensionManifest } from "@/lib/extensions/types";

export const STUDIO_EXTENSION_ID = "studio";

/** Right-sidebar tab key for the Studio surface (Tool Surfaces sidebar-tab). */
export const STUDIO_TAB_KEY = "studio";

/** Right-sidebar tab key for the per-node agentic-metadata "Context" doc. */
export const STUDIO_CONTEXT_TAB_KEY = "context";

/**
 * Folder Studio — folders as agentic hubs.
 *
 * Phase 0 ships the scaffold only: no nav items, no surfaces mounted, and
 * `enabledByDefault: false`. Later phases add the sidebar-tab tool definitions
 * and settings entry (Phase 1/2), then flip the default on at the end of
 * Phase 3. See docs/notes-feature/work-tracking/FOLDER-STUDIO-PLAN.md.
 */
export const studioExtensionManifest: ExtensionManifest = {
  id: STUDIO_EXTENSION_ID,
  label: "Folder Studio",
  description:
    "Turn folders into agentic hubs: chat grounded in a folder's contents, " +
    "generate reports, flashcards, maps, audio and more, and maintain per-note " +
    "context for the AI.",
  iconName: "Sparkles",
  enabledByDefault: false,
  canDisable: true,
  navItems: [],
  surfaces: [],
};
