/**
 * Storage Settings Page
 *
 * Configure storage providers, backups, and view usage.
 * Providers is live; Backups and Usage are previews running on sample
 * data until their backends land — each carries an explicit banner.
 */

"use client";

import { FlaskConical } from "lucide-react";

import { SettingsPage } from "@/components/settings/ui";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/client/ui/tabs";
import { StorageProvidersTab } from "@/components/settings/storage/ProvidersTab";
import { StorageBackupsTab } from "@/components/settings/storage/BackupsTab";
import { StorageUsageTab } from "@/components/settings/storage/UsageTab";

function PreviewBanner() {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
      Preview — showing sample data. This surface isn&apos;t wired to your
      account yet.
    </div>
  );
}

export default function StorageSettingsPage() {
  return (
    <SettingsPage
      title="Storage"
      description="Storage providers, backups, and usage."
    >
      <Tabs defaultValue="providers">
        <TabsList>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="backups">Backups</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
        </TabsList>
        <TabsContent value="providers" className="mt-4">
          <StorageProvidersTab />
        </TabsContent>
        <TabsContent value="backups" className="mt-4">
          <PreviewBanner />
          <StorageBackupsTab />
        </TabsContent>
        <TabsContent value="usage" className="mt-4">
          <PreviewBanner />
          <StorageUsageTab />
        </TabsContent>
      </Tabs>
    </SettingsPage>
  );
}
