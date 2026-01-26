/**
 * Tags Panel Component
 *
 * Displays tags associated with the currently selected content node
 * Shows tags as colored pills with click-to-jump functionality
 *
 * M6: Search & Knowledge Features - Tags
 */

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useContentStore } from "@/stores/content-store";
import { useEditorStatsStore } from "@/stores/editor-stats-store";

interface Tag {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  positions: Array<{ offset: number; context: string }>;
  linkedAt: string;
}

export function TagsPanel() {
  const { selectedContentId, clearSelection } = useContentStore();
  const { lastSaved } = useEditorStatsStore();
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!selectedContentId) {
      setTags([]);
      setIsInitialLoad(true);
      return;
    }

    // Skip fetching for temporary IDs (files being created)
    if (selectedContentId.startsWith("temp-")) {
      setTags([]);
      setIsLoading(false);
      return;
    }

    const fetchTags = async () => {
      // Only show loading spinner on initial load, not on refreshes
      if (isInitialLoad) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const response = await fetch(`/api/content/tags/content/${selectedContentId}`);

        // Handle 404 - content no longer exists (stale localStorage/URL)
        if (response.status === 404) {
          console.warn(`Content ${selectedContentId} not found (404). Clearing stale selection.`);
          toast.error("Note not found. It may have been deleted.");
          clearSelection();
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch tags: ${response.status}`);
        }

        const data = await response.json();
        setTags(data);
        setIsInitialLoad(false);
      } catch (err) {
        console.error("Error fetching tags:", err);
        setError(err instanceof Error ? err.message : "Failed to load tags");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTags();
  }, [selectedContentId, lastSaved]); // ← Refetch when note is saved

  // Show skeleton during SSR to prevent hydration mismatch
  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!selectedContentId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-500">
        No content selected
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-gray-500">Loading tags...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-red-500">{error}</div>
      </div>
    );
  }

  if (tags.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-sm text-gray-500 px-4">
        <div className="mb-2">No tags found</div>
        <div className="text-xs text-gray-600 text-center">
          Add tags by typing <code className="text-primary">#tag</code> in the editor
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">
        Tags ({tags.length})
      </div>

      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <TagPill key={tag.id} tag={tag} />
        ))}
      </div>

      {/* Tag positions list */}
      <div className="space-y-2 border-t border-white/10 pt-4">
        {tags.map((tag) =>
          tag.positions.length > 1 ? (
            <div key={tag.id} className="space-y-1">
              <div className="text-xs text-gray-400">
                #{tag.name} ({tag.positions.length} occurrences)
              </div>
              <div className="space-y-1 pl-2">
                {tag.positions.map((position, index) => (
                  <button
                    key={index}
                    onClick={() => handleJumpToPosition(position.offset)}
                    className="w-full text-left text-xs text-gray-500 hover:text-primary transition-colors truncate"
                    title={position.context}
                  >
                    {index + 1}. {position.context}
                  </button>
                ))}
              </div>
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}

interface TagPillProps {
  tag: Tag;
}

function TagPill({ tag }: TagPillProps) {
  const color = tag.color || "#3b82f6";

  return (
    <button
      onClick={() => {
        if (tag.positions.length > 0) {
          handleJumpToPosition(tag.positions[0].offset);
        }
      }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all hover:scale-105"
      style={{
        backgroundColor: `${color}20`,
        color: color,
        border: `1px solid ${color}40`,
      }}
      title={`Click to jump to first occurrence (${tag.positions.length} total)`}
    >
      <span className="text-xs opacity-75">#</span>
      <span>{tag.name}</span>
      {tag.positions.length > 1 && (
        <span className="text-xs opacity-60">×{tag.positions.length}</span>
      )}
    </button>
  );
}

/**
 * Jump to a specific character offset in the editor
 * TODO: This requires access to the editor instance
 * Will be connected when integrating with MarkdownEditor component
 */
function handleJumpToPosition(offset: number) {
  console.log("[TagsPanel] Jump to offset:", offset);
  // TODO: Implement scroll-to-position in editor
  // This will require exposing editor instance or creating a store
}
