import "server-only";

/**
 * The one way to write note content from outside the editor (AI collab write path).
 *
 * Every out-of-band writer — AI tools, the browser extension, maintenance scripts —
 * should route through here rather than upserting `NotePayload` itself, because the
 * correct write path depends on whether a collaborative copy of the document exists:
 *
 *   S2  no CollaborationDocument row  →  NotePayload is the only copy. Write it.
 *                                        Zero Hocuspocus contact (the resource rule:
 *                                        never wake collab for a document nobody has
 *                                        ever opened).
 *   S3  row exists                    →  a Y.Doc — and possibly browser caches —
 *                                        exist. Write THROUGH the document via
 *                                        Hocuspocus, or the edit is masked in any
 *                                        open editor and destroyed by that session's
 *                                        next store.
 *
 * Confirmed in production 2026-08-12: an AI append reached NotePayload (visible in
 * export) but never the editor, because the open session's snapshot won.
 *
 * Slice 1 uses the CollaborationDocument row as the S2/S3 discriminator. It is a
 * LEAKY proxy — a browser creates an IndexedDB cache unconditionally on open, so a
 * note first opened while Hocuspocus was unreachable has a cache but no row. Slice 2
 * replaces it with a `firstOpenedInEditorAt` stamp. See
 * docs/notes-feature/work-tracking/AI-COLLAB-WRITE-PATH-PLAN.md.
 */

import type { JSONContent } from "@tiptap/core";

import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { logger } from "@/lib/core/logger";
import { extractSearchTextFromTipTap } from "@/lib/domain/content/search-text";
import { reseedCollaborationDocumentFromNote } from "@/lib/domain/collaboration/documents";
import {
  buildNoteEditTarget,
  NoteEditRefused,
  SHRINK_GUARD_MIN_CHARS,
  SHRINK_RETAIN_FLOOR,
  type NoteEditMode,
} from "@/lib/domain/collaboration/note-edit-ops";

/** How the write reached the document — surfaced in receipts, not cosmetic. */
export type NoteWriteRoute = "collaboration" | "payload" | "payload-fallback";

export interface WriteNoteContentRequest {
  contentId: string;
  ownerId: string;
  mode: NoteEditMode;
  /** For `replace`, the whole document. For `append`, the blocks to add. */
  content: JSONContent;
  /** True when the user approved a destructive rewrite via the approval card. */
  destructiveApproved?: boolean;
}

export interface WriteNoteContentResult {
  route: NoteWriteRoute;
  charsBefore: number;
  charsAfter: number;
  blocksBefore: number;
  blocksAfter: number;
  /** Pre-write document, for the Undo chip. Never sent to the model. */
  snapshot: JSONContent | null;
  /**
   * Set when the write landed in NotePayload while a collaborative copy exists —
   * i.e. it may be invisible in an open editor. Receipts must say so.
   */
  mayBeMaskedInOpenEditor: boolean;
}

/** Refusal surfaced to the caller as an actionable tool error. */
export { NoteEditRefused };

/**
 * Budget for the collaborative apply before falling back to a payload write.
 *
 * A constant, not an env knob: Cloud Run runs at `min-instances=0`, so the only
 * real question is whether a cold start fits — and on Vercel an env change needs a
 * redeploy anyway, so a variable would buy nothing a code edit doesn't.
 */
const APPLY_TIMEOUT_MS = 8000;

/**
 * The collaboration server is one service, so this reads the one URL that names it.
 * (An override var existed briefly for pointing server-to-server traffic at a
 * different address; nothing in this topology needs that.) `NEXT_PUBLIC_` is only a
 * build-time inlining hint for the client — the value is a normal env var here, and
 * it is the same host the browser opens its websocket to. ws→http because the client
 * var is a websocket URL.
 */
function internalApplyUrl(): string | null {
  if (!process.env.COLLABORATION_WRITE_SECRET) return null;
  const base = process.env.NEXT_PUBLIC_HOCUSPOCUS_URL;
  if (!base) return null;
  const http = base.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
  return `${http.replace(/\/$/, "")}/internal/apply`;
}

interface ApplyResponse {
  ok?: boolean;
  refused?: string;
  error?: string;
  before?: JSONContent;
  charsBefore?: number;
  charsAfter?: number;
  blocksBefore?: number;
  blocksAfter?: number;
}

/**
 * Write note content by the route the document's state requires.
 *
 * @throws NoteEditRefused when the shrink guard trips without approval. Every other
 *   failure degrades to the payload path rather than failing the caller — NotePayload
 *   remains the durable store, so a Hocuspocus outage must not block a write.
 */
