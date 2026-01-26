/**
 * Search Store
 *
 * Zustand store for managing search state.
 * Handles search panel visibility, query, results, and loading states.
 * Persists search settings to localStorage.
 *
 * M6: Search & Knowledge Features
 */

import { create } from "zustand";
import type { SearchFilter, SearchResult } from "@/lib/search/filters";
import { DEFAULT_FILTER } from "@/lib/search/filters";

const STORAGE_KEY = "search-settings";
const RESULTS_STORAGE_KEY = "search-results";

interface SearchSettings {
  caseSensitive: boolean;
  useRegex: boolean;
  showMoreContext: boolean;
  autoScrollToMatch: boolean;
  type: SearchFilter["type"];
}

interface SearchResultsCache {
  query: string;
  tags: string[];
  results: SearchResult[];
  timestamp: number;
}

const DEFAULT_SETTINGS: SearchSettings = {
  caseSensitive: false,
  useRegex: false,
  showMoreContext: false,
  autoScrollToMatch: false,
  type: "all",
};

const CACHE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

// Load settings from localStorage
function loadSettings(): SearchSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error("Failed to load search settings:", e);
  }

  return DEFAULT_SETTINGS;
}

// Save settings to localStorage
function saveSettings(settings: Partial<SearchSettings>) {
  if (typeof window === "undefined") return;

  try {
    const current = loadSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error("Failed to save search settings:", e);
  }
}

// Load search results from localStorage
function loadCachedResults(): SearchResultsCache | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(RESULTS_STORAGE_KEY);
    if (stored) {
      const cache: SearchResultsCache = JSON.parse(stored);
      // Check if cache is still valid (within expiry time)
      if (Date.now() - cache.timestamp < CACHE_EXPIRY_MS) {
        return cache;
      } else {
        // Cache expired, remove it
        localStorage.removeItem(RESULTS_STORAGE_KEY);
      }
    }
  } catch (e) {
    console.error("Failed to load cached search results:", e);
  }

  return null;
}

// Save search results to localStorage
function saveCachedResults(query: string, tags: string[], results: SearchResult[]) {
  if (typeof window === "undefined") return;

  try {
    const cache: SearchResultsCache = {
      query,
      tags,
      results,
      timestamp: Date.now(),
    };
    localStorage.setItem(RESULTS_STORAGE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error("Failed to save search results:", e);
  }
}

// Clear cached results
function clearCachedResults() {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(RESULTS_STORAGE_KEY);
  } catch (e) {
    console.error("Failed to clear cached results:", e);
  }
}

interface SearchState {
  // UI state
  isSearchOpen: boolean;

  // Search state
  filter: SearchFilter;
  results: SearchResult[];
  isLoading: boolean;
  error: string | null;

  // Selection
  selectedIndex: number; // For keyboard navigation

  // Actions
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
  setFilter: (filter: Partial<SearchFilter>) => void;
  setQuery: (query: string) => void;
  setResults: (results: SearchResult[]) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setSelectedIndex: (index: number) => void;
  selectNext: () => void;
  selectPrevious: () => void;
  reset: () => void;
  loadCachedResults: () => void;
  clearCache: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => {
  const settings = loadSettings();

  return {
    // Initial state - load settings from localStorage
    isSearchOpen: false,
    filter: {
      ...DEFAULT_FILTER,
      caseSensitive: settings.caseSensitive,
      useRegex: settings.useRegex,
      showMoreContext: settings.showMoreContext,
      autoScrollToMatch: settings.autoScrollToMatch,
      type: settings.type,
    },
    results: [],
    isLoading: false,
    error: null,
    selectedIndex: -1, // -1 means no selection (only select on keyboard navigation)

    // Actions
    openSearch: () => set({ isSearchOpen: true }),

    closeSearch: () => {
      const settings = loadSettings();
      set({
        isSearchOpen: false,
        // Reset search state but preserve settings
        filter: {
          ...DEFAULT_FILTER,
          caseSensitive: settings.caseSensitive,
          useRegex: settings.useRegex,
          showMoreContext: settings.showMoreContext,
          autoScrollToMatch: settings.autoScrollToMatch,
          type: settings.type,
        },
        results: [],
        error: null,
        selectedIndex: -1,
      });
    },

    toggleSearch: () => {
      const { isSearchOpen } = get();
      if (isSearchOpen) {
        get().closeSearch();
      } else {
        get().openSearch();
      }
    },

    setFilter: (partialFilter) => {
      set((state) => ({
        filter: { ...state.filter, ...partialFilter },
      }));

      // Save persistent settings to localStorage
      const settingsToSave: Partial<SearchSettings> = {};
      if (partialFilter.caseSensitive !== undefined)
        settingsToSave.caseSensitive = partialFilter.caseSensitive;
      if (partialFilter.useRegex !== undefined) settingsToSave.useRegex = partialFilter.useRegex;
      if (partialFilter.showMoreContext !== undefined)
        settingsToSave.showMoreContext = partialFilter.showMoreContext;
      if (partialFilter.autoScrollToMatch !== undefined)
        settingsToSave.autoScrollToMatch = partialFilter.autoScrollToMatch;
      if (partialFilter.type !== undefined) settingsToSave.type = partialFilter.type;

      if (Object.keys(settingsToSave).length > 0) {
        saveSettings(settingsToSave);
      }
    },

    setQuery: (query) =>
      set((state) => ({
        filter: { ...state.filter, query },
      })),

    setResults: (results) => {
      set({
        results,
        selectedIndex: -1, // Don't auto-select, only on keyboard navigation
      });

      // Save results to cache
      const { filter } = get();
      saveCachedResults(filter.query, filter.tags || [], results);
    },

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  setSelectedIndex: (index) => {
    const { results } = get();
    if (index >= 0 && index < results.length) {
      set({ selectedIndex: index });
    }
  },

  selectNext: () => {
    const { selectedIndex, results } = get();
    if (results.length === 0) return;
    const nextIndex = (selectedIndex + 1) % results.length;
    set({ selectedIndex: nextIndex });
  },

  selectPrevious: () => {
    const { selectedIndex, results } = get();
    if (results.length === 0) return;
    const prevIndex = selectedIndex === 0 ? results.length - 1 : selectedIndex - 1;
    set({ selectedIndex: prevIndex });
  },

    reset: () => {
      const settings = loadSettings();
      set({
        filter: {
          ...DEFAULT_FILTER,
          caseSensitive: settings.caseSensitive,
          useRegex: settings.useRegex,
          showMoreContext: settings.showMoreContext,
          autoScrollToMatch: settings.autoScrollToMatch,
          type: settings.type,
        },
        results: [],
        isLoading: false,
        error: null,
        selectedIndex: -1,
      });
    },

    loadCachedResults: () => {
      const cached = loadCachedResults();
      if (cached) {
        set((state) => ({
          filter: { ...state.filter, query: cached.query, tags: cached.tags },
          results: cached.results,
        }));
      }
    },

    clearCache: () => {
      clearCachedResults();
    },
  };
});
