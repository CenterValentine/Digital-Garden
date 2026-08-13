/**
 * Note edit operations applied to a live Y.Doc (AI collab write path, Slice 1).
 *
 * This is the ONLY place that mutates a collaborative document from outside the
 * editor. Everything here is pure with respect to the database: callers hand in a
 * Y.Doc (from Hocuspocus's `openDirectConnection`) and get back the before/after
 * snapshots; persistence happens through the normal collaboration store hook.
 *
 * ## Why not write NotePayload directly (the bug this replaces)
 *
 * `NotePayload` and the Y.Doc are two stores for one document. Bootstrap trusts a
 * meaningful stored Y state OVER the payload, so a payload-only write is invisible
 * in an open editor — and worse, that session's next store writes its stale
 * snapshot back over the payload, destroying the write. Confirmed in production
 * 2026-08-12: export (payload) showed two jobs, the editor showed one.
 *
 * ## Why `updateYFragment` and not `prosemirrorJSONToYXmlFragment`
 *
 * `updateYFragment` applies a MINIMAL DIFF against the existing fragment, so
 * untouched blocks keep their Y identity and concurrent cursors elsewhere survive.
 * `prosemirrorJSONToYXmlFragment` populates a fragment from scratch — its own
 * docstring warns it "should not be used to rehydrate a Y.Doc … once collaboration
 * has begun as all history will be lost", which is the rival-document hazard that
 * makes reseeding unsound.
 *
 * See docs/notes-feature/work-tracking/AI-COLLAB-WRITE-PATH-PLAN.md
 */

import { getSchema, type JSONContent } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
import { TiptapTransformer } from "@hocuspocus/transformer";
import { updateYFragment } from "y-prosemirror";
import type * as Y from "yjs";

import { extractSearchTextFromTipTap } from "@/lib/domain/content/search-text";
import { sanitizeTipTapJsonWithExtensions } from "@/lib/domain/editor/unsupported-content";
import { hasMeaningfulTipTapContent } from "./content-safety";
import { getCollaborationServerExtensions } from "./extensions";

/** The Y fragment TipTap binds to. Must match the transformer's field name. */
export const COLLAB_FRAGMENT_FIELD = "default";

/** Transaction origin stamped on AI writes so they are attributable in the doc. */
export const AI_WRITE_ORIGIN = "ai-collab-write";

export type NoteEditMode = "append" | "replace";

/**
 * A replace retaining less than this fraction of the original text is destructive
 * enough to confirm with the user. The guard exists to catch a model that resends a
 * fragment while in replace mode, not to police ordinary trimming.
 */
export const SHRINK_RETAIN_FLOOR = 0.5;

/**
 * Minimum character count before the shrink guard applies at all. Losing 100
 * characters is an undo; losing 4,000 is a disaster, and the floor is where that
 * stops being true. Lowered from 400 on 2026-08-13 — a one-sentence rewrite of a
 * 250-character note is still a destructive act the user should see.
 */
export const SHRINK_GUARD_MIN_CHARS = 200;

/**
 * The HARD refusal threshold, deliberately LOWER than SHRINK_RETAIN_FLOOR.
 *
 * The approval card and this backstop must not compete: the card is driven by a
 * cheap pre-check against the stored payload, while this compares extracted text
 * inside the transaction, so the two can disagree at the margin. Keeping the
 * refusal threshold well below the card threshold means anything reaching it is
 * unambiguously catastrophic — and an approved rewrite skips this path entirely.
 */
export const SHRINK_HARD_REFUSE_FLOOR = 0.25;

export interface NoteEditRequest {
  mode: NoteEditMode;
  /**
   * For `replace`, the full target document. For `append`, a document whose
   * top-level `content` entries are the blocks to add at the end.
   */
  content: JSONContent;
  /**
   * Set when the destructive path was explicitly approved. Bypasses the shrink
   * guard — the user, not the model, authorized the loss.
   */
  destructiveApproved?: boolean;
}

