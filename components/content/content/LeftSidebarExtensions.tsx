/**
 * Left Sidebar Extensions View
 *
 * Placeholder view for future extensions functionality.
 * Will eventually show installed extensions, settings, and marketplace.
 */

"use client";

import { Puzzle } from "lucide-react";

export function LeftSidebarExtensions() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <Puzzle className="h-16 w-16 text-gray-500 mb-4" />
      <h3 className="text-lg font-semibold text-white mb-2">Extensions</h3>
      <p className="text-sm text-gray-400 max-w-xs">
        Extensions functionality coming soon. This will allow you to add custom features and
        integrations to your Digital Garden.
      </p>
    </div>
  );
}
