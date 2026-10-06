/**
 * Referenced content in a note's text, shown as the editor has it — before
 * the server does.
 *
 * The tree lists an image or audio clip under the note whose text holds it
 * (tree API `node.reference`), read from the note's ContentLink "image-ref" /
 * "audio-ref" edges. Those edges are written when the note is SAVED — for a
 * live note, by Hocuspocus 2–10 s after the edit (its store debounce) — and
 * the tree only learned of them on its next refresh. Owner report,
 * 2026-10-06: an image pasted into a note didn't appear in the note's
 * referenced content until the tree was refreshed by hand.
 *
 * Now the editor reports what its text gains and loses (`mediaChanges`, fed
 * by `useInTextMediaTracker`) and the tree shows it at once
 * (`showInTextEdits`): the editor's document is what the server will
 * converge to. An edit stays until the tree's data agrees with it
 * (`settleInTextEdits`), so a refresh that lands before the save can't flash
 * the old state back. A fresh upload's row, which the tree hasn't loaded yet,
 * is fetched by a quiet refresh (`missingInTextMedia`).
 *
 * The edits follow the tree API's own placement (tree/route.ts), so what is
 * shown early is what the server will show:
 *  - a referenced row filed with a note (ownedByNoteId) is placed by that,
 *    never by text; any other sits under the OLDEST note whose text holds
 *    it, else in its folder;
 *  - `reference.inTextOf` names that oldest note.
 *
 * Pure: `tree:smooth:check` pins it.
 */
import type { TreeNode } from "@/lib/domain/content/types";
import { sortedInsertIndex } from "@/lib/domain/content/sibling-order";
import { isWindowReferenceRowId } from "./window-reference";

/** TipTap node types whose `contentId` puts media in a note's text (image-refs.ts). */
export const IN_TEXT_MEDIA_NODE_TYPES: ReadonlySet<string> = new Set(["image", "audioEmbed"]);

/** How long an edit the tree's data never agrees with is kept (judged when the data changes). */
export const IN_TEXT_EDIT_MAX_AGE_MS = 120_000;

/** After an edit, how soon the tree fetches a row it hasn't loaded (a fresh upload). */
export const IN_TEXT_FETCH_MS = 150;

/**
 * After the last edit, when the tree reconciles: past Hocuspocus's store
 * window (2 s debounce, 10 s at most while typing continues — server.ts).
 */
export const IN_TEXT_RECONCILE_MS = 12_000;

interface MediaNodeLike {
  type: { name: string };
  attrs: Readonly<Record<string, unknown>>;
}

interface DocLike {
  descendants(visit: (node: MediaNodeLike) => boolean | void): void;
}

/** The content ids of the media in a document's text. */
export function mediaInDoc(doc: DocLike): Set<string> {
  const ids = new Set<string>();
  doc.descendants((node) => {
    if (!IN_TEXT_MEDIA_NODE_TYPES.has(node.type.name)) return;
    const id = node.attrs.contentId;
    if (typeof id === "string" && id) ids.add(id);
  });
  return ids;
}

/** What a document's text gained and lost. */
export function mediaChanges(
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
): { added: string[]; removed: string[] } {
  return {
    added: [...after].filter((id) => !before.has(id)),
    removed: [...before].filter((id) => !after.has(id)),
  };
}

/**
 * One document change, as the tracker sees it: what to record, and the new
 * baseline — ALWAYS the document as it now is, so a change that arrived
 * (and was not recorded) is never reported later as one made here.
 */
export function trackMediaStep(
  known: ReadonlySet<string>,
  now: Set<string>,
  arriving: boolean,
): { added: string[]; removed: string[]; known: Set<string> } {
  if (arriving) return { added: [], removed: [], known: now };
  return { ...mediaChanges(known, now), known: now };
}

/**
 * Whether a transaction is a change ARRIVING — another session's edit, or the
 * collaborative document loading — rather than one made here. y-tiptap tags
 * those `{ isChangeOrigin: true }` under its "y-sync$" meta key. An undo or
 * redo is tagged too, but it is this user's: `isUndoRedoOperation`.
 *
 * Only changes made here are shown ahead of the server: the document's first
 * load would otherwise read as every image in it being added, and another
 * session's edits reach the tree with that session's save, like any write.
 */
export function isArrivingChange(ySyncMeta: unknown): boolean {
  if (!ySyncMeta || typeof ySyncMeta !== "object") return false;
  const meta = ySyncMeta as { isChangeOrigin?: unknown; isUndoRedoOperation?: unknown };
  return meta.isChangeOrigin === true && meta.isUndoRedoOperation !== true;
}