export interface NoteEditOutcome {
  /** Document JSON as it stood BEFORE the edit — the revert snapshot. */
  before: JSONContent;
  /** Document JSON after the edit, as applied. */
  after: JSONContent;
  charsBefore: number;
  charsAfter: number;
  blocksBefore: number;
  blocksAfter: number;
  /** True when `append` fell back to replace because the document was empty. */
  appendedIntoEmptyDocument: boolean;
}

export class NoteEditRefused extends Error {
  constructor(
    readonly reason: "shrink",
    message: string,
  ) {
    super(message);
    this.name = "NoteEditRefused";
  }
}

function blockCount(doc: JSONContent): number {
  return Array.isArray(doc.content) ? doc.content.length : 0;
}

/**
 * Build the target document for an edit. Split out from the Y mutation so the
 * validation gate can exercise target construction without a Y.Doc.
 */
export function buildNoteEditTarget(
  current: JSONContent,
  request: NoteEditRequest,
): { target: JSONContent; appendedIntoEmptyDocument: boolean } {
  if (request.mode === "replace") {
    return { target: request.content, appendedIntoEmptyDocument: false };
  }

  // An "append" into a document that holds nothing but TipTap's mandatory empty
  // paragraph would leave a leading blank line forever. Treat it as a replace so
  // the first AI write to a fresh note reads correctly.
  if (!hasMeaningfulTipTapContent(current)) {
    return { target: request.content, appendedIntoEmptyDocument: true };
  }

  const existing = Array.isArray(current.content) ? current.content : [];
  const additions = Array.isArray(request.content.content)
    ? request.content.content
    : [];

  return {
    target: { ...current, content: [...existing, ...additions] },
    appendedIntoEmptyDocument: false,
  };
}

/**
 * Apply an edit to a live Y.Doc via a minimal diff.
 *
 * The caller owns the document's lifecycle (Hocuspocus's DirectConnection) and its
 * persistence; this function only mutates. It wraps its own Y transaction —
 * `updateYFragment` deliberately does not (y-prosemirror's own binding wraps it at
 * the call site), so without this the edit would emit one update per node change.
 *
 * @throws NoteEditRefused when the shrink guard trips and the loss was not approved.
 */
export function applyNoteEdit(
  ydoc: Y.Doc,
  request: NoteEditRequest,
): NoteEditOutcome {
  const extensions = getCollaborationServerExtensions();
  const schema = getSchema(extensions);

  const before = sanitizeTipTapJsonWithExtensions(
    TiptapTransformer.fromYdoc(ydoc, COLLAB_FRAGMENT_FIELD) as JSONContent,
    extensions,
  ).json;

  const { target, appendedIntoEmptyDocument } = buildNoteEditTarget(
    before,
    request,
  );
  const after = sanitizeTipTapJsonWithExtensions(target, extensions).json;

  const charsBefore = extractSearchTextFromTipTap(before).length;
  const charsAfter = extractSearchTextFromTipTap(after).length;

  // Shrink guard (harness, not prompt): a model that resends a fragment while in
  // replace mode would otherwise silently destroy the document. Only meaningful
  // above a floor — trimming a short note is not a catastrophe.
  if (
    !request.destructiveApproved &&
    charsBefore >= SHRINK_GUARD_MIN_CHARS &&
    charsAfter < charsBefore * SHRINK_HARD_REFUSE_FLOOR
  ) {
    throw new NoteEditRefused(
      "shrink",
      `Refused: this would cut the document from ${charsBefore} to ${charsAfter} characters. ` +
        `Send the full intended content, or ask the user to confirm a rewrite.`,
    );
  }

  const fragment = ydoc.getXmlFragment(COLLAB_FRAGMENT_FIELD);
  const targetNode = PMNode.fromJSON(schema, after);

  ydoc.transact(() => {
    updateYFragment(ydoc, fragment, targetNode, {
      mapping: new Map(),
      isOMark: new Map(),
    });
  }, AI_WRITE_ORIGIN);

  return {
    before,
    after,
    charsBefore,
    charsAfter,
    blocksBefore: blockCount(before),
    blocksAfter: blockCount(after),
    appendedIntoEmptyDocument,
  };
}
