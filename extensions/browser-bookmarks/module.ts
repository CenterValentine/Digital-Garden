import { browserBookmarksExtensionRuntime } from "./client";
import { browserBookmarksExtensionManifest } from "./manifest";
import type { BuiltInExtension } from "@/lib/extensions/types";

export const browserBookmarksBuiltInExtension: BuiltInExtension = {
  manifest: browserBookmarksExtensionManifest,
  runtime: browserBookmarksExtensionRuntime,
};
