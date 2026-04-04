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

import { type ComponentType, useState, useEffect, useRef, useCallback } from "react";
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
  Copy,
  ClipboardPaste,
  LayoutTemplate,
  TextQuote,
  Paintbrush,
} from "lucide-react";
import { queryTools } from "@/lib/domain/tools";
import type { ToolDefinition } from "@/lib/domain/tools";
import { useContextMenuStore } from "@/state/context-menu-store";

// Create unique plugin key for this bubble menu
const textFormattingBubbleMenuKey = new PluginKey("textFormattingBubbleMenu");

/**
 * Prevent focus theft — keeps editor selection alive when clicking toolbar buttons.
 * Only preventDefault is needed — this stops the browser from moving focus to the
 * clicked button. Do NOT use stopPropagation here: TipTap's BubbleMenu plugin
 * needs the mousedown event to propagate so it can track that an interaction
 * occurred within the menu and keep it visible.
 */
const preventFocusLoss = (e: React.MouseEvent) => {
  e.preventDefault();
};

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

/**
 * Map tool IDs to editor commands.
 *
 * NOTE: We intentionally omit .focus() from the chain. The editor already
 * has focus because preventFocusLoss() calls e.preventDefault() on mousedown,
 * which stops the browser from moving focus to the clicked button. Adding
 * .focus() is not only redundant but harmful — it can trigger a focus→blur→focus
 * cycle that exhausts the plugin's one-shot `preventHide` flag, causing the
 * BubbleMenu to hide itself on the subsequent blur.
 */
