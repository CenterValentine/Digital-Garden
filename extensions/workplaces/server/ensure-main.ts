// Ensure the owner's Main workspace row exists — WITHOUT writing when it does.
//
// This used to be a Prisma `upsert` on every workspace list. An upsert issues
// an UPDATE whenever the row exists, and Prisma stamps `@updatedAt` on every
// update it issues even when nothing changed. The workspace poll lists every
// 15 s, so the Main row's updatedAt advanced every 15 s, every poller saw a
// revision nobody had acked, and reconciled against it — forever, while the
// tab was visible. Two days of "the panes bounce with nothing touched".
//
// Read first; create only if missing; repair only if actually off-state. In
// the steady state a list is a read, which is what a read should be.
//
// Prisma-only on purpose: `service.ts` reaches the TipTap server extensions
// through the content barrel and cannot load under plain tsx, so the smoke
// that pins this (`workspace:ensure-main:smoke`) imports this module directly.

import { prisma } from "@/lib/database/client";

export const MAIN_WORKSPACE_NAME = "Main Workspace";
export const MAIN_WORKSPACE_SLUG = "main";

/** The state Main must be in. Anything else is repaired (and that write is legitimate). */
const REQUIRED = {
  isMain: true,
  isLocked: false,
  status: "active" as const,
  expiresAt: null,
  archivedAt: null,
};

export async function ensureMainWorkspaceRow(
  ownerId: string,
  defaults: { layoutMode: string; activePaneId: string }
) {
  const where = { ownerId_slug: { ownerId, slug: MAIN_WORKSPACE_SLUG } };
  const existing = await prisma.contentWorkspace.findUnique({ where });

  if (!existing) {
    return prisma.contentWorkspace.create({
      data: {
        ownerId,
        name: MAIN_WORKSPACE_NAME,
        slug: MAIN_WORKSPACE_SLUG,
        ...REQUIRED,
        layoutMode: defaults.layoutMode,
        activePaneId: defaults.activePaneId,
        paneState: {},
        settings: {},
      },
    });
  }

  const offState =
    existing.isMain !== REQUIRED.isMain ||
    existing.isLocked !== REQUIRED.isLocked ||
    existing.status !== REQUIRED.status ||
    existing.expiresAt !== REQUIRED.expiresAt ||
    existing.archivedAt !== REQUIRED.archivedAt;

  // The common case: the row is already right. Return it untouched so a read
  // stays a read and `updatedAt` stays what the last real write made it.
  if (!offState) return existing;

  return prisma.contentWorkspace.update({ where, data: REQUIRED });
}
