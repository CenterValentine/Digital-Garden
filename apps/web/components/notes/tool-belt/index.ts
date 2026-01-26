/**
 * Tool Belt System
 *
 * A context-aware action system for file viewers.
 * Each file type can provide its own set of actions.
 *
 * ## Architecture
 *
 * 1. **ToolBelt Component** - Renders action buttons with flexible positioning
 * 2. **Providers** - File-type-specific action configurations
 * 3. **Types** - Shared type definitions
 *
 * ## Usage
 *
 * ```tsx
 * import { ToolBelt } from "@/components/notes/tool-belt";
 * import { getJSONToolBeltConfig } from "@/components/notes/tool-belt/providers/json-provider";
 *
 * function JSONViewer() {
 *   const config = getJSONToolBeltConfig(fileContext, jsonContext);
 *   return <ToolBelt config={config} />;
 * }
 * ```
 *
 * ## Future File Type Providers
 *
 * - **image-provider.tsx** - Rotate, Crop, Resize, Filters
 * - **video-provider.tsx** - Play/Pause, Mute, Speed, Trim
 * - **audio-provider.tsx** - Play/Pause, Mute, Speed, Waveform
 * - **pdf-provider.tsx** - Zoom, Print, Annotations
 * - **markdown-provider.tsx** - Bold, Italic, Link, AI Chat
 * - **code-provider.tsx** - Format, Run, Debug, AI Explain
 */

export { ToolBelt } from "./ToolBelt";
export * from "./types";

// Providers
export { getJSONToolBeltConfig } from "./providers/json-provider";
export type { JSONToolBeltContext } from "./providers/json-provider";
