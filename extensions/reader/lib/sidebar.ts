import { useRightPanelCollapseStore } from "@/state/right-panel-collapse-store";
import { useRightSidebarStateStore } from "@/state/right-sidebar-state-store";
import { useReaderSession, type ReaderSidebarView } from "../state/reader-store";

/** Book icon (lucide BookOpen) for the right-sidebar tab. */
export const READER_SIDEBAR_SVG_PATH =
  "M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z";

/**
 * Open the right sidebar on the reader's Book tab for this content, optionally
 * on a given half of it (highlights & notes, or about the book).
 */
export function revealReaderSidebar(contentId: string, view?: ReaderSidebarView): void {
  if (view) useReaderSession.getState().setSidebarView(contentId, view);
  useRightSidebarStateStore.getState().setActiveTab(contentId, "extension");
  useRightPanelCollapseStore.getState().setCollapsed(false);
}
