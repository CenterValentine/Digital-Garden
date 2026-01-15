/**
 * Status Bar - Bottom status information
 *
 * Shows document stats, sync status, and other metadata.
 */

"use client";

import { CloudCheck, FileText, Clock } from "lucide-react";

export function StatusBar() {
  return (
    <div className="flex items-center justify-between text-gray-400">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <FileText className="h-3 w-3" />
          <span>Markdown</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>Saved 2m ago</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div>245 words</div>
        <div className="flex items-center gap-1">
          <CloudCheck className="h-3 w-3" />
          <span>Synced</span>
        </div>
      </div>
    </div>
  );
}
