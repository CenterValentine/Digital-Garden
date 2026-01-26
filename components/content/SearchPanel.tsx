/**
 * SearchPanel Component
 *
 * Full-text search interface that replaces file tree when active.
 * Features:
 * - Debounced search input
 * - Match case toggle
 * - Regex search toggle
 * - Show more context toggle
 * - Document type filter
 * - Real-time results display
 * - Keyboard navigation (up/down arrows, Enter to open)
 * - Empty states and loading states
 * - Click to open note in editor
 *
 * M6: Search & Knowledge Features - Phase 1
 */

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchStore } from "@/stores/search-store";
import { useContentStore } from "@/stores/content-store";
import { useTreeStateStore } from "@/stores/tree-state-store";
import { parseSearchResults } from "@/lib/search/filters";
import type { SearchResult } from "@/lib/search/filters";
import type { ContentType } from "@/lib/content/types";

export function SearchPanel() {
  const {
    filter,
    results,
    isLoading,
    error,
    selectedIndex,
    setQuery,
    setFilter,
    setResults,
    setLoading,
    setError,
    selectNext,
    selectPrevious,
    closeSearch,
    loadCachedResults,
  } = useSearchStore();

  const setSelectedContentId = useContentStore((state) => state.setSelectedContentId);
  const { setExpanded, setSelectedIds } = useTreeStateStore();

  const [localQuery, setLocalQuery] = useState(filter.query);
  const [showTypeFilter, setShowTypeFilter] = useState(false);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState("");
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; name: string; slug: string; color: string | null; usageCount: number }>>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>(filter.tags || []);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Focus input when panel opens
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load cached search results on mount
  useEffect(() => {
    loadCachedResults();
    // Update local UI state from store after loading cache
    setLocalQuery(filter.query);
    setSelectedTags(filter.tags || []);
  }, [loadCachedResults]);

  // Load all tags when tag filter is opened
  useEffect(() => {
    if (showTagFilter) {
      const fetchTags = async () => {
        try {
          const response = await fetch("/api/content/tags", {
            credentials: "include",
          });
          if (response.ok) {
            const tags = await response.json();
            setAvailableTags(tags);
          }
        } catch (err) {
          console.error("Failed to fetch tags:", err);
        }
      };
      fetchTags();
    }
  }, [showTagFilter]);

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (localQuery.trim() !== filter.query.trim()) {
        setQuery(localQuery);
        performSearch(localQuery, selectedTags);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [localQuery, selectedTags, setQuery]);

  // Perform search API call
  const performSearch = useCallback(
    async (query: string, tags: string[] = []) => {
      // If no query and no tags, clear results
      if (!query.trim() && tags.length === 0) {
        setResults([]);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Use advanced search endpoint with tag support
        const params = new URLSearchParams();

        if (query.trim()) {
          params.append("query", query);
        }

        if (tags.length > 0) {
          params.append("tags", tags.join(","));
        }

        if (filter.type && filter.type !== "all") {
          params.append("type", filter.type);
        }

        if (filter.caseSensitive) {
          params.append("caseSensitive", "true");
        }

        const response = await fetch(`/api/content/search?${params.toString()}`);

        if (!response.ok) {
          throw new Error("Search failed");
        }

        const data = await response.json();
        const searchResults = parseSearchResults(
          data.data?.items || [],
          query,
          filter.caseSensitive || false,
          filter.useRegex || false,
          filter.showMoreContext || false
        );
        setResults(searchResults);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [filter, selectedTags, setResults, setLoading, setError]
  );

  // Re-run search when filter options change or tags change
  useEffect(() => {
    if (filter.query.trim() || selectedTags.length > 0) {
      performSearch(filter.query, selectedTags);
    }
  }, [filter.caseSensitive, filter.useRegex, filter.showMoreContext, filter.type, selectedTags]);

  // Add/remove tag from filter
  const toggleTag = (tagSlug: string) => {
    const newTags = selectedTags.includes(tagSlug)
      ? selectedTags.filter((t) => t !== tagSlug)
      : [...selectedTags, tagSlug];

    setSelectedTags(newTags);
    setFilter({ tags: newTags });
  };

  const removeTag = (tagSlug: string) => {
    const newTags = selectedTags.filter((t) => t !== tagSlug);
    setSelectedTags(newTags);
    setFilter({ tags: newTags });
  };

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectNext();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectPrevious();
      } else if (e.key === "Enter" && results.length > 0 && selectedIndex >= 0) {
        e.preventDefault();
        // Set the selected content ID - this will trigger the main panel to load the content
        setSelectedContentId(results[selectedIndex].id);
        // Close search after a brief delay to allow state updates to propagate
        setTimeout(() => {
          closeSearch();
        }, 50);
      }
    },
    [results, selectedIndex, selectNext, selectPrevious, setSelectedContentId, closeSearch]
  );

  // Open note in editor or select folder in tree
  const handleResultClick = (result: SearchResult) => {
    console.log('[SearchPanel] Clicking result:', result.id, result.title, 'type:', result.type);

    if (result.type === 'folder') {
      // For folders: select in tree and expand
      console.log('[SearchPanel] Selecting folder in tree');
      setSelectedIds([result.id]); // Select folder in file tree
      setExpanded(result.id, true); // Expand the folder
      setSelectedContentId(null); // Clear editor (don't try to open folder)
    } else {
      // For notes: open in editor
      console.log('[SearchPanel] Opening note in editor');
      setSelectedContentId(result.id);

      // If autoScrollToMatch is enabled, add the search query to the URL
      if (filter.autoScrollToMatch && filter.query.trim()) {
        const url = new URL(window.location.href);
        url.searchParams.set("searchQuery", filter.query);
        window.history.replaceState({}, "", url);
      }
    }

    // Close search after a brief delay to allow state updates to propagate
    // This prevents race conditions where the content panel unmounts before loading
    setTimeout(() => {
      closeSearch();
    }, 50);
  };

  // Scroll selected result into view
  useEffect(() => {
    if (selectedIndex >= 0) {
      const selectedElement = resultsRef.current?.children[selectedIndex] as HTMLElement;
      selectedElement?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  // Toggle handlers
  const toggleCaseSensitive = () => {
    setFilter({ caseSensitive: !filter.caseSensitive });
  };

  const toggleShowMoreContext = () => {
    setFilter({ showMoreContext: !filter.showMoreContext });
  };

  const toggleAutoScrollToMatch = () => {
    setFilter({ autoScrollToMatch: !filter.autoScrollToMatch });
  };

  const setDocumentType = (type: ContentType | "all") => {
    setFilter({ type });
    setShowTypeFilter(false);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Search Input */}
      <div className="shrink-0 border-b border-white/10 px-3 py-2">
        <div className="relative mb-2">
          <input
            ref={inputRef}
            type="text"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search notes..."
            className="w-full rounded-md border border-white/10 bg-white/5 backdrop-blur-md px-3 py-2 pr-[110px] text-sm text-foreground placeholder-gray-400 transition-colors hover:border-white/20 hover:bg-white/10 focus:border-gold-primary focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-gold-primary/50"
          />

          {/* Clear button */}
          {localQuery && (
            <button
              onClick={() => {
                setLocalQuery("");
                setQuery("");
                setResults([]);
              }}
              className="absolute right-[90px] top-2.5 rounded p-0.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-foreground"
              title="Clear search"
              type="button"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Type filter icon */}
          <button
            onClick={() => setShowTypeFilter(!showTypeFilter)}
            className={`absolute right-[68px] top-2.5 rounded p-0.5 transition-colors ${
              filter.type !== "all" || showTypeFilter
                ? "bg-gold-primary/20 text-gold-primary"
                : "text-gray-400 hover:bg-white/10 hover:text-foreground"
            }`}
            title={filter.type === "all" ? "Filter by type" : `Filtered by: ${filter.type}`}
            type="button"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </button>

          {/* Tag filter icon */}
          <button
            onClick={() => setShowTagFilter(!showTagFilter)}
            className={`absolute right-[46px] top-2.5 rounded p-0.5 transition-colors ${
              selectedTags.length > 0 || showTagFilter
                ? "bg-gold-primary/20 text-gold-primary"
                : "text-gray-400 hover:bg-white/10 hover:text-foreground"
            }`}
            title={selectedTags.length > 0 ? `${selectedTags.length} tag(s) selected` : "Filter by tags"}
            type="button"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          </button>

          {/* Match case toggle */}
          <button
            onClick={toggleCaseSensitive}
            className={`absolute right-[24px] top-2.5 rounded p-0.5 text-xs font-medium transition-colors ${
              filter.caseSensitive
                ? "bg-gold-primary/20 text-gold-primary"
                : "text-gray-400 hover:bg-white/10 hover:text-foreground"
            }`}
            title="Match case"
            type="button"
          >
            Aa
          </button>

          {/* Regex toggle */}
          <button
            onClick={() => setFilter({ useRegex: !filter.useRegex })}
            className={`absolute right-2 top-2.5 rounded p-0.5 text-xs font-medium transition-colors ${
              filter.useRegex
                ? "bg-gold-primary/20 text-gold-primary"
                : "text-gray-400 hover:bg-white/10 hover:text-foreground"
            }`}
            title="Use regular expression"
            type="button"
          >
            .*
          </button>
        </div>

        {/* Options toggle */}
        <button
          onClick={() => setShowOptions(!showOptions)}
          className="mb-2 flex w-full items-center justify-between rounded-md px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-100"
          type="button"
        >
          <span>Options</span>
          <svg
            className={`h-3 w-3 transition-transform ${showOptions ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Collapsible options */}
        {showOptions && (
          <div className="mb-2 space-y-2 rounded-md border border-white/10 bg-white/50 p-2">
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={filter.showMoreContext || false}
                onChange={toggleShowMoreContext}
                className="h-3 w-3 rounded border-gray-300 text-gold-primary focus:ring-gold-primary"
              />
              More context
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={filter.autoScrollToMatch || false}
                onChange={toggleAutoScrollToMatch}
                className="h-3 w-3 rounded border-gray-300 text-gold-primary focus:ring-gold-primary"
              />
              Auto-scroll to match
            </label>
          </div>
        )}

        {/* Type filter dropdown */}
        {showTypeFilter && (
          <div className="relative mb-2">
            <div className="rounded-md border border-white/20 bg-white/5 backdrop-blur-md shadow-lg">
              <button
                onClick={() => setDocumentType("all")}
                className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-white/10"
                type="button"
              >
                {filter.type === "all" && "✓ "}All types
              </button>
              <button
                onClick={() => setDocumentType("note")}
                className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-white/10"
                type="button"
              >
                {filter.type === "note" && "✓ "}Notes
              </button>
              <button
                onClick={() => setDocumentType("folder")}
                className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-white/10"
                type="button"
              >
                {filter.type === "folder" && "✓ "}Folders
              </button>
              <button
                onClick={() => setDocumentType("html")}
                className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-white/10"
                type="button"
              >
                {filter.type === "html" && "✓ "}HTML
              </button>
              <button
                onClick={() => setDocumentType("code")}
                className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-white/10"
                type="button"
              >
                {filter.type === "code" && "✓ "}Code
              </button>
              <button
                onClick={() => setDocumentType("file")}
                className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-white/10"
                type="button"
              >
                {filter.type === "file" && "✓ "}Files
              </button>
            </div>
          </div>
        )}

        {/* Tag filter panel */}
        {showTagFilter && (
          <div className="mb-2 border-t border-white/10 pt-2">
            {/* Selected tags */}
            {selectedTags.length > 0 && (
            <div className={`mb-2 flex flex-wrap gap-1 transition-all ${selectedTags.length > 3 ? 'max-h-20 overflow-y-auto' : ''}`}>
              {selectedTags.map((tagSlug) => {
                const tag = availableTags.find((t) => t.slug === tagSlug);
                const tagName = tag?.name || tagSlug;
                const tagColor = tag?.color || "#3b82f6";
                return (
                  <button
                    key={tagSlug}
                    onClick={() => removeTag(tagSlug)}
                    className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium transition-all hover:opacity-80"
                    style={{
                      backgroundColor: `${tagColor}20`,
                      color: tagColor,
                      border: `1px solid ${tagColor}40`,
                    }}
                    title="Click to remove filter"
                  >
                    <span className="text-[10px]">#{tagName}</span>
                    <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                );
              })}
            </div>
          )}

            {/* Tag selector dropdown */}
            <div className="mb-2 max-h-40 overflow-y-auto rounded-md border border-white/10 bg-white/5 backdrop-blur-md">
              {/* Tag search input */}
              <div className="sticky top-0 border-b border-white/10 bg-white/5 backdrop-blur-md p-2">
                <input
                  type="text"
                  value={tagSearchQuery}
                  onChange={(e) => setTagSearchQuery(e.target.value)}
                  placeholder="Search tags..."
                  className="w-full rounded border border-white/10 bg-white/5 backdrop-blur-md px-2 py-1 text-xs text-foreground placeholder-gray-400 focus:border-gold-primary focus:outline-none focus:ring-1 focus:ring-gold-primary/50"
                />
              </div>

              {/* Tag list */}
              <div className="p-1">
                {availableTags
                  .filter((tag) =>
                    tag.name.toLowerCase().includes(tagSearchQuery.toLowerCase())
                  )
                  .map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.slug)}
                      className={`w-full rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-gray-100 ${
                        selectedTags.includes(tag.slug) ? "bg-gray-100" : ""
                      }`}
                      type="button"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {selectedTags.includes(tag.slug) && "✓ "}
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: tag.color || "#3b82f6" }}
                        />
                        #{tag.name}
                        <span className="text-gray-500">({tag.usageCount || 0})</span>
                      </span>
                    </button>
                  ))}
                {availableTags.length === 0 && (
                  <div className="px-2 py-3 text-center text-xs text-gray-500">No tags found</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results Area */}
      <div className="flex-1 overflow-y-auto" ref={resultsRef}>
        {/* Results count */}
        {results.length > 0 && !isLoading && (
          <div className="px-3 py-2 text-xs font-medium text-gray-600 border-b border-white/10">
            {results.length} {results.length === 1 ? "result" : "results"}
          </div>
        )}
        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center p-8 text-sm text-gray-400">
            Searching...
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-4 text-sm text-red-400">
            <p>Search error: {error}</p>
          </div>
        )}

        {/* Empty State - No Query */}
        {!localQuery.trim() && !isLoading && (
          <div className="flex flex-col items-center justify-center p-8 text-center text-sm text-gray-500">
            <svg className="mb-3 h-12 w-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <p>Type to search your documents</p>
            <p className="mt-1 text-xs text-gray-600">Press Cmd+/ to close search</p>
          </div>
        )}

        {/* Empty State - No Results */}
        {localQuery.trim() && !isLoading && results.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center p-8 text-center text-sm text-gray-500">
            <svg className="mb-3 h-12 w-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p>No results found for &quot;{localQuery}&quot;</p>
            <p className="mt-1 text-xs text-gray-600">Try different keywords</p>
          </div>
        )}

        {/* Results List */}
        {!isLoading && results.length > 0 && (
          <div className="space-y-1.5 p-2">
            {results.map((result, index) => (
              <button
                key={result.id}
                onClick={() => handleResultClick(result)}
                className={`w-full rounded-lg border p-2.5 text-left transition-all ${
                  index === selectedIndex
                    ? "border-white/30 bg-white/15 shadow-md"
                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 hover:shadow-sm"
                }`}
              >
                {/* Title */}
                <div className="mb-1.5 flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{result.title}</h3>
                  {/* Type badge */}
                  <span className="shrink-0 rounded-md border border-white/20 bg-white/10 px-2 py-0.5 text-xs font-medium text-gray-900 dark:text-white">
                    {result.type}
                  </span>
                </div>

                {/* Excerpt */}
                {result.excerpt && (
                  <p
                    className={`mb-1.5 text-xs leading-relaxed text-gray-700 dark:text-gray-200 ${
                      filter.showMoreContext ? "line-clamp-4" : "line-clamp-2"
                    }`}
                    dangerouslySetInnerHTML={{ __html: result.excerpt }}
                  />
                )}

                {/* Path */}
                {result.path && <p className="mb-1 text-xs text-gray-600 dark:text-gray-400">{result.path}</p>}

                {/* Metadata */}
                <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                  <span>{new Date(result.updatedAt).toLocaleDateString()}</span>
                  {result.matchCount && result.matchCount > 1 && <span>{result.matchCount} matches</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
