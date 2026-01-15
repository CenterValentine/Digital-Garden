/**
 * Main Panel Header / Tab Bar (Server Component)
 *
 * Renders immediately to show tab structure.
 */

import { FileText, X } from "lucide-react";
import { getSurfaceStyles } from "@/lib/design-system";

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