export interface InTextEdit {
  /** True: now in the note's text. False: taken out of it. */
  inText: boolean;
  /** When it was recorded (ms). */
  at: number;
}

/** note id → media id → the latest edit. */
export type InTextEdits = Readonly<Record<string, Readonly<Record<string, InTextEdit>>>>;

export const NO_IN_TEXT_EDITS: InTextEdits = Object.freeze({});

/** Record what a note's text gained and lost; the latest edit per media wins. */
export function recordInTextEdits(
  edits: InTextEdits,
  noteId: string,
  added: readonly string[],
  removed: readonly string[],
  at: number,
): InTextEdits {
  if (added.length === 0 && removed.length === 0) return edits;
  const forNote: Record<string, InTextEdit> = { ...(edits[noteId] ?? {}) };
  for (const id of added) forNote[id] = { inText: true, at };
  for (const id of removed) forNote[id] = { inText: false, at };
  return { ...edits, [noteId]: forNote };
}

/** Which list a row is in: a forest's top level, a node's children, or its references. */
type ListKey = string;
interface Located {
  node: TreeNode;
  list: ListKey;
}

function indexForests(forests: readonly (readonly TreeNode[])[]): Map<string, Located> {
  const index = new Map<string, Located>();
  const walk = (nodes: readonly TreeNode[], list: ListKey) => {
    for (const node of nodes) {
      // The first forest wins an id collision (on-screen rows over carried ones).
      if (!index.has(node.id)) index.set(node.id, { node, list });
      if (node.children?.length) walk(node.children, `c:${node.id}`);
      if (node.references?.length) walk(node.references, `r:${node.id}`);
    }
  };
  forests.forEach((forest, i) => walk(forest, `root:${i}`));
  return index;
}

interface EditOp {
  noteId: string;
  mediaId: string;
  inText: boolean;
  at: number;
}

function opsOf(edits: InTextEdits): EditOp[] {
  const ops: EditOp[] = [];
  for (const [noteId, forNote] of Object.entries(edits)) {
    for (const [mediaId, edit] of Object.entries(forNote)) {
      ops.push({ noteId, mediaId, inText: edit.inText, at: edit.at });
    }
  }
  // Oldest first: when two notes take the same media, the first keeps it,
  // as the oldest link does on the server.
  return ops.sort((a, b) => a.at - b.at);
}

/** A note's references with `row` placed where the tree API sorts it (window rows stay last). */
function withReference(references: readonly TreeNode[], row: TreeNode): TreeNode[] {
  const windows = references.findIndex((ref) => isWindowReferenceRowId(ref.id));
  const head = windows === -1 ? references : references.slice(0, windows);
  const at = sortedInsertIndex(head, row);
  return [...references.slice(0, at), row, ...references.slice(at)];
}

/**
 * The forests (the tree, then any carried shortcut targets) with the edits
 * shown. Returns the SAME arrays and nodes wherever nothing changed — the
 * file tree keys row recycling off identity (see expandReferences).
 */
