"use client";

import Link from "next/link";
import { Blocks, Globe } from "lucide-react";

import { Button } from "@/components/client/ui/button";
import { SettingsEmptyState, SettingsPage } from "@/components/settings/ui";
import { PUBLISHING_EXTENSION_ID } from "@/extensions/publishing/manifest";
import { renderExtensionIcon } from "@/lib/extensions";
import {
  useAllExtensionManifests,
  useIsExtensionEnabled,
  useRenderExtensionSettingsDialog,
} from "@/lib/extensions/client-registry";

import {
  ExtensionEnabledBadge,
  ExtensionEnableToggle,
} from "./ExtensionEnableControl";

/**
 * Route shell for /settings/extensions/[id]. Renders the same registered
 * settings component the Extensions dialog uses — one component, two
 * mounts. Handles the disabled state explicitly because
 * useRenderExtensionSettingsDialog resolves only for enabled runtimes.
 */
export function ExtensionSettingsShell({
  extensionId,
}: {
  extensionId: string;
}) {
  const manifests = useAllExtensionManifests();
  const isEnabled = useIsExtensionEnabled(extensionId);
  const renderedSettings = useRenderExtensionSettingsDialog(extensionId);

  const manifest = manifests.find((candidate) => candidate.id === extensionId);

  if (!manifest) {
    return (
      <SettingsEmptyState
        icon={<Blocks />}
        title="Extension not found"
        description="This extension isn't installed."
      />
    );
  }

  let body;
  if (!isEnabled) {
    body = (
      <SettingsEmptyState
        icon={<Blocks />}
        title="This extension is disabled"
        description={`Enable ${manifest.label} to configure it. Disabled extensions don't mount their shell controls, dialogs, or runtime behavior.`}
      />
    );
  } else if (renderedSettings) {
    body = renderedSettings;
  } else if (extensionId === PUBLISHING_EXTENSION_ID) {
    body = (
      <SettingsEmptyState
        icon={<Globe />}
        title="Publishing is configured through Sites & Domains"
        description="Create sites, connect custom domains, and manage publishing destinations there."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/sites">Open Sites & Domains</Link>
          </Button>
        }
      />
    );
  } else {
    body = (
      <SettingsEmptyState
        icon={<Blocks />}
        title="No settings yet"
        description="This extension doesn't have configurable settings."
      />
    );
  }

  return (
    <SettingsPage
      title={manifest.label}
      description={manifest.description}
      icon={renderExtensionIcon(manifest.iconName, "h-4 w-4")}
      badge={<ExtensionEnabledBadge extensionId={extensionId} />}
      actions={<ExtensionEnableToggle extensionId={extensionId} />}
    >
      {body}
    </SettingsPage>
  );
}
