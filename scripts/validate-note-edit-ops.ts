/**
 * Gate: note edit operations against a live Y.Doc (AI collab write path).
 *
 * `pnpm note-edit:check`
 *
 * These checks exist because the write path's correctness rests on one
 * under-documented library call. `updateYFragment` is exported by y-prosemirror but
 * is not part of its documented surface, and the whole reason we chose it over
 * `prosemirrorJSONToYXmlFragment` is that it applies a MINIMAL DIFF rather than
 * repopulating the fragment. That property is invisible in the output — a
 * delete-and-refill produces the same JSON — so check 3 asserts Y IDENTITY of an
 * untouched block. If a future y-prosemirror release regresses to repopulating,
 * that check is what catches it; the round-trip checks alone would still pass while
 * every concurrent cursor in the document silently broke.
 */

import assert from "node:assert/strict";
import * as Y from "yjs";
import type { JSONContent } from "@tiptap/core";
import { TiptapTransformer } from "@hocuspocus/transformer";

import {
  applyNoteEdit,
  buildNoteEditTarget,
  COLLAB_FRAGMENT_FIELD,
  NoteEditRefused,
  SHRINK_GUARD_MIN_CHARS,
  SHRINK_HARD_REFUSE_FLOOR,
  SHRINK_RETAIN_FLOOR,
} from "../lib/domain/collaboration/note-edit-ops";
import { getCollaborationServerExtensions } from "../lib/domain/collaboration/extensions";

const extensions = getCollaborationServerExtensions();

