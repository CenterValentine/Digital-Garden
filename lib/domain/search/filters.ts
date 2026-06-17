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

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}

/**
 * Highlight search matches in text, returning HTML-safe output.
 *
 * Consumed by SearchPanel via dangerouslySetInnerHTML, so the returned
 * string must be safe HTML. The pattern runs against raw text to preserve
 * (user-supplied) regex semantics; the output is emitted piece-by-piece
 * with each match wrapped in <mark>…</mark> and every non-match segment
 * HTML-escaped. Without escaping, a note containing
 * `<img src=x onerror=…>` would XSS the searcher.
 *
 * @param text - Original text
 * @param query - Search query
 * @param caseSensitive - Use case-sensitive matching
 * @param useRegex - Treat query as regex pattern
 * @returns HTML-escaped text with <mark> tags around matches
 */
export function highlightMatches(
  text: string,
  query: string,
  caseSensitive: boolean = false,
  useRegex: boolean = false
): string {
  if (!query.trim()) return escapeHtml(text);

  try {
    const pattern = useRegex
      ? query
      : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const flags = caseSensitive ? "g" : "gi";
    const regex = new RegExp(`(${pattern})`, flags);

    let result = "";
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      // Skip zero-width matches (e.g. user regex `a*` or `(?=foo)`) and
      // force progress so the loop terminates.
      if (match[0].length === 0) {
        if (match.index === regex.lastIndex) regex.lastIndex++;
        continue;
      }
      result += escapeHtml(text.slice(lastIndex, match.index));
      result += "<mark>" + escapeHtml(match[0]) + "</mark>";
      lastIndex = match.index + match[0].length;
    }
    result += escapeHtml(text.slice(lastIndex));
    return result;
  } catch {
    // Invalid regex — return escaped text with no highlights. The pre-fix
    // version returned raw text here, which was the XSS path.
    return escapeHtml(text);
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
// TODO(any-epic-phase-4): search-result items have a polymorphic payload shape; introduce a SearchResultItem union once payload contract stabilizes
export function parseSearchResults(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      path: item.path || undefined,
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
