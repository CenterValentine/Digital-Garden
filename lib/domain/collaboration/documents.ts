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
import { getCollaborationDocumentName } from "./tokens";

// ─── Visualization Y.Doc helpers ────────────────────────────────────────────

/**
 * Bootstrap a fresh Y.Doc from existing visualization payload data.
 * Engine-specific mapping:
 *   excalidraw  → Y.Map("elementMap") keyed by element ID + Y.Map("appState")
 *   mermaid     → Y.Text("source")
 *   diagrams-net → Y.Map("diagram") key "xml"
 */
function bootstrapVisualizationYDoc(ydoc: Y.Doc, engine: string, data: Record<string, unknown>) {
  if (engine === "excalidraw") {
    const elementMap = ydoc.getMap<unknown>("elementMap");
    const rawElements = Array.isArray(data.elements) ? data.elements : [];
    if (rawElements.length > 0) {
      ydoc.transact(() => {
        for (const el of rawElements) {
          if (el && typeof el === "object" && "id" in el) {
            elementMap.set((el as { id: string }).id, el);
          }
        }
      });
    }
    if (data.appState && typeof data.appState === "object") {
      const appState = ydoc.getMap<unknown>("appState");
      for (const [k, v] of Object.entries(data.appState as Record<string, unknown>)) {
        appState.set(k, v);
      }
    }
  } else if (engine === "mermaid") {
    const source = ydoc.getText("source");
    const text = typeof data.source === "string" ? data.source : "";
    if (text) source.insert(0, text);
  } else if (engine === "diagrams-net") {
    // Y.Map gives last-write-wins per key — correct for atomic diagram snapshots.
    // Y.Text would cause concurrent delete+insert to concatenate both XMLs.
    const diagram = ydoc.getMap<string>("diagram");
    const text = typeof data.xml === "string" ? data.xml : "";
    if (text) ydoc.transact(() => { diagram.set("xml", text); });
  }
}

/**
 * Extract a plain-JSON snapshot from a visualization Y.Doc for persistence.
 */
function extractVisualizationSnapshot(
  ydoc: Y.Doc,
  engine: string
): Record<string, unknown> {
  if (engine === "excalidraw") {
    const elementMap = ydoc.getMap<unknown>("elementMap");
    const appStateMap = ydoc.getMap<unknown>("appState");
    return {
      elements: Array.from(elementMap.values()),
      appState: Object.fromEntries(appStateMap.entries()),
    };
  } else if (engine === "mermaid") {
    return { source: ydoc.getText("source").toString() };
  } else if (engine === "diagrams-net") {
    return { xml: ydoc.getMap<string>("diagram").get("xml") ?? "" };
  }
  return {};
}

// ─── Embed helpers (Path A: embedded viz lives inside the note's Y.Doc) ─────

type EmbedEngine = "excalidraw" | "mermaid";

interface EmbedRef {
  engine: EmbedEngine;
  blockId: string;
  contentId: string;
}

/**
 * Walk a TipTap JSON tree and collect every embedded visualization block.
 * Supports excalidrawBlock (Y.Map sub-map) and mermaidBlock (Y.Text sub-text).
 */
function collectEmbeds(tiptapJson: unknown): EmbedRef[] {
  const refs: EmbedRef[] = [];
  const seen = new Set<string>();
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: unknown; attrs?: unknown; content?: unknown };
    let engine: EmbedEngine | null = null;
    if (n.type === "excalidrawBlock") engine = "excalidraw";
    else if (n.type === "mermaidBlock") engine = "mermaid";
    if (engine && n.attrs && typeof n.attrs === "object") {
      const attrs = n.attrs as { blockId?: unknown; contentId?: unknown };
      if (
        typeof attrs.blockId === "string" &&
        typeof attrs.contentId === "string" &&
        attrs.contentId &&
        !seen.has(attrs.blockId)
      ) {
        seen.add(attrs.blockId);
        refs.push({ engine, blockId: attrs.blockId, contentId: attrs.contentId });
      }
    }
    if (Array.isArray(n.content)) {
      for (const child of n.content) walk(child);
    }
  };
  walk(tiptapJson);
  return refs;
}

function excalidrawSubMapKey(blockId: string): string {
  return `blockExcalidraw:${blockId}`;
}

