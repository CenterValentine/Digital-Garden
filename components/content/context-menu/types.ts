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
  /** When true, submenu renders a search input that filters items by label */
  searchable?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Destructive action (shows in red) */
  destructive?: boolean;
  /** Divider after this item */
  divider?: boolean;
  /**
   * Inline input mode — clicking this action transforms it into a text input.
   * Used for compact creation flows (e.g., "New Category..." in context menus).
   *
   * If `onSubmit` returns a `ContextMenuAction[]`, the submenu replaces its
   * items with those actions (used for multi-step flows like create-category →
   * name-template). Returning void/undefined closes the menu as usual.
   */
  inlineInput?: {
    placeholder: string;
    /** Label shown above the input when active (e.g., "Template Name") */
    inputLabel?: string;
    onSubmit: (value: string) => void | Promise<void | ContextMenuAction[]>;
    /** Auto-enter input mode immediately (for chained flows) */
    autoFocus?: boolean;
  };
  /** Section label rendered above this action (like a group header) */
  sectionLabel?: string;
  /**
   * Secondary action shown as a small "x" button on the right side.
   * Used for inline deletion (e.g., removing a category from the submenu).
   */
  secondaryAction?: {
    icon: "x";
    onClick: () => void | Promise<void>;
    confirmLabel?: string;
  };
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
