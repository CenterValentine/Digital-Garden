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
    // Lives in the toolbar rather than beside the document title: it is a view
    // control like the rest of the toolbar, and the title row needs its width
    // back on phones. Order 10 keeps it in the leftmost position.
    id: "markdown-source",
    label: "Edit markdown source",
    activeLabel: "Apply markdown and return to rich text",
    iconName: "Code2",
    surfaces: ["toolbar"],
    contentTypes: ["note"],
    order: 10,
    group: "view",
    iconOnly: true,
    isToggle: true,
  },
  {
    id: "copy-link",
    label: "Copy Link",
    iconName: "Link2",
    surfaces: ["toolbar"],
    contentTypes: "all",
    order: 30,
    group: "share",
    iconOnly: true,
  },
  {
    id: "share",
    label: "Share settings",
    iconName: "Share2",
    surfaces: ["toolbar"],
    contentTypes: "all",
    order: 40,
    group: "share",
    iconOnly: true,
  },
  {
    id: "save-as-template",
    label: "Save as Template",
    iconName: "BookmarkPlus",
    surfaces: ["toolbar"],
    contentTypes: ["note"],
    order: 50,
    group: "templates",
    iconOnly: true,
  },
  {
    id: "import-markdown",
    label: "Import",
    iconName: "Upload",
    surfaces: ["toolbar"],
    contentTypes: "all",
    order: 75,
    group: "import",
    iconOnly: true,
  },
  {
    id: "export-markdown",
    label: "Export",
    iconName: "Download",
    surfaces: ["toolbar"],
    // Databases export too (plan Phase 7): the route returns CSV for data
    // nodes regardless of requested format.
    contentTypes: ["note", "data"],
    order: 85,
    group: "export",
    iconOnly: true,
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

  // ─── TOOLBELT: Text formatting (matches current BubbleMenu) ───
  {
    id: "bold",
    label: "Bold",
    iconName: "Bold",
    surfaces: ["toolbelt"],
    contentTypes: ["note"],
    order: 10,
    group: "text-format",
    shortcut: "Cmd+B",  // TipTap bold (not the sidebar toggle)
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
  // Outline leads (decision 2026-07-16). The old standalone Links and Tags
  // tabs are MERGED into the Context tab as sub-tabs (links · tags · AI) —
  // see components/content/ai-context/ContextTab.tsx.
  {
    id: "outline-tab",
    label: "Outline",
    iconName: "List",
    surfaces: ["sidebar-tab"],
    contentTypes: ["note", "chat"],
    order: 10,
    tabKey: "outline",
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
  {
    id: "publish-tab",
    label: "Publish",
    iconName: "Globe",
    surfaces: ["sidebar-tab"],
    contentTypes: ["note", "file", "html", "code"],
    order: 50,
    tabKey: "publish",
  },
  // Context hub: links + tags + AI metadata sub-tabs — all core surfaces
  // (components/content/ai-context/ContextTab.tsx). The AI context layer
  // graduated out of the studio extension, so nothing here follows studio
  // enablement; per-node governance is contextMode.
  {
    id: "context-tab",
    label: "Context",
    iconName: "FileText",
    surfaces: ["sidebar-tab"],
    contentTypes: "all",
    order: 20,
    tabKey: "context",
  },
  // Studio tab — filtered out in the sidebar when the extension is disabled
  // (see RightSidebar/RightSidebarHeader), the registry-filter rule for
  // extension-owned surfaces.
  {
    id: "studio-tab",
    label: "Studio",
    iconName: "LampDesk",
    surfaces: ["sidebar-tab"],
    contentTypes: ["folder"],
    order: 60,
    tabKey: "studio",
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
