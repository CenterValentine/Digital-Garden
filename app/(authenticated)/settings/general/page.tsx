/**
 * General Settings Page (Stub)
 */

"use client";

import { getSurfaceStyles } from "@/lib/design/system";

export default function GeneralSettingsPage() {
  const glass0 = getSurfaceStyles("glass-0");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">General Settings</h1>
        <p className="text-muted-foreground mt-2">App preferences and display options</p>
      </div>

      <div
        className="border border-white/10 rounded-lg p-6"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h3 className="text-lg font-semibold mb-4">Coming Soon</h3>
        <p className="text-sm text-muted-foreground">
          Theme preferences, language settings, and other general options will be available here.
        </p>
      </div>
    </div>
  );
}