function mermaidSubTextKey(blockId: string): string {
  return `blockMermaid:${blockId}`;
}

/**
 * Bootstrap empty per-block sub-maps from their referenced visualization payloads.
 *
 * Seeds once: if a block's sub-map is already populated, it stays canonical.
 * Also performs inline claim — an unclaimed referenced ContentNode is stamped
 * with ownedByNoteId, so the backfill is implicit on first load after deploy.
 *
 * Returns true if the ydoc was mutated (so the caller persists the new state).
 */
async function bootstrapNoteEmbedSubMaps(
  prisma: PrismaClient,
  noteId: string,
  ydoc: Y.Doc,
  tiptapJson: unknown
): Promise<boolean> {
  const refs = collectEmbeds(tiptapJson);
  if (refs.length === 0) return false;

  const candidates = await prisma.contentNode.findMany({
    where: {
      id: { in: refs.map((r) => r.contentId) },
      deletedAt: null,
    },
    include: { visualizationPayload: true },
  });
  const byId = new Map(candidates.map((c) => [c.id, c]));

  let mutated = false;
  const claimIds: string[] = [];

  for (const ref of refs) {
    const node = byId.get(ref.contentId);
    if (!node?.visualizationPayload) continue;
    if (node.visualizationPayload.engine !== ref.engine) continue;

    // Skip if claimed by a different note
    if (node.ownedByNoteId && node.ownedByNoteId !== noteId) {
      console.warn(
        `[bootstrap] skipping ${ref.contentId}: owned by different note ${node.ownedByNoteId}, expected ${noteId}`
      );
      continue;
    }

    const data = (node.visualizationPayload.data ?? {}) as Record<string, unknown>;

    if (ref.engine === "excalidraw") {
      const subMap = ydoc.getMap<unknown>(excalidrawSubMapKey(ref.blockId));
      if (subMap.size === 0) {
        const elements = Array.isArray(data.elements) ? data.elements : [];
        if (elements.length > 0) {
          ydoc.transact(() => {
            for (const el of elements) {
              if (el && typeof el === "object" && "id" in el) {
                subMap.set((el as { id: string }).id, el);
              }
            }
          });
          mutated = true;
        }
      }
    } else if (ref.engine === "mermaid") {
      const subText = ydoc.getText(mermaidSubTextKey(ref.blockId));
      if (subText.length === 0) {
        const source = typeof data.source === "string" ? data.source : "";
        if (source.length > 0) {
          ydoc.transact(() => {
            subText.insert(0, source);
          });
          mutated = true;
        }
      }
    }

    if (node.ownedByNoteId === null) {
      claimIds.push(ref.contentId);
    }
  }

  if (claimIds.length > 0) {
    await prisma.contentNode.updateMany({
      where: { id: { in: claimIds }, ownedByNoteId: null },
      data: { ownedByNoteId: noteId, role: "referenced" },
    });
  }

  return mutated;
}

/**
 * Extract per-block sub-maps from the note's ydoc and upsert them into the
 * respective visualization payloads as the non-canonical backup.
 *
 * Only writes to ContentNodes with role === "referenced" AND
 * ownedByNoteId === this note's id — defensive guard against corrupting
 * standalone drawings or drawings owned by a different note.
 */
