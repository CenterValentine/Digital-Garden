"use client";

import { PUBLISHING_EXTENSION_ID } from "./manifest";
import type { ExtensionRuntime } from "@/lib/extensions/types";

// Shell/sidebar components will be imported here as they are built (S1+)
// import { PublishingViewMode } from "./components/view-mode/PublishingViewMode";
// import { PublishTab } from "./components/sidebar/PublishTab";
// import { PublishToolbarControls } from "./components/toolbar/PublishToolbarControls";

export const publishingExtensionRuntime: ExtensionRuntime = {
  id: PUBLISHING_EXTENSION_ID,
  // Wired up incrementally as each phase (S1–S15) is implemented:
  // leftSidebarPanel: PublishingViewMode,
  // shellControllers: [PublishingShellController],
};
