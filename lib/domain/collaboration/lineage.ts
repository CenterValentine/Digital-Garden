/**
 * Y.Doc lineage: whether two copies of a note grew from one seed, and how to
 * move content between copies without minting a rival.
 *
 * Y.js merges copies by UNION. Copies that share a seed share their items, so
 * the union is the document once. Copies seeded independently from the same
 * JSON share NOTHING — every item has a different (client, clock) id — so the
 * union is the document twice, and it persists that way. Owner report
 * 2026-10-08: "when a collaborator joins, the content in a note gets
 * duplicated". `pnpm collab:lineage:check` pins the rules here.
 *
 * So, wherever content has to reach a copy that already exists:
 * - never build a fresh Y.Doc from JSON to REPLACE it — apply the JSON onto it
 *   as a diff (`writeFragmentAsDiff`), which keeps its lineage;
 * - never merge in a copy of another lineage (`mergePushedCopy` refuses);
 * - a browser holding a rival copy moves onto the server's before it connects,
 *   when that loses nothing (`planAlignment` / `alignOntoServerCopy`).
 *
 * Client- and server-safe: pure Y.js + the shared schema, no database.
 */

import { TiptapTransformer } from "@hocuspocus/transformer";
import { getSchema, type JSONContent } from "@tiptap/core";
import { Node as PMNode, type Schema } from "@tiptap/pm/model";
import { updateYFragment } from "y-prosemirror";
import * as Y from "yjs";

import { sanitizeTipTapJsonWithExtensions } from "@/lib/domain/editor/unsupported-content";
import { hasMeaningfulTipTapContent, ydocUpdateHasMeaningfulDefaultContent } from "./content-safety";
import { getCollaborationServerExtensions } from "./extensions";

/** The Y fragment TipTap binds to. */
export const COLLAB_FRAGMENT = "default";

let cachedSchema: Schema | null = null;
function collaborationSchema(): Schema {
  cachedSchema ??= getSchema(getCollaborationServerExtensions());
  return cachedSchema;
}

/**
 * Make the document's fragment read `content`, changing only what differs.
 * Untouched blocks keep their Y identity, so any other copy of this lineage
 * merges with the result cleanly. One transaction, one update.
 */
export function writeFragmentAsDiff(ydoc: Y.Doc, content: JSONContent, origin?: unknown): void {
  const sanitized = sanitizeTipTapJsonWithExtensions(content, getCollaborationServerExtensions()).json;
  const target = PMNode.fromJSON(collaborationSchema(), sanitized);
  const fragment = ydoc.getXmlFragment(COLLAB_FRAGMENT);
  ydoc.transact(() => {
    updateYFragment(ydoc, fragment, target, { mapping: new Map(), isOMark: new Map() });
  }, origin);
}

/** A brand-new copy of `content`, for a note that has no copy anywhere yet. */
export function seedCopy(content: JSONContent): Uint8Array {
  const extensions = getCollaborationServerExtensions();
  const sanitized = sanitizeTipTapJsonWithExtensions(content, extensions).json;
  const ydoc = TiptapTransformer.toYdoc(sanitized, COLLAB_FRAGMENT, extensions);
  try {
    return Y.encodeStateAsUpdate(ydoc);
  } finally {
    ydoc.destroy();
  }
}

/**
 * Bring a stored copy up to `content` (a payload written outside
 * collaboration) as a diff ON the stored lineage. Rebuilding from the JSON
 * instead is what forked the document: every holder of the stored copy then
 * merged with a rival.
 */
export function catchUpStoredCopy(stored: Uint8Array, content: JSONContent): Uint8Array {
  const ydoc = new Y.Doc();
  try {
    Y.applyUpdate(ydoc, stored);
    writeFragmentAsDiff(ydoc, content, "payload-catch-up");
    return Y.encodeStateAsUpdate(ydoc);
  } finally {
    ydoc.destroy();
  }
}

/**
 * Do two copies (given by their state vectors) descend from one seed? Any
 * shared client id means shared history. A copy with no items is compatible
 * with anything — there is nothing in it to double.
 */
export function sharesLineage(stateVectorA: Uint8Array, stateVectorB: Uint8Array): boolean {
  const a = Y.decodeStateVector(stateVectorA);
  const b = Y.decodeStateVector(stateVectorB);
  if (a.size === 0 || b.size === 0) return true;
  for (const client of a.keys()) {
    if (b.has(client)) return true;
  }
  return false;
}

/**
 * Merge a copy a browser pushed (a solo editor's Y state, sent with its REST
 * save) into the stored one. Returns null — refused — when the pushed copy is
 * of another lineage than a stored copy that has content: the union would be
 * the note twice. With nothing stored, the pushed copy becomes the stored one.
 */
export function mergePushedCopy(stored: Uint8Array | null, pushed: Uint8Array): Uint8Array | null {
  if (!stored || stored.length === 0) return pushed;
  const rival =
    !sharesLineage(Y.encodeStateVectorFromUpdate(stored), Y.encodeStateVectorFromUpdate(pushed)) &&
    ydocUpdateHasMeaningfulDefaultContent(stored);
  if (rival) return null;
  return Y.mergeUpdates([stored, pushed]);
}

// ── A browser's rival copy, before it connects ─────────────────────────────

/** What a browser holding a rival copy does about it before connecting. */
export type Alignment =
  /** The server's copy already shows everything this one does: take it. */
  | "adopt"
  /** This one only ADDS to the server's: take the server's, re-apply these additions. */
  | "adopt-and-reapply"
  /** Each has blocks the other lacks: no safe choice — leave it (the union keeps both). */
  | "diverged";

