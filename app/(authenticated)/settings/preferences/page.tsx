import { redirect } from "next/navigation";

/**
 * Legacy route — Preferences was dissolved into Appearance
 * (/settings/appearance) and Editor & Files (/settings/files).
 */
export default function LegacyPreferencesRoute() {
  redirect("/settings/appearance");
}
