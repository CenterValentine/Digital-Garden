// @ts-nocheck — WIP: v2 registry with richer type system (ToolContextValue, availableWhen, enabledWhen, renderPanel)
/**
 * Tool Registry (v2)
 *
 * Central registry of all tools in the system.
 * Tools are filtered and sorted by surface, content type, and context.
 *
 * Based on conductor-one's registry pattern with Digital Garden extensions.
 *
 * NOTE: This file uses an extended ToolDefinition interface not yet in types.ts.
 * The committed registry.ts uses the simpler types.ts interface.
 */

import {
  Download,
  Share2,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link as LinkIcon,
  Heading1,
  Heading2,
  Heading3,
  Link2,
  FileText,
  Folder,
  Radar,
  List,
  Tag,
  MessageSquare,
} from "lucide-react";
import type { ToolDefinition, ToolContextValue, ToolSurface } from "./types";

// ============================================================
// TOOL REGISTRY
// ============================================================

/**
 * Central registry of all tools
 *
 * Tools are registered declaratively with:
 * - Unique ID
 * - Display label and icon
 * - Order (for deterministic placement)
 * - Surfaces (where tool can appear)
 * - Content types (which content supports this tool)
 * - Availability logic (when tool is visible)
 * - Enablement logic (when tool is enabled)
 * - Action handlers (what tool does)
 *
 * Tools are resolved dynamically based on context using resolveToolsForSurface()
 */
