import type { Extensions } from "@tiptap/core";
import type { ComponentType } from "react";
import type { ToolDefinition } from "@/lib/domain/tools";
import type { SlashCommand } from "@/lib/domain/editor/commands/slash-commands";
import type {
  WorkspacePaneId,
  WorkspaceTabState,
} from "@/state/content-store";

export type ExtensionSurface =
  | "left-sidebar"
  | "main-workspace"
  | "content-viewer"
  | "right-sidebar"
  | "global-dialog"
  | "shell";

export interface ExtensionViewNavItem {
  type?: "view";
  view: string;
  label: string;
  title?: string;
  iconName: string;
  order: number;
}

export interface ExtensionActionNavItem {
  type: "action";
  id: string;
  label: string;
  title?: string;
  iconName: string;
  order: number;
}

export type ExtensionNavItem = ExtensionViewNavItem | ExtensionActionNavItem;

export interface ExtensionHeaderNavActionProps {
  item: ExtensionActionNavItem;
  collapsed?: boolean;
  className: string;
  iconClassName: string;
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
  canDisable?: boolean;
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

export interface ExtensionShellNavigationProps {
  paneId: WorkspacePaneId;
}

export interface ExtensionShellTabMenuSectionProps {
  tab: WorkspaceTabState;
  closeMenu: () => void;
}

export interface ExtensionContentViewerMatch {
  selectedContentId: string | null;
  contentType: string | null;
}

export interface ExtensionContentViewerProps
  extends ExtensionContentViewerMatch {
  paneId: WorkspacePaneId;
}

export interface ExtensionRuntime {
  id: string;
  leftSidebarPanel?: ComponentType;
  mainWorkspace?: ComponentType;
  contentViewer?: ComponentType<ExtensionContentViewerProps>;
  matchesContentViewer?: (
    input: ExtensionContentViewerMatch
  ) => boolean;
  rightSidebarPanel?: ComponentType;
  shellNavigationControls?: ComponentType<ExtensionShellNavigationProps>[];
  shellNavigationTrailingControls?: ComponentType<ExtensionShellNavigationProps>[];
  shellControllers?: ComponentType[];
  shellTabMenuSections?: ComponentType<ExtensionShellTabMenuSectionProps>[];
  headerNavActions?: Record<
    string,
    ComponentType<ExtensionHeaderNavActionProps>
  >;
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
