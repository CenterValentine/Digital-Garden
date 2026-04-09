import type { Extensions } from "@tiptap/core";
import type { ComponentType } from "react";
import type { ToolDefinition } from "@/lib/domain/tools";
import type { SlashCommand } from "@/lib/domain/editor/commands/slash-commands";

export type ExtensionSurface =
  | "left-sidebar"
  | "main-workspace"
  | "right-sidebar"
  | "global-dialog";

export interface ExtensionNavItem {
  view: string;
  label: string;
  title?: string;
  iconName: string;
  order: number;
}

export interface ExtensionSettingsEntry {
  path: string;
  label: string;
  title?: string;
  description?: string;
  order: number;
}

export interface ExtensionGoogleOAuthConfig {
  scopes: string[];
  scopeTokens?: string[];
  redirectPrefixes?: string[];
}

export interface ExtensionManifest {
  id: string;
  label: string;
  description?: string;
  iconName: string;
  enabledByDefault: boolean;
  navItems: ExtensionNavItem[];
  surfaces: ExtensionSurface[];
  settings?: ExtensionSettingsEntry;
  auth?: {
    google?: ExtensionGoogleOAuthConfig;
  };
  toolDefinitions?: ToolDefinition[];
  slashCommands?: string[];
  editorClientExtensions?: string[];
  editorServerExtensions?: string[];
}

export interface ExtensionRuntime {
  id: string;
  leftSidebarPanel?: ComponentType;
  mainWorkspace?: ComponentType;
  rightSidebarPanel?: ComponentType;
  globalDialogs?: ComponentType[];
  settingsDialog?: ComponentType;
  getSlashCommands?: () => SlashCommand[];
  editorClientExtensions?: Extensions;
}

export interface ExtensionServerRuntime {
  id: string;
  editorServerExtensions?: Extensions;
}

export interface BuiltInExtension {
  manifest: ExtensionManifest;
  runtime?: ExtensionRuntime;
  serverRuntime?: ExtensionServerRuntime;
}
