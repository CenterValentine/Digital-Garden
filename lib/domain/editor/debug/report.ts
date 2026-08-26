/**
 * Input Trace Report (Development Only)
 *
 * Renders a captured session as markdown for a human or an AI assistant to
 * read. The timeline is emitted inside a fenced block so column alignment
 * survives pasting into a chat, and every derived note is surfaced twice —
 * once in a "flagged" digest at the top, once inline in the timeline.
 */

import type {
  InputTraceEvent,
  InputTraceSession,
  InputTraceSnapshot,
} from "./types";

function formatPath(snapshot: InputTraceSnapshot): string {
  return snapshot.path
    .map((entry) => {
      if (!entry.attrs) return entry.type;
      const pairs = Object.entries(entry.attrs)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(",");
      return `${entry.type}{${pairs}}`;
    })
    .join(" > ");
}

/**
 * `stored` distinguishes three states that behave very differently:
 * `unset` (marks come from the document), `cleared` (explicitly emptied — the
 * usual cause of formatting dying at a boundary), or a pinned list.
 */
function formatMarks(snapshot: InputTraceSnapshot): string {
  const stored =
    snapshot.marks.stored === null
      ? "unset"
      : snapshot.marks.stored.length === 0
        ? "cleared"
        : snapshot.marks.stored.join(", ");
  const resolved = snapshot.marks.resolved.length > 0 ? snapshot.marks.resolved.join(", ") : "—";
  return `stored: ${stored} | resolved: ${resolved}`;
}

function formatSnapshot(snapshot: InputTraceSnapshot | null): string {
  if (!snapshot) return "(unavailable)";
  const range = snapshot.empty
    ? `sel ${snapshot.from} empty`
    : `sel ${snapshot.from}..${snapshot.to}`;
  return `${formatPath(snapshot)} | ${range} ${snapshot.selectionType} | ${formatMarks(snapshot)}`;
}

function describeKey(event: InputTraceEvent): string {
  const parts: string[] = [];
  if (event.mods.length > 0) parts.push(event.mods.join("+"));
  if (event.key) parts.push(event.key);
  const chord = parts.length > 0 ? parts.join("+") : event.kind;
  return event.inputType ? `${chord} [${event.inputType}]` : chord;
}

function renderEvent(event: InputTraceEvent): string {
  const lines: string[] = [];
  lines.push(`#${event.seq}  +${event.t}ms  ${event.kind}  ${describeKey(event)}  (src: ${event.source})`);

  if (event.data !== undefined) lines.push(`  data     ${JSON.stringify(event.data)}`);
  lines.push(`  before   ${formatSnapshot(event.before)}`);
  lines.push(`  after    ${formatSnapshot(event.after)}`);

  if (event.clipboard) {
    lines.push(`  clip     types: ${event.clipboard.types.join(", ") || "—"}`);
    if (event.clipboard.text) lines.push(`  clip.txt ${JSON.stringify(event.clipboard.text)}`);
    if (event.clipboard.html) lines.push(`  clip.htm ${JSON.stringify(event.clipboard.html)}`);
  }

  if (event.tx) {
    const flags = [
      event.tx.docChanged ? "docChanged" : "no-doc-change",
      event.tx.selectionSet ? "selectionSet" : null,
      event.tx.storedMarksSet ? "storedMarksSet" : null,
    ].filter(Boolean);
    lines.push(`  tx       ${event.tx.count}× ${flags.join(" ")}`);
    if (event.tx.meta.length > 0) lines.push(`  tx.meta  ${event.tx.meta.join(", ")}`);
    for (const step of event.tx.steps) lines.push(`    · ${step.summary}`);
  } else {
    lines.push("  tx       none");
  }

  for (const note of event.notes) lines.push(`  ⚠ ${note}`);

  return lines.join("\n");
}

/** Notes that indicate something worth looking at, rather than routine flow. */
function isFlagged(event: InputTraceEvent): boolean {
  return event.notes.some(
    (note) =>
      note.startsWith("marks dropped") ||
      note.startsWith("node path changed") ||
      note.startsWith("selection type changed") ||
      note === "no transaction produced"
  );
}

export function buildInputTraceMarkdown(session: InputTraceSession): string {
  const { meta, events } = session;
  const flagged = events.filter(isFlagged);

  const out: string[] = [];
  out.push("# TipTap Input Trace");
  out.push("");
  out.push(`- Started: ${meta.startedAt || "—"}`);
  out.push(`- Stopped: ${meta.stoppedAt ?? "(still recording)"}`);
  out.push(`- Duration: ${(meta.durationMs / 1000).toFixed(1)}s`);
  out.push(`- Events: ${meta.eventCount}${meta.droppedCount > 0 ? ` (${meta.droppedCount} dropped from the head of the buffer)` : ""}`);
  out.push(`- Flagged: ${flagged.length}`);
  out.push(`- Text redacted: ${meta.redacted ? "yes" : "no"}`);
  out.push(`- TipTap schema: ${meta.schemaVersion}`);
  out.push(`- URL: ${meta.url}`);
  out.push(`- User agent: ${meta.userAgent}`);
  out.push("");

  out.push("## Flagged events");
  out.push("");
  if (flagged.length === 0) {
    out.push("_None — no dropped marks, node-path changes or dead keystrokes._");
  } else {
    out.push("Events where marks were dropped, the node path shifted, or a keystroke produced nothing.");
    out.push("");
    out.push("```text");
    out.push(flagged.map(renderEvent).join("\n\n"));
    out.push("```");
  }
  out.push("");

  out.push("## Timeline");
  out.push("");
  if (events.length === 0) {
    out.push("_No events captured._");
  } else {
    out.push("```text");
    out.push(events.map(renderEvent).join("\n\n"));
    out.push("```");
  }
  out.push("");

  out.push("## Extensions loaded");
  out.push("");
  out.push(meta.extensions.length > 0 ? meta.extensions.join(", ") : "_none reported_");
  out.push("");

  return out.join("\n");
}

export function buildInputTraceJson(session: InputTraceSession): string {
  return JSON.stringify(session, null, 2);
}
