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
 *   excalidraw  → Y.Array("elements") + Y.Map("appState")
 *   mermaid     → Y.Text("source")
 *   diagrams-net → Y.Text("xml")
 */
function bootstrapVisualizationYDoc(ydoc: Y.Doc, engine: string, data: Record<string, unknown>) {
  if (engine === "excalidraw") {
    const elements = ydoc.getArray<unknown>("elements");
    const rawElements = Array.isArray(data.elements) ? data.elements : [];
    if (rawElements.length > 0) {
      elements.insert(0, rawElements);
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
    const xml = ydoc.getText("xml");
    const text = typeof data.xml === "string" ? data.xml : "";
    if (text) xml.insert(0, text);
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
    const elementsArray = ydoc.getArray<unknown>("elements");
    const appStateMap = ydoc.getMap<unknown>("appState");
    return {
      elements: elementsArray.toArray(),
      appState: Object.fromEntries(appStateMap.entries()),
    };
  } else if (engine === "mermaid") {
    return { source: ydoc.getText("source").toString() };
  } else if (engine === "diagrams-net") {
    return { xml: ydoc.getText("xml").toString() };
  }
  return {};
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

    // Return existing ydoc state if present — Hocuspocus is authoritative after first connect
    if (record?.ydocState) {
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

  const record = await prisma.collaborationDocument.findUnique({
    where: { documentName },
    select: { ydocState: true },
  });

  if (record?.ydocState) {
    const state = new Uint8Array(record.ydocState);
    const noteContent = content.notePayload.tiptapJson as JSONContent;
    if (
      ydocUpdateHasMeaningfulDefaultContent(state) ||
      !hasMeaningfulTipTapContent(noteContent)
    ) {
      return state;
    }
  }

  const ydoc = TiptapTransformer.toYdoc(
    content.notePayload.tiptapJson as JSONContent,
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
      snapshotJson: content.notePayload.tiptapJson as JSONContent,
    },
    create: {
      contentId,
      ownerId: content.ownerId,
      documentName,
      ydocState: Buffer.from(update),
      snapshotJson: content.notePayload.tiptapJson as JSONContent,
    },
  });

  ydoc.destroy();
  return update;
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
  Y.applyUpdate(ydoc, state);
  const snapshot = TiptapTransformer.fromYdoc(ydoc, "default") as JSONContent;
  const snapshotHasMeaningfulContent = hasMeaningfulTipTapContent(snapshot);
  const searchText = extractSearchTextFromTipTap(snapshot);
  const wordCount = searchText.split(/\s+/).filter(Boolean).length;
  ydoc.destroy();

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
