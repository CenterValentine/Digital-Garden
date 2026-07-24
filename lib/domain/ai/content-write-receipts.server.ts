import "server-only";

import { prisma } from "@/lib/database/client";
import { CONTENT_WRITE_RECEIPTS_KEY } from "./content-write-receipts";
import type {
  ContentWriteOperation,
  ContentWriteReceipt,
} from "./content-write-receipts";

/**
 * Resolve a receipt from the row after the write settles. Looking up the
 * persisted row (rather than trusting requested ids) makes the affordance
 * report the effective tree location, including referenced-under ownership.
 */
export async function getContentWriteReceipt(
  userId: string,
  contentId: string,
  operation: ContentWriteOperation,
  noun?: string,
): Promise<ContentWriteReceipt | null> {
  const node = await prisma.contentNode.findFirst({
    where: { id: contentId, ownerId: userId, deletedAt: null },
    select: {
      id: true,
      title: true,
      contentType: true,
      parent: { select: { id: true, title: true } },
      ownedByNote: { select: { id: true, title: true } },
    },
  });
  if (!node) return null;

  const location = node.ownedByNote
    ? {
        kind: "reference" as const,
        contentId: node.ownedByNote.id,
        title: node.ownedByNote.title,
      }
    : node.parent
      ? {
          kind: "folder" as const,
          contentId: node.parent.id,
          title: node.parent.title,
        }
      : {
          kind: "root" as const,
          title: "Garden root",
        };

  return {
    operation,
    contentId: node.id,
    title: node.title,
    contentType: node.contentType,
    noun: noun ?? node.contentType,
    location,
  };
}

/** Convenience envelope that can be spread into any structured tool result. */
export async function getContentWriteReceiptEnvelope(
  userId: string,
  contentId: string,
  operation: ContentWriteOperation,
  noun?: string,
): Promise<{ [CONTENT_WRITE_RECEIPTS_KEY]: ContentWriteReceipt[] }> {
  const receipt = await getContentWriteReceipt(
    userId,
    contentId,
    operation,
    noun,
  );
  return { [CONTENT_WRITE_RECEIPTS_KEY]: receipt ? [receipt] : [] };
}
