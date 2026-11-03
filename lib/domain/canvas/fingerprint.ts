/**
 * Canvas archive — "has the user edited this note since we imported it?"
 *
 * Raw TipTap JSON can't answer that: opening a note gives its blocks ids and
 * fills attribute defaults, so a note the user only READ would hash as edited
 * and every re-import would raise a false conflict. The fingerprint keeps what
 * a person changes — node types, text, marks, and the few attributes that
 * carry meaning (a link's target, a heading's level, an image's file) — and
 * drops the rest.
 *
 * Pure: the server hashes the value with `stableHash`. Pinned by
 * `pnpm canvas:check`.
 */

const MEANINGFUL_ATTRS = ["href", "src", "contentId", "targetId", "level", "checked", "language"] as const;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function pickAttrs(attrs: unknown): Record<string, Json> | undefined {
  if (!attrs || typeof attrs !== "object") return undefined;
  const source = attrs as Record<string, unknown>;
  const kept: Record<string, Json> = {};
  for (const key of MEANINGFUL_ATTRS) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") kept[key] = value as Json;
  }
  return Object.keys(kept).length ? kept : undefined;
}

function fingerprintNode(node: unknown): Json {
  if (!node || typeof node !== "object") return null;
  const record = node as Record<string, unknown>;
  const out: Record<string, Json> = { t: String(record.type ?? "") };
  if (typeof record.text === "string") out.x = record.text;
  const attrs = pickAttrs(record.attrs);
  if (attrs) out.a = attrs;
  if (Array.isArray(record.marks) && record.marks.length) {
    out.m = record.marks.map((mark) => {
      const markRecord = (mark ?? {}) as Record<string, unknown>;
      const markAttrs = pickAttrs(markRecord.attrs);
      return markAttrs ? { t: String(markRecord.type ?? ""), a: markAttrs } : String(markRecord.type ?? "");
    });
  }
  if (Array.isArray(record.content)) {
    // An empty trailing paragraph is editor furniture, not content.
    const children = record.content.filter(
      (child, index, all) =>
        !(
          index === all.length - 1 &&
          (child as { type?: string })?.type === "paragraph" &&
          !(child as { content?: unknown[] })?.content?.length
        )
    );
    out.c = children.map(fingerprintNode);
  }
  return out;
}

/** The parts of a TipTap document a person can change, as a plain value. */
export function noteFingerprintValue(doc: unknown): Json {
  return fingerprintNode(doc);
}
