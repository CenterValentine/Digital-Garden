/**
 * Position Anchors for AI Edits
 *
 * ProseMirror positions are document-wide character offsets, so every character
 * inserted earlier in the document shifts every later position. The AI edit
 * animation deliberately spans ~1.2 s (cursor arrival → selection sweep →
 * mutation), and under live collaboration a remote insert ABOVE the target
 * during that window leaves a resolved `{from,to}` pointing at the wrong text.
 * `deleteRange` then removes the wrong span.
 *
 * Two pure pieces, kept out of the orchestrator so they can be gated without a
 * browser (see scripts/validate-block-handles.ts):
 *
 *   mapRange         — carry a range through a document change
 *   rangeMatchesText — assert the range still spans the text we meant
 *
 * The assertion is the load-bearing half. Mapping keeps the range pointing at
 * the right place in the ordinary case; the assertion is what makes a silent
 * corruption into an honest, recoverable refusal when it does not.
 */

import type { Node as PMNode } from "@tiptap/pm/model";

export interface AnchoredRange {
  from: number;
  to: number;
}

/**
 * Anything that can rebase a position — a `Transaction.mapping` (`Mapping`) or a
 * single `StepMap`. Declared structurally so this module needs no
 * prosemirror-transform import.
 */
export interface PositionMapping {
  map(pos: number, assoc?: number): number;
}

/**
 * Carry a range through one document change.
 *
 * The `assoc` arguments are an EXCLUSIVE bias — `from` takes +1 and `to` takes
 * -1 — so text inserted exactly at either boundary lands OUTSIDE the range and
 * the range keeps spanning precisely the original target.
 *
 * This is the opposite of the usual sticky-left/sticky-right pairing, and it is
 * deliberate: the range exists to be REPLACED. If someone types at the first
 * character of the sentence the AI is about to rewrite, the right outcome is to
 * rewrite the sentence and leave their text alone. The inclusive bias
 * (`from: -1`, `to: +1`) would swallow their keystrokes into the replaced span,
 * which `rangeMatchesText` would then reject — turning a perfectly applicable
 * edit into a refusal.
 */
export function mapRange(
  mapping: PositionMapping,
  range: AnchoredRange
): AnchoredRange {
  return {
    from: mapping.map(range.from, 1),
    to: mapping.map(range.to, -1),
  };
}

/**
 * True when `range` still spans exactly `text` in `doc`.
 *
 * Compare-and-swap for a document edit. Deliberately strict: a collapsed range
 * (the target was deleted by a collaborator) and an out-of-bounds range (the
 * document shrank) both return false rather than throwing, so the caller can
 * refuse with a message instead of surfacing a RangeError as "unknown error".
 *
 * `textBetween` with no block separator matches how `findTextInDoc` builds its
 * flat string, so the two agree on what "the text" is.
 */
export function rangeMatchesText(
  doc: PMNode,
  range: AnchoredRange,
  text: string
): boolean {
  if (range.to <= range.from) return false;
  if (range.from < 0 || range.to > doc.content.size) return false;
  return doc.textBetween(range.from, range.to) === text;
}
