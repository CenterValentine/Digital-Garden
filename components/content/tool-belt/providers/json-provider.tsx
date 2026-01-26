/**
 * JSON Tool Belt Provider
 *
 * Provides file actions specific to JSON files:
 * - Format/Pretty Print
 * - Copy to Clipboard
 * - Revert Changes
 * - Save (with Cmd+S shortcut)
 * - Validate JSON
 */

import { Save, Copy, RotateCcw, Download } from "lucide-react";
import type { ToolBeltConfig, FileContext } from "../types";

export interface JSONToolBeltContext {
  /** Current JSON content */
  content: string;
  /** Original content (for revert) */
  originalContent: string;
  /** Does the file have unsaved changes? */
  hasUnsavedChanges: boolean;
  /** Is currently saving? */
  isSaving: boolean;
  /** Format JSON handler */
  onFormat: () => void;
  /** Copy to clipboard handler */
  onCopy: () => void;
  /** Revert to original handler */
  onRevert: () => void;
  /** Save changes handler */
  onSave: () => void;
  /** Download file handler */
  onDownload: () => void;
}

/**
 * Generate tool belt config for JSON files
 */
export function getJSONToolBeltConfig(
  fileContext: FileContext,
  jsonContext: JSONToolBeltContext
): ToolBeltConfig {
  const { hasUnsavedChanges, isSaving, onFormat, onCopy, onRevert, onSave, onDownload } =
    jsonContext;

  return {
    position: "center",
    style: "compact",
    groups: [
      {
        id: "edit-actions",
        actions: [
          {
            id: "format",
            label: "Format",
            onClick: onFormat,
            variant: "default",
            tooltip: "Format and pretty-print JSON",
          },
          {
            id: "copy",
            label: "Copy",
            icon: <Copy className="h-3 w-3" />,
            onClick: onCopy,
            variant: "default",
            tooltip: "Copy JSON to clipboard",
          },
          {
            id: "download",
            label: "Download",
            icon: <Download className="h-3 w-3" />,
            onClick: onDownload,
            variant: "default",
            tooltip: "Download JSON file",
          },
        ],
      },
      {
        id: "save-actions",
        separator: true,
        actions: [
          {
            id: "revert",
            label: "Revert",
            icon: <RotateCcw className="h-3 w-3" />,
            onClick: onRevert,
            variant: "warning",
            tooltip: "Revert to last saved version",
            hidden: !hasUnsavedChanges,
          },
          {
            id: "save",
            label: isSaving ? "Saving..." : "Save",
            icon: <Save className="h-4 w-4" />,
            onClick: onSave,
            variant: "primary",
            disabled: !hasUnsavedChanges || isSaving,
            tooltip: "Save changes (⌘S)",
            shortcut: "⌘S",
          },
        ],
      },
    ],
  };
}