export const toolRegistry: ToolDefinition[] = [
  // ============================================================
  // TOOLBAR TOOLS (content header, always visible)
  // ============================================================

  {
    id: "download",
    label: "Download",
    icon: <Download size={16} />,
    order: 10,
    surfaces: ["toolbar"],
    contentTypes: "all",
    availableWhen: (ctx) => ctx.capabilities.downloadable,
    metadata: {
      category: "content-management",
      tags: ["export", "download"],
    },
    // onClick will be implemented in ContentToolbar component
  },

  {
    id: "share",
    label: "Share",
    icon: <Share2 size={16} />,
    order: 20,
    surfaces: ["toolbar"],
    contentTypes: "all",
    availableWhen: (ctx) => !ctx.permissions.readOnly,
    metadata: {
      category: "content-management",
      tags: ["collaboration", "share"],
    },
    // onClick will be implemented in ContentToolbar component
  },

  // ============================================================
  // TOOLBELT TOOLS (floating, selection-aware)
  // ============================================================

  {
    id: "bold",
    label: "Bold",
    icon: <Bold size={16} />,
    order: 10,
    surfaces: ["toolbelt", "menu"], // Available in both surfaces
    contentTypes: ["note"],
    availableWhen: (ctx) =>
      ctx.mode === "edit" && ctx.selection?.type === "text",
    enabledWhen: (ctx) => ctx.editor?.can().toggleBold() ?? false,
    onClick: (ctx) => ctx.editor?.chain().focus().toggleBold().run(),
    tiptap: {
      extension: "Bold",
      command: "toggleBold",
      canExecute: (editor) => editor.can().toggleBold(),
    },
    metadata: {
      category: "editing",
      tags: ["formatting", "text"],
      shortcut: "Cmd+B",
    },
  },

  {
    id: "italic",
    label: "Italic",
    icon: <Italic size={16} />,
    order: 20,
    surfaces: ["toolbelt", "menu"],
    contentTypes: ["note"],
    availableWhen: (ctx) =>
      ctx.mode === "edit" && ctx.selection?.type === "text",
    enabledWhen: (ctx) => ctx.editor?.can().toggleItalic() ?? false,
    onClick: (ctx) => ctx.editor?.chain().focus().toggleItalic().run(),
    tiptap: {
      extension: "Italic",
      command: "toggleItalic",
      canExecute: (editor) => editor.can().toggleItalic(),
    },
    metadata: {
      category: "editing",
      tags: ["formatting", "text"],
      shortcut: "Cmd+I",
    },
  },

  {
    id: "strikethrough",
    label: "Strikethrough",
    icon: <Strikethrough size={16} />,
    order: 30,
    surfaces: ["toolbelt", "menu"],
    contentTypes: ["note"],
    availableWhen: (ctx) =>
      ctx.mode === "edit" && ctx.selection?.type === "text",
    enabledWhen: (ctx) => ctx.editor?.can().toggleStrike() ?? false,
    onClick: (ctx) => ctx.editor?.chain().focus().toggleStrike().run(),
    tiptap: {
      extension: "Strike",
      command: "toggleStrike",
      canExecute: (editor) => editor.can().toggleStrike(),
    },
    metadata: {
      category: "editing",
      tags: ["formatting", "text"],
    },
  },

  {
    id: "code",
    label: "Inline Code",
    icon: <Code size={16} />,
    order: 40,
    surfaces: ["toolbelt", "menu"],
    contentTypes: ["note"],
    availableWhen: (ctx) =>
      ctx.mode === "edit" && ctx.selection?.type === "text",
    enabledWhen: (ctx) => ctx.editor?.can().toggleCode() ?? false,
    onClick: (ctx) => ctx.editor?.chain().focus().toggleCode().run(),
    tiptap: {
      extension: "Code",
      command: "toggleCode",
      canExecute: (editor) => editor.can().toggleCode(),
    },
    metadata: {
      category: "editing",
      tags: ["formatting", "code"],
      shortcut: "Cmd+E",
    },
  },

  {
    id: "link",
    label: "Link",
    icon: <LinkIcon size={16} />,
    order: 50,
    surfaces: ["toolbelt", "menu"],
    contentTypes: ["note"],
    availableWhen: (ctx) =>
      ctx.mode === "edit" && ctx.selection?.type === "text",
    enabledWhen: (ctx) => ctx.editor?.can().setLink({ href: "" }) ?? false,
    // onClick will trigger link dialog in EditorToolbelt
    tiptap: {
      extension: "Link",
      command: "setLink",
      canExecute: (editor) => editor.can().setLink({ href: "" }),
    },
    metadata: {
      category: "editing",
      tags: ["formatting", "link"],
      shortcut: "Cmd+K",
    },
  },

  {
    id: "heading1",
    label: "Heading 1",
    icon: <Heading1 size={16} />,
    order: 60,
    surfaces: ["toolbelt", "menu"],
    contentTypes: ["note"],
    availableWhen: (ctx) =>
      ctx.mode === "edit" && ctx.selection?.type === "text",
    enabledWhen: (ctx) =>
      ctx.editor?.can().toggleHeading({ level: 1 }) ?? false,
    onClick: (ctx) =>
      ctx.editor?.chain().focus().toggleHeading({ level: 1 }).run(),
    tiptap: {
      extension: "Heading",
      command: "toggleHeading",
      canExecute: (editor) => editor.can().toggleHeading({ level: 1 }),
    },
    metadata: {
      category: "editing",
      tags: ["formatting", "heading"],
    },
  },

  {
    id: "heading2",
    label: "Heading 2",
    icon: <Heading2 size={16} />,
    order: 70,
    surfaces: ["toolbelt", "menu"],
    contentTypes: ["note"],
    availableWhen: (ctx) =>
      ctx.mode === "edit" && ctx.selection?.type === "text",
    enabledWhen: (ctx) =>
      ctx.editor?.can().toggleHeading({ level: 2 }) ?? false,
    onClick: (ctx) =>
      ctx.editor?.chain().focus().toggleHeading({ level: 2 }).run(),
    tiptap: {
      extension: "Heading",
      command: "toggleHeading",
      canExecute: (editor) => editor.can().toggleHeading({ level: 2 }),
    },
    metadata: {
      category: "editing",
      tags: ["formatting", "heading"],
    },
  },

  {
    id: "heading3",
    label: "Heading 3",
    icon: <Heading3 size={16} />,
    order: 80,
    surfaces: ["toolbelt", "menu"],
    contentTypes: ["note"],
    availableWhen: (ctx) =>
      ctx.mode === "edit" && ctx.selection?.type === "text",
    enabledWhen: (ctx) =>
      ctx.editor?.can().toggleHeading({ level: 3 }) ?? false,
    onClick: (ctx) =>
      ctx.editor?.chain().focus().toggleHeading({ level: 3 }).run(),
    tiptap: {
      extension: "Heading",
      command: "toggleHeading",
      canExecute: (editor) => editor.can().toggleHeading({ level: 3 }),
    },
    metadata: {
      category: "editing",
      tags: ["formatting", "heading"],
    },
  },

  // ============================================================
  // MENU TOOLS (context menu, slash commands)
  // ============================================================

  {
    id: "create-note",
    label: "New Note",
    icon: <FileText size={16} />,
    order: 10,
    surfaces: ["menu"], // Context menu only
    contentTypes: "all",
    availableWhen: (ctx) => !ctx.permissions.readOnly,
    metadata: {
      category: "content-management",
      tags: ["create", "note"],
      shortcut: "A",
    },
    // onClick will be implemented in context menu component
  },

  {
    id: "create-folder",
    label: "New Folder",
    icon: <Folder size={16} />,
    order: 20,
    surfaces: ["menu"],
    contentTypes: "all",
    availableWhen: (ctx) => !ctx.permissions.readOnly,
    metadata: {
      category: "content-management",
      tags: ["create", "folder"],
      shortcut: "Shift+A",
    },
    // onClick will be implemented in context menu component
  },

  // ============================================================
  // PANEL TOOLS (right sidebar, complex workflows)
  // ============================================================

  {
    id: "backlinks",
    label: "Backlinks",
    icon: <Link2 size={16} />,
    order: 10,
    surfaces: ["panel"],
    contentTypes: ["note"],
    availableWhen: (ctx) => Boolean(ctx.activeContentNodeId),
    metadata: {
      category: "navigation",
      tags: ["links", "relationships", "backlinks"],
    },
    // renderPanel will be implemented when integrating RightSidebar
    // For now, this is a placeholder showing the pattern
    renderPanel: (ctx) => {
      // Will be replaced with actual BacklinksPanel component
      return (
        <div className="tool-panel-body">
          <div className="tool-panel-title">Backlinks</div>
          <p className="tool-panel-text">
            Links pointing to this note will appear here.
          </p>
        </div>
      );
    },
  },

  {
    id: "outline",
    label: "Outline",
    icon: <List size={16} />,
    order: 20,
    surfaces: ["panel"],
    contentTypes: ["note"],
    availableWhen: (ctx) => Boolean(ctx.activeContentNodeId),
    metadata: {
      category: "navigation",
      tags: ["outline", "headings", "structure"],
    },
    // renderPanel will be implemented when integrating RightSidebar
    renderPanel: (ctx) => {
      // Will be replaced with actual OutlinePanel component
      return (
        <div className="tool-panel-body">
          <div className="tool-panel-title">Outline</div>
          <p className="tool-panel-text">
            Document outline with headings will appear here.
          </p>
        </div>
      );
    },
  },

  {
    id: "tags",
    label: "Tags",
    icon: <Tag size={16} />,
    order: 30,
    surfaces: ["panel"],
    contentTypes: "all",
    availableWhen: (ctx) => Boolean(ctx.activeContentNodeId),
    metadata: {
      category: "content-management",
      tags: ["tags", "metadata", "organization"],
    },
    // renderPanel will be implemented when integrating RightSidebar
    renderPanel: (ctx) => {
      // Will be replaced with actual TagsPanel component
      return (
        <div className="tool-panel-body">
          <div className="tool-panel-title">Tags</div>
          <p className="tool-panel-text">
            Tags for this content will appear here.
          </p>
        </div>
      );
    },
  },

  {
    id: "chat",
    label: "AI Chat",
    icon: <MessageSquare size={16} />,
    order: 50,
    surfaces: ["panel"],
    contentTypes: "all",
    availableWhen: (ctx) => Boolean(ctx.activeContentNodeId),
    ai: {
      contextProvider: true,
      aiActionable: true,
      ragEnabled: false,
    },
    metadata: {
      category: "ai",
      tags: ["chat", "ai", "assistant"],
    },
    // renderPanel will be implemented when integrating RightSidebar
    renderPanel: (ctx) => {
      // Will be replaced with actual chat panel component
      return (
        <div className="tool-panel-body">
          <div className="tool-panel-title">AI Chat</div>
          <p className="tool-panel-text">Coming soon</p>
        </div>
      );
    },
  },

  {
    id: "rag",
    label: "RAG",
    icon: <Radar size={16} />,
    order: 60,
    surfaces: ["panel"],
    contentTypes: "all",
    availableWhen: (ctx) =>
      ctx.capabilities.ragAssignable && Boolean(ctx.activeContentNodeId),
    ai: {
      contextProvider: true,
      aiActionable: true,
      ragEnabled: true,
    },
    metadata: {
      category: "ai",
      tags: ["rag", "context", "ai"],
    },
    // renderPanel will be implemented when integrating RightSidebar
    renderPanel: (ctx) => {
      // Will be replaced with actual RagAssignerPanel component
      return (
        <div className="tool-panel-body">
          <div className="tool-panel-title">RAG</div>
          <p className="tool-panel-text">
            Assign content to RAG contexts for AI integration.
          </p>
        </div>
      );
    },
  },
];

