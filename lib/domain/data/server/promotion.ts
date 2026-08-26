/**
 * Row promotion (plan Phase 5, D2): a DataRow earns a real ContentNode.
 *
 * Lazy by design — a ContentNode here is expensive (tags, links,
 * publishing, trash, history, grants), so only rows someone deliberately
 * elevates ever pay for one. The promoted node:
 *
 *  - contentType "note": a NotePayload body for free
 *  - parentId + ownedByNoteId = the table node (the ContentOwnedByNote
 *    ownership edge the rest of the app already honours)
 *  - `role` set by the TRIGGER, never a constant (plan Phase 5): `primary`
 *    for deliberate promotion (opened as a page) — visible in the file
 *    tree under the database; `referenced` for incidental (a wiki-link or
 *    mention landing on the row) — hidden until the existing toggle
 *  - title from the primary column, and the title-sync in writeCells keeps
 *    it current from then on
 *
 * Deletion already cascades correctly: softDeleteRows keys off DataRow
 * (never ownedByNoteId), so a row page filed elsewhere in the tree still
 * dies — and restores — with its row.
 *
 * Idempotent: promoting a promoted row returns the existing node.
 *
 * SERVER-ONLY (Prisma).
 */

import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { generateUniqueSlug } from "@/lib/domain/content/slug";
import { deriveRowTitle, type DataColumn } from "@/lib/domain/data";

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

export type PromotionRole = "primary" | "referenced";

export interface PromotionResult {
  contentId: string;
  /** False when the row was already promoted — the node is the existing one. */
  created: boolean;
}

export async function promoteRow(
  tableId: string,
  rowId: string,
  columns: DataColumn[],
  role: PromotionRole
): Promise<PromotionResult | { error: string }> {
  const row = await prisma.dataRow.findFirst({
    where: { id: rowId, tableId, deletedAt: null },
    select: { id: true, contentId: true, data: true, sortKey: true },
  });
  if (!row) return { error: "Row not found" };

  if (row.contentId) {
    // Already a page — possibly in the trash: deleting the PAGE leaves the
    // row alive (the row is data; the node is merely its note form), so
    // re-opening REVIVES the same node with its body and tags intact,
    // rather than failing on a dead pointer or minting a duplicate
    // (owner report, 2026-08-26). One upgrade is legal alongside: an
    // incidentally-promoted (referenced) row opened DELIBERATELY becomes
    // primary — it graduates into the tree. Never the reverse.
    const node = await prisma.contentNode.findUnique({
      where: { id: row.contentId },
      select: { role: true, deletedAt: true },
    });
    if (node) {
      const patch: { deletedAt?: null; deletedBy?: null; role?: "primary" } = {};
      if (node.deletedAt) {
        patch.deletedAt = null;
        patch.deletedBy = null;
      }
      if (role === "primary" && node.role === "referenced") {
        patch.role = "primary";
      }
      if (Object.keys(patch).length > 0) {
        await prisma.contentNode.update({
          where: { id: row.contentId },
          data: patch,
        });
      }
    }
    return { contentId: row.contentId, created: false };
  }

  const table = await prisma.contentNode.findFirst({
    where: { id: tableId, contentType: "data", deletedAt: null },
    select: { id: true, ownerId: true },
  });
  if (!table) return { error: "Database not found" };

  const title = deriveRowTitle(
    columns,
    (row.data ?? {}) as Record<string, never>
  ).slice(0, 255);
  const slug = await generateUniqueSlug(title, table.ownerId);

  const contentId = await prisma.$transaction(async (tx) => {
    // Tree position, stamped ONCE from the default view's order (plan O11):
    // the row's ordinal among live rows by sortKey. After this the two
    // orders are independent — reordering the table never reorders the
    // tree, and sortKey is per-view fractional text the tree could not
    // track anyway.
    const displayOrder = await tx.dataRow.count({
      where: { tableId, deletedAt: null, sortKey: { lt: row.sortKey } },
    });
    const node = await tx.contentNode.create({
      data: {
        ownerId: table.ownerId,
        title,
        slug,
        contentType: "note",
        role,
        parentId: tableId,
        ownedByNoteId: tableId,
        displayOrder,
        notePayload: {
          create: {
            tiptapJson: EMPTY_DOC as unknown as Prisma.InputJsonValue,
            searchText: "",
          },
        },
      },
      select: { id: true },
    });
    await tx.dataRow.update({
      where: { id: rowId },
      data: { contentId: node.id },
    });
    return node.id;
  });

  return { contentId, created: true };
}
