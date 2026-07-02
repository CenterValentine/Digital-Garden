/**
 * ChatInput Component
 *
 * Contenteditable composer with inline mention pills.
 *
 *   - `value` is the canonical string: text interleaved with
 *     `@[Title](id)` tokens. Mentions render as atomic, non-editable
 *     pill spans inside the editable surface; backspace removes them
 *     in one keystroke (browser default for contenteditable=false).
 *   - On input, the DOM is serialized back to that same canonical
 *     string and emitted via `onChange`. The parent never sees plain
 *     `@Title` — that intermediate form is gone.
 *   - `@` opens the mention picker, `/` opens commands. On select,
 *     the trigger query is replaced atomically at the captured Range.
 *   - Drag-from-file-tree drops insert a mention pill at the caret via
 *     react-dnd's `useDrop({ accept: "NODE" })`.
 */

"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
  type FormEvent,
} from "react";
import { ArrowUp, Square, Mic, Paperclip, X, FileText, Loader2 } from "lucide-react";
import { useDrop } from "react-dnd";
import { cn } from "@/lib/core/utils";
import {
  ChatSuggestionMenu,
  type SuggestionItem,
} from "./ChatSuggestionMenu";
import type { ChatStatus } from "ai";
import type { ChatAttachment } from "@/lib/domain/ai/use-conversation-engine";
import { useTreeDragStore } from "@/state/tree-drag-store";
import { useImagePreviewStore } from "@/state/image-preview-store";

// react-arborist's drag source type. Must match `type: "NODE"` in
// node_modules/react-arborist/dist/main/dnd/drag-hook.js so the composer
// registers as a valid drop target — otherwise react-dnd's window-level
// dragover handler stamps dropEffect="none" and the browser silently
// suppresses the drop event.
const ARBORIST_DRAG_TYPE = "NODE";

interface ArboristDragItem {
  id: string;
  dragIds: string[];
}

/** Mention syntax: `@[Title](id)`. Used in serializer + parser + send-side. */
const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

