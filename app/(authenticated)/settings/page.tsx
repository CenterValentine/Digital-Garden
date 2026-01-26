/**
 * Settings Page (Default)
 *
 * Redirects to storage settings as the primary entry point
 */

import { redirect } from "next/navigation";

export default function SettingsPage() {
  redirect("/settings/storage");
}
