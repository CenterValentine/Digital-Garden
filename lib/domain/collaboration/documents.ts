import { TiptapTransformer } from "@hocuspocus/transformer";
import type { JSONContent } from "@tiptap/core";
import * as Y from "yjs";

import type { PrismaClient } from "@/lib/database/generated/prisma";
import { extractSearchTextFromTipTap } from "@/lib/domain/content/search-text";
import { getCollaborationServerExtensions } from "./extensions";
import { getCollaborationDocumentName } from "./tokens";

function hasMeaningfulContent(content: JSONContent | null | undefined): boolean {
  if (!content) return false;

  if (typeof content.text === "string" && content.text.trim().length > 0) {
    return true;
  }

  if (Array.isArray(content.content)) {
    return content.content.some(hasMeaningfulContent);
  }

  return false;
}

export async function loadCollaborationYDocState(
  prisma: PrismaClient,
  documentName: string
): Promise<Uint8Array | null> {
  const contentId = parseCollaborationDocumentName(documentName);
  const record = await prisma.collaborationDocument.findUnique({
    where: { documentName },
    select: { ydocState: true },
  });

  if (record?.ydocState) {
    return new Uint8Array(record.ydocState);
  }

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

  return update;
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
  const snapshotHasMeaningfulContent = hasMeaningfulContent(snapshot);
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
      hasMeaningfulContent(existingContent) &&
      !snapshotHasMeaningfulContent &&
      ydoc.getXmlFragment("default").length === 0
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
