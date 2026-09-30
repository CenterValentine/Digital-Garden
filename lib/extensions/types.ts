import type { LinkAnchorLister, LinkAnchorSuggester } from "@/lib/domain/content/link-anchor";
import type { Extensions } from "@tiptap/core";
import type { ComponentType } from "react";
import type { ToolDefinition } from "@/lib/domain/tools";
import type { SlashCommand } from "@/lib/domain/editor/commands/slash-commands";
import type { NotificationKindRenderer } from "@/lib/features/notifications/kind-renderer-types";
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
  /** File payload MIME type when `contentType === "file"`, else null. */
  mimeType?: string | null;
}

/**
 * An entry an extension contributes to the shared "+" / Add menu. Rendered
 * after the built-in content types; a disabled extension contributes nothing
 * (registry filter), so shared menu code never checks extension ids.
 */
export interface ExtensionCreateMenuItem {
  id: string;
  label: string;
  /** Resolved through lib/extensions/icons.tsx. */
  iconName: string;
  title?: string;
  disabled?: boolean;
  onSelect?: (context: { parentId: string | null }) => void;
  submenu?: ExtensionCreateMenuItem[];
}

/**
 * A synthetic content id namespace owned by an extension (e.g. `reader:`).
 * MainPanelContent skips the ContentNode fetch for ids with this prefix and
 * hands the tab straight to the extension's content viewer with `contentType`.
 */
export interface ExtensionVirtualContent {
  prefix: string;
  contentType: string;
}

export interface ExtensionContentViewerProps
  extends ExtensionContentViewerMatch {
  paneId: WorkspacePaneId;
}

/** A right-sidebar tab an extension shows for content its viewer claimed. */
export interface ExtensionContentSidebarPanel {
  label: string;
  /** 24×24 stroke path for the tab icon (RightSidebarHeader draws inline SVG). */
  svgPath: string;
  component: ComponentType<{ contentId: string }>;
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
  /** Right-sidebar tab for content this extension's viewer claimed. */
  contentSidebarPanel?: ExtensionContentSidebarPanel;
  /** Static items, or a builder read each time the menu opens (dynamic lists). */
  createMenuItems?: ExtensionCreateMenuItem[] | (() => ExtensionCreateMenuItem[]);
  /**
   * Lists the spots inside a wiki-link target this extension owns (the
   * reader: a book's highlights), for the `[[Title#` step of the link menu.
   * Return null for targets that aren't this extension's kind of content.
   * See lib/domain/content/link-anchor.ts.
   */
  linkAnchors?: LinkAnchorLister;
  /**
   * Anchors typed directly after `[[` (a scripture reference). See
   * `LinkAnchorSuggester` in lib/domain/content/link-anchor.ts.
   */
  linkAnchorSuggestions?: LinkAnchorSuggester;
  virtualContent?: ExtensionVirtualContent[];
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
  /**
   * Renderers for notification kinds this extension emits (keyed by kind,
   * e.g. "flashcards.review_due"). Merged over the core registry by
   * useNotificationKindRenderers(); unknown kinds fall back to a safe
   * generic renderer.
   */
  notificationKindRenderers?: Record<string, NotificationKindRenderer>;
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
