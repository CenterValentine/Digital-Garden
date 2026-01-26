/**
 * Tool Belt Types
 *
 * Type definitions for the file viewer tool belt system.
 * The tool belt provides context-aware actions for different file types.
 */

import { ReactNode } from "react";

/**
 * Position where the tool belt should appear
 */
export type ToolBeltPosition = "top" | "bottom" | "center" | "floating";

/**
 * Visual style for the tool belt
 */
export type ToolBeltStyle = "compact" | "expanded" | "minimal";

/**
 * Individual action in the tool belt
 */
export interface ToolAction {
  /** Unique identifier for this action */
  id: string;
  /** Display label */
  label: string;
  /** Icon component (Lucide React icon) */
  icon?: ReactNode;
  /** Click handler */
  onClick: () => void;
  /** Is this action currently disabled? */
  disabled?: boolean;
  /** Variant styling (primary, secondary, danger, etc.) */
  variant?: "default" | "primary" | "danger" | "warning" | "success";
  /** Tooltip text */
  tooltip?: string;
  /** Should this action be hidden? */
  hidden?: boolean;
  /** Keyboard shortcut hint (e.g., "⌘S") */
  shortcut?: string;
}

/**
 * Group of related actions
 */
export interface ToolActionGroup {
  /** Group identifier */
  id: string;
  /** Group label (optional) */
  label?: string;
  /** Actions in this group */
  actions: ToolAction[];
  /** Should this group be separated with a divider? */
  separator?: boolean;
}

/**
 * Configuration for the tool belt
 */
export interface ToolBeltConfig {
  /** Position of the tool belt */
  position: ToolBeltPosition;
  /** Visual style */
  style: ToolBeltStyle;
  /** Action groups to display */
  groups: ToolActionGroup[];
  /** Should the tool belt be always visible? */
  alwaysVisible?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Props for the ToolBelt component
 */
export interface ToolBeltProps {
  /** Configuration for the tool belt */
  config: ToolBeltConfig;
  /** Additional context (e.g., file metadata) */
  context?: Record<string, any>;
  /** Callback when an action is triggered */
  onActionTriggered?: (actionId: string) => void;
}

/**
 * File type specific tool belt provider
 */
export interface ToolBeltProvider {
  /** File type this provider supports */
  fileType: string | string[];
  /** Generate tool belt config for this file type */
  getConfig: (context: FileContext) => ToolBeltConfig;
}

/**
 * Context information about the current file
 */
export interface FileContext {
  /** File name */
  fileName: string;
  /** MIME type */
  mimeType: string;
  /** Content ID */
  contentId: string;
  /** File size in bytes */
  fileSize?: number;
  /** Download URL */
  downloadUrl?: string;
  /** Is the file editable? */
  editable?: boolean;
  /** Does the file have unsaved changes? */
  hasUnsavedChanges?: boolean;
  /** Is the file currently saving? */
  isSaving?: boolean;
  /** Additional metadata */
  metadata?: Record<string, any>;
}
