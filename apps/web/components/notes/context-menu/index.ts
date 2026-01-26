/**
 * Context Menu - Public API
 *
 * Export all context menu components and types for easy importing.
 *
 * M4: File Tree Completion - Context Menu Infrastructure
 */

export { ContextMenu } from "./ContextMenu";
export { fileTreeActionProvider } from "./file-tree-actions";
export type {
  ContextMenuAction,
  ContextMenuSection,
  ContextMenuPanel,
  ContextMenuPosition,
  ContextMenuState,
  ContextMenuActionProvider,
} from "./types";
export type { FileTreeContext } from "./file-tree-actions";