async function extractAndPersistEmbedBackups(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  noteId: string,
  ydoc: Y.Doc,
  tiptapJson: unknown
): Promise<void> {
  const refs = collectEmbeds(tiptapJson);
  if (refs.length === 0) return;

  // Fetch status of all referenced nodes — we need to know both who's already
  // owned by us AND who's unclaimed (so we can late-claim blocks that were
  // inserted after the Hocuspocus load hook already ran).
  const nodes = await tx.contentNode.findMany({
    where: {
      id: { in: refs.map((r) => r.contentId) },
      deletedAt: null,
    },
    select: { id: true, ownedByNoteId: true, role: true },
  });
  const statusById = new Map(nodes.map((n) => [n.id, n]));

  const lateClaimIds: string[] = [];
  for (const ref of refs) {
    const node = statusById.get(ref.contentId);
    if (!node) continue;
    if (node.ownedByNoteId === null) lateClaimIds.push(ref.contentId);
  }
  if (lateClaimIds.length > 0) {
    await tx.contentNode.updateMany({
      where: { id: { in: lateClaimIds }, ownedByNoteId: null },
      data: { ownedByNoteId: noteId, role: "referenced" },
    });
  }

  for (const ref of refs) {
    const node = statusById.get(ref.contentId);
    if (!node) continue;
    const ownsThis =
      node.ownedByNoteId === noteId ||
      (node.ownedByNoteId === null && lateClaimIds.includes(ref.contentId));
    if (!ownsThis) continue;

    let snapshot: Record<string, unknown>;
    if (ref.engine === "excalidraw") {
      const subMap = ydoc.getMap<unknown>(excalidrawSubMapKey(ref.blockId));
      snapshot = { elements: Array.from(subMap.values()), appState: {} };
    } else if (ref.engine === "mermaid") {
      const subText = ydoc.getText(mermaidSubTextKey(ref.blockId));
      snapshot = { source: subText.toString() };
    } else {
      continue;
    }

    await tx.visualizationPayload.update({
      where: { contentId: ref.contentId },
      data: { data: snapshot as never },
    });
  }
}

// ─── Load ────────────────────────────────────────────────────────────────────

export async function loadCollaborationYDocState(
  prisma: PrismaClient,
  documentName: string
): Promise<Uint8Array | null> {
  const contentId = parseCollaborationDocumentName(documentName);

  const content = await prisma.contentNode.findFirst({
    where: { id: contentId, deletedAt: null },
    include: { notePayload: true, visualizationPayload: true },
  });

  if (!content) return null;

  // ── Visualization ──────────────────────────────────────────────────────
  if (content.contentType === "visualization") {
    const record = await prisma.collaborationDocument.findUnique({
      where: { documentName },
      select: { ydocState: true },
    });

    // Return existing ydoc state if present — Hocuspocus is authoritative after first connect.
    // For excalidraw: migrate legacy Y.Array("elements") state to Y.Map("elementMap") if needed.
    if (record?.ydocState) {
      const { engine, data } = content.visualizationPayload ?? { engine: "", data: {} };
      if (engine === "excalidraw") {
        const ydoc = new Y.Doc();
        Y.applyUpdate(ydoc, new Uint8Array(record.ydocState));
        if (ydoc.getMap("elementMap").size === 0) {
          // Legacy state — re-bootstrap from visualization payload using new Y.Map structure
          const payload = content.visualizationPayload;
          if (payload) {
            bootstrapVisualizationYDoc(ydoc, engine, data as Record<string, unknown>);
            const migrated = Y.encodeStateAsUpdate(ydoc);
            await prisma.collaborationDocument.update({
              where: { documentName },
              data: { ydocState: Buffer.from(migrated) },
            });
            ydoc.destroy();
            return migrated;
          }
        }
        ydoc.destroy();
      }
      return new Uint8Array(record.ydocState);
    }

    // Bootstrap from existing visualization payload
    if (!content.visualizationPayload) return null;

    const { engine, data } = content.visualizationPayload;
    const ydoc = new Y.Doc();
    bootstrapVisualizationYDoc(ydoc, engine, data as Record<string, unknown>);
    const update = Y.encodeStateAsUpdate(ydoc);

    await prisma.collaborationDocument.upsert({
      where: { contentId },
      update: {
        documentName,
        ownerId: content.ownerId,
        ydocState: Buffer.from(update),
        snapshotJson: data as JSONContent,
      },
      create: {
        contentId,
        ownerId: content.ownerId,
        documentName,
        ydocState: Buffer.from(update),
        snapshotJson: data as JSONContent,
      },
    });

    ydoc.destroy();
    return update;
  }

  // ── Note (original path) ───────────────────────────────────────────────
  if (!content.notePayload) return null;

  const tiptapJson = content.notePayload.tiptapJson as JSONContent;

  const record = await prisma.collaborationDocument.findUnique({
    where: { documentName },
    select: { ydocState: true },
  });

  // Establish the base state: prefer an existing ydoc, otherwise seed from TipTap.
  let state: Uint8Array;
  let needsPersist = false;

  if (
    record?.ydocState &&
    (ydocUpdateHasMeaningfulDefaultContent(new Uint8Array(record.ydocState)) ||
      !hasMeaningfulTipTapContent(tiptapJson))
  ) {
    state = new Uint8Array(record.ydocState);
  } else {
    const seedDoc = TiptapTransformer.toYdoc(
      tiptapJson,
      "default",
      getCollaborationServerExtensions()
    );
    state = Y.encodeStateAsUpdate(seedDoc);
    seedDoc.destroy();
    needsPersist = true;
  }

  // Bootstrap per-block embed sub-maps (Path A). Idempotent across loads.
  const ydoc = new Y.Doc();
  try {
    Y.applyUpdate(ydoc, state);
    const mutated = await bootstrapNoteEmbedSubMaps(
      prisma,
      contentId,
      ydoc,
      tiptapJson
    );
    if (mutated) {
      state = Y.encodeStateAsUpdate(ydoc);
      needsPersist = true;
    }
  } finally {
    ydoc.destroy();
  }

  if (needsPersist) {
    await prisma.collaborationDocument.upsert({
      where: { contentId },
      update: {
        documentName,
        ownerId: content.ownerId,
        ydocState: Buffer.from(state),
        snapshotJson: tiptapJson,
      },
      create: {
        contentId,
        ownerId: content.ownerId,
        documentName,
        ydocState: Buffer.from(state),
        snapshotJson: tiptapJson,
      },
    });
  }

  return state;
}

