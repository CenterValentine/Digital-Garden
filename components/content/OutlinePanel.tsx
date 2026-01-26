/**
 * Outline Panel Component
 *
 * Displays a table of contents extracted from the current note's headings.
 * Features:
 * - Hierarchical display with indentation
 * - Click heading to scroll editor to that position
 * - Highlight current active heading (optional future enhancement)
 * - Real-time updates as headings change
 * - Empty state when no headings
 *
 * M6: Search & Knowledge Features - Outline Panel
 */

"use client";

import { useState, useEffect } from "react";
import { useContentStore } from "@/state/content-store";
import type { OutlineHeading } from "@/lib/domain/content/outline-extractor";

interface OutlinePanelProps {
  /** Current outline headings from the editor */
  outline?: OutlineHeading[];
  /** Callback when a heading is clicked - scrolls editor to that heading */
  onHeadingClick?: (heading: OutlineHeading) => void;
}

export function OutlinePanel({ outline = [], onHeadingClick }: OutlinePanelProps) {
  const selectedContentId = useContentStore((state) => state.selectedContentId);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);

  // Reset active heading when switching notes
  useEffect(() => {
    setActiveHeadingId(null);
  }, [selectedContentId]);

  // Handle heading click
  const handleHeadingClick = (heading: OutlineHeading) => {
    setActiveHeadingId(heading.id);
    if (onHeadingClick) {
      onHeadingClick(heading);
    }
  };

  // Calculate indentation based on heading level
  // H1 = 0px, H2 = 12px, H3 = 24px, etc.
  const getIndentation = (level: number) => {
    return (level - 1) * 12;
  };

  // Empty state - no note selected
  if (!selectedContentId) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <svg
          className="mb-3 h-12 w-12 text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="text-sm text-gray-500">No note selected</p>
        <p className="mt-1 text-xs text-gray-600">Select a note to see its outline</p>
      </div>
    );
  }

  // Empty state - no headings
  if (outline.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <svg
          className="mb-3 h-12 w-12 text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 6h16M4 12h16M4 18h7"
          />
        </svg>
        <p className="text-sm text-gray-500">No headings yet</p>
        <p className="mt-1 text-xs text-gray-600">Add headings to create an outline</p>
      </div>
    );
  }

  // Render outline
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          Outline ({outline.length})
        </h2>
      </div>

      {/* Headings List */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-0.5">
          {outline.map((heading) => {
            const isActive = activeHeadingId === heading.id;
            const indentation = getIndentation(heading.level);

            return (
              <button
                key={heading.id}
                onClick={() => handleHeadingClick(heading)}
                className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? "bg-gold-primary/20 text-gold-primary font-medium"
                    : "text-gray-700 hover:bg-white/10 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                }`}
                style={{ paddingLeft: `${12 + indentation}px` }}
                title={`Jump to: ${heading.text}`}
              >
                {/* Heading level indicator (visual only) */}
                <span
                  className={`shrink-0 inline-block rounded-full ${
                    isActive ? "bg-gold-primary" : "bg-gray-400"
                  }`}
                  style={{
                    width: heading.level === 1 ? "6px" : heading.level === 2 ? "4px" : "3px",
                    height: heading.level === 1 ? "6px" : heading.level === 2 ? "4px" : "3px",
                  }}
                />

                {/* Heading text - truncate if too long */}
                <span className="truncate">{heading.text}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer hint (optional) */}
      <div className="shrink-0 border-t border-white/10 px-4 py-2">
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Click a heading to jump to it
        </p>
      </div>
    </div>
  );
}
