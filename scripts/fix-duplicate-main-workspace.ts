/**
 * Normalize duplicate "main" workspaces (Epoch fix: duplicate isMain).
 *
 * ContentWorkspace has `@@index([ownerId, isMain])` but NO unique constraint
 * enforcing a single main, so an owner can end up with more than one
 * `isMain = true` active workspace. When that happens the extension content
 * tree (and any "default to main" logic) can land on the wrong workspace.
 *
 * The canonical main is unambiguous: the workspace whose slug is
 * MAIN_WORKSPACE_SLUG ("main"), created/owned by ensureMainWorkspace(). This
 * script makes that the SOLE main per owner:
 *
 *   1. Per owner, gather active `isMain = true` workspaces.
 *   2. Pick the keeper: the canonical slug="main" workspace if present,
 *      otherwise the OLDEST isMain (the original).
 *   3. Demote every other isMain workspace to `isMain = false`.
 *   4. Ensure the keeper is `isMain = true`.
 *
 * SAFETY
 *   - Dry-run by DEFAULT. Pass `--apply` to write.
 *   - Only flips the `isMain` boolean — fully reversible, NEVER deletes a
 *     workspace or its items.
 *   - Idempotent: re-running after a clean run is a no-op.
 *   - Per-owner transaction so one owner's fix can't half-apply.
 *
 * It also REPORTS (never touches) workspaces merely NAMED "Main Workspace"
 * with a non-canonical slug — those are duplicates to rename/merge by hand, a
 * decision too destructive to automate.
 *
 * Usage:
 *   tsx scripts/fix-duplicate-main-workspace.ts                 # dry-run, all owners
 *   tsx scripts/fix-duplicate-main-workspace.ts --apply         # write, all owners
 *   tsx scripts/fix-duplicate-main-workspace.ts --owner=you@x.com          # dry-run, one owner
 *   tsx scripts/fix-duplicate-main-workspace.ts --owner=you@x.com --apply  # write, one owner
 */

import "./_load-env.js";
import { prisma } from "../lib/database/client.js";

// Mirrors extensions/workplaces/server/service.ts (single source of truth).
const MAIN_WORKSPACE_SLUG = "main";
const MAIN_WORKSPACE_NAME = "Main Workspace";

const APPLY = process.argv.includes("--apply");
const ownerArg = process.argv
  .find((a) => a.startsWith("--owner="))
  ?.split("=")[1]
  ?.trim();

type WorkspaceRow = {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  isMain: boolean;
  viewRootContentId: string | null;
  createdAt: Date;
};

async function resolveOwnerId(email: string): Promise<string> {
  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true },
  });
  if (!user) throw new Error(`No user found for email "${email}"`);
  return user.id;
}

function groupByOwner(rows: WorkspaceRow[]): Map<string, WorkspaceRow[]> {
  const map = new Map<string, WorkspaceRow[]>();
  for (const row of rows) {
    const list = map.get(row.ownerId) ?? [];
    list.push(row);
    map.set(row.ownerId, list);
  }
  return map;
}

async function main(): Promise<void> {
  const scopedOwnerId = ownerArg ? await resolveOwnerId(ownerArg) : null;

  console.log(
    `\n=== fix-duplicate-main-workspace (${APPLY ? "APPLY" : "DRY-RUN"}${
      scopedOwnerId ? `, owner=${ownerArg}` : ", all owners"
    }) ===\n`,
  );

  // All active mains, oldest first (so [0] is the original when no canonical).
  const mains = (await prisma.contentWorkspace.findMany({
    where: {
      status: "active",
      isMain: true,
      ...(scopedOwnerId ? { ownerId: scopedOwnerId } : {}),
    },
    select: {
      id: true,
      ownerId: true,
      name: true,
      slug: true,
      isMain: true,
      viewRootContentId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  })) as WorkspaceRow[];

  const byOwner = groupByOwner(mains);

  let ownersFixed = 0;
  let demoted = 0;

  for (const [ownerId, ownerMains] of byOwner) {
    if (ownerMains.length <= 1) continue; // already a single main

    const keeper =
      ownerMains.find((w) => w.slug === MAIN_WORKSPACE_SLUG) ?? ownerMains[0];
    const toDemote = ownerMains.filter((w) => w.id !== keeper.id);

    ownersFixed += 1;
    console.log(`owner ${ownerId}: ${ownerMains.length} mains`);
    console.log(
      `  KEEP   ${keeper.id}  "${keeper.name}" (slug=${keeper.slug}${
        keeper.slug === MAIN_WORKSPACE_SLUG ? ", canonical" : ", oldest"
      })`,
    );
    for (const w of toDemote) {
      console.log(
        `  DEMOTE ${w.id}  "${w.name}" (slug=${w.slug}, created ${w.createdAt.toISOString()})`,
      );
    }

    if (APPLY) {
      await prisma.$transaction([
        prisma.contentWorkspace.updateMany({
          where: { id: { in: toDemote.map((w) => w.id) } },
          data: { isMain: false },
        }),
        prisma.contentWorkspace.update({
          where: { id: keeper.id },
          data: { isMain: true },
        }),
      ]);
    }
    demoted += toDemote.length;
  }

  // Informational: workspaces named "Main Workspace" that AREN'T the canonical
  // slug — same-named duplicates the user may want to rename/merge by hand.
  const namedDupes = await prisma.contentWorkspace.findMany({
    where: {
      status: "active",
      name: MAIN_WORKSPACE_NAME,
      slug: { not: MAIN_WORKSPACE_SLUG },
      ...(scopedOwnerId ? { ownerId: scopedOwnerId } : {}),
    },
    select: { id: true, ownerId: true, slug: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(
    `\n--- summary ---\n` +
      `owners with duplicate mains: ${ownersFixed}\n` +
      `workspaces demoted: ${demoted}${APPLY ? "" : " (dry-run — not written)"}\n` +
      `same-named "Main Workspace" (non-canonical slug, NOT touched): ${namedDupes.length}`,
  );
  if (namedDupes.length > 0) {
    console.log(
      `  ↳ review these manually (rename or merge — they may hold content):`,
    );
    for (const w of namedDupes) {
      console.log(`    ${w.id}  owner=${w.ownerId}  slug=${w.slug}`);
    }
  }

  if (!APPLY && (demoted > 0 || namedDupes.length > 0)) {
    console.log(`\nRe-run with --apply to write the isMain changes.`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
