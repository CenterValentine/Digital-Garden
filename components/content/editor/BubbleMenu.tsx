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
  EyeOff,
  Italic,
  LayoutTemplate,
  Link2Off,
  Link as LinkIcon,
  MessageSquarePlus,
  Paintbrush,
  Strikethrough,
  Code,
  TextQuote,
  Volume2,
  X,
  Heading1,
  Heading2,
  Heading3,
  Heading,
  MoreHorizontal,
} from "lucide-react";
import type { JSONContent } from "@tiptap/core";
import { toast } from "sonner";
import { queryTools } from "@/lib/domain/tools";
import type { ToolDefinition } from "@/lib/domain/tools";
import { useContextMenuStore } from "@/state/context-menu-store";
import { useCommentsStore } from "@/state/comments-store";
import { ttsController } from "@/lib/features/tts";
import { extractReadableText } from "@/lib/domain/editor/tts/extract-readable-text";
import { pendingCommentRange, setPendingCommentRange } from "@/lib/domain/editor/extensions/comment-plugin";
import { COMMENT_ANCHOR_CONTEXT_MAX, COMMENT_ANCHOR_QUOTE_MAX } from "@/lib/domain/comments/types";
import { CommentComposer } from "@/components/content/comments/CommentComposer";
import { revealCommentThread } from "@/components/content/comments/reveal";

// Create unique plugin key for this bubble menu
const textFormattingBubbleMenuKey = new PluginKey("textFormattingBubbleMenu");

/**
 * Touch devices: place the menu BELOW the selection. iOS draws its native
 * Cut/Copy/Paste callout directly ABOVE the selection — exactly where Floating
 * UI's default 'top' placement puts this menu — leaving ours covered and
 * unusable (observed on-device, 2026-07-16). Below the selection, both menus
 * coexist. Desktop keeps the default 'top'.
 *
 * Read once at module level: pointer type doesn't change mid-session, and this
 * component intentionally avoids hooks (see header comment re: TipTap plugin
 * lifecycle).
 */
const IS_COARSE_POINTER =
  typeof window !== "undefined" &&
  window.matchMedia?.("(pointer: coarse)").matches === true;

/**
 * MUST be a module-level constant, not an inline literal at the render site.
 * TipTap's BubbleMenu re-initializes its floating plugin whenever the
 * `options` identity changes; an inline `{ placement: "bottom" }` is a fresh
 * object every render → plugin update → state change → re-render → infinite
 * loop ("Maximum update depth exceeded"). Desktop never hit it because its
 * options are `undefined` (stable) — the loop only armed on coarse-pointer
 * devices (caught in the P0 shell smoke, 2026-08-14).
 */
const COARSE_POINTER_MENU_OPTIONS = { placement: "bottom" as const };

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

/** A comment thread's anchor overlapping the selection (the link-segment shape). */
type CommentSegment = {
  threadId: string;
  from: number;
  to: number;
};

type SelectionFormattingState = {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  code: boolean;
  /** Private (commented-out) text or a private block in the selection. */
  private: boolean;
  heading1: boolean;
  heading2: boolean;
  heading3: boolean;
  links: LinkSegment[];
  comments: CommentSegment[];
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
  private: false,
  heading1: false,
  heading2: false,
  heading3: false,
  links: [],
  comments: [],
};

