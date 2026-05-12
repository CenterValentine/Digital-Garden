import type { ExtensionManifest } from "@/lib/extensions/types";

export const BROWSER_BOOKMARKS_EXTENSION_ID = "browser-bookmarks";
export const BROWSER_BOOKMARKS_SETTINGS_PATH = "/settings/browser-bookmarks";

export const browserBookmarksExtensionManifest: ExtensionManifest = {
  id: BROWSER_BOOKMARKS_EXTENSION_ID,
  label: "Browser Bookmarks",
  description:
    "Sync your Chromium browser's activity as external links to your content folders.",
  iconName: "Bookmark",
  enabledByDefault: true,
  navItems: [],
  surfaces: [],
  settings: {
    path: BROWSER_BOOKMARKS_SETTINGS_PATH,
    label: "Browser Bookmarks",
    title: "Browser Bookmarks",
    description: "Manage trusted browsers, sync connections, and bookmark metadata preferences.",
    order: 72,
  },
};
