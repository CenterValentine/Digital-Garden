/**
 * Storage Settings Page
 *
 * Configure storage providers, backups, and view usage
 * Three tabs: Providers, Backups, Usage
 */

"use client";

import { useState } from "react";
import { StorageProvidersTab } from "@/components/settings/storage/ProvidersTab";
import { StorageBackupsTab } from "@/components/settings/storage/BackupsTab";
import { StorageUsageTab } from "@/components/settings/storage/UsageTab";

export default function StorageSettingsPage() {
  const [activeTab, setActiveTab] = useState<"providers" | "backups" | "usage">("providers");

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold">Storage Settings</h1>
        <p className="text-muted-foreground mt-2">
          Configure storage providers, manage backups, and monitor usage
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-white/10">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab("providers")}
            className={`
              pb-3 text-sm font-medium border-b-2 transition-colors
              ${
                activeTab === "providers"
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-400 hover:text-gray-300"
              }
            `}
          >
            Providers
          </button>
          <button
            onClick={() => setActiveTab("backups")}
            className={`
              pb-3 text-sm font-medium border-b-2 transition-colors
              ${
                activeTab === "backups"
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-400 hover:text-gray-300"
              }
            `}
          >
            Backups
          </button>
          <button
            onClick={() => setActiveTab("usage")}
            className={`
              pb-3 text-sm font-medium border-b-2 transition-colors
              ${
                activeTab === "usage"
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-400 hover:text-gray-300"
              }
            `}
          >
            Usage
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === "providers" && <StorageProvidersTab />}
        {activeTab === "backups" && <StorageBackupsTab />}
        {activeTab === "usage" && <StorageUsageTab />}
      </div>
    </div>
  );
}
