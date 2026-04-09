"use client";

import { createElement } from "react";
import type { ComponentType, ReactNode } from "react";
import type { Extensions } from "@tiptap/core";
import { getEnabledExtensionRuntimes, getExtensionRuntimeForView } from "./registry";
import type { SlashCommand } from "@/lib/domain/editor/commands/slash-commands";

export function getExtensionLeftSidebarPanel(
  view: string
): ComponentType | undefined {
  return getExtensionRuntimeForView(view)?.leftSidebarPanel;
}

export function getExtensionMainWorkspace(
  view: string
): ComponentType | undefined {
  return getExtensionRuntimeForView(view)?.mainWorkspace;
}

export function getExtensionRightSidebarPanel(
  view: string
): ComponentType | undefined {
  return getExtensionRuntimeForView(view)?.rightSidebarPanel;
}

export function getExtensionGlobalDialogs(): ComponentType[] {
  return getEnabledExtensionRuntimes().flatMap(
    (runtime) => runtime.globalDialogs ?? []
  );
}

export function getExtensionSettingsDialog(
  extensionId: string
): ComponentType | undefined {
  return getEnabledExtensionRuntimes().find(
    (runtime) => runtime.id === extensionId
  )?.settingsDialog;
}

export function renderExtensionSettingsDialog(
  extensionId: string
): ReactNode {
  const SettingsDialog = getExtensionSettingsDialog(extensionId);
  return SettingsDialog ? createElement(SettingsDialog) : null;
}

export function getExtensionSlashCommands(): SlashCommand[] {
  return getEnabledExtensionRuntimes().flatMap(
    (runtime) => runtime.getSlashCommands?.() ?? []
  );
}

export function getExtensionClientEditorExtensions(): Extensions {
  return getEnabledExtensionRuntimes().flatMap(
    (runtime) => runtime.editorClientExtensions ?? []
  );
}
