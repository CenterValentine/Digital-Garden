/**
 * Ephemeral block handle gate.
 *
 * Handles (`b3#1f4a2b90`) are the address the AI uses to say WHICH block it
 * means. They are derived from the live document and never written into it, so
 * the only thing standing between "precise edit" and "edited the wrong block"
 * is that a stale handle is *detected*. This gate proves the four properties
 * that detection rests on:
 *
 *   1. DISTINCT   — two blocks never share a handle (ordinal disambiguates
 *                   even when their content is byte-identical).
 *   2. DETERMINISTIC — a handle is a pure function of content, so two clients
 *                   reading the same document derive the same handles. This is
 *                   what makes handles safe where a per-client `crypto.randomUUID()`
 *                   would not be (cf. node-view-factory's blockId backfill).
 *   3. REFUSES STALE — an edited target, a shifted ordinal, a shrunk document
 *                   and a garbage string each resolve to a typed miss rather
 *                   than to some other block.
 *   4. TOLERATES ELSEWHERE — an edit to an UNRELATED block leaves the target's
 *                   handle valid. Without this the gate would pass trivially by
 *                   refusing everything, and every concurrent edit anywhere in
 *                   the document would spuriously block the AI.
 *
 * Also covers scoped `findTextInDoc`, since the whole point of a handle is to
 * make repeated text addressable.
 *
 * Runs under tsx against the tsx-safe collaboration extension set (same
 * convention as validate-block-id-hygiene.ts).
 */
import { getSchema } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
import { getCollaborationServerExtensions } from "@/lib/domain/collaboration/extensions";
import { buildOutline, resolveHandle } from "@/lib/domain/editor/ai/block-handles";
import { findTextInDoc } from "@/lib/domain/editor/ai/text-search";

const schema = getSchema(getCollaborationServerExtensions());

let fails = 0;
const pass = (msg: string) => console.log(`  PASS  ${msg}`);
const fail = (msg: string) => {
  fails++;
  console.log(`  FAIL  ${msg}`);
};
const check = (msg: string, ok: boolean, detail = "") =>
  ok ? pass(msg) : fail(`${msg}${detail ? ` — ${detail}` : ""}`);

const para = (text: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

const DUPLICATED = "the workflow is typecheck then lint then build";

/** Two paragraphs with IDENTICAL text — the case apply_diff alone cannot address. */
const docJson: JSONContent = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Quality Gates" }],
    },
    para(DUPLICATED),
    para(DUPLICATED),
    para("Unrelated closing paragraph."),
  ],
};

const doc = PMNode.fromJSON(schema, docJson);
const outline = buildOutline(doc);

console.log("\n1. buildOutline");
check("one entry per top-level block", outline.length === 4, `got ${outline.length}`);
check(
  "every handle matches b<ordinal>#<8 hex>",
  outline.every((e) => /^b\d+#[0-9a-f]{8}$/.test(e.handle)),
);
check(
  "identical paragraphs get DISTINCT handles",
  outline[1].handle !== outline[2].handle,
);
check(
  "…because the ordinal differs, not the fingerprint",
  outline[1].handle.split("#")[1] === outline[2].handle.split("#")[1],
);
check(
  "entry ranges are non-overlapping and ascending",
  outline.every((e, i) => i === 0 || e.from === outline[i - 1].to),
);

console.log("\n2. resolveHandle — happy path");
{
  const r = resolveHandle(doc, outline[2].handle);
  check("resolves", r.ok === true);
  check(
    "positions agree with the outline",
    r.ok && r.entry.from === outline[2].from && r.entry.to === outline[2].to,
  );
}

console.log("\n3. determinism (no minting)");
check(
  "re-deriving from the same doc is byte-identical",
  JSON.stringify(buildOutline(doc)) === JSON.stringify(outline),
);
check(
  "a separate parse of the same JSON derives the same handles",
  JSON.stringify(buildOutline(PMNode.fromJSON(schema, docJson)).map((e) => e.handle)) ===
    JSON.stringify(outline.map((e) => e.handle)),
);

console.log("\n4. scoped search disambiguates repeated text");
{
  const unscoped = findTextInDoc(doc, DUPLICATED);
  check(
    "unscoped search reports ambiguity",
    !!unscoped && "count" in unscoped && unscoped.count === 2,
    JSON.stringify(unscoped),
  );
  const scoped = findTextInDoc(doc, DUPLICATED, {
    from: outline[2].from,
    to: outline[2].to,
  });
  const single = !!scoped && !("count" in scoped);
  check("scoping to one block yields exactly one match", single, JSON.stringify(scoped));
  check(
    "the match lies inside the scoped block",
    single && scoped.from >= outline[2].from && scoped.to <= outline[2].to,
    JSON.stringify(scoped),
  );
  check(
    "a scoped search does not leak into the neighbouring block",
    single && scoped.from >= outline[2].from,
  );

  // A range that BISECTS two blocks. `nodesBetween` yields nodes that merely
  // overlap, so without the boundary guard in findTextInDoc both paragraphs'
  // full text joins the flat string and a match is reported that reaches well
  // outside the requested range. Node-aligned ranges never exercise this, which
  // is why it needs its own case.
  const straddling = findTextInDoc(doc, DUPLICATED, {
    from: outline[1].from + 5,
    to: outline[2].to - 5,
  });
  const escaped =
    !!straddling &&
    ("count" in straddling
      ? true
      : straddling.from < outline[1].from + 5 || straddling.to > outline[2].to - 5);
  check(
    "a partially-overlapping range never returns a match outside it",
    !escaped,
    JSON.stringify(straddling),
  );
}

console.log("\n5. stale handles are refused");
{
  // (a) the target block's own text changed
  const edited = structuredClone(docJson);
  edited.content![2] = para(`${DUPLICATED} and deploy`);
  const r = resolveHandle(PMNode.fromJSON(schema, edited), outline[2].handle);
  check(
    "edited target → fingerprint-mismatch",
    r.ok === false && r.reason === "fingerprint-mismatch",
    JSON.stringify(r),
  );
}
{
  // (b) a collaborator inserted a block ABOVE — the ordinal now points elsewhere
  const shifted = structuredClone(docJson);
  shifted.content!.splice(1, 0, para("A collaborator typed this mid-turn."));
  const r = resolveHandle(PMNode.fromJSON(schema, shifted), outline[3].handle);
  check(
    "shifted ordinal → refused, NOT silently retargeted",
    r.ok === false && r.reason === "fingerprint-mismatch",
    JSON.stringify(r),
  );
}
{
  // (c) the document shrank past the ordinal
  const shrunk = PMNode.fromJSON(schema, { type: "doc", content: [para("one left")] });
  const r = resolveHandle(shrunk, outline[3].handle);
  check(
    "shrunk document → out-of-range",
    r.ok === false && r.reason === "out-of-range",
    JSON.stringify(r),
  );
}
{
  const r = resolveHandle(doc, "paragraph-7");
  check(
    "unparseable handle → malformed",
    r.ok === false && r.reason === "malformed",
    JSON.stringify(r),
  );
}

console.log("\n6. unrelated edits do NOT invalidate a handle");
{
  const elsewhere = structuredClone(docJson);
  elsewhere.content![3] = para("Completely rewritten closing paragraph.");
  const r = resolveHandle(PMNode.fromJSON(schema, elsewhere), outline[2].handle);
  check("editing a different block leaves the target valid", r.ok === true, JSON.stringify(r));
}

if (fails > 0) {
  console.log(`\nblock handles: ${fails} FAILED`);
  process.exit(1);
}
console.log("\nblock handles: all passed");
