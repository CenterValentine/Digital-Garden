/**
 * BubbleMenu Component
 *
 * Floating toolbar that appears when text is selected.
 * Reads tool definitions from the Tool Surfaces registry for ordering
 * and grouping, while keeping editor commands local.
 *
 * Fallback: renders original hardcoded buttons if registry is unavailable.
 */

"use client";

import { useMemo, type ComponentType } from "react";
import { BubbleMenu as TipTapBubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link as LinkIcon,
  Heading1,
  Heading2,
  Heading3,
} from "lucide-react";
import { useToolSurface } from "@/lib/domain/tools";
import type { ToolInstance } from "@/lib/domain/tools";

// Create unique plugin key for this bubble menu
const textFormattingBubbleMenuKey = new PluginKey("textFormattingBubbleMenu");

/** Map tool IDs to lucide icons (local to BubbleMenu) */
const TOOLBELT_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  bold: Bold,
  italic: Italic,
  strikethrough: Strikethrough,
  "code-inline": Code,
  link: LinkIcon,
  "heading-1": Heading1,
  "heading-2": Heading2,
  "heading-3": Heading3,
};

/** Map tool IDs to editor commands (local to BubbleMenu) */
function getEditorCommand(
  toolId: string,
  editor: Editor,
  onLinkClick?: () => void
): (() => void) | undefined {
  const commands: Record<string, () => void> = {
    bold: () => editor.chain().focus().toggleBold().run(),
    italic: () => editor.chain().focus().toggleItalic().run(),
    strikethrough: () => editor.chain().focus().toggleStrike().run(),
    "code-inline": () => editor.chain().focus().toggleCode().run(),
    link: () => {
      if (editor.isActive("link")) {
        editor.chain().focus().unsetLink().run();
      } else {
        onLinkClick?.();
      }
    },
    "heading-1": () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    "heading-2": () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    "heading-3": () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  };
  return commands[toolId];
}

/** Map tool IDs to editor active-state checks */
function isToolActive(toolId: string, editor: Editor): boolean {
  const checks: Record<string, () => boolean> = {
    bold: () => editor.isActive("bold"),
    italic: () => editor.isActive("italic"),
    strikethrough: () => editor.isActive("strike"),
    "code-inline": () => editor.isActive("code"),
    link: () => editor.isActive("link"),
    "heading-1": () => editor.isActive("heading", { level: 1 }),
    "heading-2": () => editor.isActive("heading", { level: 2 }),
    "heading-3": () => editor.isActive("heading", { level: 3 }),
  };
  return checks[toolId]?.() ?? false;
}

/** Get tooltip text for a tool */
function getToolTitle(toolId: string, editor: Editor, shortcut?: string): string {
  if (toolId === "link") {
    return editor.isActive("link") ? "Remove Link" : `Add Link${shortcut ? ` (${shortcut})` : ""}`;
  }
  const label =
    toolId === "code-inline" ? "Inline Code" :
    toolId === "heading-1" ? "Heading 1" :
    toolId === "heading-2" ? "Heading 2" :
    toolId === "heading-3" ? "Heading 3" :
    toolId.charAt(0).toUpperCase() + toolId.slice(1);
  return shortcut ? `${label} (${shortcut})` : label;
}

export interface BubbleMenuProps {
  editor: Editor | null;
  onLinkClick?: () => void;
}

