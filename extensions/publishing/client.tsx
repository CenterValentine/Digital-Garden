"use client";

import { PUBLISHING_EXTENSION_ID } from "./manifest";
import { PublishingViewMode } from "./components/view-mode/PublishingViewMode";
import type { ExtensionRuntime } from "@/lib/extensions/types";

// Further components wired as phases S2–S15 are built:
// import { PublishTab } from "./components/sidebar/PublishTab";
// import { PublishToolbarControls } from "./components/toolbar/PublishToolbarControls";

export const publishingExtensionRuntime: ExtensionRuntime = {
  id: PUBLISHING_EXTENSION_ID,
  leftSidebarPanel: PublishingViewMode,
};
