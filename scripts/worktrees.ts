/**
 * `pnpm wt` (alias `pnpm worktrees`) — every checkout of this repo in plain
 * terms: name (what `pnpm dev -wt <name>` takes), branch, last activity, and
 * whether it is serving, ready, or needs setup first. Newest first.
 *
 *   pnpm wt          worktrees active in the last 7 days
 *   pnpm wt 30       ... in the last 30 days
 *   pnpm wt all      every worktree
 *
 * To pick one by clicking, use `pnpm dev -wt` (no name).
 */

import { DEFAULT_RECENT_DAYS, printWorktrees } from "./lib/worktrees";

const arg = process.argv.slice(2).find((a) => a !== "--");
let days: number | null = DEFAULT_RECENT_DAYS;
if (arg === "all" || arg === "0") {
  days = null;
} else if (arg !== undefined) {
  days = Number(arg.replace(/d$/i, ""));
  if (!Number.isFinite(days) || days <= 0) {
    console.error(`\n  Usage: pnpm wt [days | all]   (got "${arg}")\n`);
    process.exit(1);
  }
}

void printWorktrees(undefined, days);
