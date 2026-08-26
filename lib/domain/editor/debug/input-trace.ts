/**
 * Input Trace Recorder (Development Only)
 *
 * Correlates keystrokes with the ProseMirror transactions they produce, so a
 * TipTap formatting quirk can be read back as "this key, in this node, with
 * these marks pinned, produced these steps and left these marks".
 *
 * Design constraints:
 *  • Observe only. Listeners are capture-phase and passive; nothing calls
 *    preventDefault/stopPropagation, so editor behaviour is unchanged.
 *  • Inert outside `next dev` — `attach()` and `start()` are no-ops, so the
 *    module costs nothing in production beyond its own bytes.
 *  • Framework-free. React state lives in `state/input-trace-store.ts`, which
 *    subscribes to this singleton. This module never imports it (no cycle).
 */

import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";

import { TIPTAP_SCHEMA_VERSION } from "../schema-version";
import { captureSnapshot, describeMeta, previewText, summarizeStep } from "./snapshot";
import type {
  InputTraceEvent,
  InputTraceEventKind,
  InputTraceOptions,
  InputTraceSession,
  InputTraceTransactionInfo,
} from "./types";

const IS_DEV = process.env.NODE_ENV === "development";

const DEFAULT_MAX_EVENTS = 5000;

/**
 * How long to keep an event open for late transactions. Keymap-handled keys
 * dispatch synchronously, but plain text insertion round-trips through
 * `beforeinput` → DOM mutation → ProseMirror's DOMObserver flush, which lands
 * a tick or two later. 32ms comfortably covers both without merging
 * neighbouring keystrokes at realistic typing speeds.
 */
const SETTLE_MS = 32;

/** Coalesce subscriber notifications so fast typing can't thrash React. */
const NOTIFY_THROTTLE_MS = 120;

const CLIPBOARD_PREVIEW_LIMIT = 2000;

/** Bare modifier presses produce no transaction and would flood the log. */
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph"]);

interface AttachedEditor {
  editor: Editor;
  source: string;
  extensions: string[];
}

interface PendingEvent {
  event: InputTraceEvent;
  editor: Editor;
  timer: ReturnType<typeof setTimeout> | null;
}

function modifiersOf(event: KeyboardEvent): string[] {
  const mods: string[] = [];
  if (event.metaKey) mods.push("Meta");
  if (event.ctrlKey) mods.push("Ctrl");
  if (event.altKey) mods.push("Alt");
  if (event.shiftKey) mods.push("Shift");
  return mods;
}

function emptyTx(): InputTraceTransactionInfo {
  return {
    count: 0,
    docChanged: false,
    selectionSet: false,
    storedMarksSet: false,
    steps: [],
    meta: [],
  };
}

/**
 * The derived signals that make a trace readable at a glance. Mark drift is
 * the single most common explanation for "my formatting turned itself off".
 */
function annotate(event: InputTraceEvent): void {
  const { before, after } = event;

  if (!event.tx || event.tx.count === 0) {
    event.notes.push("no transaction produced");
  } else if (!event.tx.docChanged && event.tx.steps.length === 0) {
    event.notes.push("transaction produced no document change");
  }

  if (!before || !after) return;

  const beforeMarks = new Set(before.marks.stored ?? before.marks.resolved);
  const afterMarks = new Set(after.marks.stored ?? after.marks.resolved);
  const dropped = [...beforeMarks].filter((mark) => !afterMarks.has(mark));
  const gained = [...afterMarks].filter((mark) => !beforeMarks.has(mark));
  if (dropped.length > 0) event.notes.push(`marks dropped: ${dropped.join(", ")}`);
  if (gained.length > 0) event.notes.push(`marks gained: ${gained.join(", ")}`);

  const beforePath = before.path.map((entry) => entry.type).join(" > ");
  const afterPath = after.path.map((entry) => entry.type).join(" > ");
  if (beforePath !== afterPath) {
    event.notes.push(`node path changed: ${beforePath} → ${afterPath}`);
  }

  if (before.selectionType !== after.selectionType) {
    event.notes.push(`selection type changed: ${before.selectionType} → ${after.selectionType}`);
  }
}