/** Key order independent, so two copies of one block compare equal. */
function stableKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableKey).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableKey(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The blocks that show something — an empty paragraph decides nothing. */
function blockKeys(doc: JSONContent): string[] {
  return (doc.content ?? [])
    .filter((block) => hasMeaningfulTipTapContent({ type: "doc", content: [block] }))
    .map(stableKey);
}

/** Is every entry of `inner` in `outer`, in the same order? */
function isSubsequence(inner: string[], outer: string[]): boolean {
  let at = 0;
  for (const key of outer) {
    if (at < inner.length && inner[at] === key) at += 1;
  }
  return at === inner.length;
}

/**
 * Decide from content alone, block by block. Without a common ancestor there
 * is no telling "I deleted X" from "they added X", so only the two one-sided
 * cases are safe; anything else is left alone rather than guessed at.
 */
export function planAlignment(local: JSONContent, server: JSONContent): Alignment {
  const localBlocks = blockKeys(local);
  const serverBlocks = blockKeys(server);
  if (isSubsequence(localBlocks, serverBlocks)) return "adopt";
  if (isSubsequence(serverBlocks, localBlocks)) return "adopt-and-reapply";
  return "diverged";
}

/**
 * Move a browser's copy onto the server's lineage, in place: its own items
 * are deleted, the server's copy applied, and (for "adopt-and-reapply") its
 * content written back as a diff on top. In place because the editor and the
 * IndexedDB store hold this Y.Doc; the deleted items travel to the server as
 * invisible tombstones.
 *
 * Worked out on a scratch copy and landed as ONE update, so the editor sees
 * one change (never an empty or doubled document in between). Not in one
 * transaction on the real doc: applying an update marks the transaction
 * remote, and Y.js then takes the doc's own writes in it for another client
 * using its id — and changes the doc's client id under the live editor.
 */
export function alignOntoServerCopy(
  ydoc: Y.Doc,
  serverUpdate: Uint8Array,
  reapply: JSONContent | null,
  origin?: unknown,
): void {
  const scratch = new Y.Doc();
  try {
    Y.applyUpdate(scratch, Y.encodeStateAsUpdate(ydoc));
    scratch.transact(() => {
      const fragment = scratch.getXmlFragment(COLLAB_FRAGMENT);
      if (fragment.length > 0) fragment.delete(0, fragment.length);
    });
    Y.applyUpdate(scratch, serverUpdate);
    if (reapply) writeFragmentAsDiff(scratch, reapply);
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(scratch, Y.encodeStateVector(ydoc)), origin);
  } finally {
    scratch.destroy();
  }
}

// ── A browser copy the stored note has moved past ──────────────────────────

/**
 * What a browser does with its cached copy when a note opens, once it has the
 * server's copy in hand (plan: AI-VIEW-SCREEN-PLAN D17).
 *
 * The browser keeps a Y.Doc per note in IndexedDB and, solo, never connects
 * (sleep mode). A note whose server copy did not exist yet was written by the
 * AI straight to its payload — the designed path, because no Y state existed
 * on the server — and the browser kept showing its own copy, which nothing
 * ever compared with the payload (owner report 2026-10-09: an AI revision
 * invisible in the viewer, present in the download). Worse, the editor's save
 * baseline came from the FRESH payload, so the next keystroke would have
 * saved the stale copy over the revision.
 *
 *   - "merge": same lineage AND the union equals the server's copy — Y.js's
 *     own union carries the server's changes, deletions included. A shared
 *     lineage alone is not enough: a browser that saved through REST before
 *     solo saves carried their Y state holds items of its own for text the
 *     server caught up on with ITS items, and that union doubles the note.
 *   - "adopt" / "adopt-and-reapply": a rival copy where one side only adds
 *     (planAlignment) — #287's move onto the server's lineage.
 *   - "adopt" for a DIVERGED rival when the stored note changed after this
 *     browser last edited its copy: every clean local edit reached the
 *     payload through autosave, so the payload is the newer truth.
 *   - "keep": the browser holds offline edits that never reached the server
 *     (never thrown away), it edited after the stored note last changed, or
 *     a same-lineage union would not equal the server's copy. Connecting
 *     later behaves exactly as before this check existed.
 *
 * `lastLocalEditAt` is null for copies cached before it was tracked; a clean
 * copy then defers to the server, whose payload holds every online edit.
 */
export type LocalCatchUp = "merge" | "adopt" | "adopt-and-reapply" | "keep";

export function planLocalCatchUp(input: {
  sharesLineage: boolean;
  /** Same lineage only: the union of both copies shows exactly the server's content. */
  unionMatchesServer: boolean;
  alignment: Alignment;
  /** The last session left no offline / unsynced edits behind. */
  localClean: boolean;
  /** When this browser last edited its copy (ms), or null when unknown. */
  lastLocalEditAt: number | null;
  /** When the stored note last changed (ms), or null when unknown. */
  payloadUpdatedAt: number | null;
}): LocalCatchUp {
  if (input.sharesLineage) return input.unionMatchesServer ? "merge" : "keep";
  if (input.alignment !== "diverged") return input.alignment;
  if (!input.localClean) return "keep";
  if (input.lastLocalEditAt === null) return "adopt";
  if (input.payloadUpdatedAt === null) return "keep";
  return input.payloadUpdatedAt > input.lastLocalEditAt ? "adopt" : "keep";
}