function para(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function docOf(...blocks: JSONContent[]): JSONContent {
  return { type: "doc", content: blocks };
}

/** A Y.Doc seeded the way the collaboration bootstrap seeds one. */
function seedYDoc(doc: JSONContent): Y.Doc {
  return TiptapTransformer.toYdoc(doc, COLLAB_FRAGMENT_FIELD, extensions);
}

function readYDoc(ydoc: Y.Doc): JSONContent {
  return TiptapTransformer.fromYdoc(ydoc, COLLAB_FRAGMENT_FIELD) as JSONContent;
}

function textsOf(doc: JSONContent): string[] {
  return (doc.content ?? []).map((block) =>
    (block.content ?? []).map((leaf) => leaf.text ?? "").join(""),
  );
}

// ── 1. Append adds blocks at the end and preserves the existing ones ─────────

{
  const ydoc = seedYDoc(docOf(para("job one"), para("job two")));
  const outcome = applyNoteEdit(ydoc, {
    mode: "append",
    content: docOf(para("job three")),
  });

  assert.deepEqual(
    textsOf(readYDoc(ydoc)),
    ["job one", "job two", "job three"],
    "append must add at the end and keep prior blocks",
  );
  assert.equal(outcome.blocksBefore, 2);
  assert.equal(outcome.blocksAfter, 3);
  assert.deepEqual(
    textsOf(outcome.before),
    ["job one", "job two"],
    "the before snapshot must be the pre-edit document (it powers the Undo chip)",
  );
}

// ── 2. Replace round-trips exactly ───────────────────────────────────────────

{
  const ydoc = seedYDoc(docOf(para("old one"), para("old two")));
  const target = docOf(para("brand new"), para("second new"), para("third new"));
  applyNoteEdit(ydoc, {
    mode: "replace",
    content: target,
    destructiveApproved: true,
  });

  assert.deepEqual(
    textsOf(readYDoc(ydoc)),
    ["brand new", "second new", "third new"],
    "replace must round-trip the target document",
  );
}

// ── 3. THE LOAD-BEARING CHECK: append is a minimal diff ──────────────────────
// Untouched blocks must keep their Y identity. A delete-and-refill implementation
// would satisfy every other check here while breaking concurrent editing.

{
  const ydoc = seedYDoc(docOf(para("untouched"), para("also untouched")));
  const fragment = ydoc.getXmlFragment(COLLAB_FRAGMENT_FIELD);
  const firstBlockBefore = fragment.get(0);
  const secondBlockBefore = fragment.get(1);

  applyNoteEdit(ydoc, { mode: "append", content: docOf(para("appended")) });

  assert.equal(
    fragment.get(0),
    firstBlockBefore,
    "append must not recreate the first block — same Y object, or cursors break",
  );
  assert.equal(
    fragment.get(1),
    secondBlockBefore,
    "append must not recreate untouched trailing blocks",
  );
  assert.equal(fragment.length, 3, "append must add exactly one block");
}

// ── 4. Replace also diffs rather than rebuilding ─────────────────────────────

{
  const ydoc = seedYDoc(docOf(para("keep me"), para("change me")));
  const fragment = ydoc.getXmlFragment(COLLAB_FRAGMENT_FIELD);
  const keptBefore = fragment.get(0);

  applyNoteEdit(ydoc, {
    mode: "replace",
    content: docOf(para("keep me"), para("changed")),
    destructiveApproved: true,
  });

  assert.equal(
    fragment.get(0),
    keptBefore,
    "replace must leave an unchanged leading block untouched (minimal diff)",
  );
  assert.deepEqual(textsOf(readYDoc(ydoc)), ["keep me", "changed"]);
}

// ── 5. Append into an effectively empty document replaces instead ────────────
// TipTap documents always carry a paragraph; appending after it would leave a
// permanent leading blank line on the first AI write to a fresh note.

{
  const empty = buildNoteEditTarget(docOf({ type: "paragraph" }), {
    mode: "append",
    content: docOf(para("first content")),
  });
  assert.equal(empty.appendedIntoEmptyDocument, true);
  assert.deepEqual(
    textsOf(empty.target),
    ["first content"],
    "append into an empty document must not preserve the placeholder paragraph",
  );

  const nonEmpty = buildNoteEditTarget(docOf(para("has content")), {
    mode: "append",
    content: docOf(para("more")),
  });
  assert.equal(nonEmpty.appendedIntoEmptyDocument, false);
  assert.deepEqual(textsOf(nonEmpty.target), ["has content", "more"]);
}

// ── 5b. The refusal threshold must stay BELOW the approval-card threshold ────
// If they crossed, a rewrite could be hard-refused without the user ever being
// offered the card — an unresolvable dead end, since the model has no way to
// escalate. Asserted rather than commented because the two live in different
// decisions (a Prisma pre-check vs an in-transaction compare) and will drift.

{
  assert.ok(
    SHRINK_HARD_REFUSE_FLOOR < SHRINK_RETAIN_FLOOR,
    "the hard-refuse floor must be strictly below the approval floor, or a write can be refused with no way to approve it",
  );
}

// ── 6. Shrink guard refuses unapproved destruction, allows approved ──────────

{
  const long = "x".repeat(SHRINK_GUARD_MIN_CHARS + 200);
  const ydoc = seedYDoc(docOf(para(long)));

  assert.throws(
    () =>
      applyNoteEdit(ydoc, { mode: "replace", content: docOf(para("tiny")) }),
    (error: unknown) =>
      error instanceof NoteEditRefused && error.reason === "shrink",
    "an unapproved replace that drops most of the document must be refused",
  );

  assert.deepEqual(
    textsOf(readYDoc(ydoc)),
    [long],
    "a refused edit must leave the document completely untouched",
  );

  applyNoteEdit(ydoc, {
    mode: "replace",
    content: docOf(para("tiny")),
    destructiveApproved: true,
  });
  assert.deepEqual(
    textsOf(readYDoc(ydoc)),
    ["tiny"],
    "an approved rewrite must apply",
  );
}

// ── 7. Short documents are not policed by the shrink guard ──────────────────

{
  const ydoc = seedYDoc(docOf(para("short note")));
  applyNoteEdit(ydoc, { mode: "replace", content: docOf(para("s")) });
  assert.deepEqual(
    textsOf(readYDoc(ydoc)),
    ["s"],
    "trimming a short note is ordinary editing, not destruction",
  );
}

// ── 8. Appends emit ONE transaction, so clients see one update ───────────────

{
  const ydoc = seedYDoc(docOf(para("one")));
  let updates = 0;
  ydoc.on("update", () => {
    updates += 1;
  });
  applyNoteEdit(ydoc, {
    mode: "append",
    content: docOf(para("two"), para("three")),
  });
  assert.equal(
    updates,
    1,
    "the edit must be wrapped in a single Y transaction (updateYFragment does not wrap itself)",
  );
}

console.log("Note edit op checks passed.");
