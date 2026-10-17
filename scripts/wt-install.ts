/**
 * `pnpm wt:install <name>` — install a worktree's dependencies to keep, without
 * cd-ing into it. Unlike the automatic install `pnpm dev -wt` makes, this one
 * stays after the server stops (and promotes a temporary install to a kept one).
 */

import { ensureReady, listWorktrees, printWorktrees, resolveWorktree } from "./lib/worktrees";

async function main(): Promise<void> {
  const name = process.argv.slice(2).find((a) => !a.startsWith("-"));
  const trees = listWorktrees();
  const target = name ? resolveWorktree(trees, name) : null;

  if (!target) {
    console.error(name ? `\n  No worktree named "${name}".` : "\n  Usage: pnpm wt:install <name>");
    await printWorktrees(trees, null);
    process.exit(1);
  }

  console.log("");
  ensureReady(target, trees[0], { temporary: false });
  console.log(`  ✓ "${target.name}" is installed and ready. Serve it with: pnpm dev -wt ${target.name}\n`);
}

void main();
