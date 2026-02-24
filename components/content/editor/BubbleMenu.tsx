/**
 * BubbleMenu Component
 *
 * Floating toolbar that appears when text is selected.
 * Uses tool definitions from the registry for ordering and grouping,
 * but reads them statically (no React hooks) to avoid interfering
 * with TipTap's internal ProseMirror plugin lifecycle.
 *
 * Editor commands and active-state checks remain local.
 *
 * Note: All buttons use onMouseDown={e => e.preventDefault()} to prevent
 * the browser from stealing focus from the editor, which would collapse
 * the selection and permanently hide the bubble menu.
 */

"use client";

import type { ComponentType } from "react";
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
import { queryTools } from "@/lib/domain/tools";
import type { ToolDefinition } from "@/lib/domain/tools";

// Create unique plugin key for this bubble menu
const textFormattingBubbleMenuKey = new PluginKey("textFormattingBubbleMenu");

/** Prevent focus theft — keeps editor selection alive when clicking toolbar buttons */
const preventFocusLoss = (e: React.MouseEvent) => e.preventDefault();

// ─── Static registry data (computed once at module load, no hooks) ───

const TOOLBELT_TOOLS = queryTools({ surface: "toolbelt", contentType: "note" });

/** Pre-computed groups for divider placement */
const TOOLBELT_GROUPS: { groupId: string; tools: ToolDefinition[] }[] = [];
{
  let currentGroup = "";
  for (const tool of TOOLBELT_TOOLS) {
    const group = tool.group ?? "";
    if (group !== currentGroup) {
      TOOLBELT_GROUPS.push({ groupId: group, tools: [] });
      currentGroup = group;
    }
    TOOLBELT_GROUPS[TOOLBELT_GROUPS.length - 1].tools.push(tool);
  }
}

/** Map tool IDs to lucide icons */
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

/** Map tool IDs to editor commands */
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
  if (!editor) {
    return null;
  }

  return (
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
      {TOOLBELT_GROUPS.map((group, groupIdx) => (
        <div key={group.groupId} className="flex items-center gap-1">
          {groupIdx > 0 && <div className="mx-1 h-6 w-px bg-white/10" />}

          {group.tools.map((tool) => {
            const IconComponent = TOOLBELT_ICONS[tool.id];
            const active = isToolActive(tool.id, editor);
            const command = getEditorCommand(tool.id, editor, onLinkClick);

            return (
              <button
                key={tool.id}
                onMouseDown={preventFocusLoss}
                onClick={() => command?.()}
                className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
                  active ? "bg-white/20 text-white" : "text-gray-400"
                }`}
                title={getToolTitle(tool.id, editor, tool.shortcut)}
                type="button"
              >
                {IconComponent && <IconComponent className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      ))}
    </TipTapBubbleMenu>
  );
}
