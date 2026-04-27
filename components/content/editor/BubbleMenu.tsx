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

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { BubbleMenu as TipTapBubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/core";
import { NodeSelection, PluginKey } from "@tiptap/pm/state";
import {
  Bold,
  Check,
  ClipboardPaste,
  Copy,
  Italic,
  LayoutTemplate,
  Link2Off,
  Link as LinkIcon,
  Paintbrush,
  Strikethrough,
  Code,
  TextQuote,
  X,
  Heading1,
  Heading2,
  Heading3,
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

type LinkSegment = {
  href: string;
  from: number;
  to: number;
};

type SelectionFormattingState = {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  code: boolean;
  heading1: boolean;
  heading2: boolean;
  heading3: boolean;
  links: LinkSegment[];
};

type LinkEditorTarget = {
  href: string;
  from: number;
  to: number;
  existing: boolean;
};

const EMPTY_FORMATTING: SelectionFormattingState = {
  bold: false,
  italic: false,
  strikethrough: false,
  code: false,
  heading1: false,
  heading2: false,
  heading3: false,
  links: [],
};

function getSelectionFormattingState(editor: Editor): SelectionFormattingState {
  const { state } = editor;
  const { selection, doc } = state;
  if (selection.empty) return EMPTY_FORMATTING;

  const summary: SelectionFormattingState = {
    ...EMPTY_FORMATTING,
    links: [],
  };

  let lastLink: LinkSegment | null = null;

  doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    const start = Math.max(selection.from, pos);
    const end = Math.min(selection.to, pos + node.nodeSize);
    if (start >= end) return;

    if (node.type.name === "heading") {
      const level = Number(node.attrs.level);
      if (level === 1) summary.heading1 = true;
      if (level === 2) summary.heading2 = true;
      if (level === 3) summary.heading3 = true;
    }

    if (!node.isText) return;

    for (const mark of node.marks) {
      if (mark.type.name === "bold") summary.bold = true;
      if (mark.type.name === "italic") summary.italic = true;
      if (mark.type.name === "strike") summary.strikethrough = true;
      if (mark.type.name === "code") summary.code = true;
      if (mark.type.name === "link") {
        const href = String(mark.attrs.href || "");
        if (lastLink && lastLink.href === href && lastLink.to === start) {
          lastLink.to = end;
        } else {
          lastLink = { href, from: start, to: end };
          summary.links.push(lastLink);
        }
      }
    }
  });

  return summary;
}

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
    link: () => onLinkClick?.(),
    "heading-1": () => editor.chain().toggleHeading({ level: 1 }).run(),
    "heading-2": () => editor.chain().toggleHeading({ level: 2 }).run(),
    "heading-3": () => editor.chain().toggleHeading({ level: 3 }).run(),
  };
  return commands[toolId];
}

