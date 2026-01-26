/**
 * Search Filter System
 *
 * Modular search filtering for content search.
 * Easily extensible for future filter types (tags, date ranges, content types, etc.)
 *
 * M6: Search & Knowledge Features
 *
 * TODO: When additional document types are added to the system (beyond note, file, html, code),
 * update parseSearchResults() to extract searchText from those new payload types.
 * The API already supports searching across all content types via the searchText field.
 */

import type { ContentType } from "@/lib/domain/content/types";

/**
 * Search filter configuration
 * Add new filter types here as needed
 */
export interface SearchFilter {
  /** Search query text */
  query: string;

  /** Filter by content type */
  type?: ContentType | "all";

  /** Case-sensitive search */
  caseSensitive?: boolean;

  /** Use regex for search */
  useRegex?: boolean;

  /** Show more context in excerpts */
  showMoreContext?: boolean;

  /** Auto-scroll to match when opening content */
  autoScrollToMatch?: boolean;

  /** Filter by tags (future) */
  tags?: string[];

  /** Filter by date range (future) */
  dateRange?: {
    start: Date;
    end: Date;
  };

  /** Filter by author (future) */
  authorId?: string;

  /** Filter by folder (future) */
  folderId?: string;

  /** Include deleted items (future) */
  includeDeleted?: boolean;
}

/**
 * Search result item
 */
export interface SearchResult {
  id: string;
  title: string;
  type: ContentType;
  excerpt?: string; // Snippet with highlighted matches
  path?: string; // Breadcrumb path (e.g., "Folder > Subfolder > Note")
  updatedAt: Date;
  matchCount?: number; // Number of matches found
}

/**
 * Build API query parameters from search filter
 *
 * Modular design: easy to add new filter types by extending this function
 */
export function buildSearchQuery(filter: SearchFilter): URLSearchParams {
  const params = new URLSearchParams();

  // Always add query if provided
  if (filter.query.trim()) {
    params.append("search", filter.query.trim());
  }

  // Content type filter (future)
  if (filter.type && filter.type !== "all") {
    params.append("type", filter.type);
  }

  // Tags filter (future)
  if (filter.tags && filter.tags.length > 0) {
    params.append("tags", filter.tags.join(","));
  }

  // Date range filter (future)
  if (filter.dateRange) {
    params.append("dateFrom", filter.dateRange.start.toISOString());
    params.append("dateTo", filter.dateRange.end.toISOString());
  }

  // Author filter (future)
  if (filter.authorId) {
    params.append("authorId", filter.authorId);
  }

  // Folder filter (future)
  if (filter.folderId) {
    params.append("folderId", filter.folderId);
  }

  // Include deleted (future)
  if (filter.includeDeleted) {
    params.append("includeDeleted", "true");
  }

  return params;
}

/**
 * Highlight search matches in text
 *
 * @param text - Original text
 * @param query - Search query
 * @param caseSensitive - Use case-sensitive matching
 * @param useRegex - Treat query as regex pattern
 * @returns Text with <mark> tags around matches
 */
export function highlightMatches(
  text: string,
  query: string,
  caseSensitive: boolean = false,
  useRegex: boolean = false
): string {
  if (!query.trim()) return text;

  try {
    let pattern: string;
    if (useRegex) {
      // Use query as-is if regex mode
      pattern = query;
    } else {
      // Escape special regex characters for literal search
      pattern = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    const flags = caseSensitive ? "g" : "gi";
    const regex = new RegExp(`(${pattern})`, flags);

    return text.replace(regex, "<mark>$1</mark>");
  } catch (e) {
    // Invalid regex - return text unchanged
    return text;
  }
}

/**
 * Extract excerpt from content with search match context
 *
 * @param content - Full content text
 * @param query - Search query
 * @param showMoreContext - Show more context around matches
 * @param caseSensitive - Use case-sensitive matching
 * @returns Excerpt centered around first match
 */
export function extractExcerpt(
  content: string,
  query: string,
  showMoreContext: boolean = false,
  caseSensitive: boolean = false
): string {
  const maxLength = showMoreContext ? 300 : 150;

  if (!query.trim()) {
    // No query - return start of content
    return content.slice(0, maxLength) + (content.length > maxLength ? "..." : "");
  }

  // Find first match
  const searchContent = caseSensitive ? content : content.toLowerCase();
  const searchQuery = caseSensitive ? query : query.toLowerCase();
  const matchIndex = searchContent.indexOf(searchQuery);

  if (matchIndex === -1) {
    // No match found - return start
    return content.slice(0, maxLength) + (content.length > maxLength ? "..." : "");
  }

  // Calculate excerpt start/end to center the match
  const halfMax = Math.floor(maxLength / 2);
  const start = Math.max(0, matchIndex - halfMax);
  const end = Math.min(content.length, matchIndex + query.length + halfMax);

  let excerpt = content.slice(start, end);

  // Add ellipsis if truncated
  if (start > 0) excerpt = "..." + excerpt;
  if (end < content.length) excerpt = excerpt + "...";

  return excerpt;
}

/**
 * Parse search results from API response
 *
 * Converts API content items to SearchResult format
 */
export function parseSearchResults(
  items: any[],
  query: string,
  caseSensitive: boolean = false,
  useRegex: boolean = false,
  showMoreContext: boolean = false
): SearchResult[] {
  return items.map((item) => {
    // Extract searchText from payload based on content type
    let searchText = "";
    if (item.note?.searchText) {
      searchText = item.note.searchText;
    } else if (item.html?.searchText) {
      searchText = item.html.searchText;
    } else if (item.code?.searchText) {
      searchText = item.code.searchText;
    } else {
      // Fallback to title if no searchText available
      searchText = item.title;
    }

    // Extract excerpt and apply highlighting
    const excerpt = searchText
      ? extractExcerpt(searchText, query, showMoreContext, caseSensitive)
      : undefined;
    const highlightedExcerpt = excerpt
      ? highlightMatches(excerpt, query, caseSensitive, useRegex)
      : undefined;

    return {
      id: item.id,
      title: item.title || "Untitled",
      type: item.contentType,
      excerpt: highlightedExcerpt,
      path: undefined, // TODO: Build breadcrumb path from parentId
      updatedAt: new Date(item.updatedAt),
      matchCount: undefined, // Not provided by current API
    };
  });
}

/**
 * Default search filter
 */
export const DEFAULT_FILTER: SearchFilter = {
  query: "",
  type: "all",
  caseSensitive: false,
  useRegex: false,
  showMoreContext: false,
  autoScrollToMatch: false,
};
