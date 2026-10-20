/**
 * The link menu's `[[Note#` step: a note's comment threads as link anchors
 * (`comment:<threadId>`), so a thread can be linked from any note and a
 * notification can deep-link to it. Core content, composed IN FRONT of the
 * extensions' listers (MainPanelContent), like the database-column lister.
 * Answers null for anything that is not a note.
 */

import { commentsApi } from "@/lib/domain/comments/client";
import type { CommentThreadDto } from "@/lib/domain/comments/types";
import { clipAnchorLabel, type LinkAnchorItem, type LinkAnchorLister } from "./link-anchor";

export const COMMENT_ANCHOR_KIND = "comment";

export function formatCommentAnchor(threadId: string): string {
  return `${COMMENT_ANCHOR_KIND}:${threadId.toLowerCase()}`;
}

const CACHE_TTL_MS = 15_000;
const cache = new Map<string, { at: number; threads: Promise<CommentThreadDto[]> }>();

function loadThreads(contentId: string): Promise<CommentThreadDto[]> {
  const hit = cache.get(contentId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.threads;
  const threads = commentsApi.list(contentId).catch((error: unknown) => {
    cache.delete(contentId);
    throw error;
  });
  cache.set(contentId, { at: Date.now(), threads });
  return threads;
}

function firstLive(thread: CommentThreadDto) {
  return thread.comments.find((c) => !c.deletedAt) ?? thread.comments[0] ?? null;
}

export const listCommentAnchors: LinkAnchorLister = async (target, query) => {
  if (target.contentType !== "note") return null;
  const threads = await loadThreads(target.id);
  const needle = query.trim().toLowerCase();
  return threads
    .filter((thread) => {
      if (!needle) return true;
      const first = firstLive(thread);
      return (
        (thread.anchor?.quote ?? "").toLowerCase().includes(needle) ||
        (first?.body ?? "").toLowerCase().includes(needle) ||
        (first?.author.username ?? "").toLowerCase().includes(needle)
      );
    })
    .map((thread): LinkAnchorItem => {
      const first = firstLive(thread);
      const label = thread.anchor?.quote ? clipAnchorLabel(thread.anchor.quote) : clipAnchorLabel(first?.body ?? "comment");
      const detail = `${first?.author.username ?? "?"}: ${clipAnchorLabel(first?.body ?? "", 60)}${thread.resolvedAt ? " · resolved" : ""}`;
      return { anchor: formatCommentAnchor(thread.id), label, detail };
    });
};
