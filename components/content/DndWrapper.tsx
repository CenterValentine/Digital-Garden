"use client";

import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

/**
 * DND Context Provider Wrapper
 *
 * Provides react-dnd context for both:
 * 1. LeftSidebar's useDrop hook (file upload)
 * 2. react-arborist's internal drag-and-drop (tree reordering)
 *
 * Both features share the same HTML5Backend instance, preventing conflicts.
 */
export function DndWrapper({ children }: { children: React.ReactNode }) {
  return <DndProvider backend={HTML5Backend}>{children}</DndProvider>;
}
