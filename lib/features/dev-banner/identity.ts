/**
 * Resolves which checkout the running dev server belongs to, by reading git's
 * on-disk plumbing directly rather than shelling out to `git`.
 *
 * Reading files instead of spawning a process matters here: this runs inside
 * the root layout on every dev request, and a `child_process` spawn per render
 * would be both slow and a nuisance under Turbopack's module graph. The two
 * files involved (`.git` and `HEAD`) are a few dozen bytes each.
 *
 * Nothing here is cached across requests on purpose — switching branches in a
 * checkout must be reflected on the next page load without restarting `next dev`.
 * React's `cache()` only dedupes within a single render pass.
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

export type WorktreeIdentity = {
  /**
   * Directory name of the checkout — the linked-worktree name (e.g. `browser-reach`)
   * or the repository directory for the main checkout (e.g. `Digital-Garden`).
   */
  directory: string;
  /** Branch name, or `detached@<sha>` when HEAD is not on a branch. */
  branch: string;
  /** True when this checkout is a linked worktree rather than the main one. */
  isLinkedWorktree: boolean;
};

/**
 * The main checkout has `.git` as a directory. A linked worktree has `.git` as a
 * FILE containing `gitdir: /abs/path/to/main/.git/worktrees/<name>` — and that
 * per-worktree directory is where its own HEAD lives. Reading the main repo's
 * `.git/HEAD` from a worktree would report the wrong branch entirely.
 */
async function resolveGitDir(
  root: string,
): Promise<{ gitDir: string; isLinkedWorktree: boolean } | null> {
  const dotGit = path.join(root, ".git");

  let entry;
  try {
    entry = await stat(dotGit);
  } catch {
    return null; // not a git checkout — degrade to no banner
  }

  if (entry.isDirectory()) {
    return { gitDir: dotGit, isLinkedWorktree: false };
  }

  const pointer = (await readFile(dotGit, "utf8")).trim();
  const match = /^gitdir:\s*(.+)$/.exec(pointer);
  if (!match) return null;

  return { gitDir: path.resolve(root, match[1]), isLinkedWorktree: true };
}

async function readBranch(gitDir: string): Promise<string | null> {
  let head: string;
  try {
    head = (await readFile(path.join(gitDir, "HEAD"), "utf8")).trim();
  } catch {
    return null;
  }

  const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(head);
  if (ref) return ref[1];

  // Detached HEAD stores the raw commit sha instead of a symbolic ref.
  return /^[0-9a-f]{40}$/.test(head) ? `detached@${head.slice(0, 7)}` : null;
}

export const getWorktreeIdentity = cache(
  async (): Promise<WorktreeIdentity | null> => {
    const root = process.cwd();
    const git = await resolveGitDir(root);
    if (!git) return null;

    const branch = await readBranch(git.gitDir);
    if (!branch) return null;

    return {
      directory: path.basename(root),
      branch,
      isLinkedWorktree: git.isLinkedWorktree,
    };
  },
);

/**
 * Builds the single line of text the banner shows.
 *
 * Git guarantees one branch per worktree, so the branch alone is already a
 * unique identifier — the directory is added only when it carries information
 * the branch name doesn't. Hence:
 *   - main checkout                                    → `feat/tone-system`
 *   - worktree `folder-studio` on `worktree-folder-studio` → `worktree-folder-studio`
 *   - worktree `browser-reach` on `chore/pin-hocuspocus`   → `browser-reach · chore/pin-hocuspocus`
 */
export function composeWorktreeLabel(identity: WorktreeIdentity): string {
  if (!identity.isLinkedWorktree) return identity.branch;
  if (identity.branch.includes(identity.directory)) return identity.branch;
  return `${identity.directory} · ${identity.branch}`;
}