interface ChatInputProps {
  /** Canonical value: text + `@[Title](id)` tokens. */
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  status: ChatStatus;
  disabled?: boolean;
  placeholder?: string;
  /** Called when user types @ followed by a query */
  onMentionSearch?: (query: string) => void;
  /** Results returned from mention search */
  mentionResults?: SuggestionItem[];
  /** Static list of / command items */
  commandItems?: SuggestionItem[];
  /**
   * Slot for controls on the left of the footer row — typically the
   * make/model picker.
   */
  footerLeading?: React.ReactNode;
  // ── attachments ──
  attachments?: ChatAttachment[];
  onAddFiles?: (files: File[] | FileList) => void;
  onRemoveAttachment?: (id: string) => void;
  attachmentsUploading?: boolean;
  supportsImages?: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  status,
  disabled = false,
  placeholder = "Ask anything...",
  onMentionSearch,
  mentionResults = [],
  commandItems = [],
  footerLeading,
  attachments = [],
  onAddFiles,
  onRemoveAttachment,
  attachmentsUploading = false,
  supportsImages = true,
}: ChatInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The last value we emitted via onChange. When `value` prop comes back
  // identical, we skip re-rendering the DOM so the caret stays put.
  //
  // Seeded to `null` (not `value`) so the `[value]` effect ALWAYS paints on
  // mount — including the case where `value` is a rehydrated sticky draft.
  // If we seeded with `value`, the mount guard `value === lastEmittedRef`
  // would short-circuit and the contenteditable would render empty while
  // state still held the draft (invisible-but-sendable text). That was the
  // root cause of the "drafts don't restore on reload" bug.
  const lastEmittedRef = useRef<string | null>(null);
  // Range marking the trigger position (start = the `@` or `/` char,
  // end = current caret). Stable across renders because we don't rewrite
  // the DOM during typing.
  const triggerRangeRef = useRef<Range | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isEmpty, setIsEmpty] = useState(value.length === 0);

  const [suggestionMode, setSuggestionMode] = useState<
    "mention" | "command" | null
  >(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filteredCommands, setFilteredCommands] = useState<SuggestionItem[]>(
    [],
  );

  const isActive = status === "streaming" || status === "submitted";
  const hasReadyAttachment = attachments.some((a) => a.status === "ready");
  const canSend =
    (value.trim().length > 0 || hasReadyAttachment) &&
    !isActive &&
    !disabled &&
    !attachmentsUploading;
  const dropEnabled = Boolean(onAddFiles);

  // ── DOM ↔ canonical-string conversion ──

  // External value change → re-render. Skip if the change came from our
  // own onInput (lastEmittedRef matches), which avoids caret jumps mid-
  // typing. On a real external change (clear, edit-substitute), wipe and
  // re-render.
  useEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    if (value === lastEmittedRef.current) return;
    renderValueIntoElement(root, value);
    lastEmittedRef.current = value;
    setIsEmpty(value.length === 0);
    if (value.length === 0) closeSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- closeSuggestions is stable; including it would re-render on every render
  }, [value]);

  const closeSuggestions = useCallback(() => {
    setSuggestionMode(null);
    setSelectedIndex(0);
    setFilteredCommands([]);
    triggerRangeRef.current = null;
  }, []);

  const emit = useCallback(() => {
    const root = editorRef.current;
    if (!root) return;
    const next = serializeDom(root);
    lastEmittedRef.current = next;
    setIsEmpty(next.length === 0);
    onChange(next);
  }, [onChange]);

  // ── suggestion-trigger detection ──

  // Read the current caret position and walk back inside the same text
  // node looking for the trigger character. If found and properly
  // bounded, returns the trigger info; otherwise returns null.
  const detectActiveTrigger = useCallback(():
    | { kind: "mention" | "command"; query: string; range: Range }
    | null => {
    const root = editorRef.current;
    if (!root) return null;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return null;
    if (!root.contains(range.startContainer)) return null;
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return null;

    const textNode = range.startContainer as Text;
    const offset = range.startOffset;
    const before = textNode.data.slice(0, offset);

    // Mention: `@query` with whitespace / start-of-node before the @.
    const mentionMatch = /(^|\s)@([^\s@]*)$/.exec(before);
    if (mentionMatch && onMentionSearch) {
      const triggerOffset = offset - mentionMatch[2].length - 1;
      const triggerRange = document.createRange();
      triggerRange.setStart(textNode, triggerOffset);
      triggerRange.setEnd(textNode, offset);
      return { kind: "mention", query: mentionMatch[2], range: triggerRange };
    }

    // Command: `/query` only when the `/` is at the very start of the
    // first text node (we don't try to support multi-line "command at
    // line start" since chat inputs are nearly always single-line).
    const isFirstTextNode = root.firstChild === textNode;
    const commandMatch = /^\/([^\s/]*)$/.exec(before);
    if (commandMatch && isFirstTextNode && commandItems.length > 0) {
      const triggerRange = document.createRange();
      triggerRange.setStart(textNode, 0);
      triggerRange.setEnd(textNode, offset);
      return { kind: "command", query: commandMatch[1], range: triggerRange };
    }

    return null;
  }, [commandItems.length, onMentionSearch]);

  // ── input event handler ──

  const handleInput = useCallback(() => {
    emit();
    const trig = detectActiveTrigger();
    if (!trig) {
      if (suggestionMode) closeSuggestions();
      return;
    }
    triggerRangeRef.current = trig.range;
    if (trig.kind === "mention") {
      setSuggestionMode("mention");
      setSelectedIndex(0);
      onMentionSearch?.(trig.query);
    } else {
      setSuggestionMode("command");
      setSelectedIndex(0);
      const q = trig.query.toLowerCase();
      setFilteredCommands(
        commandItems.filter(
          (c) =>
            c.label.toLowerCase().includes(q) ||
            c.description?.toLowerCase().includes(q),
        ),
      );
    }
  }, [
    closeSuggestions,
    commandItems,
    detectActiveTrigger,
    emit,
    onMentionSearch,
    suggestionMode,
  ]);

  // ── suggestion menu plumbing ──

  const suggestionItems =
    suggestionMode === "mention" ? mentionResults : filteredCommands;
  const showMenu = suggestionMode !== null && suggestionItems.length > 0;

  useEffect(() => {
    setSelectedIndex(0);
  }, [mentionResults, filteredCommands]);

  const handleSelect = useCallback(
    (item: SuggestionItem) => {
      const root = editorRef.current;
      const triggerRange = triggerRangeRef.current;
      if (!root || !triggerRange) return;

      // Range = trigger char → current caret. Delete it; insert the
      // mention pill (or command insertText) in its place.
      const sel = window.getSelection();
      const caretRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      const replaceRange = document.createRange();
      replaceRange.setStart(triggerRange.startContainer, triggerRange.startOffset);
      if (
        caretRange &&
        caretRange.collapsed &&
        root.contains(caretRange.startContainer)
      ) {
        replaceRange.setEnd(caretRange.startContainer, caretRange.startOffset);
      } else {
        replaceRange.setEnd(triggerRange.endContainer, triggerRange.endOffset);
      }
      replaceRange.deleteContents();

      if (suggestionMode === "mention") {
        const pill = makeMentionPill(item.label, item.id);
        replaceRange.insertNode(pill);
        // Trailing space after the pill so the next keystroke isn't
        // glued to the chip.
        const space = document.createTextNode(" ");
        pill.after(space);
        placeCaretAfter(space);
      } else {
        const inserted = document.createTextNode(item.insertText ?? item.label);
        replaceRange.insertNode(inserted);
        placeCaretAfter(inserted);
      }

      closeSuggestions();
      emit();
      root.focus();
    },
    [closeSuggestions, emit, suggestionMode],
  );

  // ── submit / keyboard ──

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      if (canSend) {
        closeSuggestions();
        onSubmit();
      }
    },
    [canSend, onSubmit, closeSuggestions],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (showMenu) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < suggestionItems.length - 1 ? prev + 1 : 0,
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : suggestionItems.length - 1,
          );
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          if (suggestionItems[selectedIndex]) {
            handleSelect(suggestionItems[selectedIndex]);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          closeSuggestions();
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
        return;
      }
      // Shift+Enter: insert a newline (contenteditable default is a
      // <div> on Chrome / <br> elsewhere — we force <br> for consistency
      // and to keep serialization simple).
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        insertLineBreakAtCaret();
        emit();
      }
    },
    [
      showMenu,
      suggestionItems,
      selectedIndex,
      handleSelect,
      closeSuggestions,
      handleSubmit,
      emit,
    ],
  );

  // ── paste: strip formatting, keep plain text ──

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      // OS-file paste → attachment intake.
      if (onAddFiles) {
        const files = Array.from(e.clipboardData.files);
        if (files.length > 0) {
          e.preventDefault();
          onAddFiles(files);
          return;
        }
      }
      const text = e.clipboardData.getData("text/plain");
      if (text === "") return;
      e.preventDefault();
      insertPlainTextAtCaret(text);
      emit();
    },
    [emit, onAddFiles],
  );

  // ── file drop ──

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (!onAddFiles) return;
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onAddFiles(files);
    },
    [onAddFiles],
  );

  // ── tree-node drop (react-dnd) ──

  const insertTreeNodeMention = useCallback(
    (item: ArboristDragItem) => {
      const root = editorRef.current;
      if (!root) return;
      const stored = useTreeDragStore.getState().draggingNode;
      const node =
        stored && stored.id === item.id
          ? stored
          : { id: item.id, title: item.id, contentType: "unknown" };
      useTreeDragStore.getState().setDraggingNode(null);

      const pill = makeMentionPill(node.title, node.id);
      const space = document.createTextNode(" ");
      appendToRoot(root, pill);
      pill.after(space);
      placeCaretAfter(space);
      root.focus();
      emit();
    },
    [emit],
  );

  const [{ isOverTree }, treeDropRef] = useDrop<
    ArboristDragItem,
    void,
    { isOverTree: boolean }
  >(
    () => ({
      accept: ARBORIST_DRAG_TYPE,
      drop: (item) => insertTreeNodeMention(item),
      collect: (monitor) => ({
        isOverTree: monitor.isOver() && monitor.canDrop(),
      }),
    }),
    [insertTreeNodeMention],
  );

  const handlePickFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-black/10 dark:border-white/10 bg-black/20 p-2"
    >
      <div
        ref={treeDropRef as unknown as React.Ref<HTMLDivElement>}
        className={cn(
          "relative rounded-xl border bg-white/[0.04] transition-colors",
          isDragging || isOverTree
            ? "border-emerald-400/60 ring-1 ring-emerald-400/30"
            : "border-white/10 focus-within:border-white/25 focus-within:ring-1 focus-within:ring-white/10",
        )}
        onDragOver={
          dropEnabled
            ? (e) => {
                if (!Array.from(e.dataTransfer.types ?? []).includes("Files")) return;
                e.preventDefault();
                setIsDragging(true);
              }
            : undefined
        }
        onDragLeave={dropEnabled ? () => setIsDragging(false) : undefined}
        onDrop={dropEnabled ? handleDrop : undefined}
      >
        {showMenu && (
          <ChatSuggestionMenu
            items={suggestionItems}
            selectedIndex={selectedIndex}
            onSelect={handleSelect}
            mode={suggestionMode!}
          />
        )}

        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-2.5 pt-2.5">
            {attachments.map((a) => (
              <AttachmentChip
                key={a.id}
                attachment={a}
                onRemove={() => onRemoveAttachment?.(a.id)}
              />
            ))}
          </div>
        )}

        {/* Contenteditable composer.
            - `data-placeholder` paired with the CSS `:empty:before`
              pattern shows the placeholder when truly empty.
            - `whitespace-pre-wrap` preserves newlines from Shift+Enter.
            - `max-h-[160px] overflow-y-auto` mirrors the textarea's cap. */}
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder}
          contentEditable={!(disabled || isActive)}
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          data-placeholder={placeholder}
          className={cn(
            "scrollbar-hide block w-full max-h-[160px] min-h-[36px] overflow-y-auto whitespace-pre-wrap break-words",
            "bg-transparent px-3 pt-2.5 pb-1",
            "text-sm text-white",
            "focus:outline-none",
            (disabled || isActive) && "opacity-50 cursor-not-allowed",
            isEmpty &&
              "before:content-[attr(data-placeholder)] before:text-gray-500 before:pointer-events-none",
          )}
        />

        {/* Footer row — picker / voice / submit */}
        <div className="flex items-center gap-1 px-1.5 pb-1.5 pt-0.5">
          <div className="flex-1 min-w-0 flex items-center">{footerLeading}</div>
          {onAddFiles && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.heic,.heif,image/heic,image/heif,audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,application/pdf,.pdf,text/plain,text/markdown,text/csv,application/json,.md,.markdown,.csv,.json,.txt,.log"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) onAddFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={handlePickFiles}
                title={
                  supportsImages
                    ? "Attach images or text files"
                    : "Attach text files (active model can't read images)"
                }
                aria-label="Attach files"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/10 transition-colors"
              >
                <Paperclip className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button
            type="button"
            disabled
            title="Speech input (coming soon)"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 hover:text-gray-300 transition-colors cursor-not-allowed disabled:opacity-50"
          >
            <Mic className="h-3.5 w-3.5" />
          </button>
          {isActive ? (
            <button
              type="button"
              onClick={onStop}
              title="Stop generation"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
            >
              <Square className="h-3 w-3" fill="currentColor" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              title="Send message"
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
                canSend
                  ? "bg-white/15 text-white hover:bg-white/25"
                  : "bg-white/5 text-gray-600 cursor-not-allowed",
              )}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

// ───────────────────────── DOM helpers ─────────────────────────

/** Walk the editor root and produce the canonical `@[Title](id)` string. */
function serializeDom(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.dataset.mention) {
      const id = el.dataset.id ?? "";
      const label = el.dataset.label ?? "";
      out += `@[${label}](${id})`;
      return;
    }
    if (el.tagName === "BR") {
      out += "\n";
      return;
    }
    for (const child of Array.from(el.childNodes)) walk(child);
  };
  for (const child of Array.from(root.childNodes)) walk(child);
  return out;
}

