import { TiptapTransformer } from "@hocuspocus/transformer";
import type { JSONContent } from "@tiptap/core";
import * as Y from "yjs";

import type { PrismaClient } from "@/lib/database/generated/prisma";
import { extractSearchTextFromTipTap } from "@/lib/domain/content/search-text";
import {
  hasMeaningfulTipTapContent,
  ydocUpdateHasMeaningfulDefaultContent,
} from "./content-safety";
import { getCollaborationServerExtensions } from "./extensions";
import { sanitizeTipTapJsonWithExtensions } from "@/lib/domain/editor/unsupported-content";
import { getCollaborationDocumentName } from "./tokens";

/**
 * Bootstrap freshness check (fixes the stale-Y.Doc class of bug, 2026-08-18).
 *
 * The store hook mirrors every Y.Doc save into NotePayload and stamps
 * `metadata.collaborationSnapshotAt`. A payload written OUTSIDE the collab
 * path (offline/localOnly REST fallback while the collab server was down)
 * advances `updatedAt` past that stamp — or wipes the stamp entirely, since
 * that write path replaces `metadata` wholesale. Either way the payload then
 * holds content the Y.Doc does not, and the old rule ("a meaningful stored
 * Y state is trusted over the payload") served the STALE copy forever until a
 * manual reseed. Observed on db80c857: 63 blocks in the Y.Doc, 167 in the
 * payload, mirror stamp erased.
 *
 * Returns true when the payload should win bootstrap. Guarded so a rich Y.Doc
 * is never traded for a degenerate payload: the payload must be meaningful
 * and must not be a strict SHRINK of the Y.Doc's own last snapshot (a shorter
 * payload with a newer timestamp is far more likely a partial/failed write
 * than a legitimate edit — in that ambiguous case we keep the Y.Doc, and the
 * existing divergence banner still surfaces it to the user).
 */
function payloadIsNewerThanCollaborativeCopy(
  payload: { updatedAt: Date; metadata: unknown },
  payloadContent: JSONContent,
  record: { updatedAt: Date; snapshotJson: unknown },
): boolean {
  if (!hasMeaningfulTipTapContent(payloadContent)) return false;

  const meta =
    typeof payload.metadata === "object" && payload.metadata !== null
      ? (payload.metadata as Record<string, unknown>)
      : {};
  const stampRaw = meta.collaborationSnapshotAt;
  const lastMirror =
    typeof stampRaw === "string" ? new Date(stampRaw) : null;

  // Written after the last mirror (or never mirrored at all): the payload has
  // moved independently of the collaborative copy.
  const payloadWrittenOutsideCollab = lastMirror
    ? payload.updatedAt.getTime() > lastMirror.getTime() + 1000
    : payload.updatedAt.getTime() > record.updatedAt.getTime() + 1000;
  if (!payloadWrittenOutsideCollab) return false;

  // Shrink guard: don't let a smaller newer payload displace a larger Y.Doc.
  const payloadBlocks = Array.isArray(payloadContent.content)
    ? payloadContent.content.length
    : 0;
  const snapshot = record.snapshotJson as JSONContent | null | undefined;
  const ydocBlocks = Array.isArray(snapshot?.content) ? snapshot.content.length : 0;
  return payloadBlocks >= ydocBlocks;
}

export async function loadCollaborationYDocState(
  prisma: PrismaClient,
  documentName: string
): Promise<Uint8Array | null> {
  const contentId = parseCollaborationDocumentName(documentName);
  const content = await prisma.contentNode.findFirst({
    where: {
      id: contentId,
      contentType: "note",
      deletedAt: null,
    },
    include: {
      notePayload: true,
    },
  });

  if (!content?.notePayload) {
    return null;
  }

  const record = await prisma.collaborationDocument.findUnique({
    where: { documentName },
    select: { ydocState: true, updatedAt: true, snapshotJson: true },
  });

  if (record?.ydocState) {
    const state = new Uint8Array(record.ydocState);
    const noteContent = sanitizeTipTapJsonWithExtensions(
      content.notePayload.tiptapJson as JSONContent,
      getCollaborationServerExtensions()
    ).json;
    if (
      (ydocUpdateHasMeaningfulDefaultContent(state) ||
        !hasMeaningfulTipTapContent(noteContent)) &&
      !payloadIsNewerThanCollaborativeCopy(content.notePayload, noteContent, record)
    ) {
      return state;
    }
  }

  const sanitizedContent = sanitizeTipTapJsonWithExtensions(
    content.notePayload.tiptapJson as JSONContent,
    getCollaborationServerExtensions()
  ).json;

  const ydoc = TiptapTransformer.toYdoc(
    sanitizedContent,
    "default",
    getCollaborationServerExtensions()
  );
  const update = Y.encodeStateAsUpdate(ydoc);

  await prisma.collaborationDocument.upsert({
    where: { contentId },
    update: {
      documentName,
      ownerId: content.ownerId,
      ydocState: Buffer.from(update),
      snapshotJson: sanitizedContent,
    },
    create: {
      contentId,
      ownerId: content.ownerId,
      documentName,
      ydocState: Buffer.from(update),
      snapshotJson: sanitizedContent,
    },
  });

  return update;
}

