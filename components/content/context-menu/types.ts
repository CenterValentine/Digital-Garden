/**
 * Context Menu Types
 *
 * Defines the structure for adaptive context menus across different panels.
 * Each panel (file tree, main editor, right sidebar) can provide its own actions.
 *
 * M4: File Tree Completion - Context Menu Infrastructure
 */

import type { ReactNode } from "react";

/**
 * Context menu action definition
 */
export interface ContextMenuAction {
  /** Unique action ID */
  id: string;
  /** Display label */
  label: string;
  /** Optional icon component */
  icon?: ReactNode;
  /** Keyboard shortcut display (e.g., "⌘D", "Delete") */
  shortcut?: string;
  /** Action handler (omit if this action has a submenu) */
  onClick?: () => void | Promise<void>;
  /** Sub-menu actions (nested menu) */
  submenu?: ContextMenuAction[];
  /** Disabled state */
  disabled?: boolean;
  /** Destructive action (shows in red) */
  destructive?: boolean;
  /** Divider after this item */
  divider?: boolean;
}

/**
 * Context menu section (group of related actions)
 */
export interface ContextMenuSection {
  /** Section title (optional) */
  title?: string;
  /** Actions in this section */
  actions: ContextMenuAction[];
}

/**
 * Context menu panel type - determines which actions to show
 */
export type ContextMenuPanel = "file-tree" | "main-editor" | "right-sidebar";

/**
 * Context menu position
 */
export interface ContextMenuPosition {
  x: number;
  y: number;
}

/**
 * Context menu state
 */
export interface ContextMenuState {
  /** Is menu open? */
  isOpen: boolean;
  /** Menu position */
  position: ContextMenuPosition | null;
  /** Which panel triggered the menu */
  panel: ContextMenuPanel | null;
  /** Context data (e.g., selected node IDs, cursor position) */
  context: Record<string, any> | null;
}

/**
 * Action provider - each panel provides its own actions based on context
 */
export type ContextMenuActionProvider = (
  context: Record<string, any>
) => ContextMenuSection[];
