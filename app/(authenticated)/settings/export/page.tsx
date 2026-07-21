/**
 * Export & Backup Settings Page
 *
 * Configure export formats, bulk export options, and automated backups
 */

import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { getUserSettings } from "@/lib/features/settings";
import { DEFAULT_EXPORT_BACKUP_SETTINGS } from "@/lib/domain/export";
import type { ExportBackupSettings } from "@/lib/domain/export/types";
import { SettingsPage } from "@/components/settings/ui";
import { ExportSettingsClient } from "./ExportSettingsClient";

export default async function ExportSettingsPage() {
  const session = await requireAuth();
  const settings = await getUserSettings(session.user.id);

  return (
    <SettingsPage
      title="Export & Backup"
      description="Export formats and bulk export for your Digital Garden."
    >
      <ExportSettingsClient
        initialSettings={
          (settings.exportBackup ||
            DEFAULT_EXPORT_BACKUP_SETTINGS) as ExportBackupSettings
        }
        userId={session.user.id}
      />
    </SettingsPage>
  );
}
