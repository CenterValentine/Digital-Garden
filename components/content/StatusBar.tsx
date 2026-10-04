/**
 * Status Bar - Bottom status information
 *
 * Shows document stats, sync status, and other metadata.
 */

"use client";

import { AlertTriangle, CloudCheck, FileText, Clock } from "lucide-react";
import { useEditorStatsStore } from "@/state/editor-stats-store";
import { useContentStore } from "@/state/content-store";
import { useSaveConflictStore } from "@/state/save-conflict-store";

export function StatusBar() {
  const {
    fileType,
    wordCount,
    characterCount,
    lineCount,
    objectCount,
    lastSaved,
    isSaving
  } = useEditorStatsStore();

  // A conflict PAUSES every save for this document until it is resolved. Both
  // indicators below used to keep reporting "Saved 3m ago" and "Synced"
  // throughout — reassuring the user while their work piled up unsaved. The
  // status bar is the one place that claims to know save state, so it has to
  // be the one place that admits when saving has stopped.
  const selectedContentId = useContentStore((state) => state.selectedContentId);
  const hasConflict = useSaveConflictStore((state) =>
    selectedContentId ? Boolean(state.conflicts[selectedContentId]) : false,
  );

  // Format last saved time
  const getLastSavedText = () => {
    if (hasConflict) return "Not saved — resolve conflict";
    if (isSaving) return "Saving...";
    if (!lastSaved) return "Not saved";

    const now = new Date();
    const diffMs = now.getTime() - lastSaved.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);

    if (diffSecs < 10) return "Saved just now";
    if (diffSecs < 60) return `Saved ${diffSecs}s ago`;
    if (diffMins < 60) return `Saved ${diffMins}m ago`;
    if (diffHours < 24) return `Saved ${diffHours}h ago`;
    return `Saved ${Math.floor(diffHours / 24)}d ago`;
  };

  // Get file type label
  const getFileTypeLabel = () => {
    switch (fileType) {
      case "json":
        return "JSON";
      case "markdown":
        return "Markdown";
      default:
        return "File";
    }
  };

  return (
    <div className="flex items-center justify-between text-gray-400">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <FileText className="h-3 w-3" />
          <span>{getFileTypeLabel()}</span>
        </div>
        <div
          className={`flex items-center gap-1 ${
            hasConflict ? "font-medium text-red-500 dark:text-red-400" : ""
          }`}
        >
          {hasConflict ? (
            <AlertTriangle className="h-3 w-3" />
          ) : (
            <Clock className="h-3 w-3" />
          )}
          <span>{getLastSavedText()}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs">
          {fileType === "json" ? (
            <>
              <span>Ln {lineCount}</span>
              <span className="text-gray-600">•</span>
              <span>{characterCount.toLocaleString()} characters</span>
              <span className="text-gray-600">•</span>
              <span>{objectCount} {objectCount === 1 ? "object" : "objects"}</span>
            </>
          ) : (
            <>
              <span>{wordCount} words</span>
              <span className="text-gray-600">•</span>
              <span>{characterCount} characters</span>
            </>
          )}
        </div>
        <div
          className={`flex items-center gap-1 ${
            hasConflict ? "font-medium text-red-500 dark:text-red-400" : ""
          }`}
        >
          {hasConflict ? (
            <AlertTriangle className="h-3 w-3" />
          ) : (
            <CloudCheck className="h-3 w-3" />
          )}
          <span>
            {hasConflict ? "Paused" : isSaving ? "Syncing..." : "Synced"}
          </span>
        </div>
      </div>
    </div>
  );
}
