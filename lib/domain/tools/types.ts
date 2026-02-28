/**
 * Tool Surfaces Type System
 *
 * Declarative registry mapping tools to UI surfaces.
 * Pure types — no React, no side effects.
 */

/** Content types in the system (matches api-types.ts) */
export type ContentType =
  | "folder"
  | "note"
  | "file"
  | "html"
  | "template"
  | "code"
  | "external"
  | "chat"
  | "visualization"
  | "data"
  | "hope"
  | "workflow";

/** UI surfaces where tools can appear */
export type ToolSurface = "toolbar" | "toolbelt" | "sidebar-tab";

/**
 * Static tool definition — pure data, no React components or callbacks.
 * Resolved to ToolInstance at runtime by the context provider.
 */
export interface ToolDefinition {
  /** Unique tool ID (e.g., "bold", "download", "outline-tab") */
  id: string;
  /** Human-readable label */
  label: string;
  /** Lucide icon name as string (resolved to component at render time) */
  iconName: string;
  /** Which surface(s) this tool appears on */
  surfaces: ToolSurface[];
  /** Which content types this tool is available for */
  contentTypes: ContentType[] | "all";
  /** Display order within its surface (lower = first, use 10/20/30 gaps) */
  order: number;
  /** Group ID for visual separators (e.g., "text-format", "heading") */
  group?: string;
  /** Keyboard shortcut display string (e.g., "Cmd+B") */
  shortcut?: string;
  /** Whether this tool has an active/inactive toggle state */
  isToggle?: boolean;
  /** For sidebar-tab surface: the tab key used by RightSidebar */
  tabKey?: string;
}

/**
 * Runtime tool instance — definition + live state/handlers.
 * Created by ToolSurfaceProvider when combining registry with context.
 */
export interface ToolInstance {
  definition: ToolDefinition;
  /** Runtime click handler (wired by the consuming component) */
  execute: () => void;
  /** Is this tool currently active? (e.g., bold text selected) */
  isActive: boolean;
  /** Is this tool currently disabled? */
  isDisabled: boolean;
}

/** Query parameters for filtering the registry */
export interface ToolQuery {
  surface: ToolSurface;
  contentType?: ContentType;
}
