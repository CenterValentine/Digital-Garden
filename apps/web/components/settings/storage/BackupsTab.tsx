/**
 * Storage Backups Tab
 *
 * Configure backup settings per folder
 * Retention policy and schedule configuration
 */

"use client";

import { useState } from "react";
import { getSurfaceStyles } from "@/lib/design-system";
import { toast } from "sonner";

// Dummy data
const DUMMY_FOLDERS = [
  { id: "1", title: "Work Projects", backupEnabled: true },
  { id: "2", title: "Personal Notes", backupEnabled: true },
  { id: "3", title: "Temp Files", backupEnabled: false },
  { id: "4", title: "Archive", backupEnabled: true },
];

export function StorageBackupsTab() {
  const glass0 = getSurfaceStyles("glass-0");

  const [backupsEnabled, setBackupsEnabled] = useState(true);
  const [backupSchedule, setBackupSchedule] = useState("weekly");
  const [retentionDays, setRetentionDays] = useState(90);
  const [folders, setFolders] = useState(DUMMY_FOLDERS);

  const handleToggleGlobalBackup = (enabled: boolean) => {
    console.log("[BackupsTab] Global backup toggle:", enabled);
    setBackupsEnabled(enabled);
    toast.success(enabled ? "Backups enabled" : "Backups disabled");
  };

  const handleToggleFolderBackup = (folderId: string, enabled: boolean) => {
    console.log("[BackupsTab] Folder backup toggle:", folderId, enabled);
    setFolders(folders.map(f =>
      f.id === folderId ? { ...f, backupEnabled: enabled } : f
    ));
    toast.success(`Backup ${enabled ? "enabled" : "disabled"} for folder`);
  };

  const handleScheduleChange = (schedule: string) => {
    console.log("[BackupsTab] Schedule changed:", schedule);
    setBackupSchedule(schedule);
    toast.success(`Backup schedule: ${schedule}`);
  };

  const handleRetentionChange = (days: number) => {
    console.log("[BackupsTab] Retention changed:", days);
    setRetentionDays(days);
    toast.success(`Retention policy: ${days} days`);
  };

  return (
    <div className="space-y-6">
      {/* Global Backup Toggle */}
      <div
        className="border border-white/10 rounded-lg p-6"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-semibold">Automatic Backups</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Enable versioning for file recovery (uses bucket versioning)
            </p>
          </div>
          <button
            onClick={() => handleToggleGlobalBackup(!backupsEnabled)}
            className={`
              relative w-12 h-6 rounded-full transition-colors
              ${backupsEnabled ? "bg-primary" : "bg-gray-600"}
            `}
          >
            <span
              className={`
                absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform
                ${backupsEnabled ? "translate-x-6" : "translate-x-0"}
              `}
            />
          </button>
        </div>
      </div>

      {/* Per-Folder Backup Settings */}
      {backupsEnabled && (
        <>
          <div
            className="border border-white/10 rounded-lg p-6"
            style={{
              background: glass0.background,
              backdropFilter: glass0.backdropFilter,
            }}
          >
            <h3 className="text-lg font-semibold mb-4">Folder Backup Settings</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Choose which folders to back up
            </p>

            <div className="space-y-3">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-white/5 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-gray-400"
                    >
                      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                    </svg>
                    <span className="text-sm">{folder.title}</span>
                  </div>
                  <button
                    onClick={() => handleToggleFolderBackup(folder.id, !folder.backupEnabled)}
                    className={`
                      relative w-10 h-5 rounded-full transition-colors
                      ${folder.backupEnabled ? "bg-primary" : "bg-gray-600"}
                    `}
                  >
                    <span
                      className={`
                        absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform
                        ${folder.backupEnabled ? "translate-x-5" : "translate-x-0"}
                      `}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Backup Schedule */}
          <div
            className="border border-white/10 rounded-lg p-6"
            style={{
              background: glass0.background,
              backdropFilter: glass0.backdropFilter,
            }}
          >
            <h3 className="text-lg font-semibold mb-4">Backup Schedule</h3>
            <p className="text-sm text-muted-foreground mb-4">
              How often to create backup snapshots
            </p>

            <div className="space-y-2">
              {["manual", "daily", "weekly"].map((schedule) => (
                <label
                  key={schedule}
                  className="flex items-center gap-3 p-3 rounded-lg border border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <input
                    type="radio"
                    name="schedule"
                    value={schedule}
                    checked={backupSchedule === schedule}
                    onChange={() => handleScheduleChange(schedule)}
                    className="w-4 h-4 text-primary"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium capitalize">{schedule}</div>
                    <div className="text-xs text-muted-foreground">
                      {schedule === "manual" && "Backup only when you trigger it"}
                      {schedule === "daily" && "Automatic backup every 24 hours"}
                      {schedule === "weekly" && "Automatic backup every 7 days (Recommended)"}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Retention Policy */}
          <div
            className="border border-white/10 rounded-lg p-6"
            style={{
              background: glass0.background,
              backdropFilter: glass0.backdropFilter,
            }}
          >
            <h3 className="text-lg font-semibold mb-4">Retention Policy</h3>
            <p className="text-sm text-muted-foreground mb-4">
              How long to keep old versions before deletion
            </p>

            <div className="space-y-2">
              {[30, 90, 365].map((days) => (
                <label
                  key={days}
                  className="flex items-center gap-3 p-3 rounded-lg border border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <input
                    type="radio"
                    name="retention"
                    value={days}
                    checked={retentionDays === days}
                    onChange={() => handleRetentionChange(days)}
                    className="w-4 h-4 text-primary"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      {days === 30 && "30 days"}
                      {days === 90 && "90 days (Recommended)"}
                      {days === 365 && "1 year"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Old versions move to archive tier after {days} days
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Info Alert */}
          <div
            className="border border-blue-500/30 rounded-lg p-6 bg-blue-500/10"
            style={{
              backdropFilter: glass0.backdropFilter,
            }}
          >
            <div className="flex gap-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-blue-400 flex-shrink-0 mt-0.5"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
              <div>
                <h4 className="text-sm font-semibold text-blue-400">Backup Cost</h4>
                <p className="text-sm text-gray-300 mt-1">
                  Backups using bucket versioning add approximately <strong>10-20%</strong> to storage costs (not 100%).
                  Old versions are automatically moved to cheaper archive tiers.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