function getEditorCommand(
  toolId: string,
  editor: Editor,
  onLinkClick?: () => void
): (() => void) | undefined {
  const commands: Record<string, () => void> = {
    bold: () => editor.chain().toggleBold().run(),
    italic: () => editor.chain().toggleItalic().run(),
    strikethrough: () => editor.chain().toggleStrike().run(),
    "code-inline": () => editor.chain().toggleCode().run(),
    link: () => {
      if (editor.isActive("link")) {
        editor.chain().unsetLink().run();
      } else {
        onLinkClick?.();
      }
    },
    "heading-1": () => editor.chain().toggleHeading({ level: 1 }).run(),
    "heading-2": () => editor.chain().toggleHeading({ level: 2 }).run(),
    "heading-3": () => editor.chain().toggleHeading({ level: 3 }).run(),
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

/**
 * Stable shouldShow callback — defined at module level to avoid creating
 * a new function reference on every render. The TipTap React BubbleMenu
 * wrapper includes `shouldShow` in its useEffect dependency array; an
 * inline arrow function creates a new reference each render, triggering
 * constant `updateOptions` transaction dispatches.
 */
const bubbleMenuShouldShow = ({
  state,
  editor: ed,
}: {
  editor: Editor;
  element: HTMLElement;
  view: import("@tiptap/pm/view").EditorView;
  state: import("@tiptap/pm/state").EditorState;
  oldState?: import("@tiptap/pm/state").EditorState;
  from: number;
  to: number;
}): boolean => {
  const { selection } = state;
  const { empty } = selection;
  if (empty) return false;
  if (ed.isActive("table")) return false;
  if (ed.isActive("image")) return false;
  return true;
};

/** Captured inline + block formatting snapshot */
interface CapturedFormat {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
  heading: 1 | 2 | 3 | null;
}

/** Read the active formatting at the current selection */
function captureFormat(editor: Editor): CapturedFormat {
  return {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    strike: editor.isActive("strike"),
    code: editor.isActive("code"),
    heading: editor.isActive("heading", { level: 1 }) ? 1
      : editor.isActive("heading", { level: 2 }) ? 2
      : editor.isActive("heading", { level: 3 }) ? 3
      : null,
  };
}

/** Apply a captured format snapshot to the current selection */
function applyFormat(editor: Editor, fmt: CapturedFormat) {
  const chain = editor.chain();

  // Toggle each inline mark to match the captured state
  if (fmt.bold !== editor.isActive("bold")) chain.toggleBold();
  if (fmt.italic !== editor.isActive("italic")) chain.toggleItalic();
  if (fmt.strike !== editor.isActive("strike")) chain.toggleStrike();
  if (fmt.code !== editor.isActive("code")) chain.toggleCode();

  // Block-level: heading or paragraph
  if (fmt.heading) {
    if (!editor.isActive("heading", { level: fmt.heading })) {
      chain.setHeading({ level: fmt.heading });
    }
  } else if (editor.isActive("heading")) {
    chain.setParagraph();
  }

  chain.run();
}

export interface BubbleMenuProps {
  editor: Editor | null;
  onLinkClick?: () => void;
}

export function BubbleMenu({ editor, onLinkClick }: BubbleMenuProps) {
  const [paintMode, setPaintMode] = useState(false);
  const fmtRef = useRef<CapturedFormat | null>(null);
  const originRef = useRef<{ from: number; to: number } | null>(null);

  // Apply format when the user makes a new non-empty selection in paint mode
  const handleSelectionUpdate = useCallback(() => {
    if (!editor || !fmtRef.current) return;
    const { from, to } = editor.state.selection;
    if (from === to) return; // empty — user is still clicking around
    const orig = originRef.current;
    if (orig && orig.from === from && orig.to === to) return; // same selection
    applyFormat(editor, fmtRef.current);
    fmtRef.current = null;
    originRef.current = null;
    setPaintMode(false);
  }, [editor]);

  // Subscribe/unsubscribe to selectionUpdate based on paint mode
  useEffect(() => {
    if (!editor) return;
    if (paintMode) {
      editor.on("selectionUpdate", handleSelectionUpdate);
    }
    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate);
    };
  }, [editor, paintMode, handleSelectionUpdate]);

  // Add/remove cursor class on the editor DOM
  useEffect(() => {
    if (!editor) return;
    const el = editor.view.dom;
    if (paintMode) {
      el.style.cursor = "crosshair";
    } else {
      el.style.cursor = "";
    }
    return () => { el.style.cursor = ""; };
  }, [editor, paintMode]);

  // Cancel paint mode on Escape
  useEffect(() => {
    if (!paintMode) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        fmtRef.current = null;
        originRef.current = null;
        setPaintMode(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [paintMode]);

  if (!editor) {
    return null;
  }

  return (
    <TipTapBubbleMenu
      editor={editor}
      pluginKey={textFormattingBubbleMenuKey}
      updateDelay={100}
      shouldShow={bubbleMenuShouldShow}
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

      {/* Copy / Paste */}
      <div className="flex items-center gap-1">
        <div className="mx-1 h-6 w-px bg-white/10" />
        <button
          onMouseDown={preventFocusLoss}
          onClick={() => {
            const { from, to } = editor.state.selection;
            if (from !== to) {
              const text = editor.state.doc.textBetween(from, to, "\n");
              navigator.clipboard.writeText(text).catch(() => {});
            }
          }}
          className="rounded p-1.5 transition-colors hover:bg-white/10 text-gray-400"
          title="Copy (⌘C)"
          type="button"
        >
          <Copy className="h-4 w-4" />
        </button>
        <button
          onMouseDown={preventFocusLoss}
          onClick={async () => {
            try {
              const text = await navigator.clipboard.readText();
              if (text) editor.chain().insertContent(text).run();
            } catch { /* clipboard permission denied */ }
          }}
          className="rounded p-1.5 transition-colors hover:bg-white/10 text-gray-400"
          title="Paste (⌘V)"
          type="button"
        >
          <ClipboardPaste className="h-4 w-4" />
        </button>
      </div>

      {/* Format Painter */}
      <div className="flex items-center gap-1">
        <div className="mx-1 h-6 w-px bg-white/10" />
        <button
          onMouseDown={preventFocusLoss}
          onClick={() => {
            if (paintMode) {
              // Toggle off
              fmtRef.current = null;
              originRef.current = null;
              setPaintMode(false);
            } else {
              const { from, to } = editor.state.selection;
              if (from !== to) {
                fmtRef.current = captureFormat(editor);
                originRef.current = { from, to };
                setPaintMode(true);
              }
            }
          }}
          className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
            paintMode ? "bg-amber-500/30 text-amber-300" : "text-gray-400"
          }`}
          title={paintMode ? "Format Painter (active — Esc to cancel)" : "Format Painter"}
          type="button"
        >
          <Paintbrush className="h-4 w-4" />
        </button>
      </div>

      {/* Save selection as Template / Snippet */}
      <div className="flex items-center gap-1">
        <div className="mx-1 h-6 w-px bg-white/10" />
        <button
          onMouseDown={preventFocusLoss}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            useContextMenuStore.getState().openMenu(
              "main-editor",
              { x: rect.left, y: rect.bottom + 4 },
              { hasSelection: true, bubbleMenuAction: "save-template" },
            );
          }}
          className="rounded p-1.5 transition-colors hover:bg-white/10 text-gray-400"
          title="Save as Template"
          type="button"
        >
          <LayoutTemplate className="h-4 w-4" />
        </button>
        <button
          onMouseDown={preventFocusLoss}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            useContextMenuStore.getState().openMenu(
              "main-editor",
              { x: rect.left, y: rect.bottom + 4 },
              { hasSelection: true, bubbleMenuAction: "save-snippet" },
            );
          }}
          className="rounded p-1.5 transition-colors hover:bg-white/10 text-gray-400"
          title="Save as Snippet"
          type="button"
        >
          <TextQuote className="h-4 w-4" />
        </button>
      </div>
    </TipTapBubbleMenu>
  );
}
