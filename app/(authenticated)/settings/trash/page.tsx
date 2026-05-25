/**
 * Trash Settings Route Page
 *
 * Lists soft-deleted chats + documents with restore / delete-now, backed by
 * the 30-day auto-purge cron.
 */

import { TrashSettings } from "@/components/settings/TrashSettings";

export default function TrashSettingsRoute() {
  return <TrashSettings />;
}
