import type { Metadata } from "next";

import { composeWorktreeLabel, getWorktreeIdentity } from "./identity";

type RootTitle = { default: string; template: string };

function isRootTitle(title: Metadata["title"]): title is RootTitle {
  return (
    typeof title === "object" &&
    title !== null &&
    "default" in title &&
    "template" in title
  );
}

/**
 * Dev-only: prefix the browser-tab title with the worktree/branch label so tabs
 * from different checkouts are distinguishable at a glance.
 *
 * The root metadata title is `{ default, template }`. Both slots must be
 * prefixed, not just `template`: `template` only wraps titles that *child*
 * routes supply, while `default` is what renders when a route supplies none
 * (the content IDE, for one). Prefixing both is what makes the tag appear on
 * every route — safe precisely because nothing in the app mutates
 * `document.title` at runtime to clobber it.
 *
 * Returns the title untouched outside development, or if the checkout can't be
 * identified, so production titles are byte-for-byte unchanged.
 */
export async function withDevWorktreeTitle(
  title: Metadata["title"],
): Promise<Metadata["title"]> {
  if (process.env.NODE_ENV !== "development") return title;
  if (!isRootTitle(title)) return title;

  const identity = await getWorktreeIdentity();
  if (!identity) return title;

  const tag = `[${composeWorktreeLabel(identity)}]`;
  return {
    default: `${tag} ${title.default}`,
    template: `${tag} ${title.template}`,
  };
}
