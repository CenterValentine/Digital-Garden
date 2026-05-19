/**
 * Redirect to the unified AI settings page.
 *
 * Connections now mount as a section inside /settings/ai. This stub
 * keeps deep links (bookmarks, in-app nav, docs) working by 308-ing
 * to the canonical URL.
 */

import { redirect } from "next/navigation";

export default function AIConnectionsRedirect() {
  redirect("/settings/ai");
}
