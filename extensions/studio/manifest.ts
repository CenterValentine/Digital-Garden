import type { ExtensionManifest } from "@/lib/extensions/types";

export const STUDIO_EXTENSION_ID = "studio";

/** Right-sidebar tab key for the Studio surface (Tool Surfaces sidebar-tab). */
export const STUDIO_TAB_KEY = "studio";

/** Right-sidebar tab key for the per-node agentic-metadata "Context" doc. */
export const STUDIO_CONTEXT_TAB_KEY = "context";

/**
 * Folder Studio — folders as agentic hubs.
 *
 * Enabled by default since the end of Phase 3 (grounded folder chat works).
 * Sidebar tabs mount via the Tool Surfaces registry (studio-tab/context-tab)
 * and are filtered out of the right sidebar when this extension is disabled.
 * See docs/notes-feature/work-tracking/FOLDER-STUDIO-PLAN.md.
 */
export const studioExtensionManifest: ExtensionManifest = {
  id: STUDIO_EXTENSION_ID,
  label: "Folder Studio",
  description:
    "Turn folders into agentic hubs: chat grounded in a folder's contents, " +
    "generate reports, flashcards, maps, audio and more, and maintain per-note " +
    "context for the AI.",
  iconName: "Sparkles",
  enabledByDefault: true,
  canDisable: true,
  navItems: [],
  surfaces: [],
};
