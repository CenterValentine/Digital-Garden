/**
 * Input Trace Debug View
 *
 * Records keystrokes alongside the ProseMirror transactions they produce, so
 * TipTap formatting quirks can be read back as cause and effect. Explicit
 * start/stop; export as markdown to the clipboard or to `.local/input-trace/`
 * for an AI assistant to read.
 *
 * Development only — mounted by MainPanelContent behind a NODE_ENV check.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  Save,
  Square,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { JSONContent } from "@tiptap/core";

import { Button } from "@/components/ui/glass/button";
import {
  buildInputTraceJson,
  buildInputTraceMarkdown,
  inputTraceRecorder,
  type InputTraceEvent,
  type InputTraceSnapshot,
} from "@/lib/domain/editor/debug";
import { useInputTraceStore } from "@/state/input-trace-store";

/** Matches the other debug views' props so it drops into the same switch. */
interface InputTraceDebugViewProps {
  content: JSONContent;
  title: string;
}

/** Keep the DOM bounded — a long session can hold thousands of events. */
const MAX_RENDERED = 400;

const MONO = '"JetBrains Mono", "Fira Code", "Courier New", monospace';

function formatPath(snapshot: InputTraceSnapshot): string {
  return snapshot.path.map((entry) => entry.type).join(" › ");
}

function formatMarks(snapshot: InputTraceSnapshot): string {
  const stored =
    snapshot.marks.stored === null
      ? "unset"
      : snapshot.marks.stored.length === 0
        ? "cleared"
        : snapshot.marks.stored.join(", ");
  const resolved = snapshot.marks.resolved.length > 0 ? snapshot.marks.resolved.join(", ") : "—";
  return `stored ${stored} · resolved ${resolved}`;
}

function describeChord(event: InputTraceEvent): string {
  const parts: string[] = [];
  if (event.mods.length > 0) parts.push(event.mods.join("+"));
  if (event.key) parts.push(event.key);
  return parts.length > 0 ? parts.join("+") : event.kind;
}

function isFlagged(event: InputTraceEvent): boolean {
  return event.notes.some(
    (note) =>
      note.startsWith("marks dropped") ||
      note.startsWith("node path changed") ||
      note.startsWith("selection type changed") ||
      note === "no transaction produced"
  );
}

