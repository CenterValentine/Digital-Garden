/**
 * AI Edit Orchestrator
 *
 * Animation engine for AI-powered document editing. Processes edit payloads
 * from the AI chat and applies them to the live TipTap editor with animated
 * effects.
 *
 * Animation sequence per diff:
 *   Phase 1: Cursor arrival — scroll into view, position cursor (~500ms)
 *   Phase 2: Selection highlight — sweep selection across target text (~1s)
 *   Phase 3: Content insertion —
 *     - Simple text (no newlines/markdown): char-by-char typing
 *     - Structured content: parsed markdown → TipTap JSON, inserted node-by-node
 *   Phase 4: Settle — cursor at end of new text (~300ms)
 *
 * Features:
 *   - Editor lock (setEditable(false)) during AI edits
 *   - 30-second timeout failsafe
 *   - Queued execution for multiple diffs
 *   - Abort on document navigation
 *   - Cursor left at last edit position after completion
 */

import type { Editor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { findTextInDoc } from "./text-search";
import { markdownToTiptap } from "@/lib/domain/content/markdown";
import { useBlockStore } from "@/state/block-store";

// ─── Types ───────────────────────────────────────────────────

export interface ApplyDiffPayload {
  __editPayload: true;
  type: "apply_diff";
  before: string;
  after: string;
  documentTitle: string;
  action: string;
  toolCallId?: string;
}

export interface ReplaceDocumentPayload {
  __editPayload: true;
  type: "replace_document";
  markdown: string;
  documentTitle: string;
  action: string;
  toolCallId?: string;
}

export interface InsertImagePayload {
  __editPayload: true;
  type: "insert_image";
  src: string;
  alt: string;
  documentTitle: string;
  action: string;
  toolCallId?: string;
}

export interface InsertBlockPayload {
  __editPayload: true;
  type: "insert_block";
  /** A fully-formed, server-validated TipTap block node ready to insert. */
  node: JSONContent;
  blockType: string;
  /** Insert immediately after the block with this id; falls back to doc end. */
  afterBlockId?: string;
  documentTitle: string;
  action: string;
  toolCallId?: string;
}

export interface UpdateBlockPayload {
  __editPayload: true;
  type: "update_block";
  /** The blockId of the existing block to patch. */
  blockId: string;
  /** The attribute changes to merge into the block's live attrs. */
  attrs: Record<string, unknown>;
  documentTitle: string;
  action: string;
  toolCallId?: string;
}

export type EditPayload =
  | ApplyDiffPayload
  | ReplaceDocumentPayload
  | InsertImagePayload
  | InsertBlockPayload
  | UpdateBlockPayload;

export interface EditResult {
  success: boolean;
  action: string;
  error?: string;
  /** Document state captured immediately before this edit was applied. Present only on success. */
  snapshot?: JSONContent;
  /** The tool call ID that triggered this edit, for associating the revert with the chat UI. */
  toolCallId?: string;
}

// ─── Constants ───────────────────────────────────────────────

/** Base typing speed range (ms per character) */
const TYPE_SPEED_MIN = 18;
const TYPE_SPEED_MAX = 35;

/** Micro-pause range (ms) — inserted every 5-15 characters */
const MICRO_PAUSE_MIN = 40;
const MICRO_PAUSE_MAX = 120;
const MICRO_PAUSE_INTERVAL_MIN = 5;
const MICRO_PAUSE_INTERVAL_MAX = 15;

/** Sentence boundary pause (ms) */
const SENTENCE_PAUSE = 200;

/** Delay between nodes in structured insertion (ms) */
const NODE_INSERT_DELAY = 80;

/** Delay between phases (ms) */
const CURSOR_ARRIVAL_DELAY = 400;
const SELECTION_SWEEP_DELAY = 800;
const SETTLE_DELAY = 250;
const BETWEEN_DIFFS_DELAY = 500;

/** Failsafe timeout (ms) */
const TIMEOUT_MS = 30_000;

// ─── Helpers ─────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Detect whether `after` text contains markdown/block structure that
 * requires parsed insertion (vs. simple char-by-char typing).
 */
function needsStructuredInsert(text: string): boolean {
  // Multiple paragraphs (double newline)
  if (text.includes("\n\n")) return true;
  // Markdown headings
  if (/^#{1,6}\s/m.test(text)) return true;
  // Markdown list items
  if (/^[\s]*[-*+]\s/m.test(text)) return true;
  if (/^[\s]*\d+\.\s/m.test(text)) return true;
  // Markdown formatting (bold, italic, code)
  if (/\*\*[^*]+\*\*/.test(text)) return true;
  if (/\*[^*]+\*/.test(text)) return true;
  if (/`[^`]+`/.test(text)) return true;
  // Code blocks
  if (text.includes("```")) return true;
  // Blockquotes
  if (/^>\s/m.test(text)) return true;
  return false;
}

/**
 * Check if a tool result string contains an edit payload.
 * Edit payloads are JSON strings with `__editPayload: true`.
 */
export function parseEditPayload(toolResult: string): EditPayload | null {
  if (!toolResult.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(toolResult);
    if (parsed.__editPayload === true) return parsed as EditPayload;
  } catch {
    // Not JSON or not an edit payload
  }
  return null;
}

/**
 * Process-wide guard: a given tool call's payload must apply at most once.
 * `toolCallId`s are globally unique, so this protects against every double-apply
 * path — React StrictMode double-invoke, component re-mount, effect re-run, or a
 * second orchestrator instance — that a per-instance/per-mount guard would miss.
 * (Non-idempotent edits like insert_block otherwise duplicate; idempotent ones
 * like apply_diff hid the same bug.)
 */
const appliedToolCallIds = new Set<string>();

/**
 * Second guard, for *content*: a model (notably GPT-family, which emits parallel
 * tool calls) can fire two identical `insert_block` calls in one turn — distinct
 * `toolCallId`s, same block — which the id guard above cannot catch because the
 * calls are genuinely separate. Dedupe by block content (node type + attrs, minus
 * the per-call `blockId`) within a short window, so a redundant duplicate is
 * dropped while a deliberate later re-insert of the same block still works.
 */
const recentBlockInserts = new Map<string, number>();
const BLOCK_DEDUP_WINDOW_MS = 8000;

function blockContentSignature(payload: InsertBlockPayload): string {
  const attrs = { ...((payload.node?.attrs as Record<string, unknown>) ?? {}) };
  delete attrs.blockId; // freshly generated per call — must be excluded
  const canonical = Object.keys(attrs)
    .sort()
    .map((k) => `${k}=${JSON.stringify(attrs[k])}`)
    .join("&");
  const nodeType = (payload.node as { type?: string } | undefined)?.type ?? "";
  return `${nodeType}::${canonical}`;
}

// ─── Orchestrator ────────────────────────────────────────────

export class AiEditOrchestrator {
  private queue: EditPayload[] = [];
  private processing = false;
  private aborted = false;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private onStateChange: (editing: boolean) => void;
  private onEditResult: (result: EditResult) => void;
  /** toolCallId → resolver, for callers awaiting a specific edit's outcome. */
  private awaiters = new Map<string, (result: EditResult) => void>();

  constructor(
    private getEditor: () => Editor | null,
    callbacks: {
      onStateChange: (editing: boolean) => void;
      onEditResult: (result: EditResult) => void;
    }
  ) {
    this.onStateChange = callbacks.onStateChange;
    this.onEditResult = callbacks.onEditResult;
  }

  /**
   * Enqueue an edit and await ITS outcome.
   *
   * `enqueue` is fire-and-forget with a single global `onEditResult` callback,
   * which is fine for a payload that arrived inside a tool result the model has
   * already been told about. It is NOT enough for a **client-executed** tool: there
   * the model is still waiting, and the honest outcome has to become the tool's
   * return value. Without this, a failed edit was reported to the model as success
   * (2026-08-12: "Done — appended…" while the client had toasted
   * "Could not locate the text to edit" and written nothing).
   *
   * Resolves with the same EditResult that `onEditResult` receives, so the caller
   * can turn it into a truthful tool result.
   */
  applyAndWait(payload: EditPayload): Promise<EditResult> {
    const id = payload.toolCallId;
    if (!id) {
      // Nothing to correlate a result to; fall back to fire-and-forget.
      this.enqueue(payload);
      return Promise.resolve({ success: true, action: payload.action });
    }
    const pending = new Promise<EditResult>((resolve) => {
      this.awaiters.set(id, resolve);
    });
    if (!this.enqueue(payload)) {
      // Dropped as a duplicate — no result will ever be emitted for it.
      this.awaiters.delete(id);
      return Promise.resolve({
        success: false,
        action: payload.action,
        error: "This edit was already applied.",
      });
    }
    return pending;
  }

  /**
   * Enqueue an edit payload for processing.
   *
   * Returns false when the payload was dropped (duplicate tool call, or a repeated
   * identical block) so `applyAndWait` never hangs on a result that will not come.
   */
  enqueue(payload: EditPayload): boolean {
    // Idempotency: never apply the same tool call's edit twice.
    if (payload.toolCallId) {
      if (appliedToolCallIds.has(payload.toolCallId)) return false;
      appliedToolCallIds.add(payload.toolCallId);
    }
    // Content dedupe: drop a redundant identical block from parallel/repeat
    // model tool calls (distinct toolCallIds, same block content).
    if (payload.type === "insert_block") {
      const sig = blockContentSignature(payload);
      const now = Date.now();
      const last = recentBlockInserts.get(sig);
      if (last !== undefined && now - last < BLOCK_DEDUP_WINDOW_MS) return false;
      recentBlockInserts.set(sig, now);
    }
    this.queue.push(payload);
    if (!this.processing) {
      this.processQueue();
    }
    return true;
  }

  /** Abort all pending edits and unlock the editor */
  abort(): void {
    this.aborted = true;
    this.queue = [];
    this.clearTimeout();
    this.unlock();
    // Anything queued behind the abort will never produce a result. A
    // client-executed tool has the model blocked on that result, so settle every
    // awaiter rather than leaving the run hung.
    this.settleAllAwaiters(
      "Editing was interrupted before this change was applied.",
    );
  }

  /** Clean up — call on unmount or document navigation */
  destroy(): void {
    this.abort();
  }

  /** Resolve a caller waiting on this specific edit, if any. */
  private settleAwaiter(
    toolCallId: string | undefined,
    result: EditResult,
  ): void {
    if (!toolCallId) return;
    const resolve = this.awaiters.get(toolCallId);
    if (!resolve) return;
    this.awaiters.delete(toolCallId);
    resolve(result);
  }

  /** Settle every outstanding awaiter — used when the queue is torn down. */
  private settleAllAwaiters(error: string): void {
    for (const [id, resolve] of this.awaiters) {
      this.awaiters.delete(id);
      resolve({ success: false, action: "Edit interrupted", error });
    }
  }

  // ─── Queue processing ──────────────────────────────────────

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    this.aborted = false;

    // Signal UI state (shows "AI is editing..." indicator) but don't lock
    // the editor yet — Phase 2 selection highlight needs contenteditable=true
    // for the browser to render native text selection. Each edit method locks
    // the editor at Phase 3 when actual modifications begin.
    this.onStateChange(true);

    while (this.queue.length > 0 && !this.aborted) {
      const payload = this.queue.shift()!;
      this.startTimeout();

      const result = await this.executeEdit(payload);
      this.onEditResult(result);
      this.settleAwaiter(payload.toolCallId, result);

      this.clearTimeout();

      // Pause between diffs
      if (this.queue.length > 0 && !this.aborted) {
        await sleep(BETWEEN_DIFFS_DELAY);
      }
    }

    this.unlock();
    this.processing = false;
  }

  // ─── Edit execution ────────────────────────────────────────

  private async executeEdit(payload: EditPayload): Promise<EditResult> {
    // Capture document state before applying the edit so the UI can offer revert.
    const snapshot = this.getEditor()?.getJSON();

    let result: EditResult;
    if (payload.type === "apply_diff") {
      result = await this.executeApplyDiff(payload);
    } else if (payload.type === "replace_document") {
      result = await this.executeReplaceDocument(payload);
    } else if (payload.type === "insert_image") {
      result = await this.executeInsertImage(payload);
    } else if (payload.type === "insert_block") {
      result = await this.executeInsertBlock(payload);
    } else if (payload.type === "update_block") {
      result = await this.executeUpdateBlock(payload);
    } else {
      return { success: false, action: "Unknown edit type", error: "Unknown payload type" };
    }

    if (result.success && snapshot) {
      result.snapshot = snapshot;
      result.toolCallId = payload.toolCallId;
    }
    return result;
  }

  private async executeApplyDiff(payload: ApplyDiffPayload): Promise<EditResult> {
    const editor = this.getEditor();
    if (!editor) {
      return { success: false, action: payload.action, error: "Editor not available" };
    }

    // Find the text in the ProseMirror document
    const searchResult = findTextInDoc(editor.state.doc, payload.before);

    if (!searchResult) {
      return {
        success: false,
        action: payload.action,
        error: "Could not locate the text to edit.",
      };
    }

    if ("count" in searchResult) {
      return {
        success: false,
        action: payload.action,
        error: `Found ${searchResult.count} matches, please be more specific.`,
      };
    }

    const { from, to } = searchResult;

    try {
      // Phase 1: Cursor arrival — scroll into view
      editor.chain().setTextSelection(from).scrollIntoView().run();
      if (this.aborted) return { success: false, action: payload.action, error: "Aborted" };
      await sleep(CURSOR_ARRIVAL_DELAY);

      // Phase 2: Selection highlight — select the target text
      const selectionTr = editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, from, to)
      );
      editor.view.dispatch(selectionTr);
      if (this.aborted) return { success: false, action: payload.action, error: "Aborted" };
      await sleep(SELECTION_SWEEP_DELAY);

      // Phase 3: Lock editor + delete selected text + insert replacement
      if (this.aborted) return { success: false, action: payload.action, error: "Aborted" };
      this.lockEditor();

      // Delete the selected text
      const deleteTr = editor.state.tr.deleteRange(from, to);
      editor.view.dispatch(deleteTr);

      // Insert replacement — choose strategy based on content complexity
      let insertEndPos = from;
      if (payload.after.length > 0) {
        if (needsStructuredInsert(payload.after)) {
          insertEndPos = await this.insertStructuredContent(editor, from, payload.after);
        } else {
          insertEndPos = await this.typeText(editor, from, payload.after);
        }
      }

      // Apply AI highlight mark to the inserted range
      if (insertEndPos > from) {
        this.applyAiHighlight(editor, from, insertEndPos);
      }

      // Phase 4: Settle — cursor at end of new content
      const clampedPos = Math.min(
        insertEndPos,
        editor.state.doc.content.size - 1
      );
      editor.chain().setTextSelection(clampedPos).scrollIntoView().run();
      await sleep(SETTLE_DELAY);

      return { success: true, action: payload.action };
    } catch (err) {
      return {
        success: false,
        action: payload.action,
        error: err instanceof Error ? err.message : "Unknown error during edit",
      };
    }
  }

  private async executeReplaceDocument(payload: ReplaceDocumentPayload): Promise<EditResult> {
    const editor = this.getEditor();
    if (!editor) {
      return { success: false, action: payload.action, error: "Editor not available" };
    }

    try {
      // Lock editor for document replacement
      this.lockEditor();

      // For full document replacement, use setContent (no character animation)
      const tiptapJson = markdownToTiptap(payload.markdown);
      editor.commands.setContent(tiptapJson);

      // Mark entire document as AI content
      this.applyAiHighlight(editor, 0, editor.state.doc.content.size);

      // Position cursor at the beginning
      editor.chain().setTextSelection(1).scrollIntoView().run();
      await sleep(SETTLE_DELAY);

      return { success: true, action: payload.action };
    } catch (err) {
      return {
        success: false,
        action: payload.action,
        error: err instanceof Error ? err.message : "Unknown error during replacement",
      };
    }
  }

  private async executeInsertImage(payload: InsertImagePayload): Promise<EditResult> {
    const editor = this.getEditor();
    if (!editor) {
      return { success: false, action: payload.action, error: "Editor not available" };
    }

    try {
      // Lock editor for image insertion
      this.lockEditor();

      // Insert at end of document (before trailing doc boundary)
      const insertPos = editor.state.doc.content.size - 1;

      // Scroll to end
      editor.chain().setTextSelection(insertPos).scrollIntoView().run();
      if (this.aborted) return { success: false, action: payload.action, error: "Aborted" };
      await sleep(CURSOR_ARRIVAL_DELAY);

      // Insert image node with ai-generated source
      editor.commands.insertContentAt(insertPos, {
        type: "image",
        attrs: {
          src: payload.src,
          alt: payload.alt || "",
          source: "ai-generated",
          width: null,
          contentId: null,
          uploading: false,
        },
      });

      await sleep(SETTLE_DELAY);

      return { success: true, action: payload.action };
    } catch (err) {
      return {
        success: false,
        action: payload.action,
        error: err instanceof Error ? err.message : "Unknown error during image insertion",
      };
    }
  }

  private async executeInsertBlock(payload: InsertBlockPayload): Promise<EditResult> {
    const editor = this.getEditor();
    if (!editor) {
      return { success: false, action: payload.action, error: "Editor not available" };
    }

    try {
      // Lock editor for block insertion
      this.lockEditor();

      // Insert right after a specific block if requested, else at the doc end.
      let insertPos = editor.state.doc.content.size - 1;
      if (payload.afterBlockId) {
        let anchor: { pos: number; nodeSize: number } | null = null;
        editor.state.doc.descendants((node, pos) => {
          if (anchor) return false;
          if ((node.attrs as Record<string, unknown> | undefined)?.blockId === payload.afterBlockId) {
            anchor = { pos, nodeSize: node.nodeSize };
            return false;
          }
          return true;
        });
        const a = anchor as { pos: number; nodeSize: number } | null;
        if (a) insertPos = a.pos + a.nodeSize;
      }

      // Scroll to the insertion point
      editor.chain().setTextSelection(insertPos).scrollIntoView().run();
      if (this.aborted) return { success: false, action: payload.action, error: "Aborted" };
      await sleep(CURSOR_ARRIVAL_DELAY);

      // Insert the pre-validated block node. `updateSelection: false` places the
      // block WITHOUT selecting it, so a bot insert doesn't fire the block's
      // selectNode() → Properties panel (which would yank the right rail off the
      // chat). A human placing a block via slash/drag still selects it and gets
      // the panel through those separate code paths.
      const sizeBefore = editor.state.doc.content.size;
      editor.commands.insertContentAt(insertPos, payload.node, {
        updateSelection: false,
      });
      const growth = editor.state.doc.content.size - sizeBefore;

      // Mark the inserted range as AI content (no-op if the block has no text)
      if (growth > 0) {
        this.applyAiHighlight(editor, insertPos, insertPos + growth);
      }

      // A bot insert must not leave the block *selected*: a selected block makes
      // RightSidebar swap the rail to the Properties panel (node-view-factory
      // selectNode() → block-store → RightSidebar activeTab), yanking focus off
      // the chat. `updateSelection:false` isn't sufficient — the atom still
      // resolves to a NodeSelection — so collapse to a caret and clear the
      // block-selection store. Human placement (slash/drag/click) never goes
      // through the orchestrator, so it still opens the panel as expected.
      try {
        editor.commands.setTextSelection(
          Math.min(insertPos, editor.state.doc.content.size - 1)
        );
      } catch {
        /* best-effort selection collapse */
      }
      useBlockStore.getState().clearSelection();

      await sleep(SETTLE_DELAY);

      return { success: true, action: payload.action };
    } catch (err) {
      return {
        success: false,
        action: payload.action,
        error: err instanceof Error ? err.message : "Unknown error during block insertion",
      };
    }
  }

  private async executeUpdateBlock(payload: UpdateBlockPayload): Promise<EditResult> {
    const editor = this.getEditor();
    if (!editor) {
      return { success: false, action: payload.action, error: "Editor not available" };
    }

    try {
      this.lockEditor();

      // Locate the block node by its blockId.
      let found: { pos: number; attrs: Record<string, unknown>; nodeSize: number } | null = null;
      editor.state.doc.descendants((node, pos) => {
        if (found) return false;
        const bid = (node.attrs as Record<string, unknown> | undefined)?.blockId;
        if (bid === payload.blockId) {
          found = {
            pos,
            attrs: node.attrs as Record<string, unknown>,
            nodeSize: node.nodeSize,
          };
          return false;
        }
        return true;
      });
      const target = found as { pos: number; attrs: Record<string, unknown>; nodeSize: number } | null;
      if (!target) {
        return {
          success: false,
          action: payload.action,
          error: `Block "${payload.blockId}" was not found in the document.`,
        };
      }

      editor.chain().setTextSelection(target.pos).scrollIntoView().run();
      if (this.aborted) return { success: false, action: payload.action, error: "Aborted" };
      await sleep(CURSOR_ARRIVAL_DELAY);

      // Merge the changed attrs into the live node's attrs.
      const tr = editor.state.tr.setNodeMarkup(target.pos, undefined, {
        ...target.attrs,
        ...payload.attrs,
      });
      editor.view.dispatch(tr);

      this.applyAiHighlight(editor, target.pos, target.pos + target.nodeSize);

      // A bot edit must not leave the block selected / hijack the right rail.
      useBlockStore.getState().clearSelection();

      await sleep(SETTLE_DELAY);

      return { success: true, action: payload.action };
    } catch (err) {
      return {
        success: false,
        action: payload.action,
        error: err instanceof Error ? err.message : "Unknown error during block update",
      };
    }
  }

  // ─── Structured content insertion ───────────────────────────

  /**
   * Insert markdown content as properly formatted TipTap nodes.
   * Parses the markdown to TipTap JSON, then inserts node-by-node
   * with brief delays for a progressive "reveal" animation.
   */
  private async insertStructuredContent(
    editor: Editor,
    pos: number,
    markdown: string
  ): Promise<number> {
    const tiptapJson = markdownToTiptap(markdown);
    const nodes = tiptapJson.content || [];

    if (nodes.length === 0) return pos;

    const docSizeBefore = editor.state.doc.content.size;

    // Insert nodes one-by-one with delays for progressive reveal
    for (let i = 0; i < nodes.length; i++) {
      if (this.aborted) return editor.state.doc.content.size - 1;

      // insertContentAt handles proper ProseMirror node creation
      // (paragraphs, headings, lists, formatted text, etc.)
      editor.commands.insertContentAt(
        // After each insertion the document grows, so we insert at the end
        // of previously inserted content. For the first node, use `pos`.
        // For subsequent nodes, use the current document size minus 1
        // (just before the trailing doc boundary).
        i === 0 ? pos : editor.state.doc.content.size - 1,
        nodes[i]
      );

      // Brief delay between nodes for animation feel
      if (i < nodes.length - 1) {
        await sleep(NODE_INSERT_DELAY);
      }
    }

    // Return end position: original pos + how much the document grew
    const growth = editor.state.doc.content.size - docSizeBefore;
    return pos + growth;
  }

  // ─── Character-by-character typing ─────────────────────────

  private async typeText(editor: Editor, startPos: number, text: string): Promise<number> {
    let currentPos = startPos;
    let charsSinceLastPause = 0;
    const nextPauseAt = randomBetween(MICRO_PAUSE_INTERVAL_MIN, MICRO_PAUSE_INTERVAL_MAX);

    for (let i = 0; i < text.length; i++) {
      if (this.aborted) return currentPos;

      const char = text[i];

      // Insert single character via transaction
      const tr = editor.state.tr.insertText(char, currentPos);
      editor.view.dispatch(tr);
      currentPos++;
      charsSinceLastPause++;

      // Base typing delay
      const baseDelay = randomBetween(TYPE_SPEED_MIN, TYPE_SPEED_MAX);
      await sleep(baseDelay);

      // Sentence boundary pause
      if ((char === "." || char === "!" || char === "?") && i < text.length - 1 && text[i + 1] === " ") {
        await sleep(SENTENCE_PAUSE);
      }

      // Micro-pause every N characters
      if (charsSinceLastPause >= nextPauseAt) {
        await sleep(randomBetween(MICRO_PAUSE_MIN, MICRO_PAUSE_MAX));
        charsSinceLastPause = 0;
      }
    }

    return currentPos;
  }

  // ─── AI highlight mark application ────────────────────────

  /**
   * Apply the aiHighlight mark to a range of content.
   * Uses a raw ProseMirror transaction to add the mark across
   * text nodes in the specified range.
   */
  private applyAiHighlight(editor: Editor, from: number, to: number): void {
    const markType = editor.schema.marks.aiHighlight;
    if (!markType) return; // Mark not registered — silently skip

    try {
      const tr = editor.state.tr.addMark(
        from,
        to,
        markType.create({ source: "ai" })
      );
      editor.view.dispatch(tr);
    } catch {
      // Non-critical — don't fail the edit if marking fails
    }
  }

  // ─── Lock / unlock editor ──────────────────────────────────

  /**
   * Lock the editor (setEditable(false)) to prevent user input.
   * Called at Phase 3 of each edit, after the visual selection phase
   * which needs contenteditable=true for native selection rendering.
   */
  private lockEditor(): void {
    const editor = this.getEditor();
    if (editor) {
      editor.setEditable(false);
    }
  }

  private unlock(): void {
    const editor = this.getEditor();
    if (editor) {
      editor.setEditable(true);
    }
    this.onStateChange(false);
  }

  // ─── Timeout failsafe ─────────────────────────────────────

  private startTimeout(): void {
    this.clearTimeout();
    this.timeoutId = setTimeout(() => {
      console.warn("[AiEditOrchestrator] Timeout — force aborting AI edits");
      this.abort();
      this.onEditResult({
        success: false,
        action: "Timeout",
        error: "AI editing timed out after 30 seconds. Editor unlocked.",
      });
    }, TIMEOUT_MS);
  }

  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