/** Render a canonical string into a contenteditable root. */
function renderValueIntoElement(root: HTMLElement, value: string) {
  root.replaceChildren();
  if (!value) return;
  let cursor = 0;
  const re = new RegExp(MENTION_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    if (match.index > cursor) {
      appendTextWithBreaks(root, value.slice(cursor, match.index));
    }
    root.appendChild(makeMentionPill(match[1], match[2]));
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) {
    appendTextWithBreaks(root, value.slice(cursor));
  }
}

function appendTextWithBreaks(root: HTMLElement, text: string) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) root.appendChild(document.createElement("br"));
    if (lines[i].length > 0) {
      root.appendChild(document.createTextNode(lines[i]));
    }
  }
}

function makeMentionPill(label: string, id: string): HTMLElement {
  const span = document.createElement("span");
  span.dataset.mention = "1";
  span.dataset.id = id;
  span.dataset.label = label;
  span.contentEditable = "false";
  span.className =
    "inline-flex items-center align-baseline rounded-md border border-blue-500/30 bg-blue-500/15 px-1.5 py-0.5 text-blue-200 text-xs font-medium leading-tight mx-0.5";
  span.textContent = `@${label}`;
  return span;
}

function placeCaretAfter(node: Node) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function appendToRoot(root: HTMLElement, node: Node) {
  // If there's an existing caret, prefer inserting there; else append.
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    if (root.contains(range.startContainer)) {
      range.deleteContents();
      range.insertNode(node);
      return;
    }
  }
  root.appendChild(node);
}

