/**
 * Editor Module
 *
 * TipTap editor extensions and configuration for rich text editing.
 */

// Extension configurations (client-side with React components)
export {
  getEditorExtensions,
  type EditorExtensionsOptions,
} from "./extensions-client";

// Extension configurations (server-side, no React components)
export {
  getServerExtensions,
  getViewerExtensions,
  getPlainTextExtensions,
} from "./extensions-client";

// Re-export individual extensions for advanced use cases
export { SlashCommands } from "./commands/slash-commands";
export { WikiLink } from "./extensions/wiki-link";
export { createWikiLinkSuggestion } from "./extensions/wiki-link-suggestion";
export { Callout } from "./extensions/callout";
export { Tag } from "./extensions/tag";
export { TaskListInputRule } from "./extensions/task-list";
export { BulletListBackspace } from "./extensions/bullet-list";