/**
 * Rebuild the CollaborationDocument Y.Doc from the note's CURRENT NotePayload.
 *
 * Use this after any write path that updates `NotePayload` WITHOUT going through
 * the collaborative Y.Doc — the browser extension being the canonical example
 * (`updateExtensionNoteContent` writes only NotePayload). Without this, a
 * previously-stored, now-stale-but-non-empty `CollaborationDocument` wins during
 * bootstrap (see `loadCollaborationYDocState`: a meaningful stored state is
 * trusted over the payload), so the collaborative layer serves STALE content and
 * masks the extension's edit. Re-seeding realigns the collaborative snapshot with
 * the authoritative payload the user just wrote.
 *
 * Safety: this only rewrites the durable DB snapshot. It does not reach into a
 * live Hocuspocus in-memory session — if one is connected it remains
 * authoritative and re-persists on its next store. The dominant case (an
 * extension-authored note that is NOT currently open in a live collab session)
 * is fully corrected; the concurrent-live-session case is the inherent
 * two-writers conflict and is out of scope here.
 */
export async function reseedCollaborationDocumentFromNote(
  prisma: PrismaClient,
  contentId: string
): Promise<void> {
  const documentName = getCollaborationDocumentName(contentId);
  const content = await prisma.contentNode.findFirst({
    where: {
      id: contentId,
      contentType: "note",
      deletedAt: null,
    },
    include: {
      notePayload: true,
    },
  });

  if (!content?.notePayload) {
    return;
  }

  const sanitizedContent = sanitizeTipTapJsonWithExtensions(
    content.notePayload.tiptapJson as JSONContent,
    getCollaborationServerExtensions()
  ).json;

  const ydoc = TiptapTransformer.toYdoc(
    sanitizedContent,
    "default",
    getCollaborationServerExtensions()
  );
  const update = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();

  await prisma.collaborationDocument.upsert({
    where: { contentId },
    update: {
      documentName,
      ownerId: content.ownerId,
      ydocState: Buffer.from(update),
      snapshotJson: sanitizedContent,
    },
    create: {
      contentId,
      ownerId: content.ownerId,
      documentName,
      ydocState: Buffer.from(update),
      snapshotJson: sanitizedContent,
    },
  });
}

export async function storeCollaborationYDocState(
  prisma: PrismaClient,
  documentName: string,
  state: Uint8Array
): Promise<void> {
  const contentId = parseCollaborationDocumentName(documentName);
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, state);
  const snapshot = TiptapTransformer.fromYdoc(ydoc, "default") as JSONContent;
  const snapshotHasMeaningfulContent = hasMeaningfulTipTapContent(snapshot);
  const searchText = extractSearchTextFromTipTap(snapshot);
  const wordCount = searchText.split(/\s+/).filter(Boolean).length;

  await prisma.$transaction(async (tx) => {
    const content = await tx.contentNode.findFirst({
      where: {
        id: contentId,
        contentType: "note",
        deletedAt: null,
      },
      include: {
        notePayload: true,
      },
    });

    if (!content) {
      throw new Error("Collaboration content not found");
    }

    const existingContent = content.notePayload?.tiptapJson as JSONContent | undefined;
    if (
      hasMeaningfulTipTapContent(existingContent) &&
      !snapshotHasMeaningfulContent
    ) {
      throw new Error(
        "Refusing to store an empty collaborative document over existing note content"
      );
    }

    await tx.collaborationDocument.upsert({
      where: { contentId },
      update: {
        documentName,
        ownerId: content.ownerId,
        ydocState: Buffer.from(state),
        snapshotJson: snapshot,
      },
      create: {
        contentId,
        ownerId: content.ownerId,
        documentName,
        ydocState: Buffer.from(state),
        snapshotJson: snapshot,
      },
    });

    // MERGE over the existing metadata, never replace it (owner bug
    // 2026-09-04: an editor save wiped a charter's `charter` mark and
    // would equally destroy `masterLedgerId` (D10), a quest log's
    // `runLedgerKey`/`ledgerMarkdown`/`captureConfig`/`questInfo`, or any
    // other durable key — this hook only OWNS the derived-stats keys).
    const existingPayload = await tx.notePayload.findUnique({
      where: { contentId },
      select: { metadata: true },
    });
    const priorMeta =
      existingPayload?.metadata && typeof existingPayload.metadata === "object"
        ? (existingPayload.metadata as Record<string, unknown>)
        : {};
    await tx.notePayload.update({
      where: { contentId },
      data: {
        tiptapJson: snapshot,
        searchText,
        metadata: {
          ...priorMeta,
          wordCount,
          characterCount: searchText.length,
          readingTime: Math.ceil(wordCount / 200),
          collaborationEnabled: true,
          collaborationSnapshotAt: new Date().toISOString(),
        },
      },
    });
  });
}

export function parseCollaborationDocumentName(documentName: string): string {
  if (!documentName.startsWith("content:")) {
    throw new Error("Invalid collaboration document name");
  }

  const contentId = documentName.slice("content:".length);
  if (!contentId) {
    throw new Error("Invalid collaboration content id");
  }

  return contentId;
}

export function documentNameForContent(contentId: string): string {
  return getCollaborationDocumentName(contentId);
}