function insertLineBreakAtCaret() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const br = document.createElement("br");
  range.insertNode(br);
  // Sentinel text node so the caret is visible after a trailing <br>.
  const sentinel = document.createTextNode("​");
  br.after(sentinel);
  placeCaretAfter(br);
}

function insertPlainTextAtCaret(text: string) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const lines = text.split("\n");
  let last: Node | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      const br = document.createElement("br");
      range.insertNode(br);
      range.setStartAfter(br);
      range.collapse(true);
      last = br;
    }
    if (lines[i].length > 0) {
      const txt = document.createTextNode(lines[i]);
      range.insertNode(txt);
      range.setStartAfter(txt);
      range.collapse(true);
      last = txt;
    }
  }
  if (last) placeCaretAfter(last);
}

// ───────────────────── attachment chip ─────────────────────

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: ChatAttachment;
  onRemove: () => void;
}) {
  const { name, kind, status, url, error } = attachment;
  const isImage = kind === "image";
  return (
    <div
      className={cn(
        "group/att relative flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] max-w-[180px]",
        status === "error"
          ? "border-red-500/30 bg-red-500/10 text-red-300"
          : "border-white/10 bg-white/[0.06] text-gray-300",
      )}
      title={error || name}
    >
      {status === "uploading" ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400" />
      ) : isImage && url ? (
        // eslint-disable-next-line @next/next/no-img-element -- ephemeral composer preview, not page content
        <img
          src={url}
          alt={name}
          onClick={() =>
            useImagePreviewStore
              .getState()
              .open([{ src: url, alt: name, downloadUrl: url }])
          }
          title="Preview image"
          className="h-5 w-5 shrink-0 cursor-zoom-in rounded object-cover"
        />
      ) : (
        <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
      )}
      <span className="truncate">{name}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className="shrink-0 text-gray-500 hover:text-red-400 transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
