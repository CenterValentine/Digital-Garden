"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { CSSProperties } from "react";

import { SettingsPage } from "@/components/settings/ui";
import { cn } from "@/lib/core/utils";
import { getSurfaceStyles } from "@/lib/design/system";
import { renderExtensionIcon } from "@/lib/extensions";
import type { ExtensionManifest } from "@/lib/extensions";
import {
  useAllExtensionManifests,
  useIsExtensionEnabled,
} from "@/lib/extensions/client-registry";

import { ExtensionEnableToggle } from "./ExtensionEnableControl";

function ExtensionCard({ manifest }: { manifest: ExtensionManifest }) {
  const isEnabled = useIsExtensionEnabled(manifest.id);
  const glass = getSurfaceStyles("glass-0");
  const style: CSSProperties = {
    background: glass.background,
    backdropFilter: glass.backdropFilter,
  };

  return (
    <div
      style={style}
      className="flex flex-col gap-3 rounded-xl border border-black/10 p-4 dark:border-white/10"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
            isEnabled
              ? "border-black/10 bg-black/[0.03] text-foreground dark:border-white/10 dark:bg-white/[0.03]"
              : "border-black/10 bg-black/[0.02] text-muted-foreground dark:border-white/10 dark:bg-white/[0.02]"
          )}
        >
          {renderExtensionIcon(manifest.iconName, "h-5 w-5")}
        </div>
        <div className="min-w-0 flex-1">
          <Link
            href={`/settings/extensions/${manifest.id}`}
            className="inline-flex items-center gap-1 text-sm font-semibold hover:underline"
          >
            {manifest.label}
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
          </Link>
          {manifest.description && (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
              {manifest.description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-end">
        {manifest.canDisable ? (
          <ExtensionEnableToggle extensionId={manifest.id} />
        ) : (
          <span className="px-1 text-xs text-muted-foreground">Always on</span>
        )}
      </div>
    </div>
  );
}

/**
 * /settings/extensions — every installed extension with its enabled state,
 * quick toggle, and a link to its settings page.
 */
export function ExtensionsOverview() {
  const manifests = useAllExtensionManifests();
  // "Always on" extensions (no disable toggle) first, then toggleable ones;
  // alphabetical within each group.
  const sorted = [...manifests].sort((a, b) => {
    const aToggle = a.canDisable ? 1 : 0;
    const bToggle = b.canDisable ? 1 : 0;
    if (aToggle !== bToggle) return aToggle - bToggle;
    return a.label.localeCompare(b.label);
  });

  return (
    <SettingsPage
      title="Extensions"
      description="Built-in extensions add optional surfaces and workflows. Disabled extensions unmount their controls, dialogs, and runtime behavior."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {sorted.map((manifest) => (
          <ExtensionCard key={manifest.id} manifest={manifest} />
        ))}
      </div>
    </SettingsPage>
  );
}