// ============================================================
// RESOLVER FUNCTION
// ============================================================

/**
 * Resolve tools for a specific surface
 *
 * Filters tools by:
 * 1. Surface (toolbar, toolbelt, panel, menu, interaction)
 * 2. Content type (matches activeContentNodeId's type)
 * 3. Availability (availableWhen function returns true)
 *
 * Sorts by:
 * - Order field (deterministic ordering)
 *
 * @param surface - Target surface (toolbar, toolbelt, panel, menu, interaction)
 * @param ctx - Current tool context
 * @returns Filtered and sorted tools for the surface
 *
 * @example
 * ```tsx
 * const toolbarTools = resolveToolsForSurface('toolbar', ctx);
 * // Returns: [download, share] (if both are available)
 * ```
 */
export function resolveToolsForSurface(
  surface: ToolSurface,
  ctx: ToolContextValue
): ToolDefinition[] {
  return toolRegistry
    .filter((tool) => tool.surfaces.includes(surface))
    .filter(
      (tool) =>
        tool.contentTypes === "all" ||
        tool.contentTypes.includes(ctx.contentNodeType ?? "note")
    )
    .filter((tool) => tool.availableWhen(ctx))
    .sort((a, b) => a.order - b.order); // Deterministic ordering
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Get tool by ID
 * Useful for debugging and testing
 */
export function getToolById(id: string): ToolDefinition | undefined {
  return toolRegistry.find((tool) => tool.id === id);
}

/**
 * Get all tools for a content type
 * Useful for debugging and documentation
 */
export function getToolsForContentType(
  contentType: ToolContextValue["contentNodeType"]
): ToolDefinition[] {
  return toolRegistry.filter(
    (tool) =>
      tool.contentTypes === "all" ||
      tool.contentTypes.includes(contentType ?? "note")
  );
}

/**
 * Get all tools in a category
 * Useful for grouping in UI
 */
export function getToolsByCategory(
  category: NonNullable<ToolDefinition["metadata"]>["category"]
): ToolDefinition[] {
  return toolRegistry.filter((tool) => tool.metadata?.category === category);
}