class InputTraceRecorder {
  private recording = false;
  private events: InputTraceEvent[] = [];
  private pending: PendingEvent | null = null;
  private attached = new Map<Editor, AttachedEditor>();
  private listeners = new Set<() => void>();

  private seq = 0;
  private dropped = 0;
  private startedAt: number | null = null;
  private startedAtIso: string | null = null;
  private stoppedAtIso: string | null = null;

  private notifyTimer: ReturnType<typeof setTimeout> | null = null;

  private options: InputTraceOptions = {
    redactText: false,
    maxEvents: DEFAULT_MAX_EVENTS,
  };

  // ── lifecycle ──

  /**
   * Wire capture-phase observers onto one editor. Returns a detach function.
   * Safe to call for every editor mount; listeners no-op while not recording.
   */
  attach(editor: Editor, source: string): () => void {
    if (!IS_DEV || typeof window === "undefined") return () => {};

    const dom = editor.view?.dom as HTMLElement | undefined;
    if (!dom) return () => {};

    let extensions: string[] = [];
    try {
      extensions = editor.extensionManager.extensions.map((extension) => extension.name);
    } catch {
      extensions = [];
    }
    this.attached.set(editor, { editor, source, extensions });

    const onKeyDown = (event: Event) => {
      this.handleKeyDown(editor, source, event as KeyboardEvent);
    };
    const onBeforeInput = (event: Event) => {
      this.handleBeforeInput(editor, source, event as InputEvent);
    };
    const onComposition = (event: Event) => {
      this.handleComposition(editor, source, event as CompositionEvent);
    };
    const onPaste = (event: Event) => {
      this.handlePaste(editor, source, event as ClipboardEvent);
    };
    const onTransaction = ({ transaction }: { transaction: Transaction }) => {
      this.handleTransaction(editor, source, transaction);
    };

    // Capture phase: our snapshot must run before ProseMirror's own handlers.
    // Passive: we never call preventDefault, and the flag makes that a
    // guarantee the browser enforces rather than a promise in a comment.
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    dom.addEventListener("keydown", onKeyDown, opts);
    dom.addEventListener("beforeinput", onBeforeInput, opts);
    dom.addEventListener("compositionstart", onComposition, opts);
    dom.addEventListener("compositionend", onComposition, opts);
    dom.addEventListener("paste", onPaste, opts);
    editor.on("transaction", onTransaction);

    this.notify();

    return () => {
      dom.removeEventListener("keydown", onKeyDown, opts);
      dom.removeEventListener("beforeinput", onBeforeInput, opts);
      dom.removeEventListener("compositionstart", onComposition, opts);
      dom.removeEventListener("compositionend", onComposition, opts);
      dom.removeEventListener("paste", onPaste, opts);
      editor.off("transaction", onTransaction);
      this.attached.delete(editor);
      if (this.pending?.editor === editor) this.flushPending();
      this.notify();
    };
  }

  start(): void {
    if (!IS_DEV || this.recording) return;
    this.events = [];
    this.seq = 0;
    this.dropped = 0;
    this.pending = null;
    this.startedAt = Date.now();
    this.startedAtIso = new Date(this.startedAt).toISOString();
    this.stoppedAtIso = null;
    this.recording = true;
    this.notify(true);
  }

  stop(): void {
    if (!this.recording) return;
    this.flushPending();
    this.recording = false;
    this.stoppedAtIso = new Date().toISOString();
    this.notify(true);
  }

  clear(): void {
    this.events = [];
    this.seq = 0;
    this.dropped = 0;
    this.pending = null;
    this.startedAt = this.recording ? Date.now() : null;
    this.startedAtIso = this.recording && this.startedAt ? new Date(this.startedAt).toISOString() : null;
    this.stoppedAtIso = null;
    this.notify(true);
  }