/** Map tool IDs to editor active-state checks */
function isToolActive(toolId: string, formatting: SelectionFormattingState): boolean {
  const checks: Record<string, boolean> = {
    bold: formatting.bold,
    italic: formatting.italic,
    strikethrough: formatting.strikethrough,
    "code-inline": formatting.code,
    link: formatting.links.length > 0,
    "heading-1": formatting.heading1,
    "heading-2": formatting.heading2,
    "heading-3": formatting.heading3,
  };
  return checks[toolId] ?? false;
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

/** Captured inline + block formatting snapshot for Format Painter */
interface CapturedFormat {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  code: boolean;
  heading: 1 | 2 | 3 | null;
}

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

function applyFormat(editor: Editor, fmt: CapturedFormat) {
  const chain = editor.chain();
  if (fmt.bold !== editor.isActive("bold")) chain.toggleBold();
  if (fmt.italic !== editor.isActive("italic")) chain.toggleItalic();
  if (fmt.strike !== editor.isActive("strike")) chain.toggleStrike();
  if (fmt.code !== editor.isActive("code")) chain.toggleCode();
  if (fmt.heading) {
    if (!editor.isActive("heading", { level: fmt.heading })) chain.setHeading({ level: fmt.heading });
  } else if (editor.isActive("heading")) {
    chain.setParagraph();
  }
  chain.run();
}

export function BubbleMenu({ editor, onLinkClick }: BubbleMenuProps) {
  const [, forceRender] = useState(0);
  const [linkEditorTarget, setLinkEditorTarget] = useState<LinkEditorTarget | null>(null);
  const [linkInputValue, setLinkInputValue] = useState("");
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [paintMode, setPaintMode] = useState(false);
  const fmtRef = useRef<CapturedFormat | null>(null);
  const originRef = useRef<{ from: number; to: number } | null>(null);

  useEffect(() => {
    if (!editor) return;
    const rerender = () => forceRender((value) => value + 1);
    editor.on("selectionUpdate", rerender);
    editor.on("transaction", rerender);
    editor.on("focus", rerender);
    editor.on("blur", rerender);
    return () => {
      editor.off("selectionUpdate", rerender);
      editor.off("transaction", rerender);
      editor.off("focus", rerender);
      editor.off("blur", rerender);
    };
  }, [editor]);

  // Apply format when user makes a new selection in paint mode
  useEffect(() => {
    if (!editor || !paintMode) return () => {};
    const handleSelectionUpdate = () => {
      if (!fmtRef.current) return;
      const { from, to } = editor.state.selection;
      if (from === to) return;
      const orig = originRef.current;
      if (orig && orig.from === from && orig.to === to) return;
      applyFormat(editor, fmtRef.current);
      fmtRef.current = null;
      originRef.current = null;
      setPaintMode(false);
    };
    editor.on("selectionUpdate", handleSelectionUpdate);
    return () => editor.off("selectionUpdate", handleSelectionUpdate);
  }, [editor, paintMode]);

  // Crosshair cursor in paint mode
  useEffect(() => {
    if (!editor) return () => {};
    const el = editor.view.dom as HTMLElement;
    el.style.cursor = paintMode ? "crosshair" : "";
    return () => { el.style.cursor = ""; };
  }, [editor, paintMode]);

  useEffect(() => {
    if (!paintMode) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { fmtRef.current = null; originRef.current = null; setPaintMode(false); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [paintMode]);

  const formatting = editor ? getSelectionFormattingState(editor) : EMPTY_FORMATTING;
  const visibleLinks = formatting.links.slice(0, 3);

  const openLinkEditor = useCallback(
    (target?: LinkSegment) => {
      if (!editor) return;
      const currentSelection = editor.state.selection;
      const nextTarget: LinkEditorTarget = target
        ? {
            href: target.href,
            from: target.from,
            to: target.to,
            existing: true,
          }
        : {
            href: String(editor.getAttributes("link").href || ""),
            from: currentSelection.from,
            to: currentSelection.to,
            existing: editor.isActive("link"),
          };

      setLinkEditorTarget(nextTarget);
      setLinkInputValue(nextTarget.href);
    },
    [editor]
  );

  const closeLinkEditor = useCallback(() => {
    setLinkEditorTarget(null);
    setLinkInputValue("");
  }, []);

  const applyLink = useCallback(() => {
    if (!editor || !linkEditorTarget) return;
    const rawUrl = linkInputValue.trim();
    if (!rawUrl) return;

    let finalUrl = rawUrl;
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    if (linkEditorTarget.from !== linkEditorTarget.to) {
      let chain = editor
        .chain()
        .focus()
        .setTextSelection({ from: linkEditorTarget.from, to: linkEditorTarget.to });
      if (linkEditorTarget.existing) {
        chain = chain.extendMarkRange("link");
      }
      chain.setLink({ href: finalUrl }).run();
    } else {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          marks: [{ type: "link", attrs: { href: finalUrl } }],
          text: finalUrl,
        })
        .run();
    }

    closeLinkEditor();
  }, [closeLinkEditor, editor, linkEditorTarget, linkInputValue]);

  const removeLink = useCallback(() => {
    if (!editor || !linkEditorTarget) return;

    let chain = editor
      .chain()
      .focus()
      .setTextSelection({ from: linkEditorTarget.from, to: linkEditorTarget.to });
    if (linkEditorTarget.existing) {
      chain = chain.extendMarkRange("link");
    }
    chain.unsetLink().run();
    closeLinkEditor();
  }, [closeLinkEditor, editor, linkEditorTarget]);

  const shouldShow = useCallback(
    ({
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
      if (linkEditorTarget) return true;
      const { selection } = state;
      const { empty } = selection;
      if (empty) return false;
      if (selection instanceof NodeSelection) return false;
      if (ed.isActive("table")) return false;
      if (ed.isActive("image")) return false;
      return true;
    },
    [linkEditorTarget]
  );

  useEffect(() => {
    if (!linkEditorTarget) return;
    const timer = setTimeout(() => {
      linkInputRef.current?.focus();
      linkInputRef.current?.select();
    }, 0);
    return () => clearTimeout(timer);
  }, [linkEditorTarget]);

  if (!editor) {
    return null;
  }

  return (
    <TipTapBubbleMenu
      editor={editor}
      pluginKey={textFormattingBubbleMenuKey}
      updateDelay={100}
      shouldShow={shouldShow}
      className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/80 p-2 shadow-lg backdrop-blur-md"
    >
      <div className="flex items-center gap-1">
        {TOOLBELT_GROUPS.map((group, groupIdx) => (
          <div key={group.groupId} className="flex items-center gap-1">
            {groupIdx > 0 && <div className="mx-1 h-6 w-px bg-white/10" />}

            {group.tools.map((tool) => {
              const IconComponent = TOOLBELT_ICONS[tool.id];
              const active = isToolActive(tool.id, formatting);
              const command = getEditorCommand(tool.id, editor, onLinkClick);

              if (tool.id === "link") {
                const linkTargets = visibleLinks.length > 0 ? visibleLinks : [null];
                return (
                  <div key={tool.id} className="flex items-center gap-1">
                    {linkTargets.map((linkTarget, linkIndex) => (
                      <button
                        key={`${tool.id}-${linkTarget?.href || "new"}-${linkIndex}`}
                        onMouseDown={preventFocusLoss}
                        onClick={() => openLinkEditor(linkTarget ?? undefined)}
                        className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
                          linkTarget ? "bg-white/20 text-white" : "text-gray-400"
                        }`}
                        title={
                          linkTarget
                            ? `Edit Link ${linkIndex + 1}: ${linkTarget.href}`
                            : getToolTitle(tool.id, editor, tool.shortcut)
                        }
                        type="button"
                      >
                        <LinkIcon className="h-4 w-4" />
                      </button>
                    ))}
                  </div>
                );
              }

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
            title={paintMode ? "Format Painter active — select to apply (Esc to cancel)" : "Format Painter"}
            type="button"
          >
            <Paintbrush className="h-4 w-4" />
          </button>
        </div>

        {/* Save as Template / Snippet */}
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
      </div>
      {linkEditorTarget && (
        <>
          <div className="h-px w-full bg-white/10" />
          <div
            className="flex items-center gap-1"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <input
              ref={linkInputRef}
              type="url"
              value={linkInputValue}
              onChange={(e) => setLinkInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  closeLinkEditor();
                }
              }}
              className="w-44 rounded bg-white/10 px-2 py-1 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-white/30"
              placeholder="https://example.com"
            />
            {linkEditorTarget.existing && (
              <button
                type="button"
                onMouseDown={preventFocusLoss}
                onClick={removeLink}
                className="rounded p-1.5 text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                title="Remove link"
              >
                <Link2Off className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onMouseDown={preventFocusLoss}
              onClick={applyLink}
              className="rounded p-1.5 text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
              title="Apply link"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onMouseDown={preventFocusLoss}
              onClick={closeLinkEditor}
              className="rounded p-1.5 text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </TipTapBubbleMenu>
  );
}