function getSelectionFormattingState(editor: Editor): SelectionFormattingState {
  const { state } = editor;
  const { selection, doc } = state;
  if (selection.empty) return EMPTY_FORMATTING;

  const summary: SelectionFormattingState = {
    ...EMPTY_FORMATTING,
    links: [],
    comments: [],
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
    if (node.type.name === "privateBlock") summary.private = true;

    if (!node.isText) return;

    for (const mark of node.marks) {
      if (mark.type.name === "bold") summary.bold = true;
      if (mark.type.name === "italic") summary.italic = true;
      if (mark.type.name === "strike") summary.strikethrough = true;
      if (mark.type.name === "code") summary.code = true;
      if (mark.type.name === "privateText") summary.private = true;
      if (mark.type.name === "comment") {
        const threadId = String(mark.attrs.threadId || "");
        const open = summary.comments.find((segment) => segment.threadId === threadId && segment.to === start);
        if (open) open.to = end;
        else if (threadId) summary.comments.push({ threadId, from: start, to: end });
      }
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
  private: EyeOff,
  link: LinkIcon,
  comment: MessageSquarePlus,
  "heading-1": Heading1,
  "heading-2": Heading2,
  "heading-3": Heading3,
};

// ─── Responsive layout: fold by priority, never wrap ───
//
// The menu must fit the EDITOR it floats over — a split pane, the panel embed,
// a phone — not the viewport. Rather than a second row of icons covering more
// text, groups fold in priority order until the row fits:
//   1. the three heading buttons → one "H" button (opens H1/H2/H3 as a row)
//   2. Save as Template / Snippet → the "⋯" row
//   3. Format Painter → "⋯"
//   4. Copy / Paste / Read aloud → "⋯"
//   5. the "H" button itself → "⋯" (the narrowest phones)
// Bold…Private, Link and Comment never fold. Widths are modelled, not
// measured: every button is the same size, so a slot count is exact enough.

type HeadingsPlacement = "inline" | "button" | "overflow";
type FoldableGroup = "templates" | "painter" | "clipboard";

interface ToolbeltLayout {
  headings: HeadingsPlacement;
  overflow: ReadonlySet<FoldableGroup>;
}

const SLOT_PX = 34; // 28px button + 6px gap
const DIVIDER_PX = 13; // 1px rule + mx-1 (4px each side) + gap
const MENU_CHROME_PX = 16 + 2 + 24; // p-2 both sides, border, and a margin so it never kisses the pane edge
const PRIMARY_ITEMS = 7; // bold italic strike code private · link comment
const PRIMARY_GROUPS = 2;

const FULL_LAYOUT: ToolbeltLayout = { headings: "inline", overflow: new Set() };

function layoutWidthPx(layout: ToolbeltLayout): number {
  let items = PRIMARY_ITEMS;
  let groups = PRIMARY_GROUPS;
  if (layout.headings === "inline") {
    items += 3;
    groups += 1;
  } else if (layout.headings === "button") {
    items += 1;
    groups += 1;
  }
  if (!layout.overflow.has("clipboard")) {
    items += 3;
    groups += 1;
  }
  if (!layout.overflow.has("painter")) {
    items += 1;
    groups += 1;
  }
  if (!layout.overflow.has("templates")) {
    items += 2;
    groups += 1;
  }
  if (layout.overflow.size > 0 || layout.headings === "overflow") {
    items += 1; // the ⋯ button
    groups += 1;
  }
  return items * SLOT_PX + (groups - 1) * DIVIDER_PX + MENU_CHROME_PX;
}

function planToolbeltLayout(availableWidth: number): ToolbeltLayout {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return FULL_LAYOUT;
  let layout: ToolbeltLayout = FULL_LAYOUT;
  const steps: Array<(l: ToolbeltLayout) => ToolbeltLayout> = [
    (l) => ({ ...l, headings: "button" }),
    (l) => ({ ...l, overflow: new Set([...l.overflow, "templates"]) }),
    (l) => ({ ...l, overflow: new Set([...l.overflow, "painter"]) }),
    (l) => ({ ...l, overflow: new Set([...l.overflow, "clipboard"]) }),
    (l) => ({ ...l, headings: "overflow" }),
  ];
  for (const step of steps) {
    if (layoutWidthPx(layout) <= availableWidth) break;
    layout = step(layout);
  }
  return layout;
}

/** One secondary action, rendered icon-only in the row or icon + label in the ⋯ row. */
interface ToolbeltAction {
  id: string;
  label: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  /**
   * Absent for the Format Painter: its handler touches refs, and a closure
   * that does so taints every render-time value holding it (the React
   * Compiler's "refs during render" rule). The renderers attach it at the
   * JSX prop site instead, where an event handler may touch refs.
   */
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  activeClassName?: string;
}

const PAINTER_ACTION_ID = "painter";

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
  onLinkClick?: () => void,
  onCommentClick?: () => void
): (() => void) | undefined {
  const commands: Record<string, () => void> = {
    bold: () => editor.chain().toggleBold().run(),
    italic: () => editor.chain().toggleItalic().run(),
    strikethrough: () => editor.chain().toggleStrike().run(),
    "code-inline": () => editor.chain().toggleCode().run(),
    // Same decision the Cmd+/ chord makes: inline mark inside one paragraph,
    // block wrapper across blocks, reversal when already private.
    private: () => editor.chain().togglePrivate().run(),
    link: () => onLinkClick?.(),
    comment: () => onCommentClick?.(),
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
    private: formatting.private,
    link: formatting.links.length > 0,
    comment: formatting.comments.length > 0,
    "heading-1": formatting.heading1,
    "heading-2": formatting.heading2,
    "heading-3": formatting.heading3,
  };
  return checks[toolId] ?? false;
}

/** Get tooltip text for a tool */
function getToolTitle(toolId: string, editor: Editor, shortcut?: string, active = false): string {
  if (toolId === "link") {
    return editor.isActive("link") ? "Remove Link" : `Add Link${shortcut ? ` (${shortcut})` : ""}`;
  }
  if (toolId === "comment") {
    return active ? "View comment" : `Comment${shortcut ? ` (${shortcut})` : ""}`;
  }
  const label =
    toolId === "code-inline" ? "Inline Code" :
    toolId === "private" ? "Private — hidden from AI, publishing and search" :
    toolId === "heading-1" ? "Heading 1" :
    toolId === "heading-2" ? "Heading 2" :
    toolId === "heading-3" ? "Heading 3" :
    toolId.charAt(0).toUpperCase() + toolId.slice(1);
  return shortcut ? `${label} (${shortcut})` : label;
}

// Module-scope helper: writes through a fresh-bound function parameter so the
// React Compiler does not treat the mutation as reaching through `editor`
// (which it considers immutable as a hook argument). The compiler's mutation
// tracker analyzes parameter origins; module-scope helpers break the chain.
function setEditorDomCursor(el: HTMLElement, cursor: string): void {
  el.style.cursor = cursor;
}

/**
 * Arm or disarm the Format Painter. Returns the next paint-mode flag. Lives
 * at module scope for the same reason as setEditorDomCursor: the refs are
 * written through parameters, so the component's handler holds no `.current`.
 */
function togglePainterState(
  editor: Editor,
  painting: boolean,
  fmtRef: React.MutableRefObject<CapturedFormat | null>,
  originRef: React.MutableRefObject<{ from: number; to: number } | null>,
): boolean {
  if (painting) {
    fmtRef.current = null;
    originRef.current = null;
    return false;
  }
  const { from, to } = editor.state.selection;
  if (from === to) return false;
  fmtRef.current = captureFormat(editor);
  originRef.current = { from, to };
  return true;
}

export interface BubbleMenuProps {
  editor: Editor | null;
  /** The note this editor shows — a comment thread is filed under it. */
  contentId?: string | null;
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

export function BubbleMenu({ editor, contentId = null, onLinkClick }: BubbleMenuProps) {
  const [, forceRender] = useState(0);
  const [linkEditorTarget, setLinkEditorTarget] = useState<LinkEditorTarget | null>(null);
  const [linkInputValue, setLinkInputValue] = useState("");
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [paintMode, setPaintMode] = useState(false);
  const fmtRef = useRef<CapturedFormat | null>(null);
  const originRef = useRef<{ from: number; to: number } | null>(null);

  // The comment composer: opened for THIS editor by the Comment button, the
  // ⌘⌥M chord or the context menu (all through the store), hosted here as a
  // second row like the link editor. While it is open the selection wears a
  // provisional (dashed) decoration that maps across collaborators' edits;
  // nothing is written to the document until the comment is posted.
  const composerEditor = useCommentsStore((s) => s.composerEditor);
  const composerNonce = useCommentsStore((s) => s.composerNonce);
  const commentComposerOpen = Boolean(editor) && composerEditor === editor;

  useEffect(() => {
    if (!editor || !commentComposerOpen) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      useCommentsStore.getState().closeComposer();
      return;
    }
    setPendingCommentRange(editor, { from, to });
    return () => {
      setPendingCommentRange(editor, null);
    };
  }, [editor, commentComposerOpen, composerNonce]);

  const closeCommentComposer = useCallback(() => {
    useCommentsStore.getState().closeComposer();
  }, []);

  const handleCommentClick = useCallback(() => {
    if (!editor) return;
    const segments = getSelectionFormattingState(editor).comments;
    // A collaborative note's editor is rebuilt when its provider binds, and
    // a mark applied before that is lost with the first editor. Until the
    // document is editable, viewing an existing thread is fine; anchoring a
    // new one is not.
    if (segments.length === 0 && !editor.isEditable) {
      toast.message("The note is still loading — try again in a moment");
      return;
    }
    if (segments.length === 1) {
      // The passage already carries a thread: view it in place.
      useCommentsStore.getState().requestOpen(segments[0].threadId);
      return;
    }
    if (segments.length > 1 && contentId) {
      revealCommentThread(contentId, segments[0].threadId);
      return;
    }
    useCommentsStore.getState().openComposer(editor);
  }, [contentId, editor]);

  const submitComment = useCallback(
    async (body: string, mentions: string[]) => {
      if (!editor) return;
      if (!contentId) {
        toast.error("This editor isn't attached to a note");
        return;
      }
      if (!editor.isEditable) {
        toast.message("The note is still loading — try again in a moment");
        return;
      }
      const selection = editor.state.selection;
      const range = pendingCommentRange(editor) ?? (selection.empty ? null : { from: selection.from, to: selection.to });
      if (!range || range.from >= range.to) {
        toast.error("Select the text to comment on");
        return;
      }
      const { doc } = editor.state;
      const threadId = crypto.randomUUID();
      const anchor = {
        quote: doc.textBetween(range.from, range.to, " ").slice(0, COMMENT_ANCHOR_QUOTE_MAX),
        before: doc.textBetween(Math.max(0, range.from - COMMENT_ANCHOR_CONTEXT_MAX), range.from, " ").slice(-COMMENT_ANCHOR_CONTEXT_MAX),
        after: doc.textBetween(range.to, Math.min(doc.content.size, range.to + COMMENT_ANCHOR_CONTEXT_MAX), " ").slice(0, COMMENT_ANCHOR_CONTEXT_MAX),
      };
      // Optimistic: the mark lands now, the row follows; a failed save
      // removes the mark again (the flashcard-selection precedent).
      const applied = editor.chain().setTextSelection(range).setComment(threadId).setTextSelection(range.to).run();
      if (!applied) {
        toast.error("Couldn't anchor a comment here");
        return;
      }
      closeCommentComposer();
      try {
        // Not marked active: the mark's own gold is the confirmation. The
        // active ring is for a pinned card or a row chosen in the tab, and
        // a ring left on after posting read as a stuck hover (owner, 2026-10-17).
        await useCommentsStore.getState().create(contentId, { id: threadId, body, anchor, mentions });
      } catch (error) {
        editor.commands.unsetComment(threadId);
        toast.error(error instanceof Error ? error.message : "Couldn't save the comment");
      }
    },
    [closeCommentComposer, contentId, editor],
  );

  // The width the menu may use: the editor's own box (a split pane, the panel
  // embed), capped by the viewport. Starts unbounded (full row) and settles on
  // the ResizeObserver's first callback, which fires on observe.
  const [availableWidth, setAvailableWidth] = useState(Number.POSITIVE_INFINITY);
  // A second row the user opened: the folded headings, or the ⋯ actions.
  const [expandedRow, setExpandedRow] = useState<"headings" | "more" | null>(null);

  useEffect(() => {
    if (!editor || typeof ResizeObserver === "undefined") return;
    const target = editor.view.dom;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? target.getBoundingClientRect().width;
      setAvailableWidth(Math.min(width, window.innerWidth));
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const rerender = () => {
      forceRender((value) => value + 1);
      // A folded row is a moment, not a mode: it closes with the selection.
      if (editor.state.selection.empty) setExpandedRow(null);
    };
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

  // Crosshair cursor in paint mode. Mutation goes through a module-scope
  // helper so the React Compiler doesn't flag it as modifying the `editor`
  // hook argument (see setEditorDomCursor above).
  useEffect(() => {
    if (!editor) return () => {};
    const el = editor.view.dom as HTMLElement;
    setEditorDomCursor(el, paintMode ? "crosshair" : "");
    return () => { setEditorDomCursor(el, ""); };
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
      if (linkEditorTarget || commentComposerOpen) return true;
      const { selection } = state;
      const { empty } = selection;
      if (empty) return false;
      if (selection instanceof NodeSelection) return false;
      if (ed.isActive("table")) return false;
      if (ed.isActive("image")) return false;
      return true;
    },
    [commentComposerOpen, linkEditorTarget]
  );

  useEffect(() => {
    if (!linkEditorTarget) return;
    const timer = setTimeout(() => {
      linkInputRef.current?.focus();
      linkInputRef.current?.select();
    }, 0);
    return () => clearTimeout(timer);
  }, [linkEditorTarget]);

  // The painter's refs are written through a module-scope helper (below):
  // a closure that touches `.current` taints every render-time value that
  // holds it — the action object, the overflow list — as "refs read during
  // render". Parameter rebinding breaks that lineage (the setEditorDomCursor
  // precedent).
  const togglePaintMode = useCallback(() => {
    if (!editor) return;
    setPaintMode(togglePainterState(editor, paintMode, fmtRef, originRef));
  }, [editor, paintMode]);

  if (!editor) {
    return null;
  }

  // ─── Responsive layout for this editor's width ───
  const layout = planToolbeltLayout(availableWidth);
  const headingTools = TOOLBELT_GROUPS.find((group) => group.groupId === "heading")?.tools ?? [];
  const anyHeadingActive = formatting.heading1 || formatting.heading2 || formatting.heading3;

  const clipboardActions: ToolbeltAction[] = [
    {
      id: "copy",
      label: "Copy",
      title: "Copy (⌘C)",
      icon: Copy,
      onClick: () => {
        const { from, to } = editor.state.selection;
        if (from !== to) {
          const text = editor.state.doc.textBetween(from, to, "\n");
          navigator.clipboard.writeText(text).catch(() => {});
        }
      },
    },
    {
      id: "paste",
      label: "Paste",
      title: "Paste (⌘V)",
      icon: ClipboardPaste,
      onClick: () => {
        void navigator.clipboard
          .readText()
          .then((text) => {
            if (text) editor.chain().insertContent(text).run();
          })
          .catch(() => {
            /* clipboard permission denied */
          });
      },
    },
    {
      // Runs the slice through the TTS extractor so non-narratable nodes
      // (code, diagrams) in the selection are skipped.
      id: "read-aloud",
      label: "Read aloud",
      title: "Read selection aloud",
      icon: Volume2,
      onClick: () => {
        const fragment = editor.state.selection.content().content;
        const json = fragment.toJSON() as JSONContent[] | null;
        const text = extractReadableText(json);
        if (text) void ttsController.play(text, { label: "Reading selection" });
      },
    },
  ];

  const painterAction: ToolbeltAction = {
    id: PAINTER_ACTION_ID,
    label: paintMode ? "Painting — select to apply" : "Format painter",
    title: paintMode ? "Format Painter active — select to apply (Esc to cancel)" : "Format Painter",
    icon: Paintbrush,
    active: paintMode,
    activeClassName: "bg-amber-500/30 text-amber-300",
    // onClick attached by the renderers (togglePaintMode) — see ToolbeltAction.
  };

  const openContextAction = (event: React.MouseEvent<HTMLButtonElement>, bubbleMenuAction: "save-template" | "save-snippet") => {
    const rect = event.currentTarget.getBoundingClientRect();
    useContextMenuStore.getState().openMenu(
      "main-editor",
      { x: rect.left, y: rect.bottom + 4 },
      { hasSelection: true, bubbleMenuAction },
    );
  };
  const templateActions: ToolbeltAction[] = [
    { id: "save-template", label: "Save as template", title: "Save as Template", icon: LayoutTemplate, onClick: (e) => openContextAction(e, "save-template") },
    { id: "save-snippet", label: "Save as snippet", title: "Save as Snippet", icon: TextQuote, onClick: (e) => openContextAction(e, "save-snippet") },
  ];

  const overflowActions: ToolbeltAction[] = [
    ...(layout.overflow.has("clipboard") ? clipboardActions : []),
    ...(layout.overflow.has("painter") ? [painterAction] : []),
    ...(layout.overflow.has("templates") ? templateActions : []),
  ];
  const headingsInOverflow = layout.headings === "overflow";
  const hasOverflow = overflowActions.length > 0 || headingsInOverflow;

  const divider = <div className="mx-1 h-6 w-px bg-white/10" />;

  const iconButton = (action: ToolbeltAction) => {
    const Icon = action.icon;
    return (
      <button
        key={action.id}
        onMouseDown={preventFocusLoss}
        onClick={action.id === PAINTER_ACTION_ID ? togglePaintMode : action.onClick}
        className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
          action.active ? action.activeClassName ?? "bg-white/20 text-white" : "text-gray-400"
        }`}
        title={action.title}
        type="button"
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  };

  const labeledButton = (action: ToolbeltAction) => {
    const Icon = action.icon;
    return (
      <button
        key={action.id}
        onMouseDown={preventFocusLoss}
        onClick={(event) => {
          if (action.id === PAINTER_ACTION_ID) togglePaintMode();
          else action.onClick?.(event);
          setExpandedRow(null);
        }}
        className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors hover:bg-white/10 ${
          action.active ? action.activeClassName ?? "bg-white/20 text-white" : "text-gray-300"
        }`}
        title={action.title}
        type="button"
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="whitespace-nowrap">{action.label}</span>
      </button>
    );
  };

  /** A heading tool as the registry renders it, icon-only or with its label. */
  const headingButton = (tool: ToolDefinition, labeled: boolean) => {
    const Icon = TOOLBELT_ICONS[tool.id];
    const active = isToolActive(tool.id, formatting);
    const command = getEditorCommand(tool.id, editor, onLinkClick, handleCommentClick);
    return (
      <button
        key={tool.id}
        onMouseDown={preventFocusLoss}
        onClick={() => {
          command?.();
          if (labeled) setExpandedRow(null);
        }}
        className={
          labeled
            ? `flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors hover:bg-white/10 ${active ? "bg-white/20 text-white" : "text-gray-300"}`
            : `rounded p-1.5 transition-colors hover:bg-white/10 ${active ? "bg-white/20 text-white" : "text-gray-400"}`
        }
        title={getToolTitle(tool.id, editor, tool.shortcut, active)}
        type="button"
      >
        {Icon && <Icon className="h-4 w-4 shrink-0" />}
        {labeled && <span className="whitespace-nowrap">{tool.label}</span>}
      </button>
    );
  };

  return (
    <TipTapBubbleMenu
      editor={editor}
      pluginKey={textFormattingBubbleMenuKey}
      updateDelay={100}
      shouldShow={shouldShow}
      options={IS_COARSE_POINTER ? COARSE_POINTER_MENU_OPTIONS : undefined}
      className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/80 p-2 shadow-lg backdrop-blur-md"
    >
      <div className="flex items-center gap-1">
        {TOOLBELT_GROUPS.map((group, groupIdx) => {
          if (group.groupId === "heading" && layout.headings !== "inline") {
            if (layout.headings === "overflow") return null;
            // Folded: one H button opens the three levels as a row below.
            return (
              <div key={group.groupId} className="flex items-center gap-1">
                {groupIdx > 0 && divider}
                <button
                  onMouseDown={preventFocusLoss}
                  onClick={() => setExpandedRow((row) => (row === "headings" ? null : "headings"))}
                  className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
                    anyHeadingActive || expandedRow === "headings" ? "bg-white/20 text-white" : "text-gray-400"
                  }`}
                  title="Headings"
                  aria-expanded={expandedRow === "headings"}
                  type="button"
                >
                  <Heading className="h-4 w-4" />
                </button>
              </div>
            );
          }

          return (
            <div key={group.groupId} className="flex items-center gap-1">
              {groupIdx > 0 && divider}

              {group.tools.map((tool) => {
                if (group.groupId === "heading") return headingButton(tool, false);
                const IconComponent = TOOLBELT_ICONS[tool.id];
                const active = isToolActive(tool.id, formatting);
                const command = getEditorCommand(tool.id, editor, onLinkClick, handleCommentClick);

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
                      active || (tool.id === "comment" && commentComposerOpen) ? "bg-white/20 text-white" : "text-gray-400"
                    }`}
                    title={getToolTitle(tool.id, editor, tool.shortcut, active)}
                    type="button"
                  >
                    {IconComponent && <IconComponent className="h-4 w-4" />}
                  </button>
                );
              })}
            </div>
          );
        })}

        {!layout.overflow.has("clipboard") && (
          <div className="flex items-center gap-1">
            {divider}
            {clipboardActions.map(iconButton)}
          </div>
        )}

        {!layout.overflow.has("painter") && (
          <div className="flex items-center gap-1">
            {divider}
            {iconButton(painterAction)}
          </div>
        )}

        {!layout.overflow.has("templates") && (
          <div className="flex items-center gap-1">
            {divider}
            {templateActions.map(iconButton)}
          </div>
        )}

        {hasOverflow && (
          <div className="flex items-center gap-1">
            {divider}
            <button
              onMouseDown={preventFocusLoss}
              onClick={() => setExpandedRow((row) => (row === "more" ? null : "more"))}
              className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
                expandedRow === "more" || paintMode ? "bg-white/20 text-white" : "text-gray-400"
              }`}
              title="More"
              aria-expanded={expandedRow === "more"}
              type="button"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      {expandedRow === "headings" && layout.headings === "button" && (
        <>
          <div className="h-px w-full bg-white/10" />
          <div className="flex items-center gap-1">{headingTools.map((tool) => headingButton(tool, true))}</div>
        </>
      )}
      {expandedRow === "more" && hasOverflow && (
        <>
          <div className="h-px w-full bg-white/10" />
          <div className="flex max-w-[19rem] flex-wrap items-center gap-1">
            {headingsInOverflow && headingTools.map((tool) => headingButton(tool, true))}
            {overflowActions.map(labeledButton)}
          </div>
        </>
      )}
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
      {commentComposerOpen && (
        <>
          <div className="h-px w-full bg-white/10" />
          <div
            className="w-72"
            // Clicks on the row's chrome must not collapse the editor
            // selection (the link row's rule); the textarea itself needs the
            // default so the caret can be placed in it (the MarkPopover rule).
            onMouseDown={(e) => {
              if (!(e.target instanceof HTMLTextAreaElement)) e.preventDefault();
              e.stopPropagation();
            }}
          >
            <CommentComposer
              autoFocus
              tone="dark"
              placeholder="Comment…"
              submitLabel="Comment"
              contentId={contentId}
              onSubmit={submitComment}
              onCancel={closeCommentComposer}
            />
          </div>
        </>
      )}
    </TipTapBubbleMenu>
  );
}
