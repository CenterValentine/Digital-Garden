/**
 * Main Panel Header / Tab Bar (Server Component)
 *
 * Shows the filename tab for the active document.
 * Renders immediately to show tab structure without JS.
 *
 * TODO: Make filename dynamic based on selected content
 * TODO: Implement tab close functionality
 * TODO: Support multiple tabs for multi-note views
 */

import { FileText, X } from "lucide-react";
import { getSurfaceStyles } from "@/lib/design/system";

export function MainPanelHeader() {
  const glass1 = getSurfaceStyles("glass-1");

  return (
    <div
      className="flex shrink-0 items-center border-b border-white/10"
      style={{
        background: glass1.background,
        backdropFilter: glass1.backdropFilter,
      }}
    >
      {/* TODO: Replace hardcoded filename with dynamic content title */}
      <div className="flex items-center gap-1 border-r border-white/10 px-3 py-2 text-sm">
        <FileText className="h-4 w-4" />
        <span>Welcome.md</span>
        <button className="ml-2 rounded p-0.5 transition-colors hover:bg-white/10">
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