export async function writeNoteContent(
  request: WriteNoteContentRequest,
): Promise<WriteNoteContentResult> {
  const { contentId, ownerId, mode, content, destructiveApproved } = request;

  const collabDoc = await prisma.collaborationDocument.findUnique({
    where: { contentId },
    select: { contentId: true },
  });

  if (collabDoc) {
    const url = internalApplyUrl();
    if (url) {
      try {
        const applied = await applyThroughCollaboration(url, request);
        return {
          route: "collaboration",
          charsBefore: applied.charsBefore ?? 0,
          charsAfter: applied.charsAfter ?? 0,
          blocksBefore: applied.blocksBefore ?? 0,
          blocksAfter: applied.blocksAfter ?? 0,
          snapshot: applied.before ?? null,
          mayBeMaskedInOpenEditor: false,
        };
      } catch (error) {
        // A refusal is a decision, not a transport failure — do not fall back and
        // silently perform the destructive write the guard just blocked.
        if (error instanceof NoteEditRefused) throw error;
        logger.warn({
          layer: "ai",
          event: "collab_write:fallback",
          summary:
            "collaborative apply failed — falling back to a payload write (may be masked in an open editor)",
          attrs: { content_id: contentId },
          error,
        });
      }
    }
  }

  // Payload path. S2 (no collaborative copy) reaches here by design; S3 only
  // reaches it when Hocuspocus is unconfigured or unreachable.
  const result = await writeNotePayload({
    contentId,
    ownerId,
    mode,
    content,
    destructiveApproved,
  });
  return {
    ...result,
    route: collabDoc ? "payload-fallback" : "payload",
    mayBeMaskedInOpenEditor: Boolean(collabDoc),
  };
}

async function applyThroughCollaboration(
  url: string,
  request: WriteNoteContentRequest,
): Promise<ApplyResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), APPLY_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-dg-collab-write": process.env.COLLABORATION_WRITE_SECRET ?? "",
      },
      body: JSON.stringify({
        contentId: request.contentId,
        mode: request.mode,
        content: request.content,
        destructiveApproved: request.destructiveApproved === true,
        expectedOwnerId: request.ownerId,
      }),
    });

    const body = (await response.json().catch(() => null)) as
      | ApplyResponse
      | null;

    if (response.status === 409 && body?.refused === "shrink") {
      throw new NoteEditRefused("shrink", body.error ?? "refused");
    }
    if (!response.ok || !body?.ok) {
      throw new Error(
        `internal apply failed (${response.status}): ${body?.error ?? "no body"}`,
      );
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The payload write, with the same op semantics as the collaborative path so both
 * routes behave identically from the caller's perspective.
 */
async function writeNotePayload({
  contentId,
  ownerId,
  mode,
  content,
  destructiveApproved,
}: WriteNoteContentRequest): Promise<
  Omit<WriteNoteContentResult, "route" | "mayBeMaskedInOpenEditor">
> {
  const existing = await prisma.notePayload.findUnique({
    where: { contentId },
    select: { tiptapJson: true },
  });
  const before = (existing?.tiptapJson as JSONContent | undefined) ?? {
    type: "doc",
    content: [],
  };

  const { target } = buildNoteEditTarget(before, {
    mode,
    content,
    destructiveApproved,
  });

  const charsBefore = extractSearchTextFromTipTap(before).length;
  const searchText = extractSearchTextFromTipTap(target);

  // Same guard as the collaborative path — a fallback must not become the loophole
  // through which an unapproved rewrite lands.
  if (
    !destructiveApproved &&
    charsBefore >= SHRINK_GUARD_MIN_CHARS &&
    searchText.length < charsBefore * SHRINK_RETAIN_FLOOR
  ) {
    throw new NoteEditRefused(
      "shrink",
      `Refused: this would cut the document from ${charsBefore} to ${searchText.length} characters. ` +
        `Send the full intended content, or ask the user to confirm a rewrite.`,
    );
  }

  const wordCount = searchText.split(/\s+/).filter(Boolean).length;
  const metadata = {
    wordCount,
    characterCount: searchText.length,
    readingTime: Math.ceil(wordCount / 200),
  };

  await prisma.notePayload.upsert({
    where: { contentId },
    update: {
      tiptapJson: target as unknown as Prisma.InputJsonValue,
      searchText,
      metadata,
    },
    create: {
      contentId,
      tiptapJson: target as unknown as Prisma.InputJsonValue,
      searchText,
      metadata,
    },
  });

  // Race closer, not the mechanism (D9): if a collaborative copy appeared between
  // the discriminator read and this write, realign the stored snapshot. It cannot
  // reach a live in-memory session — that is what the collaborative route is for.
  try {
    const appeared = await prisma.collaborationDocument.findUnique({
      where: { contentId },
      select: { contentId: true },
    });
    if (appeared) {
      await reseedCollaborationDocumentFromNote(prisma, contentId);
    }
  } catch (error) {
    logger.error({
      layer: "ai",
      event: "collab_write:reseed_failed",
      summary: "post-write reseed failed — payload remains authoritative",
      attrs: { content_id: contentId, owner_id: ownerId },
      error,
    });
  }

  return {
    charsBefore,
    charsAfter: searchText.length,
    blocksBefore: Array.isArray(before.content) ? before.content.length : 0,
    blocksAfter: Array.isArray(target.content) ? target.content.length : 0,
    snapshot: before,
  };
}
