/**
 * Icon Selector Component
 *
 * Compact tooltip-style icon/emoji picker for customizing content icons.
 * Features:
 * - Searchable lucide-react icons
 * - Emoji picker
 * - Tab-based interface
 * - Positioned near click location
 * - No backdrop/modal overlay
 */

"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import * as LucideIcons from "lucide-react";
import { X, Search } from "lucide-react";
import { calculateMenuPosition } from "@/lib/core/menu-positioning";

interface IconSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectIcon: (icon: string) => void;
  currentIcon?: string | null;
  triggerPosition: { x: number; y: number };
}

// Get all lucide icon names (filter out non-icon exports)
// Lucide exports icons as PascalCase React components
const lucideIconNames = Object.keys(LucideIcons).filter(
  (key) =>
    // Keep PascalCase names (icon components)
    /^[A-Z]/.test(key) &&
    // Exclude known non-icon exports
    key !== "Icon" &&
    key !== "IconNode" &&
    key !== "LucideProps"
);

/**
 * Convert PascalCase icon name to spaced display name
 * Examples:
 * - "AArrowUp" → "A Arrow Up"
 * - "FileText" → "File Text"
 * - "ChevronRight" → "Chevron Right"
 * - "LayoutDashboard" → "Layout Dashboard"
 */
function formatIconName(name: string): string {
  return name
    // Insert space before uppercase letters that follow lowercase/digit
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    // Insert space before uppercase letter that follows uppercase+lowercase (for acronyms)
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .trim();
}

export function IconSelector({
  isOpen,
  onClose,
  onSelectIcon,
  currentIcon,
  triggerPosition,
}: IconSelectorProps) {
  const [activeTab, setActiveTab] = useState<"icons" | "emoji">("icons");
  const [searchQuery, setSearchQuery] = useState("");
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Filter icons based on search query (fuzzy/substring match)
  const filteredIcons = useMemo(() => {
    if (!searchQuery) return lucideIconNames.slice(0, 100); // Limit to first 100 for performance

    const query = searchQuery.toLowerCase();
    return lucideIconNames
      .filter((iconName) => {
        // Search both the original name and formatted name
        const formattedName = formatIconName(iconName).toLowerCase();
        return iconName.toLowerCase().includes(query) || formattedName.includes(query);
      })
      .slice(0, 100);
  }, [searchQuery]);

  // Two-phase rendering: measure then position
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

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setActiveTab("icons"); // Default to icons tab
    }
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Handle clicks outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Delay to avoid closing immediately after opening
    const timeout = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleIconSelect = (iconName: string) => {
    onSelectIcon(`lucide:${iconName}`);
    onClose();
  };

  const handleEmojiSelect = (emoji: string) => {
    onSelectIcon(`emoji:${emoji}`);
    onClose();
  };

  const menuStyle = !menuPosition
    ? { visibility: "hidden" as const }
    : { left: `${menuPosition.x}px`, top: `${menuPosition.y}px` };

  // Common emoji list (expandable)
  const commonEmojis = [
    "📄", "📁", "📝", "📊", "📈", "📉", "📅", "📆",
    "💼", "📋", "📌", "📍", "🔖", "🏷️", "📎", "🔗",
    "💡", "⚡", "🔥", "⭐", "✨", "🎯", "🎨", "🎭",
    "🚀", "🔧", "🔨", "⚙️", "🛠️", "🔑", "🔒", "🔓",
    "📚", "📖", "📕", "📗", "📘", "📙", "📜", "📃",
    "🎓", "🎪", "🎬", "🎤", "🎧", "🎵", "🎶", "🎸",
    "💻", "⌨️", "🖥️", "🖨️", "💾", "💿", "📱", "☎️",
  ];

  const content = (
    <div
      ref={menuRef}
      className="fixed z-[200] w-80 max-h-[400px] rounded-lg border border-white/10 bg-[#1a1a1a] shadow-2xl flex flex-col"
      style={menuStyle}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <h3 className="text-xs font-semibold text-white">Choose Icon</h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X className="h-3 w-3 text-gray-400" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setActiveTab("icons")}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === "icons"
              ? "border-b-2 border-primary text-primary"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Icons ({lucideIconNames.length})
        </button>
        <button
          onClick={() => setActiveTab("emoji")}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === "emoji"
              ? "border-b-2 border-primary text-primary"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Emoji
        </button>
      </div>

      {/* Search (Icons tab only) */}
      {activeTab === "icons" && (
        <div className="px-3 py-2 border-b border-white/10">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
            <input
              type="text"
              placeholder="Search icons..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-2 py-1.5 text-xs border border-white/10 rounded bg-black/20 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary"
              autoFocus
            />
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === "icons" ? (
          <div className="grid grid-cols-6 gap-1">
            {filteredIcons.length > 0 ? (
              filteredIcons.map((iconName) => {
                const IconComponent = (LucideIcons as any)[iconName];
                const isSelected = currentIcon === `lucide:${iconName}`;
                const displayName = formatIconName(iconName);

                if (!IconComponent) return null;

                return (
                  <button
                    key={iconName}
                    onClick={() => handleIconSelect(iconName)}
                    className={`p-2 rounded hover:bg-white/10 transition-colors flex items-center justify-center ${
                      isSelected ? "bg-primary/10 ring-1 ring-primary/30" : ""
                    }`}
                    title={displayName}
                  >
                    <IconComponent className="h-4 w-4 text-white" />
                  </button>
                );
              })
            ) : (
              <div className="col-span-6 text-center py-6 text-xs text-gray-500">
                No icons found for "{searchQuery}"
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-8 gap-1">
            {commonEmojis.map((emoji) => {
              const isSelected = currentIcon === `emoji:${emoji}`;

              return (
                <button
                  key={emoji}
                  onClick={() => handleEmojiSelect(emoji)}
                  className={`p-1.5 rounded text-lg hover:bg-white/10 transition-colors ${
                    isSelected ? "bg-primary/10 ring-1 ring-primary/30" : ""
                  }`}
                  title={emoji}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-white/10 px-3 py-1.5 text-[10px] text-gray-500">
        {activeTab === "icons"
          ? `${filteredIcons.length} / ${lucideIconNames.length} icons`
          : `${commonEmojis.length} emojis`}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
