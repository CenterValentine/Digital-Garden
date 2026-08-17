/**
 * blockId hygiene gate.
 *
 * Proves the two blockId re-identification paths that keep per-instance
 * block state (excalidraw/mermaid Y.Doc sub-maps, Note Window history)
 * from being shared between two block nodes:
 *
 *   1. Paste channel — `remapCollidingBlockIds` (the transformPasted
 *      plugin's pure core): COLLISION-scoped. A pasted id that already
 *      exists in the doc (or repeats within the slice) gets a fresh id;
 *      a non-colliding id is kept, so cut/paste-as-move preserves state.
 *   2. Duplicate channel — `regenerateAllBlockIds` (duplicate route):
 *      UNCONDITIONAL. A duplicated note has no Y.Doc, so every copied
 *      block starts with a fresh identity.
 *
 * Runs under tsx against the tsx-safe collaboration extension set (same
 * convention as validate-markdown-block-safety.ts).
 */
import { getSchema } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { getCollaborationServerExtensions } from "@/lib/domain/collaboration/extensions";
import {
  remapCollidingBlockIds,
  collectBlockIds,
} from "@/lib/domain/editor/extensions/block-id-paste-hygiene";
import { regenerateAllBlockIds } from "@/lib/domain/blocks/block-id-walk";

const schema = getSchema(getCollaborationServerExtensions());

let fails = 0;
const fail = (m: string) => {
  console.log(`  FAIL  ${m}`);
  fails++;
};
const pass = (m: string) => console.log(`  PASS  ${m}`);

let idCounter = 0;
const makeId = () => `fresh-${++idCounter}`;

const doc = (...c: JSONContent[]): JSONContent => ({ type: "doc", content: c });
const para = (text: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});
const excalidraw = (blockId: string): JSONContent => ({
  type: "excalidrawBlock",
  attrs: { blockId, blockType: "excalidrawBlock" },
});
const noteWindow = (blockId: string): JSONContent => ({
  type: "noteWindow",
  attrs: { blockId, blockType: "noteWindow" },
});

function idsOf(json: JSONContent): string[] {
  const out: string[] = [];
  const walk = (n: JSONContent) => {
    const id = n.attrs?.blockId;
    if (typeof id === "string" && id) out.push(id);
    (n.content ?? []).forEach(walk);
  };
  walk(json);
  return out;
}

console.log("\n── paste channel: remapCollidingBlockIds ──");

// 1. Collision with the host doc → re-id; non-colliding sibling kept.
{
  const hostDoc = schema.nodeFromJSON(doc(excalidraw("a"), para("x")));
  const slice = schema.nodeFromJSON(doc(excalidraw("a"), noteWindow("b"))).content;
  const existing = collectBlockIds(hostDoc);
  const out = remapCollidingBlockIds(slice, existing, makeId);
  const ids: string[] = [];
  out.forEach((n) => ids.push(String(n.attrs.blockId)));
  if (ids[0] !== "a" && ids[0].startsWith("fresh-") && ids[1] === "b") {
    pass("doc collision re-idd, non-colliding id kept");
  } else {
    fail(`doc collision handling (${JSON.stringify(ids)})`);
  }
}

// 2. No collision anywhere → the ORIGINAL fragment is returned untouched.
{
  const hostDoc = schema.nodeFromJSON(doc(excalidraw("a")));
  const slice = schema.nodeFromJSON(doc(noteWindow("b"))).content;
  const out = remapCollidingBlockIds(slice, collectBlockIds(hostDoc), makeId);
  if (out === slice) pass("no collision → fragment identity preserved (move semantics)");
  else fail("no-collision paste rebuilt the fragment");
}

// 3. Duplicate WITHIN the pasted slice → second occurrence re-idd.
{
  const hostDoc = schema.nodeFromJSON(doc(para("empty")));
  const slice = schema.nodeFromJSON(doc(excalidraw("x"), excalidraw("x"))).content;
  const out = remapCollidingBlockIds(slice, collectBlockIds(hostDoc), makeId);
  const ids: string[] = [];
  out.forEach((n) => ids.push(String(n.attrs.blockId)));
  if (ids[0] === "x" && ids[1] !== "x" && ids[1].startsWith("fresh-")) {
    pass("intra-slice duplicate re-idd");
  } else {
    fail(`intra-slice duplicate (${JSON.stringify(ids)})`);
  }
}

// 4. Nested collision: a colliding id deep inside a container is re-idd
//    while the non-colliding container keeps its id.
{
  const hostDoc = schema.nodeFromJSON(doc(excalidraw("deep")));
  const nested = doc({
    type: "cardPanel",
    attrs: { blockId: "cp-1", blockType: "cardPanel" },
    content: [para("inside"), excalidraw("deep")],
  });
  const slice = schema.nodeFromJSON(nested).content;
  const out = remapCollidingBlockIds(slice, collectBlockIds(hostDoc), makeId);
  const outJson = out.toJSON() as JSONContent[];
  const flat = idsOf({ type: "doc", content: outJson });
  if (flat[0] === "cp-1" && flat[1] !== "deep" && flat[1]?.startsWith("fresh-")) {
    pass("nested collision re-idd inside container");
  } else {
    fail(`nested collision (${JSON.stringify(flat)})`);
  }
}

console.log("\n── duplicate channel: regenerateAllBlockIds ──");

// 5. Every blockId is regenerated, uniquely; structure and other attrs survive.
{
  const original = doc(
    excalidraw("a"),
    {
      type: "cardPanel",
      attrs: { blockId: "cp-1", blockType: "cardPanel", headerText: "Keep me" },
      content: [para("inside"), noteWindow("b")],
    },
    para("plain"),
  );
  const before = JSON.stringify(original);
  const out = regenerateAllBlockIds(original);
  const oldIds = new Set(idsOf(original));
  const newIds = idsOf(out);
  const allFresh = newIds.every((id) => !oldIds.has(id));
  const allUnique = new Set(newIds).size === newIds.length;
  const headerKept =
    (out.content?.[1]?.attrs as { headerText?: string })?.headerText === "Keep me";
  const inputUntouched = JSON.stringify(original) === before;
  if (newIds.length === 3 && allFresh && allUnique && headerKept && inputUntouched) {
    pass("all ids regenerated, unique, other attrs + input untouched");
  } else {
    fail(
      `regenerateAllBlockIds (fresh=${allFresh} unique=${allUnique} header=${headerKept} pure=${inputUntouched})`,
    );
  }
}

if (fails > 0) {
  console.log(`\nblockId hygiene: ${fails} FAILED`);
  process.exit(1);
}
console.log("\nblockId hygiene: all passed");