export function showInTextEdits(
  forests: readonly TreeNode[][],
  edits: InTextEdits,
): TreeNode[][] {
  if (Object.keys(edits).length === 0) return forests as TreeNode[][];
  const index = indexForests(forests);
  const patched = new Map<string, TreeNode>(); // changed where it is
  const lifted = new Map<string, TreeNode>(); // out of its list, not placed again (yet)
  const placed = new Set<string>(); // put under a note by an edit
  const removedFrom = new Map<ListKey, Set<string>>();
  const attached = new Map<string, TreeNode[]>(); // note id → rows joining its references

  const liftOut = (id: string, row: TreeNode) => {
    const list = index.get(id)!.list;
    const gone = removedFrom.get(list) ?? new Set<string>();
    gone.add(id);
    removedFrom.set(list, gone);
    lifted.set(id, row);
  };

  const ops = opsOf(edits);

  // Out of the text first, so media cut from one note and pasted into
  // another can move between them.
  for (const op of ops) {
    if (op.inText || lifted.has(op.mediaId)) continue;
    const located = index.get(op.mediaId);
    if (!located) continue;
    const row = patched.get(op.mediaId) ?? located.node;
    const ref = row.reference;
    if (ref?.via !== "text" || ref.inTextOf?.id !== op.noteId) continue;
    if (ref.filedWithNote) {
      // Placed by its filing, not by text: it stays, no longer in text.
      patched.set(row.id, { ...row, reference: { via: "filed", inTextOf: null, filedWithNote: true } });
      continue;
    }
    liftOut(row.id, row);
  }

  for (const op of ops) {
    if (!op.inText || placed.has(op.mediaId)) continue;
    const note = index.get(op.noteId)?.node;
    if (!note || note.contentType !== "note") continue;
    const out = lifted.get(op.mediaId);
    const located = index.get(op.mediaId);
    const row = out ?? (located ? (patched.get(op.mediaId) ?? located.node) : undefined);
    // Not loaded yet (a fresh upload), or primary content — never placed by text.
    if (!row || row.role !== "referenced") continue;
    const inText = { via: "text" as const, inTextOf: { id: note.id, title: note.title } };
    if (!out) {
      // Already in a note's text: the oldest note holds it.
      if (row.reference?.via === "text") continue;
      if (row.reference?.filedWithNote) {
        // Placed by its filing, not by text: it stays, now in this note's text.
        patched.set(row.id, { ...row, reference: { ...inText, filedWithNote: true } });
        continue;
      }
      liftOut(row.id, row);
    }
    lifted.delete(row.id);
    placed.add(row.id);
    const arriving = attached.get(note.id) ?? [];
    arriving.push({ ...row, parentId: note.id, reference: inText });
    attached.set(note.id, arriving);
  }

  if (patched.size === 0 && removedFrom.size === 0 && attached.size === 0) {
    return forests as TreeNode[][];
  }

  const rebuild = (nodes: TreeNode[], list: ListKey): TreeNode[] => {
    const gone = removedFrom.get(list);
    let changed = false;
    const out: TreeNode[] = [];
    for (const node of nodes) {
      if (gone?.has(node.id)) {
        changed = true;
        continue;
      }
      const base = patched.get(node.id) ?? node;
      const children = node.children?.length ? rebuild(node.children, `c:${node.id}`) : node.children;
      let references = node.references?.length
        ? rebuild(node.references, `r:${node.id}`)
        : node.references;
      for (const row of attached.get(node.id) ?? []) {
        references = withReference(references ?? [], row);
      }
      const next =
        children !== node.children || references !== node.references
          ? { ...base, children, references }
          : base;
      if (next !== node) changed = true;
      out.push(next);
    }
    return changed ? out : nodes;
  };

  return forests.map((forest, i) => rebuild(forest, `root:${i}`));
}

/** Whether the tree's data already shows an edit (so it can be dropped). */
function editSettled(
  index: Map<string, Located>,
  noteId: string,
  mediaId: string,
  edit: InTextEdit,
): boolean {
  const row = index.get(mediaId)?.node;
  const inThisText = row?.reference?.via === "text" && row.reference.inTextOf?.id === noteId;
  if (!edit.inText) return !inThisText;
  // Not loaded yet: keep it until the row arrives.
  if (!row) return false;
  // Primary content is never placed by text — there is nothing to show.
  if (row.role !== "referenced") return true;
  return inThisText;
}

/**
 * The edits the tree's data doesn't show yet. Expired edits go too — judged
 * only when the data changes, so the tree never falls back on its own to data
 * older than the edit.
 */
export function settleInTextEdits(
  forests: readonly (readonly TreeNode[])[],
  edits: InTextEdits,
  now: number,
  maxAgeMs: number = IN_TEXT_EDIT_MAX_AGE_MS,
): InTextEdits {
  const noteIds = Object.keys(edits);
  if (noteIds.length === 0) return edits;
  const index = indexForests(forests);
  let changed = false;
  const next: Record<string, Record<string, InTextEdit>> = {};
  for (const noteId of noteIds) {
    const kept: Record<string, InTextEdit> = {};
    let keptAny = false;
    for (const [mediaId, edit] of Object.entries(edits[noteId])) {
      if (now - edit.at > maxAgeMs || editSettled(index, noteId, mediaId, edit)) {
        changed = true;
        continue;
      }
      kept[mediaId] = edit;
      keptAny = true;
    }
    if (keptAny) next[noteId] = kept;
  }
  return changed ? next : edits;
}

/** Media now in a note's text whose rows the tree hasn't loaded (fresh uploads). */
export function missingInTextMedia(
  forests: readonly (readonly TreeNode[])[],
  edits: InTextEdits,
): string[] {
  const index = indexForests(forests);
  const missing = new Set<string>();
  for (const forNote of Object.values(edits)) {
    for (const [mediaId, edit] of Object.entries(forNote)) {
      if (edit.inText && !index.has(mediaId)) missing.add(mediaId);
    }
  }
  return [...missing];
}
