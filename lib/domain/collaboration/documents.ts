import { TiptapTransformer } from "@hocuspocus/transformer";
import type { JSONContent } from "@tiptap/core";
import * as Y from "yjs";

import type { Prisma, PrismaClient } from "@/lib/database/generated/prisma";
import { extractSearchTextFromTipTap } from "@/lib/domain/content/search-text";
import { syncWindowReferences } from "@/lib/domain/content/window-refs";
import { syncImageReferences } from "@/lib/domain/content/image-refs";
import {
  hasMeaningfulTipTapContent,
  ydocUpdateHasMeaningfulDefaultContent,
} from "./content-safety";
import { getCollaborationServerExtensions } from "./extensions";
import { catchUpStoredCopy, mergePushedCopy, seedCopy } from "./lineage";
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

type CollaborationDb = Prisma.TransactionClient;

/**
 * Serialize every write to one document's stored copy. Two loads at once (the
 * canonical-state fetch and Hocuspocus's own load, a moment apart when a
 * collaborator joins) would otherwise each decide to catch up and each write
 * their own items — the same text twice once the copies meet.
 */
async function lockCollaborationDocument(tx: CollaborationDb, documentName: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`collab-doc:${documentName}`}, 0))`;
}

/** What a load serves: the stored copy as is, or a write first. */
type BootstrapPlan =
  | { kind: "serve"; state: Uint8Array }
  | { kind: "catch-up"; stored: Uint8Array; content: JSONContent }
  | { kind: "seed"; content: JSONContent };

interface StoredCopies {
  ownerId: string;
  payload: { tiptapJson: unknown; metadata: unknown; updatedAt: Date };
  record: { ydocState: Uint8Array | null; updatedAt: Date; snapshotJson: unknown } | null;
}

async function readStoredCopies(
  db: CollaborationDb,
  contentId: string,
  documentName: string
): Promise<StoredCopies | null> {
  const content = await db.contentNode.findFirst({
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
  const record = await db.collaborationDocument.findUnique({
    where: { documentName },
    select: { ydocState: true, updatedAt: true, snapshotJson: true },
  });
  return {
    ownerId: content.ownerId,
    payload: content.notePayload,
    record: record
      ? { ...record, ydocState: record.ydocState ? new Uint8Array(record.ydocState) : null }
      : null,
  };
}

function planBootstrap({ payload, record }: StoredCopies): BootstrapPlan {
  const content = sanitizeTipTapJsonWithExtensions(
    payload.tiptapJson as JSONContent,
    getCollaborationServerExtensions()
  ).json;
  if (!record?.ydocState) {
    return { kind: "seed", content };
  }
  const state = record.ydocState;
  if (
    (ydocUpdateHasMeaningfulDefaultContent(state) || !hasMeaningfulTipTapContent(content)) &&
    !payloadIsNewerThanCollaborativeCopy(payload, content, record)
  ) {
    return { kind: "serve", state };
  }
  return { kind: "catch-up", stored: state, content };
}

/**
 * Record that the stored copy now reflects the payload AS OF its `updatedAt`
 * — the mirror stamp `payloadIsNewerThanCollaborativeCopy` reads. Written
 * with `updatedAt` held where it was: opening a note is not editing it, and
 * the payload's `updatedAt` is what activity signals ("edited today") read.
 */
async function stampMirrorAsOf(tx: CollaborationDb, contentId: string, asOf: Date): Promise<void> {
  const existing = await tx.notePayload.findUnique({
    where: { contentId },
    select: { metadata: true },
  });
  const priorMeta =
    existing?.metadata && typeof existing.metadata === "object"
      ? (existing.metadata as Record<string, unknown>)
      : {};
  await tx.notePayload.update({
    where: { contentId },
    data: {
      metadata: { ...priorMeta, collaborationSnapshotAt: asOf.toISOString() },
      updatedAt: asOf,
    },
  });
}

export async function loadCollaborationYDocState(
  prisma: PrismaClient,
  documentName: string
): Promise<Uint8Array | null> {
  const contentId = parseCollaborationDocumentName(documentName);

  // Nearly every load serves the stored copy as is — read without the lock.
  const unlocked = await readStoredCopies(prisma, contentId, documentName);
  if (!unlocked) return null;
  const first = planBootstrap(unlocked);
  if (first.kind === "serve") return first.state;

  // A write is due. Take the document's lock and decide again: another load
  // may have done this work while we read.
  return prisma.$transaction(async (tx) => {
    await lockCollaborationDocument(tx, documentName);
    const copies = await readStoredCopies(tx, contentId, documentName);
    if (!copies) return null;
    const plan = planBootstrap(copies);
    if (plan.kind === "serve") return plan.state;

    // Catch up ON the stored lineage, never by rebuilding (see lineage.ts):
    // every browser and server session holding the stored copy must merge
    // with the result cleanly.
    const update =
      plan.kind === "catch-up" ? catchUpStoredCopy(plan.stored, plan.content) : seedCopy(plan.content);

    await tx.collaborationDocument.upsert({
      where: { contentId },
      update: {
        documentName,
        ownerId: copies.ownerId,
        ydocState: Buffer.from(update),
        snapshotJson: plan.content,
      },
      create: {
        contentId,
        ownerId: copies.ownerId,
        documentName,
        ydocState: Buffer.from(update),
        snapshotJson: plan.content,
      },
    });
    // Without this the NEXT load found the payload still "newer" and wrote
    // again — which is how a joining collaborator got two copies.
    await stampMirrorAsOf(tx, contentId, copies.payload.updatedAt);
    return update;
  });
}

/**
 * Merge the Y state a SOLO editor sent with its REST save into the stored
 * copy (collaboration-local: its Y.Doc is bound, no live connection, so its
 * edits reach the server only through REST). Without this the payload moved
 * ahead of the stored copy while the editor's own Y.Doc held the same edits;
 * when a collaborator arrived, the server caught up from the payload with its
 * own items, and the editor then brought ITS items for the same text.
 *
 * Call BEFORE writing the payload, and write the payload with
 * `collaborationSnapshotAt` when this returns "merged": no load can then see
 * a payload ahead of the stored copy in between.
 *
 * "rival" — the pushed copy is of another lineage than the stored one;
 * merging would double the note, so nothing is written (the browser moves
 * onto the server's lineage before it connects).
 */
export async function mergeSoloCollaborationCopy(
  prisma: PrismaClient,
  contentId: string,
  pushed: Uint8Array
): Promise<"merged" | "rival" | "missing"> {
  const documentName = getCollaborationDocumentName(contentId);
  return prisma.$transaction(async (tx) => {
    await lockCollaborationDocument(tx, documentName);
    const copies = await readStoredCopies(tx, contentId, documentName);
    if (!copies) return "missing";
    const merged = mergePushedCopy(copies.record?.ydocState ?? null, pushed);
    if (!merged) return "rival";

    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, merged);
    const snapshot = TiptapTransformer.fromYdoc(ydoc, "default") as JSONContent;
    ydoc.destroy();
    await tx.collaborationDocument.upsert({
      where: { contentId },
      update: {
        documentName,
        ownerId: copies.ownerId,
        ydocState: Buffer.from(merged),
        snapshotJson: snapshot,
      },
      create: {
        contentId,
        ownerId: copies.ownerId,
        documentName,
        ydocState: Buffer.from(merged),
        snapshotJson: snapshot,
      },
    });
    return "merged";
  });
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

  const ownerId = await prisma.$transaction(async (tx) => {
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
    return content.ownerId;
  });

  // Window-ref edges are derived from note content, and collaborative saves
  // are the PRIMARY write path — hooking the sync only into the REST routes
  // would leave edges stale for exactly the notes users edit most. Outside
  // the transaction (and non-throwing internally): edge syncing must never
  // fail or slow the store hook itself.
  await syncWindowReferences(prisma, contentId, snapshot);
  // …and the same for the images and audio in the note's text. These links
  // are what say an item is IN a note (the tree's "In this note's text"
  // badge, the move rules that keep such items with their note), and they
  // were only refreshed on REST saves — so during live editing a removed
  // image still counted as embedded and a pasted one didn't yet. Links only:
  // no trashing of now-unused media here (see `trashOrphans`).
  await syncImageReferences(contentId, snapshot, ownerId, { trashOrphans: false });
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
