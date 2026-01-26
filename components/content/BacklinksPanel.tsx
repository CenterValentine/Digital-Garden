/**
 * Backlinks Panel
 *
 * Shows notes that link to the currently selected content (note or folder).
 * Displays in the right sidebar.
 *
 * M6: Search & Knowledge Features - Phase 2 (Backlinks)
 */

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useContentStore } from "@/stores/content-store";
import { useTreeStateStore } from "@/stores/tree-state-store";
import { ArrowLeft } from "lucide-react";

interface Backlink {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  linkText: string;
  updatedAt: Date;
}

interface BacklinksData {
  targetId: string;
  targetTitle: string;
  backlinks: Backlink[];
  count: number;
}

export function BacklinksPanel() {
  // Use tree selection for backlinks (includes notes AND folders)
  const selectedIds = useTreeStateStore((state) => state.selectedIds);
  const selectedContentId = selectedIds.length === 1 ? selectedIds[0] : null;

  const setSelectedContentId = useContentStore((state) => state.setSelectedContentId);
  const clearSelection = useContentStore((state) => state.clearSelection);

  const [backlinks, setBacklinks] = useState<BacklinksData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch backlinks when selected content changes
  useEffect(() => {
    if (!selectedContentId) {
      setBacklinks(null);
      return;
    }

    // Skip if this is a temporary document being created
    if (selectedContentId.startsWith("temp-")) {
      setBacklinks(null);
      setIsLoading(false);
      return;
    }

    const fetchBacklinks = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/content/backlinks/${selectedContentId}`, {
          credentials: "include",
        });

        console.log('[BacklinksPanel] Response status:', response.status);

        if (!response.ok) {
          // Handle 404: Note not found (likely deleted)
          if (response.status === 404) {
            toast.error("Note not found. It may have been deleted.");
            // Clear the selection to prevent further 404 errors
            clearSelection();
            return;
          }

          const errorText = await response.text();
          console.error('[BacklinksPanel] Error response:', errorText);
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        console.log('[BacklinksPanel] Result:', result);

        if (!result.success) {
          throw new Error(result.error?.message || "Failed to fetch backlinks");
        }

        setBacklinks(result.data);
      } catch (err) {
        console.error("[BacklinksPanel] Failed to fetch backlinks:", err);
        setError(err instanceof Error ? err.message : "Failed to load backlinks");
      } finally {
        setIsLoading(false);
      }
    };

    fetchBacklinks();
  }, [selectedContentId]);

  // Handle clicking a backlink to navigate to that note
  const handleBacklinkClick = (backlinkId: string) => {
    setSelectedContentId(backlinkId);
  };

  // Empty state - no note selected
  if (!selectedContentId) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center">
        <div className="text-sm text-gray-400">
          Select a note to see backlinks
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-sm text-gray-400">Loading backlinks...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center">
        <div className="text-sm text-red-400">Failed to load backlinks</div>
      </div>
    );
  }

  // No backlinks found
  if (backlinks && backlinks.count === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center">
        <div className="mb-2 text-sm font-medium text-gray-300">No backlinks</div>
        <div className="text-xs text-gray-500">
          No other notes link to "{backlinks.targetTitle}"
        </div>
      </div>
    );
  }

  // Display backlinks
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header with count */}
      <div className="shrink-0 border-b border-white/10 px-4 py-3">
        <div className="text-sm font-medium text-gray-300">
          {backlinks?.count} {backlinks?.count === 1 ? "backlink" : "backlinks"}
        </div>
        <div className="text-xs text-gray-500">
          Notes linking to "{backlinks?.targetTitle}"
        </div>
      </div>

      {/* Backlinks list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {backlinks?.backlinks.map((backlink) => (
          <button
            key={backlink.id}
            onClick={() => handleBacklinkClick(backlink.id)}
            className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-left transition-all hover:border-white/20 hover:bg-white/10 hover:shadow-sm"
          >
            {/* Note title with arrow icon */}
            <div className="mb-2 flex items-center gap-2">
              <ArrowLeft className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <div className="font-medium text-gray-200 text-sm truncate">
                {backlink.title}
              </div>
            </div>

            {/* Link text preview */}
            {backlink.linkText && (
              <div className="mb-1 text-xs text-primary">
                "{backlink.linkText}"
              </div>
            )}

            {/* Context excerpt */}
            <div className="text-xs text-gray-400 line-clamp-2">
              {backlink.excerpt}
            </div>

            {/* Updated date */}
            <div className="mt-2 text-xs text-gray-500">
              {new Date(backlink.updatedAt).toLocaleDateString()}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