  setOptions(next: Partial<InputTraceOptions>): void {
    this.options = { ...this.options, ...next };
    this.notify(true);
  }

  // ── reads ──

  isRecording(): boolean {
    return this.recording;
  }

  getOptions(): InputTraceOptions {
    return this.options;
  }

  getEvents(): InputTraceEvent[] {
    return this.events;
  }

  getDroppedCount(): number {
    return this.dropped;
  }

  getAttachedCount(): number {
    return this.attached.size;
  }

  getSession(): InputTraceSession {
    const extensions = new Set<string>();
    for (const entry of this.attached.values()) {
      for (const name of entry.extensions) extensions.add(name);
    }

    return {
      meta: {
        startedAt: this.startedAtIso ?? "",
        stoppedAt: this.stoppedAtIso,
        durationMs: this.startedAt ? Date.now() - this.startedAt : 0,
        eventCount: this.events.length,
        droppedCount: this.dropped,
        redacted: this.options.redactText,
        userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
        url: typeof window === "undefined" ? "" : window.location.href,
        schemaVersion: TIPTAP_SCHEMA_VERSION,
        extensions: [...extensions].sort(),
      },
      events: this.events,
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ── event handlers ──

  private handleKeyDown(editor: Editor, source: string, event: KeyboardEvent): void {
    if (!this.recording) return;
    if (MODIFIER_KEYS.has(event.key)) return;

    // A new keystroke seals the previous one even if its settle timer is still
    // running — otherwise fast typing would merge two keys into one event.
    this.flushPending();

    this.openEvent(editor, source, "key", {
      key: event.key,
      code: event.code,
      mods: modifiersOf(event),
      isComposing: event.isComposing,
    });
  }

  private handleBeforeInput(editor: Editor, source: string, event: InputEvent): void {
    if (!this.recording) return;

    const data = event.data ?? undefined;

    if (this.pending && this.pending.editor === editor) {
      // Same user action as the open keydown — enrich it with the browser's
      // declared intent rather than logging a second event. A repeat
      // beforeinput inside one settle window (common during IME) is part of
      // the same action, so it is folded in rather than dropped.
      if (!this.pending.event.inputType) {
        this.pending.event.inputType = event.inputType;
      }
      if (data !== undefined && this.pending.event.data === undefined) {
        this.pending.event.data = previewText(data, this.options.redactText);
      }
      return;
    }

    // No open event for this editor: IME commit, autocorrect, dictation or a
    // toolbar-driven insertion. Worth a record of its own.
    this.flushPending();
    this.openEvent(editor, source, "beforeinput", {
      mods: [],
      inputType: event.inputType,
      ...(data !== undefined ? { data: previewText(data, this.options.redactText) } : {}),
    });
  }

  private handleComposition(editor: Editor, source: string, event: CompositionEvent): void {
    if (!this.recording) return;
    this.flushPending();
    this.openEvent(editor, source, "composition", {
      mods: [],
      key: event.type,
      ...(event.data ? { data: previewText(event.data, this.options.redactText) } : {}),
    });
  }

  private handlePaste(editor: Editor, source: string, event: ClipboardEvent): void {
    if (!this.recording) return;

    const clipboard = event.clipboardData;
    const redact = this.options.redactText;
    const text = clipboard?.getData("text/plain") ?? "";
    const html = clipboard?.getData("text/html") ?? "";
    const payload = {
      types: clipboard ? [...clipboard.types] : [],
      ...(text ? { text: previewText(text, redact, CLIPBOARD_PREVIEW_LIMIT) } : {}),
      ...(html ? { html: previewText(html, redact, CLIPBOARD_PREVIEW_LIMIT) } : {}),
    };

    // Paste arrives after its Cmd+V keydown; fold it into that open event so
    // the trace shows one action, not two.
    if (this.pending && this.pending.editor === editor) {
      this.pending.event.kind = "paste";
      this.pending.event.clipboard = payload;
      return;
    }

    this.flushPending();
    this.openEvent(editor, source, "paste", { mods: [], clipboard: payload });
  }

  private handleTransaction(editor: Editor, source: string, tr: Transaction): void {
    if (!this.recording) return;

    if (this.pending && this.pending.editor === editor) {
      this.mergeTransaction(this.pending.event, tr);
      // Appended transactions (input rules, collab sync) belong to the same
      // keystroke, so restart the settle window rather than sealing now.
      this.scheduleFlush();
      return;
    }

    // Unattributed transaction: programmatic command, remote collaborative
    // update, or an async effect. Selection-only churn (mouse moves, caret
    // repaints) is dropped — it would drown the log without explaining a quirk.
    if (!tr.docChanged && !tr.storedMarksSet) return;

    const event = this.newEvent(source, "transaction", { mods: [] });
    event.before = null;
    this.mergeTransaction(event, tr);
    event.after = captureSnapshot(editor, this.options.redactText);
    annotate(event);
    this.push(event);
  }

  // ── pending-event machinery ──

  private newEvent(
    source: string,
    kind: InputTraceEventKind,
    fields: Partial<InputTraceEvent> & { mods: string[] }
  ): InputTraceEvent {
    this.seq += 1;
    return {
      seq: this.seq,
      t: this.startedAt ? Date.now() - this.startedAt : 0,
      kind,
      source,
      before: null,
      after: null,
      tx: null,
      notes: [],
      ...fields,
    };
  }

  private openEvent(
    editor: Editor,
    source: string,
    kind: InputTraceEventKind,
    fields: Partial<InputTraceEvent> & { mods: string[] }
  ): void {
    const event = this.newEvent(source, kind, fields);
    event.before = captureSnapshot(editor, this.options.redactText);
    this.pending = { event, editor, timer: null };
    this.scheduleFlush();
  }

  private mergeTransaction(event: InputTraceEvent, tr: Transaction): void {
    const info = event.tx ?? emptyTx();
    info.count += 1;
    info.docChanged = info.docChanged || tr.docChanged;
    info.selectionSet = info.selectionSet || tr.selectionSet;
    info.storedMarksSet = info.storedMarksSet || tr.storedMarksSet;
    for (const step of tr.steps) {
      info.steps.push(summarizeStep(step, this.options.redactText));
    }
    for (const key of describeMeta(tr)) {
      if (!info.meta.includes(key)) info.meta.push(key);
    }
    event.tx = info;
  }

  private scheduleFlush(): void {
    if (!this.pending) return;
    if (this.pending.timer) clearTimeout(this.pending.timer);
    this.pending.timer = setTimeout(() => this.flushPending(), SETTLE_MS);
  }

  private flushPending(): void {
    const pending = this.pending;
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    this.pending = null;

    const { event, editor } = pending;
    event.after = captureSnapshot(editor, this.options.redactText);
    annotate(event);
    this.push(event);
  }

  private push(event: InputTraceEvent): void {
    this.events.push(event);
    const overflow = this.events.length - this.options.maxEvents;
    if (overflow > 0) {
      this.events.splice(0, overflow);
      this.dropped += overflow;
    }
    this.notify();
  }

  // ── subscriber fan-out ──

  private notify(immediate = false): void {
    if (immediate) {
      if (this.notifyTimer) {
        clearTimeout(this.notifyTimer);
        this.notifyTimer = null;
      }
      for (const listener of this.listeners) listener();
      return;
    }
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      for (const listener of this.listeners) listener();
    }, NOTIFY_THROTTLE_MS);
  }
}

/** Process-wide singleton — multiple editors report into one timeline. */
export const inputTraceRecorder = new InputTraceRecorder();
