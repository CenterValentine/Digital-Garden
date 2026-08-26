/**
 * Input Trace Snapshots (Development Only)
 *
 * Turns live ProseMirror state and transaction steps into the compact,
 * serializable shapes the trace log stores. Everything here is pure and
 * defensive — a debug tool must never throw into the editor's event path.
 */

import type { Editor } from "@tiptap/core";
import type { Mark, Node as PMNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import type { Step } from "@tiptap/pm/transform";

import type {
  InputTracePathEntry,
  InputTraceSnapshot,
  InputTraceStep,
} from "./types";

const TEXT_PREVIEW_LIMIT = 120;
const ATTR_STRING_LIMIT = 60;
const SLICE_PREVIEW_LIMIT = 400;

/**
 * Truncate for display, optionally bullet-masking while preserving length and
 * whitespace shape. `limit` is explicit because clipboard payloads need a far
 * larger budget than inline node previews — pasted HTML is usually the whole
 * evidence in a paste-related formatting bug.
 */
export function previewText(
  text: string,
  redact: boolean,
  limit: number = TEXT_PREVIEW_LIMIT
): string {
  const clipped = text.length > limit ? `${text.slice(0, limit)}…` : text;
  if (!redact) return clipped;
  return clipped.replace(/\S/g, "•");
}

/** Drop empty attrs and truncate long strings so paths stay one line. */
function compactAttrs(attrs: Record<string, unknown>): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === "") continue;
    if (typeof value === "string") {
      out[key] = value.length > ATTR_STRING_LIMIT ? `${value.slice(0, ATTR_STRING_LIMIT)}…` : value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else {
      // Objects/arrays (e.g. table cell attrs) — record shape, not contents.
      out[key] = Array.isArray(value) ? `[${value.length} items]` : "{…}";
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function describeMark(mark: Mark): string {
  const attrs = compactAttrs(mark.attrs);
  if (!attrs) return mark.type.name;
  const pairs = Object.entries(attrs)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(",");
  return `${mark.type.name}{${pairs}}`;
}

/**
 * Capture selection, ancestry and both mark sets. Called on the capture phase
 * of input events (so it is genuinely "before") and again after transactions
 * settle.
 */
export function captureSnapshot(editor: Editor, redact: boolean): InputTraceSnapshot | null {
  try {
    const state = editor.state;
    if (!state) return null;

    const { selection, storedMarks } = state;
    const { $from, from, to, empty } = selection;

    const path: InputTracePathEntry[] = [];
    for (let depth = 0; depth <= $from.depth; depth += 1) {
      const node: PMNode = $from.node(depth);
      const attrs = compactAttrs(node.attrs);
      path.push(attrs ? { type: node.type.name, attrs } : { type: node.type.name });
    }

    const parent = $from.parent;

    return {
      from,
      to,
      empty,
      path,
      marks: {
        stored: storedMarks ? storedMarks.map(describeMark) : null,
        resolved: $from.marks().map(describeMark),
      },
      parentType: parent.type.name,
      parentText: previewText(parent.textContent, redact),
      selectionType: selection.constructor.name,
    };
  } catch {
    // A debug probe must never destabilise the editor it observes.
    return null;
  }
}

// ── step summaries ──

type NodeJSONish = {
  type?: string;
  text?: string;
  marks?: Array<{ type?: string }>;
  content?: NodeJSONish[];
};

function describeNodeJSON(node: NodeJSONish, redact: boolean): string {
  if (node.type === "text") {
    const marks = (node.marks ?? [])
      .map((mark) => mark.type)
      .filter((name): name is string => Boolean(name));
    const text = JSON.stringify(previewText(node.text ?? "", redact));
    return marks.length > 0 ? `${text}·${marks.join("·")}` : text;
  }
  const inner = (node.content ?? []).map((child) => describeNodeJSON(child, redact)).join("");
  return inner ? `<${node.type ?? "?"}:${inner}>` : `<${node.type ?? "?"}>`;
}

function describeSlice(slice: unknown, redact: boolean): string {
  if (!slice || typeof slice !== "object") return "∅";
  const content = (slice as { content?: NodeJSONish[] }).content;
  if (!Array.isArray(content) || content.length === 0) return "∅";
  const rendered = content.map((node) => describeNodeJSON(node, redact)).join("");
  return rendered.length > SLICE_PREVIEW_LIMIT
    ? `${rendered.slice(0, SLICE_PREVIEW_LIMIT)}…`
    : rendered;
}

function num(value: unknown): string {
  return typeof value === "number" ? String(value) : "?";
}

/**
 * `step.toJSON()` is the stable cross-version shape, so we summarize from that
 * rather than instanceof-testing step classes.
 */
export function summarizeStep(step: Step, redact: boolean): InputTraceStep {
  let raw: Record<string, unknown>;
  try {
    raw = step.toJSON() as Record<string, unknown>;
  } catch {
    return { stepType: "unknown", summary: "unserializable step", raw: {} };
  }

  const stepType = typeof raw.stepType === "string" ? raw.stepType : "unknown";
  const from = num(raw.from);
  const to = num(raw.to);

  let summary: string;
  switch (stepType) {
    case "replace":
    case "replaceAround": {
      const slice = describeSlice(raw.slice, redact);
      summary = `${stepType} ${from}..${to} ← ${slice}`;
      break;
    }
    case "addMark":
    case "removeMark": {
      const mark = (raw.mark as { type?: string } | undefined)?.type ?? "?";
      summary = `${stepType} ${mark} ${from}..${to}`;
      break;
    }
    case "attr": {
      summary = `attr ${String(raw.attr)}=${JSON.stringify(raw.value)} @${num(raw.pos)}`;
      break;
    }
    case "docAttr": {
      summary = `docAttr ${String(raw.attr)}=${JSON.stringify(raw.value)}`;
      break;
    }
    default:
      summary = `${stepType} ${from}..${to}`;
  }

  // Keep the raw slice from bloating the log; the summary carries the shape.
  if (typeof raw.slice === "object" && raw.slice !== null) {
    const serialized = JSON.stringify(raw.slice);
    if (serialized.length > SLICE_PREVIEW_LIMIT * 4) {
      raw = { ...raw, slice: `[truncated ${serialized.length} bytes]` };
    }
  }

  return { stepType, summary, raw };
}

/**
 * Transaction meta is stored on a private bag keyed by plugin keys and strings.
 * Reading it is the only way to see `y-sync$`, `addToHistory`, `paste`, etc. —
 * exactly the signals that explain surprising collaborative or paste behaviour.
 */
export function describeMeta(tr: Transaction): string[] {
  const bag = (tr as unknown as { meta?: Record<string, unknown> }).meta;
  if (!bag) return [];
  return Object.keys(bag).map((key) => {
    const value = bag[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return `${key}=${String(value)}`;
    }
    return key;
  });
}
