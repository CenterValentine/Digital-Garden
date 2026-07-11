"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Switch } from "@/components/client/ui/switch";
import { cn } from "@/lib/core/utils";
import {
  useAllExtensionManifests,
  useIsExtensionEnabled,
  useSetExtensionEnabled,
} from "@/lib/extensions/client-registry";

/**
 * Enabled/Disabled status badge for an extension. Shared between the
 * Extensions dialog header and the /settings/extensions/[id] route shell.
 */
export function ExtensionEnabledBadge({
  extensionId,
}: {
  extensionId: string;
}) {
  const isEnabled = useIsExtensionEnabled(extensionId);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]",
        isEnabled
          ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
          : "border border-black/10 bg-black/[0.04] text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
      )}
    >
      <CheckCircle2 className="h-3 w-3" />
      {isEnabled ? "Enabled" : "Disabled"}
    </span>
  );
}

/**
 * Enable/disable switch pill for an extension. Renders nothing when the
 * manifest doesn't allow disabling. Label reflects the actual state
 * (Enabled / Disabled / Updating…).
 */
export function ExtensionEnableToggle({
  extensionId,
}: {
  extensionId: string;
}) {
  const manifests = useAllExtensionManifests();
  const isEnabled = useIsExtensionEnabled(extensionId);
  const setExtensionEnabled = useSetExtensionEnabled();
  const [isPending, setIsPending] = useState(false);

  const manifest = manifests.find((candidate) => candidate.id === extensionId);
  if (!manifest?.canDisable) return null;

  const handleToggle = async (enabled: boolean) => {
    setIsPending(true);
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    setExtensionEnabled(extensionId, enabled);
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    setIsPending(false);
  };

  return (
    <div className="flex items-center gap-2 rounded-full border border-black/10 bg-black/[0.03] px-3 py-1.5 dark:border-white/10 dark:bg-white/[0.03]">
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
        {isPending ? "Updating…" : isEnabled ? "Enabled" : "Disabled"}
      </span>
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin text-gray-700 dark:text-gray-300" />
      ) : null}
      <Switch
        checked={isEnabled}
        disabled={isPending}
        onCheckedChange={(checked) => void handleToggle(checked)}
        aria-label={`${isEnabled ? "Disable" : "Enable"} ${manifest.label}`}
      />
    </div>
  );
}
