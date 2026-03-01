/**
 * Tool Registry
 *
 * Static, declarative definitions of all tools.
 * Pure data — no React, no side effects.
 */

import type { ToolDefinition, ToolQuery, ToolSurface } from "./types";

/** All registered tools */
const TOOL_REGISTRY: ToolDefinition[] = [
  // ─── TOOLBAR: Content header actions ───
  {
    id: "import-markdown",
    label: "Import",
    iconName: "Upload",
    surfaces: ["toolbar"],
    contentTypes: "all",
    order: 90,
    group: "import",
  },
  {
    id: "export-markdown",
    label: "Export",
    iconName: "Download",
    surfaces: ["toolbar"],
    contentTypes: ["note"],
    order: 100,
    group: "export",
  },
  {
    id: "export-chat",
    label: "Export Chat",
    iconName: "Download",
    surfaces: ["toolbar"],
    contentTypes: ["chat"],
    order: 100,
    group: "export",
  },
  {
    id: "copy-link",
    label: "Copy Link",
    iconName: "Link2",
    surfaces: ["toolbar"],
    contentTypes: "all",
    order: 200,
    group: "share",
  },

  // ─── TOOLBELT: Text formatting (matches current BubbleMenu) ───
  {
    id: "bold",
    label: "Bold",
    iconName: "Bold",
    surfaces: ["toolbelt"],
    contentTypes: ["note"],
    order: 10,
    group: "text-format",
    shortcut: "Cmd+B",
    isToggle: true,
  },
  {
    id: "italic",
    label: "Italic",
    iconName: "Italic",
    surfaces: ["toolbelt"],
    contentTypes: ["note"],
    order: 20,
    group: "text-format",
    shortcut: "Cmd+I",
    isToggle: true,
  },
  {
    id: "strikethrough",
    label: "Strikethrough",
    iconName: "Strikethrough",
    surfaces: ["toolbelt"],
    contentTypes: ["note"],
    order: 30,
    group: "text-format",
    isToggle: true,
  },
  {
    id: "code-inline",
    label: "Inline Code",
    iconName: "Code",
    surfaces: ["toolbelt"],
    contentTypes: ["note"],
    order: 40,
    group: "text-format",
    shortcut: "Cmd+E",
    isToggle: true,
  },
  {
    id: "link",
    label: "Link",
    iconName: "Link",
    surfaces: ["toolbelt"],
    contentTypes: ["note"],
    order: 50,
    group: "link",
    isToggle: true,
  },
  {
    id: "heading-1",
    label: "Heading 1",
    iconName: "Heading1",
    surfaces: ["toolbelt"],
    contentTypes: ["note"],
    order: 60,
    group: "heading",
    isToggle: true,
  },
  {
    id: "heading-2",
    label: "Heading 2",
    iconName: "Heading2",
    surfaces: ["toolbelt"],
    contentTypes: ["note"],
    order: 70,
    group: "heading",
    isToggle: true,
  },
  {
    id: "heading-3",
    label: "Heading 3",
    iconName: "Heading3",
    surfaces: ["toolbelt"],
    contentTypes: ["note"],
    order: 80,
    group: "heading",
    isToggle: true,
  },

  // ─── SIDEBAR TABS (matches current RightSidebar) ───
  {
    id: "backlinks-tab",
    label: "Backlinks",
    iconName: "Link",
    surfaces: ["sidebar-tab"],
    contentTypes: ["note"],
    order: 10,
    tabKey: "backlinks",
  },
  {
    id: "outline-tab",
    label: "Outline",
    iconName: "List",
    surfaces: ["sidebar-tab"],
    contentTypes: ["note"],
    order: 20,
    tabKey: "outline",
  },
  {
    id: "tags-tab",
    label: "Tags",
    iconName: "Tag",
    surfaces: ["sidebar-tab"],
    contentTypes: "all",
    order: 30,
    tabKey: "tags",
  },
  {
    id: "chat-tab",
    label: "AI Chat",
    iconName: "MessageCircle",
    surfaces: ["sidebar-tab"],
    // Exclude "chat" content type — ChatViewer IS the chat; sidebar chat would be redundant
    contentTypes: ["folder", "note", "file", "html", "template", "code", "external", "visualization", "data", "hope", "workflow"],
    order: 40,
    tabKey: "chat",
  },
];

/**
 * Query tools from the registry.
 * Returns sorted, filtered ToolDefinitions.
 */
export function queryTools(query: ToolQuery): ToolDefinition[] {
  return TOOL_REGISTRY.filter(
    (tool) => tool.surfaces.includes(query.surface)
  )
    .filter((tool) => {
      if (!query.contentType) return true;
      if (tool.contentTypes === "all") return true;
      return tool.contentTypes.includes(query.contentType);
    })
    .sort((a, b) => a.order - b.order);
}

/** Get a single tool by ID */
export function getToolById(id: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((tool) => tool.id === id);
}

/** Get distinct group IDs for a surface (in order of first appearance) */
export function getToolGroups(
  surface: ToolSurface,
  contentType?: string
): string[] {
  const tools = queryTools({
    surface,
    contentType: contentType as ToolQuery["contentType"],
  });
  const seen = new Set<string>();
  const groups: string[] = [];
  for (const tool of tools) {
    if (tool.group && !seen.has(tool.group)) {
      seen.add(tool.group);
      groups.push(tool.group);
    }
  }
  return groups;
}