export async function storeCollaborationYDocState(
  prisma: PrismaClient,
  documentName: string,
  state: Uint8Array
): Promise<void> {
  const contentId = parseCollaborationDocumentName(documentName);

  const content = await prisma.contentNode.findFirst({
    where: { id: contentId, deletedAt: null },
    include: { notePayload: true, visualizationPayload: true },
  });

  if (!content) {
    // Content may have been deleted while a collaboration session was still active.
    // Log and skip — do not throw, as Hocuspocus re-throws errors from storeDocumentHooks
    // as unhandled promise rejections that crash the Node.js process.
    console.warn(`[hocuspocus] store skipped: content not found for ${documentName}`);
    return;
  }

  // ── Visualization ──────────────────────────────────────────────────────
  if (content.contentType === "visualization") {
    if (!content.visualizationPayload) {
      console.warn(`[hocuspocus] store skipped: visualization payload not found for ${documentName}`);
      return;
    }

    const { engine } = content.visualizationPayload;
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, state);
    const snapshot = extractVisualizationSnapshot(ydoc, engine);
    ydoc.destroy();

    await prisma.$transaction(async (tx) => {
      await tx.collaborationDocument.upsert({
        where: { contentId },
        update: {
          documentName,
          ownerId: content.ownerId,
          ydocState: Buffer.from(state),
          snapshotJson: snapshot as JSONContent,
        },
        create: {
          contentId,
          ownerId: content.ownerId,
          documentName,
          ydocState: Buffer.from(state),
          snapshotJson: snapshot as JSONContent,
        },
      });

      // Write authoritative data back to the visualization payload
      await tx.visualizationPayload.update({
        where: { contentId },
        data: { data: snapshot as never },
      });
    });

    return;
  }

  // ── Note (original path) ───────────────────────────────────────────────
  const ydoc = new Y.Doc();
  try {
    Y.applyUpdate(ydoc, state);
    const snapshot = TiptapTransformer.fromYdoc(ydoc, "default") as JSONContent;
    const snapshotHasMeaningfulContent = hasMeaningfulTipTapContent(snapshot);
    const searchText = extractSearchTextFromTipTap(snapshot);
    const wordCount = searchText.split(/\s+/).filter(Boolean).length;

    await prisma.$transaction(async (tx) => {
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

      await tx.notePayload.update({
        where: { contentId },
        data: {
          tiptapJson: snapshot,
          searchText,
          metadata: {
            wordCount,
            characterCount: searchText.length,
            readingTime: Math.ceil(wordCount / 200),
            collaborationEnabled: true,
            collaborationSnapshotAt: new Date().toISOString(),
          },
        },
      });

      // Non-canonical backup for embedded drawings — only writes to referenced
      // ContentNodes owned by this note. Safe no-op when the note has no embeds.
      await extractAndPersistEmbedBackups(tx, contentId, ydoc, snapshot);
    });
  } finally {
    ydoc.destroy();
  }
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
