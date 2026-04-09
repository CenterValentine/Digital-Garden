"use client";

import { createElement, useMemo } from "react";
import type { ComponentType, ReactNode } from "react";
import type { Extensions } from "@tiptap/core";
import type { SlashCommand } from "@/lib/domain/editor/commands/slash-commands";
import {
  getAllExtensionManifests,
  getAllExtensionRuntimes,
  type ExtensionManifest,
  type ExtensionRuntime,
  type ExtensionSettingsEntry,
} from "@/lib/extensions";
import { useExtensionActivationStore } from "@/state/extension-activation-store";
import type {
  ExtensionNavItem,
  ExtensionShellNavigationProps,
  ExtensionShellTabMenuSectionProps,
} from "./types";

function isClientExtensionEnabled(
  extensionId: string,
  manifests: ExtensionManifest[],
  overrides: Record<string, boolean>
) {
  const manifest = manifests.find((candidate) => candidate.id === extensionId);
  return overrides[extensionId] ?? manifest?.enabledByDefault ?? false;
}

function getClientEnabledExtensionRuntimes(): ExtensionRuntime[] {
  const manifests = getAllExtensionManifests();
  const overrides = useExtensionActivationStore.getState().overrides;
  return getAllExtensionRuntimes().filter((runtime) =>
    isClientExtensionEnabled(runtime.id, manifests, overrides)
  );
}

function useEnabledExtensionRuntimes(): ExtensionRuntime[] {
  const runtimes = useMemo(() => getAllExtensionRuntimes(), []);
  const manifests = useMemo(() => getAllExtensionManifests(), []);
  const overrides = useExtensionActivationStore((state) => state.overrides);
  return useMemo(
    () =>
      runtimes.filter((runtime) =>
        isClientExtensionEnabled(runtime.id, manifests, overrides)
      ),
    [manifests, overrides, runtimes]
  );
}

export function useAllExtensionManifests(): ExtensionManifest[] {
  return useMemo(() => getAllExtensionManifests(), []);
}

export function useIsExtensionEnabled(extensionId: string): boolean {
  return useExtensionActivationStore((state) => state.isExtensionEnabled(extensionId));
}

export function useSetExtensionEnabled() {
  return useExtensionActivationStore((state) => state.setExtensionEnabled);
}

export function useEnabledExtensionManifests(): ExtensionManifest[] {
  const manifests = useAllExtensionManifests();
  const overrides = useExtensionActivationStore((state) => state.overrides);
  return useMemo(
    () =>
      manifests.filter(
        (manifest) => overrides[manifest.id] ?? manifest.enabledByDefault
      ),
    [manifests, overrides]
  );
}

export function useExtensionNavItems(): ExtensionNavItem[] {
  const manifests = useEnabledExtensionManifests();
  return useMemo(
    () =>
      manifests
        .flatMap((extension) => extension.navItems)
        .sort((a, b) => a.order - b.order),
    [manifests]
  );
}

export function useExtensionSettingsEntries(): Array<
  ExtensionSettingsEntry & { extensionId: string; iconName: string }
> {
  const manifests = useEnabledExtensionManifests();
  return useMemo(
    () =>
      manifests
        .filter(
          (
            manifest
          ): manifest is ExtensionManifest & { settings: ExtensionSettingsEntry } =>
            Boolean(manifest.settings)
        )
        .map((manifest) => ({
          ...manifest.settings,
          extensionId: manifest.id,
          iconName: manifest.iconName,
        }))
        .sort((a, b) => a.order - b.order),
    [manifests]
  );
}

export function useExtensionLeftSidebarPanel(
  view: string
): ComponentType | undefined {
  const manifests = useEnabledExtensionManifests();
  const runtimes = useEnabledExtensionRuntimes();
  const extensionId = manifests.find((manifest) =>
    manifest.navItems.some((item) => item.view === view)
  )?.id;
  return runtimes.find((runtime) => runtime.id === extensionId)?.leftSidebarPanel;
}

export function useExtensionMainWorkspace(
  view: string
): ComponentType | undefined {
  const manifests = useEnabledExtensionManifests();
  const runtimes = useEnabledExtensionRuntimes();
  const extensionId = manifests.find((manifest) =>
    manifest.navItems.some((item) => item.view === view)
  )?.id;
  return runtimes.find((runtime) => runtime.id === extensionId)?.mainWorkspace;
}

export function useExtensionRightSidebarPanel(
  view: string
): ComponentType | undefined {
  const manifests = useEnabledExtensionManifests();
  const runtimes = useEnabledExtensionRuntimes();
  const extensionId = manifests.find((manifest) =>
    manifest.navItems.some((item) => item.view === view)
  )?.id;
  return runtimes.find((runtime) => runtime.id === extensionId)?.rightSidebarPanel;
}

export function useExtensionGlobalDialogs(): ComponentType[] {
  return useEnabledExtensionRuntimes().flatMap(
    (runtime) => runtime.globalDialogs ?? []
  );
}

export function useExtensionSettingsDialog(
  extensionId: string
): ComponentType | undefined {
  return useEnabledExtensionRuntimes().find(
    (runtime) => runtime.id === extensionId
  )?.settingsDialog;
}

export function useRenderExtensionSettingsDialog(
  extensionId: string
): ReactNode {
  const SettingsDialog = useExtensionSettingsDialog(extensionId);
  return SettingsDialog ? createElement(SettingsDialog) : null;
}

export function useExtensionSlashCommands(): SlashCommand[] {
  return useEnabledExtensionRuntimes().flatMap(
    (runtime) => runtime.getSlashCommands?.() ?? []
  );
}

export function getExtensionSlashCommands(): SlashCommand[] {
  return getClientEnabledExtensionRuntimes().flatMap(
    (runtime) => runtime.getSlashCommands?.() ?? []
  );
}

export function useExtensionClientEditorExtensions(): Extensions {
  return useEnabledExtensionRuntimes().flatMap(
    (runtime) => runtime.editorClientExtensions ?? []
  );
}

export function getExtensionClientEditorExtensions(): Extensions {
  return getClientEnabledExtensionRuntimes().flatMap(
    (runtime) => runtime.editorClientExtensions ?? []
  );
}

export function useExtensionShellNavigationControls(): Array<
  ComponentType<ExtensionShellNavigationProps>
> {
  return useEnabledExtensionRuntimes().flatMap(
    (runtime) => runtime.shellNavigationControls ?? []
  );
}

export function useExtensionShellControllers(): ComponentType[] {
  return useEnabledExtensionRuntimes().flatMap(
    (runtime) => runtime.shellControllers ?? []
  );
}

export function useExtensionShellTabMenuSections(): Array<
  ComponentType<ExtensionShellTabMenuSectionProps>
> {
  return useEnabledExtensionRuntimes().flatMap(
    (runtime) => runtime.shellTabMenuSections ?? []
  );
}
