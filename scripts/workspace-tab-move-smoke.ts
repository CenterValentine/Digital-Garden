/**
 * Smoke test for moving an open tab between workplaces (R1 membership move).
 *
 * The move is one transaction with an asymmetric timestamp rule — the target's
 * `updatedAt` bumps so other surfaces reconcile, the source's must NOT, or the
 * mover's own next save 409s — and that asymmetry is invisible in the UI until
 * it breaks. This pins it.
 *
 * DB-backed: needs DATABASE_URL (local Docker Postgres; the package script
 * passes `--env-file=.env.local`). Creates two throwaway workplaces and one
 * folder node for the first user it finds, and deletes all of it on the way
 * out — pass or fail.
 *
 * Deliberately touches only `membership.ts`, never `service.ts`: the service
 * reaches the TipTap server extensions through the content barrel, and
 * `@tiptap/extension-code-block-lowlight`'s CJS build does not load under
 * plain Node/tsx (default-export interop against the nested code-block
 * package). The read path that names a moved tab (`getWorkspace` → tabs
 * include → contentMeta) is covered by typecheck and the PR's browser smoke.
 *
 * Run: pnpm workspace:tab-move:smoke
 */

import { prisma } from "../lib/database/client";
import {
  openWorkspaceTab,
  moveWorkspaceTab,
  listWorkspaceTabs,
} from "../extensions/workplaces/server/membership";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `  ${ok ? "✓" : "✖"} ${label}${
      ok ? "" : `\n      got:  ${JSON.stringify(actual)}\n      want: ${JSON.stringify(expected)}`
    }`,
  );
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) throw new Error("No user in the database — sign in once first");
  const ownerId = user.id;
  const stamp = Date.now();

  const content = await prisma.contentNode.create({
    data: {
      ownerId,
      title: `Tab-move smoke ${stamp}`,
      slug: `tab-move-smoke-${stamp}`,
      contentType: "folder",
    },
    select: { id: true, title: true },
  });
  const makeWorkspace = (name: string) =>
    prisma.contentWorkspace.create({
      data: {
        ownerId,
        name,
        slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        isMain: false,
        paneState: {},
        settings: {},
      },
      select: { id: true },
    });
  const source = await makeWorkspace(`Tab-move source ${stamp}`);
  const target = await makeWorkspace(`Tab-move target ${stamp}`);

  const stamps = async () => {
    const rows = await prisma.contentWorkspace.findMany({
      where: { id: { in: [source.id, target.id] } },
      select: { id: true, updatedAt: true },
    });
    return {
      source: rows.find((row) => row.id === source.id)!.updatedAt,
      target: rows.find((row) => row.id === target.id)!.updatedAt,
    };
  };

  try {
    console.log("\nmoveWorkspaceTab");
    await openWorkspaceTab(ownerId, source.id, content.id, { h: "left", v: "top" });
    const before = await stamps();
    // A bump inside the same millisecond would be invisible.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const moved = await moveWorkspaceTab(
      ownerId,
      target.id,
      content.id,
      source.id,
      { h: "right", v: "bottom" },
    );
    check(
      "returns the target's row with the new placement hint",
      moved
        ? {
            workspaceId: moved.workspaceId,
            contentId: moved.contentId,
            affinityH: moved.affinityH,
            affinityV: moved.affinityV,
          }
        : null,
      {
        workspaceId: target.id,
        contentId: content.id,
        affinityH: "right",
        affinityV: "bottom",
      },
    );
    check(
      "source membership no longer holds the tab",
      (await listWorkspaceTabs(ownerId, source.id))?.map((t) => t.contentId),
      [],
    );
    check(
      "target membership holds the tab",
      (await listWorkspaceTabs(ownerId, target.id))?.map((t) => t.contentId),
      [content.id],
    );

    const after = await stamps();
    check(
      "target updatedAt bumped (other surfaces reconcile on it)",
      after.target.getTime() > before.target.getTime(),
      true,
    );
    check(
      "source updatedAt untouched (the mover's own next save must not 409)",
      after.source.getTime() === before.source.getTime(),
      true,
    );

    console.log("\nrejections");
    check(
      "same workspace on both sides",
      await moveWorkspaceTab(ownerId, target.id, content.id, target.id),
      null,
    );
    check(
      "unknown source workspace",
      await moveWorkspaceTab(ownerId, target.id, content.id, NIL_UUID),
      null,
    );
    check(
      "unknown content",
      await moveWorkspaceTab(ownerId, target.id, NIL_UUID, source.id),
      null,
    );
    check(
      "archived target is not a destination",
      await (async () => {
        await prisma.contentWorkspace.update({
          where: { id: source.id },
          data: { status: "archived" },
        });
        const result = await moveWorkspaceTab(
          ownerId,
          source.id,
          content.id,
          target.id,
        );
        await prisma.contentWorkspace.update({
          where: { id: source.id },
          data: { status: "active" },
        });
        return result;
      })(),
      null,
    );
    check(
      "repeat move from an emptied source is an idempotent upsert, not an error",
      (await moveWorkspaceTab(ownerId, target.id, content.id, source.id))
        ?.contentId,
      content.id,
    );
  } finally {
    await prisma.contentWorkspace.deleteMany({
      where: { id: { in: [source.id, target.id] } },
    });
    await prisma.contentNode.deleteMany({ where: { id: content.id } });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log(
      failures === 0
        ? "\nworkspace-tab-move smoke: PASS"
        : `\nworkspace-tab-move smoke: FAIL (${failures})`,
    );
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (error) => {
    await prisma.$disconnect();
    console.error(error);
    process.exit(1);
  });
