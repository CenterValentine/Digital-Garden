/**
 * Navigation History Dropdown
 *
 * Shows navigation history when holding down the back button.
 * Features:
 * - Compact list with file name and preview
 * - Max height with scrolling
 * - Click to navigate to history item
 * - Portal rendering with boundary-aware positioning
 */

"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import type { NavigationHistoryItem } from "@/state/navigation-history-store";
import { calculateMenuPosition } from "@/lib/core/menu-positioning";
import { getContentTypeIcon } from "@/lib/domain/content/types";
import * as LucideIcons from "lucide-react";

interface PreviewData {
  id: string;
  title: string;
  contentType: string;
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
  const [previews, setPreviews] = useState<Map<string, PreviewData>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

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

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Fetch previews for history items (lazy load)
  useEffect(() => {
    if (!isOpen || historyItems.length === 0) return;

    const contentIds = historyItems
      .map((item) => item.contentId)
      .filter((id): id is string => id !== null);

    if (contentIds.length === 0) return;

    setIsLoading(true);

    fetch("/api/content/content/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentIds }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.previews) {
          const previewMap = new Map<string, PreviewData>();
          data.previews.forEach((preview: PreviewData) => {
            previewMap.set(preview.id, preview);
          });
          setPreviews(previewMap);
        }
      })
      .catch((err) => {
        console.error("[NavigationHistoryDropdown] Failed to fetch previews:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen, historyItems]);

  // Calculate menu position (two-phase rendering)
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
    : {
        position: "fixed" as const,
        left: `${menuPosition.x}px`,
        top: `${menuPosition.y}px`,
        zIndex: 9999,
      };

  const getIcon = (contentType: string) => {
    const iconName = getContentTypeIcon(contentType as any);
    const LucideIcon = (LucideIcons as any)[iconName];
    return LucideIcon ? <LucideIcon className="h-4 w-4 text-gray-400" /> : null;
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

      {/* Content */}
      <div className="max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="px-3 py-4 text-center text-sm text-gray-500">
            Loading previews...
          </div>
        ) : historyItems.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-gray-500">
            No history available
          </div>
        ) : (
          <div className="py-1">
            {historyItems.map((item, index) => {
              const preview = item.contentId ? previews.get(item.contentId) : null;

              return (
                <button
                  key={`${item.contentId}-${item.timestamp}-${index}`}
                  onClick={() => {
                    onSelectItem(item.contentId);
                    onClose();
                  }}
                  className="w-full px-3 py-2 flex items-start gap-2 hover:bg-white/5 transition-colors text-left"
                >
                  {/* Icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    {preview ? getIcon(preview.contentType) : <div className="h-4 w-4" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Title */}
                    <div className="text-sm font-medium text-gray-200 truncate">
                      {preview ? preview.title : item.contentId || "Unknown"}
                    </div>

                    {/* Preview */}
                    {preview && preview.preview && (
                      <div className="text-xs text-gray-400 truncate mt-0.5">
                        {preview.preview}
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
