/**
 * Redirect to the unified AI settings page.
 *
 * Feature Routing now mounts as a section inside /settings/ai.
 */

import { redirect } from "next/navigation";

export default function AIFeatureRoutingRedirect() {
  redirect("/settings/ai");
}
