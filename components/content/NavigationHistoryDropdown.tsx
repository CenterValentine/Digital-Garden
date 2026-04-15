/**
 * Navigation History Dropdown
 *
 * Shows navigation history when holding down the back button.
 * Titles and content types are stored directly in the history entries
 * (set at navigation time), so display is instant with no network round-trip.
 * A secondary fetch enriches entries with a text preview snippet.
 */

"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import type { NavigationHistoryItem } from "@/state/navigation-history-store";
import { calculateMenuPosition } from "@/lib/core/menu-positioning";
import { getContentTypeIcon } from "@/lib/domain/content/types";
import * as LucideIcons from "lucide-react";

interface PreviewSnippet {
  id: string;
  preview: string | null;
}

interface NavigationHistoryDropdownProps {
  isOpen: boolean;
  triggerPosition: { x: number; y: number };
  historyItems: NavigationHistoryItem[];
  onSelectItem: (contentId: string | null) => void;
  onClose: () => void;
}

export function NavigationHistoryDropdown({
  isOpen,
  triggerPosition,
  historyItems,
  onSelectItem,
  onClose,
}: NavigationHistoryDropdownProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [snippets, setSnippets] = useState<Map<string, string>>(new Map());

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Secondary fetch: enrich with text preview snippets (best-effort, non-blocking)
  useEffect(() => {
    if (!isOpen || historyItems.length === 0) return;

    const contentIds = historyItems
      .map((item) => item.contentId)
      .filter((id): id is string => id !== null && !id.startsWith("person:"));

    if (contentIds.length === 0) return;

    fetch("/api/content/content/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentIds }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.previews)) {
          const map = new Map<string, string>();
          data.previews.forEach((p: { id: string; preview: string | null }) => {
            if (p.preview) map.set(p.id, p.preview);
          });
          setSnippets(map);
        }
      })
      .catch(() => {/* best-effort, ignore errors */});
  }, [isOpen]);  // intentionally omit historyItems — stale snippets are fine

  // Two-phase menu positioning
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;
    const menuRect = menuRef.current.getBoundingClientRect();
    const calculatedPosition = calculateMenuPosition({
      triggerPosition,
      menuDimensions: { width: menuRect.width, height: menuRect.height },
      preferredPlacementX: "right",
      preferredPlacementY: "bottom",
    });
    setMenuPosition(calculatedPosition);
  }, [isOpen, triggerPosition]);

  if (!isOpen) return null;

  const menuStyle = !menuPosition
    ? { visibility: "hidden" as const, position: "fixed" as const, left: 0, top: 0 }
    : { position: "fixed" as const, left: `${menuPosition.x}px`, top: `${menuPosition.y}px`, zIndex: 9999 };

  const getIcon = (contentType?: string) => {
    if (!contentType) return <div className="h-4 w-4" />;
    const iconName = getContentTypeIcon(contentType as any);
    const LucideIcon = (LucideIcons as any)[iconName];
    return LucideIcon ? <LucideIcon className="h-4 w-4 text-gray-400" /> : <div className="h-4 w-4" />;
  };

  const menuContent = (
    <div
      ref={menuRef}
      style={menuStyle}
      className="w-80 bg-gray-900 border border-white/10 rounded-lg shadow-lg overflow-hidden"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-white/10 bg-white/5">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">
          Back History
        </div>
      </div>

      {/* Items */}
      <div className="max-h-96 overflow-y-auto">
        {historyItems.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-gray-500">
            No history available
          </div>
        ) : (
          <div className="py-1">
            {historyItems.map((item, index) => {
              const title = item.title || null;
              const snippet = item.contentId ? snippets.get(item.contentId) : null;

              return (
                <button
                  key={`${item.contentId}-${item.timestamp}-${index}`}
                  onClick={() => {
                    onSelectItem(item.contentId);
                    onClose();
                  }}
                  className="w-full px-3 py-2 flex items-start gap-2 hover:bg-white/5 transition-colors text-left"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {getIcon(item.contentType)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-200 truncate">
                      {title ?? (
                        <span className="text-gray-500 italic">No title</span>
                      )}
                    </div>
                    {snippet && (
                      <div className="text-xs text-gray-500 truncate mt-0.5">
                        {snippet}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(menuContent, document.body);
}
