import type { ExtensionManifest } from "@/lib/extensions/types";

export const BROWSER_BOOKMARKS_EXTENSION_ID = "browser-bookmarks";
export const BROWSER_BOOKMARKS_SETTINGS_PATH =
  "/settings/extensions/browser-bookmarks";

export const browserBookmarksExtensionManifest: ExtensionManifest = {
  id: BROWSER_BOOKMARKS_EXTENSION_ID,
  label: "Browser Extension",
  description:
    "Capture pages, co-browse with AI, and sync your Chromium browser activity as external links to your content folders.",
  iconName: "Bookmark",
  enabledByDefault: true,
  navItems: [],
  surfaces: [],
  settings: {
    path: BROWSER_BOOKMARKS_SETTINGS_PATH,
    label: "Browser Extension and Cobrowse",
    title: "Browser Extension and Cobrowse",
    description: "Manage trusted browsers, sync connections, co-browsing, and page-capture preferences.",
    order: 72,
  },
};
