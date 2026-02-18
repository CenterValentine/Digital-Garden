/**
 * Debug View Toggle Component
 *
 * Floating button in top-right corner to switch between debug view modes.
 * Only renders in development mode.
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { Bug, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/glass/button";
import { useDebugViewStore, type DebugViewMode } from "@/state/debug-view-store";
import { getSurfaceStyles } from "@/lib/design/system";

const VIEW_MODES: Array<{ value: DebugViewMode; label: string; description: string }> = [
  { value: "json", label: "JSON", description: "Raw TipTap document structure" },
  { value: "tree", label: "Tree", description: "ProseMirror-like hierarchy" },
  { value: "markdown", label: "Markdown", description: "Export preview" },
  { value: "metadata", label: "Metadata", description: "Stats and extracted content" },
];

export function DebugViewToggle() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { isDebugPanelVisible, toggleDebugPanel, viewMode, setViewMode } = useDebugViewStore();

  // Only render in development mode
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleViewModeChange = (mode: DebugViewMode) => {
    setViewMode(mode);
    setIsOpen(false);

    // If debug panel is not visible, show it when user selects a view mode
    if (!isDebugPanelVisible) {
      toggleDebugPanel();
    }
  };

  const currentMode = VIEW_MODES.find((m) => m.value === viewMode) || VIEW_MODES[0];
  const glass1 = getSurfaceStyles("glass-1");

  return (
    <div className="relative">
      {/* Main toggle button */}
      <div className="flex gap-2">
        <Button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          size="sm"
          variant="ghost"
          className="gap-2 border border-white/10 relative group"
          style={{
            background: glass1.background,
            backdropFilter: glass1.backdropFilter,
          }}
        >
          <Bug className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">{currentMode.label}</span>
          <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />

          {/* Active indicator */}
          {isDebugPanelVisible && (
            <span className="absolute -top-1 -right-1 h-2 w-2 bg-green-500 rounded-full border border-black/50" />
          )}
        </Button>

        {/* Quick toggle button */}
        <Button
          onClick={toggleDebugPanel}
          size="sm"
          variant={isDebugPanelVisible ? "default" : "ghost"}
          className="border border-white/10"
          style={{
            background: isDebugPanelVisible ? "rgba(34, 197, 94, 0.2)" : glass1.background,
            backdropFilter: glass1.backdropFilter,
          }}
          title="Toggle debug panel (Cmd+Shift+D)"
        >
          {isDebugPanelVisible ? "Hide" : "Show"}
        </Button>
      </div>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          ref={menuRef}
          className="absolute top-full right-0 mt-2 w-64 border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden"
          style={{
            background: glass1.background,
            backdropFilter: glass1.backdropFilter,
          }}
        >
          <div className="p-2 space-y-1">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.value}
                onClick={() => handleViewModeChange(mode.value)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  viewMode === mode.value
                    ? "bg-white/10 text-foreground"
                    : "text-gray-300 hover:bg-white/5 hover:text-foreground"
                }`}
              >
                <div className="font-medium">{mode.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{mode.description}</div>
              </button>
            ))}
          </div>

          <div className="border-t border-white/10 px-3 py-2 text-[10px] text-gray-500">
            Press <kbd className="px-1 py-0.5 bg-black/30 rounded">Cmd+Shift+D</kbd> to toggle
          </div>
        </div>
      )}
    </div>
  );
}
