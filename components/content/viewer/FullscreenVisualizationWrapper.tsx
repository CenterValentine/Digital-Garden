/**
 * Fullscreen Visualization Wrapper (Client Component)
 *
 * Handles client-side interactions for fullscreen mode:
 * - Close button with window.close()
 * - Escape key handler
 * - Toaster notifications
 */

"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { Toaster } from "sonner";

interface FullscreenVisualizationWrapperProps {
  children: React.ReactNode;
  title: string;
  engine: string;
}

export function FullscreenVisualizationWrapper({
  children,
  title,
  engine,
}: FullscreenVisualizationWrapperProps) {
  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        window.close();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      {/* Fullscreen view with navigation bar visible (adds top padding to avoid masking) */}
      <div className="fixed inset-0 pt-[56px] bg-black flex flex-col">
        {/* Viewer (no header in full screen, isFullScreen=true hides header) */}
        <div className="flex-1 overflow-hidden">{children}</div>

        {/* Status Bar (bottom) */}
        <div className="h-10 bg-gray-900 border-t border-white/10 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{title}</span>
            <span className="text-xs text-gray-600">•</span>
            <span className="text-xs text-gray-500 capitalize">{engine}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Auto-save: Enabled</span>
          </div>
        </div>

        {/* Close button (closes browser tab) */}
        <button
          onClick={() => window.close()}
          className="fixed top-4 right-4 z-50 p-2 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur-sm transition-colors group"
          aria-label="Close full screen"
          title="Close full screen (Esc)"
        >
          <X className="h-4 w-4 text-white group-hover:text-gray-300" />
        </button>
      </div>

      {/* Toaster works in full screen (top-right corner) */}
      <Toaster position="top-right" />
    </>
  );
}
