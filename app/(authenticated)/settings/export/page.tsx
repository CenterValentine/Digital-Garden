/**
 * Export & Backup Settings Page
 *
 * Configure export formats, bulk export options, and automated backups
 */

import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { getUserSettings } from "@/lib/features/settings";
import { DEFAULT_EXPORT_BACKUP_SETTINGS } from "@/lib/domain/export";
import { ExportSettingsClient } from "./ExportSettingsClient";

export default async function ExportSettingsPage() {
  const session = await requireAuth();
  const settings = await getUserSettings(session.user.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Export & Backup</h1>
        <p className="text-gray-400 mt-2">
          Configure export formats and bulk export your Digital Garden
        </p>
      </div>

      <ExportSettingsClient
        initialSettings={(settings.exportBackup || DEFAULT_EXPORT_BACKUP_SETTINGS) as any}
        userId={session.user.id}
      />
    </div>
  );
}