export function BubbleMenu({ editor, onLinkClick }: BubbleMenuProps) {
  const toolSurface = useToolSurface();

  // Get toolbelt tools from registry, sorted by order
  const tools = useMemo(() => {
    return toolSurface?.getToolsForSurface("toolbelt") ?? [];
  }, [toolSurface]);

  if (!editor) return null;

  // Group tools by group ID for visual separation (dividers between groups)
  const groups: { groupId: string; tools: ToolInstance[] }[] = [];
  let currentGroup = "";
  for (const tool of tools) {
    const group = tool.definition.group ?? "";
    if (group !== currentGroup) {
      groups.push({ groupId: group, tools: [] });
      currentGroup = group;
    }
    groups[groups.length - 1].tools.push(tool);
  }

  // Shared TipTap BubbleMenu wrapper (same for both paths)
  const menuWrapper = (children: React.ReactNode) => (
    <TipTapBubbleMenu
      editor={editor}
      pluginKey={textFormattingBubbleMenuKey}
      updateDelay={100}
      shouldShow={({ state, editor: ed }) => {
        const { selection } = state;
        const { empty } = selection;
        if (empty) return false;
        if (ed.isActive("table")) return false;
        return true;
      }}
      className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/80 p-1 shadow-lg backdrop-blur-md"
    >
      {children}
    </TipTapBubbleMenu>
  );

  // ─── Registry-driven path ───
  if (groups.length > 0) {
    return menuWrapper(
      <>
        {groups.map((group, groupIdx) => (
          <div key={group.groupId} className="flex items-center gap-1">
            {groupIdx > 0 && <div className="mx-1 h-6 w-px bg-white/10" />}

            {group.tools.map((tool) => {
              const IconComponent = TOOLBELT_ICONS[tool.definition.id];
              const active = isToolActive(tool.definition.id, editor);
              const command = getEditorCommand(
                tool.definition.id,
                editor,
                onLinkClick
              );

              return (
                <button
                  key={tool.definition.id}
                  onClick={() => command?.()}
                  className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
                    active ? "bg-white/20 text-white" : "text-gray-400"
                  }`}
                  title={getToolTitle(
                    tool.definition.id,
                    editor,
                    tool.definition.shortcut
                  )}
                  type="button"
                >
                  {IconComponent && <IconComponent className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
        ))}
      </>
    );
  }

  // ─── Fallback: original hardcoded buttons (safety net) ───
  return menuWrapper(
    <>
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
          editor.isActive("bold") ? "bg-white/20 text-white" : "text-gray-400"
        }`}
        title="Bold (Cmd+B)"
        type="button"
      >
        <Bold className="h-4 w-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
          editor.isActive("italic") ? "bg-white/20 text-white" : "text-gray-400"
        }`}
        title="Italic (Cmd+I)"
        type="button"
      >
        <Italic className="h-4 w-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
          editor.isActive("strike") ? "bg-white/20 text-white" : "text-gray-400"
        }`}
        title="Strikethrough"
        type="button"
      >
        <Strikethrough className="h-4 w-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
          editor.isActive("code") ? "bg-white/20 text-white" : "text-gray-400"
        }`}
        title="Inline Code (Cmd+E)"
        type="button"
      >
        <Code className="h-4 w-4" />
      </button>
      <div className="mx-1 h-6 w-px bg-white/10" />
      <button
        onClick={() => {
          if (editor.isActive("link")) {
            editor.chain().focus().unsetLink().run();
          } else {
            onLinkClick?.();
          }
        }}
        className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
          editor.isActive("link") ? "bg-white/20 text-white" : "text-gray-400"
        }`}
        title={editor.isActive("link") ? "Remove Link" : "Add Link (Cmd+K)"}
        type="button"
      >
        <LinkIcon className="h-4 w-4" />
      </button>
      <div className="mx-1 h-6 w-px bg-white/10" />
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
          editor.isActive("heading", { level: 1 }) ? "bg-white/20 text-white" : "text-gray-400"
        }`}
        title="Heading 1"
        type="button"
      >
        <Heading1 className="h-4 w-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
          editor.isActive("heading", { level: 2 }) ? "bg-white/20 text-white" : "text-gray-400"
        }`}
        title="Heading 2"
        type="button"
      >
        <Heading2 className="h-4 w-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
          editor.isActive("heading", { level: 3 }) ? "bg-white/20 text-white" : "text-gray-400"
        }`}
        title="Heading 3"
        type="button"
      >
        <Heading3 className="h-4 w-4" />
      </button>
    </>
  );
}
