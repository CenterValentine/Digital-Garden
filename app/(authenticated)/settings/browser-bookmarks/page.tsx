import { redirect } from "next/navigation";

/** Legacy route — browser bookmarks settings moved to the Extensions group. */
export default function LegacyBrowserBookmarksSettingsRoute() {
  redirect("/settings/extensions/browser-bookmarks");
}
