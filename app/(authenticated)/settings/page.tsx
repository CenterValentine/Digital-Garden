/**
 * Settings Page (Default)
 *
 * Redirects to Appearance as the primary entry point.
 */

import { redirect } from "next/navigation";

export default function SettingsPage() {
  redirect("/settings/appearance");
}