function SnapshotRow({ label, snapshot }: { label: string; snapshot: InputTraceSnapshot | null }) {
  if (!snapshot) {
    return (
      <div className="flex gap-2">
        <span className="w-14 flex-none text-gray-500">{label}</span>
        <span className="text-gray-600">(unavailable)</span>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <span className="w-14 flex-none text-gray-500">{label}</span>
      <span className="text-gray-300">
        <span className="text-cyan-400">{formatPath(snapshot)}</span>
        {"  "}
        <span className="text-gray-500">
          {snapshot.empty ? `sel ${snapshot.from}` : `sel ${snapshot.from}..${snapshot.to}`}
        </span>
        {"  "}
        <span className="text-purple-300">{formatMarks(snapshot)}</span>
      </span>
    </div>
  );
}

function EventRow({
  event,
  expanded,
  onToggle,
}: {
  event: InputTraceEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const flagged = isFlagged(event);
  const stepCount = event.tx?.steps.length ?? 0;

  return (
    <div
      className={`border-l-2 pl-2 py-1 ${
        flagged ? "border-amber-500/70 bg-amber-500/5" : "border-white/10"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-2 text-left hover:bg-white/5 rounded px-1 -mx-1"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 mt-0.5 flex-none text-gray-500" />
        ) : (
          <ChevronRight className="h-3 w-3 mt-0.5 flex-none text-gray-500" />
        )}
        <span className="w-10 flex-none text-gray-600 tabular-nums">#{event.seq}</span>
        <span className="w-14 flex-none text-gray-600 tabular-nums">+{event.t}ms</span>
        <span className="flex-none text-yellow-300 font-semibold">{describeChord(event)}</span>
        {event.inputType && <span className="flex-none text-blue-400">[{event.inputType}]</span>}
        <span className="flex-1 truncate text-gray-500">
          {stepCount > 0 ? `${stepCount} step${stepCount === 1 ? "" : "s"}` : "no steps"}
          {event.tx?.docChanged ? " · docChanged" : ""}
        </span>
        {flagged && <AlertTriangle className="h-3 w-3 mt-0.5 flex-none text-amber-400" />}
      </button>

      {expanded && (
        <div className="pl-5 pt-1 pb-1 space-y-0.5">
          {event.data !== undefined && (
            <div className="flex gap-2">
              <span className="w-14 flex-none text-gray-500">data</span>
              <span className="text-green-300">{JSON.stringify(event.data)}</span>
            </div>
          )}
          <SnapshotRow label="before" snapshot={event.before} />
          <SnapshotRow label="after" snapshot={event.after} />

          {event.clipboard && (
            <div className="flex gap-2">
              <span className="w-14 flex-none text-gray-500">clip</span>
              <span className="text-gray-300 break-all">
                {event.clipboard.types.join(", ") || "—"}
                {event.clipboard.text ? ` · ${JSON.stringify(event.clipboard.text)}` : ""}
              </span>
            </div>
          )}

          {event.tx ? (
            <>
              <div className="flex gap-2">
                <span className="w-14 flex-none text-gray-500">tx</span>
                <span className="text-gray-300">
                  {event.tx.count}× ·{" "}
                  {event.tx.docChanged ? "docChanged" : "no-doc-change"}
                  {event.tx.storedMarksSet ? " · storedMarksSet" : ""}
                  {event.tx.meta.length > 0 ? ` · meta: ${event.tx.meta.join(", ")}` : ""}
                </span>
              </div>
              {event.tx.steps.map((step, index) => (
                <div key={index} className="flex gap-2">
                  <span className="w-14 flex-none" />
                  <span className="text-orange-300">· {step.summary}</span>
                </div>
              ))}
            </>
          ) : (
            <div className="flex gap-2">
              <span className="w-14 flex-none text-gray-500">tx</span>
              <span className="text-gray-600">none</span>
            </div>
          )}

          {event.notes.map((note, index) => (
            <div key={index} className="flex gap-2">
              <span className="w-14 flex-none text-gray-500">note</span>
              <span className="text-amber-300">⚠ {note}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function InputTraceDebugView({ title }: InputTraceDebugViewProps) {
  const isRecording = useInputTraceStore((state) => state.isRecording);
  const events = useInputTraceStore((state) => state.events);
  const droppedCount = useInputTraceStore((state) => state.droppedCount);
  const attachedEditors = useInputTraceStore((state) => state.attachedEditors);
  const redactText = useInputTraceStore((state) => state.redactText);
  const toggleRecording = useInputTraceStore((state) => state.toggleRecording);
  const clear = useInputTraceStore((state) => state.clear);
  const setRedactText = useInputTraceStore((state) => state.setRedactText);
  const sync = useInputTraceStore((state) => state.sync);

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const flaggedCount = useMemo(() => events.filter(isFlagged).length, [events]);
  const rendered = events.length > MAX_RENDERED ? events.slice(-MAX_RENDERED) : events;

  // The recorder throttles its notifications, so the panel can mount between
  // them holding stale counts. Pull once on open.
  useEffect(() => {
    sync();
  }, [sync]);

  // Follow the tail while recording so the newest keystroke stays visible.
  useEffect(() => {
    if (!isRecording) return;
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [events.length, isRecording]);

  const toggleExpanded = useCallback((seq: number) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(seq)) {
        next.delete(seq);
      } else {
        next.add(seq);
      }
      return next;
    });
  }, []);

  const handleCopy = useCallback(async () => {
    const markdown = buildInputTraceMarkdown(inputTraceRecorder.getSession());
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      toast.success("Trace report copied — paste it to the assistant");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Clipboard write failed");
    }
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const session = inputTraceRecorder.getSession();
      const response = await fetch("/api/dev/input-trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown: buildInputTraceMarkdown(session),
          json: buildInputTraceJson(session),
          label: title,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = (await response.json()) as { markdownPath?: string };
      toast.success(`Saved to ${result.markdownPath ?? ".local/input-trace/"}`);
    } catch (error) {
      toast.error(error instanceof Error ? `Save failed: ${error.message}` : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [title]);

  return (
    <div className="h-full flex flex-col bg-black/40" style={{ fontFamily: MONO }}>
      {/* Header */}
      <div className="flex-none px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Input Trace</h3>
          <p className="text-xs text-gray-400 truncate">{title}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-none">
          <Button
            onClick={toggleRecording}
            size="sm"
            variant={isRecording ? "default" : "ghost"}
            className="gap-1.5 border border-white/10"
            style={isRecording ? { background: "rgba(239, 68, 68, 0.25)" } : undefined}
            title={isRecording ? "Stop recording" : "Start recording"}
          >
            {isRecording ? (
              <>
                <Square className="h-3 w-3 fill-current" />
                Stop
              </>
            ) : (
              <>
                <Circle className="h-3 w-3 fill-current text-red-500" />
                Record
              </>
            )}
          </Button>
          <Button onClick={handleCopy} size="sm" variant="ghost" title="Copy markdown report">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
          <Button
            onClick={handleSave}
            size="sm"
            variant="ghost"
            disabled={saving}
            title="Save to .local/input-trace/"
          >
            <Save className="h-3 w-3" />
          </Button>
          <Button onClick={clear} size="sm" variant="ghost" title="Clear captured events">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Options */}
      <div className="flex-none px-4 py-2 border-b border-white/10 flex items-center gap-4 text-xs">
        <label className="flex items-center gap-1.5 text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={redactText}
            onChange={(event) => setRedactText(event.target.checked)}
            className="accent-amber-500"
          />
          Redact text
        </label>
        <span className="text-gray-500">
          {attachedEditors} editor{attachedEditors === 1 ? "" : "s"} attached
        </span>
        {isRecording && (
          <span className="flex items-center gap-1.5 text-red-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            recording
          </span>
        )}
      </div>

      {/* Events */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-3 py-2 text-xs">
        {events.length === 0 ? (
          <div className="h-full flex items-center justify-center px-6">
            <div className="text-center text-gray-500 max-w-sm space-y-2">
              <p className="text-gray-400">No events captured.</p>
              <p>
                Press <span className="text-gray-300">Record</span>, reproduce the formatting quirk
                in the editor, then press <span className="text-gray-300">Stop</span>.
              </p>
              <p>
                Each keystroke is paired with the transaction it produced — node path, stored vs.
                resolved marks, and every ProseMirror step. Rows flagged in amber are where marks
                were dropped or the node path shifted.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-0.5">
            {events.length > MAX_RENDERED && (
              <div className="text-gray-600 pb-2">
                Showing the last {MAX_RENDERED} of {events.length} events — export for the full log.
              </div>
            )}
            {rendered.map((event) => (
              <EventRow
                key={event.seq}
                event={event}
                expanded={expanded.has(event.seq)}
                onToggle={() => toggleExpanded(event.seq)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Stats footer */}
      <div className="flex-none px-4 py-2 border-t border-white/10 flex items-center gap-3 text-xs text-gray-400">
        <span>{events.length} events</span>
        <span>•</span>
        <span className={flaggedCount > 0 ? "text-amber-400" : undefined}>
          {flaggedCount} flagged
        </span>
        {droppedCount > 0 && (
          <>
            <span>•</span>
            <span className="text-gray-500">{droppedCount} dropped</span>
          </>
        )}
      </div>
    </div>
  );
}
