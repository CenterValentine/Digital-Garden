import { revealRightSidebarTab } from "@/lib/features/content/reveal-right-sidebar";
import { useCommentsStore } from "@/state/comments-store";

/**
 * Open the Comments tab on this note with a thread selected (the tab scrolls
 * to it). `reply` also opens that thread's row and focuses its reply box.
 */
export function revealCommentThread(contentId: string, threadId?: string | null, options?: { reply?: boolean }): void {
  revealRightSidebarTab(contentId, "comments");
  if (!threadId) return;
  const store = useCommentsStore.getState();
  store.setActiveThread(threadId);
  if (options?.reply) store.requestComposerFocus(threadId);
}
