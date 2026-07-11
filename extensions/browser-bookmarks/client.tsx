import { BROWSER_BOOKMARKS_EXTENSION_ID } from "./manifest";
import BrowserBookmarksSettingsPage from "./settings/BrowserBookmarksSettingsPage";
import type { ExtensionRuntime } from "@/lib/extensions/types";

export const browserBookmarksExtensionRuntime: ExtensionRuntime = {
  id: BROWSER_BOOKMARKS_EXTENSION_ID,
  settingsDialog: BrowserBookmarksSettingsPage,
};
