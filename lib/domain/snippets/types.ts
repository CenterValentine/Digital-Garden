/**
 * Snippet domain types
 *
 * Epoch 11 Sprint 45: Content Templates + Snippets
 */

export interface SnippetWithCategory {
  id: string;
  title: string | null;
  displayTitle: string;
  content: string;
  tiptapJson: unknown | null;
  categoryId: string;
  categoryName: string;
  usageCount: number;
  lastUsedAt: string | null;
  isAiContext: boolean;
  isVisibleInUI: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSnippetInput {
  title?: string;
  content: string;
  tiptapJson?: unknown;
  categoryId: string;
  isAiContext?: boolean;
  isVisibleInUI?: boolean;
  searchText?: string;
}

/** Compute display title: explicit title or first line of content (max 60 chars) */
export function getSnippetDisplayTitle(
  title: string | null | undefined,
  content: string
): string {
  if (title && title.trim()) return title.trim();
  const firstLine = content.split("\n")[0].trim();
  return firstLine.length > 60 ? firstLine.slice(0, 57) + "..." : firstLine;
}
