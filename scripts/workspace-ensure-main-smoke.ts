/**
 * Smoke test: ensuring the Main workspace is a READ in the steady state.
 *
 * The workspace list calls ensureMainWorkspace on every request, and the
 * client polls that list every 15 s. If "ensure" writes when the row is
 * already right, `@updatedAt` advances on every poll, every surface sees a
 * revision nobody acked, and reconciles against it — the "panes bounce with
 * nothing touched" that took the placement tracer plus a DB watch to pin.
 *
 * DB-backed: needs DATABASE_URL (local Docker Postgres; the package script
 * passes `--env-file=.env.local`). Uses the first user's REAL Main workspace,
 * because `ownerId_slug` is unique and Main cannot be faked under a throwaway
 * owner. Safe by the property under test: a correct ensure does not write.
 * If the row is off-state, the first call repairs it (legitimate) and the
 * assertions run on the calls after.
 *
 * Imports ensure-main.ts directly — service.ts cannot load under plain tsx.
 *
 * Run: pnpm workspace:ensure-main:smoke
 */

import { prisma } from "../lib/database/client";
import { ensureMainWorkspaceRow } from "../extensions/workplaces/server/ensure-main";

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

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) throw new Error("No user in the database — sign in once first");
  const defaults = { layoutMode: "single", activePaneId: "top-left" };

  console.log("\nensureMainWorkspace is a read in the steady state");

  // Settle: if the row is missing or off-state this creates/repairs it once.
  const settled = await ensureMainWorkspaceRow(user.id, defaults);
  check("returns the Main workspace", settled.slug, "main");

  // From here on, nothing may write. Space the calls out so a bump would
  // show as a different timestamp even at millisecond resolution.
  const a = await ensureMainWorkspaceRow(user.id, defaults);
  await new Promise((r) => setTimeout(r, 25));
  const b = await ensureMainWorkspaceRow(user.id, defaults);
  await new Promise((r) => setTimeout(r, 25));
  const c = await ensureMainWorkspaceRow(user.id, defaults);

  check(
    "three ensures in a row leave updatedAt untouched",
    [b.updatedAt.toISOString(), c.updatedAt.toISOString()],
    [a.updatedAt.toISOString(), a.updatedAt.toISOString()],
  );

  const fromDb = await prisma.contentWorkspace.findUnique({
    where: { id: settled.id },
    select: { updatedAt: true },
  });
  check(
    "…and the row in the database agrees",
    fromDb?.updatedAt.toISOString(),
    a.updatedAt.toISOString(),
  );

  console.log(
    `\nworkspace-ensure-main smoke: ${failures === 0 ? "PASS" : `FAIL (${failures})`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
