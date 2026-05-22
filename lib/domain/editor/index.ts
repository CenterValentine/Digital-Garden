/**
 * Editor Module
 *
 * TipTap editor extensions and configuration for rich text editing.
 *
 * ⚠️  IMPORT-GRAPH WARNING (Epoch 19, Sprint 6 follow-up):
 *
 * This barrel re-exports BOTH extensions-client (which includes blocks
 * like flashcardEmbed-client that import `react-dom/client`) AND
 * extensions-server. Importing anything from this barrel from a server
 * route — even `getServerExtensions` — drags the client bundle into
 * server code via webpack's import-graph tracing, and Vercel's
 * `next build --webpack` rejects it with:
 *
 *   "You're importing a component that imports react-dom/client. It
 *    only works in a Client Component but none of its parents are
 *    marked with 'use client'."
 *
 * Server-only consumers (route handlers, server components) MUST
 * deep-import:
 *
 *   import { getServerExtensions } from "@/lib/domain/editor/extensions-server";
 *
 * Client consumers can keep using the barrel.
 *
 * (Turbopack/dev doesn't catch this — only webpack/prod does. Always
 *  run `pnpm vercel-build` after touching this barrel.)
 */

// Extension configurations (client-side with React components)
export {
  getEditorExtensions,
  getViewerExtensions,
  getPlainTextExtensions,
  type EditorExtensionsOptions,
} from "./extensions-client";

// Extension configurations (server-side, no React components)
export {
  getServerExtensions,
} from "./extensions-server";

// Re-export individual extensions for advanced use cases
export { SlashCommands } from "./commands/slash-commands";
export { WikiLink } from "./extensions/wiki-link";
export { createWikiLinkSuggestion } from "./extensions/wiki-link-suggestion";
export { Callout } from "./extensions/callout";
export { Tag } from "./extensions/tag";
export { TaskListInputRule } from "./extensions/task-list";
export { BulletListBackspace } from "./extensions/bullet-list";
