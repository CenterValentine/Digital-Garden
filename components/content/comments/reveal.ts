import { revealRightSidebarTab } from "@/lib/features/content/reveal-right-sidebar";
import { useCommentsStore } from "@/state/comments-store";

/** Open the Comments tab on this note with a thread selected (the tab scrolls to it). */
export function revealCommentThread(contentId: string, threadId?: string | null): void {
  revealRightSidebarTab(contentId, "comments");
  if (threadId) useCommentsStore.getState().setActiveThread(threadId);
}
