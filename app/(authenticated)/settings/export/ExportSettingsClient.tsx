/**
 * Export Settings Client Component
 *
 * Interactive settings panel for export & backup configuration
 */

"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ExportBackupSettings } from "@/lib/domain/export/types";

interface Props {
  initialSettings: Partial<ExportBackupSettings>;
  userId: string;
}

export function ExportSettingsClient({ initialSettings, userId }: Props) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState(
    initialSettings.defaultFormat || "markdown"
  );

  /**
   * Trigger bulk vault export
   */
  const handleBulkExport = async () => {
    try {
      setIsExporting(true);

      toast.info(`Preparing ${exportFormat.toUpperCase()} export...`);

      const response = await fetch("/api/content/export/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: exportFormat,
          filters: {
            includeDeleted: false,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Export failed");
      }

      // Download the ZIP file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vault-export-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("Export complete! Download started.");
    } catch (error) {
      console.error("[Export] Failed:", error);
      toast.error(
        error instanceof Error ? error.message : "Export failed"
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Format Selection */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Export Format</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {(
            [
              "markdown",
              "html",
              "json",
              "txt",
              "pdf",
              "docx",
            ] as const
          ).map((format) => (
            <button
              key={format}
              onClick={() => setExportFormat(format)}
              className={`
                p-4 rounded-lg border-2 transition-all
                ${
                  exportFormat === format
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-gray-700 bg-gray-800/50 text-gray-300 hover:border-gray-600"
                }
              `}
            >
              <div className="font-semibold uppercase">{format}</div>
              <div className="text-xs mt-1 opacity-70">
                {format === "markdown" && "Obsidian-compatible"}
                {format === "html" && "Standalone document"}
                {format === "json" && "Lossless TipTap"}
                {format === "txt" && "Plain text"}
                {format === "pdf" && "Not yet implemented"}
                {format === "docx" && "Not yet implemented"}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Markdown Options */}
      {exportFormat === "markdown" && (
        <div className="space-y-4 p-4 rounded-lg bg-gray-800/50 border border-gray-700">
          <h3 className="font-semibold">Markdown Options</h3>
          <div className="space-y-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded" />
              <span>Include metadata sidecar (.meta.json)</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded" />
              <span>Include YAML frontmatter</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded" />
              <span>Preserve semantics (HTML comments)</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded" />
              <span>Use Obsidian-style [[wiki links]]</span>
            </label>
          </div>
        </div>
      )}

      {/* Bulk Export Action */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Bulk Export</h2>
        <div className="p-6 rounded-lg bg-gray-800/50 border border-gray-700">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold">Export Entire Vault</h3>
              <p className="text-sm text-gray-400 mt-1">
                Download all your notes as a ZIP archive in{" "}
                {exportFormat.toUpperCase()} format
              </p>
              {initialSettings.bulkExport?.includeStructure && (
                <p className="text-xs text-gray-500 mt-2">
                  ✓ Folder hierarchy will be preserved
                </p>
              )}
            </div>
            <button
              onClick={handleBulkExport}
              disabled={isExporting}
              className={`
                px-6 py-2 rounded-lg font-semibold transition-all
                ${
                  isExporting
                    ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                    : "bg-primary hover:bg-primary/90 text-white"
                }
              `}
            >
              {isExporting ? "Exporting..." : "Export Vault"}
            </button>
          </div>
        </div>
      </div>

      {/* Automated Backup (Coming Soon) */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          Automated Backup
          <span className="px-2 py-0.5 text-xs rounded-full bg-primary/20 text-primary">
            Coming Soon
          </span>
        </h2>
        <div className="p-6 rounded-lg bg-gray-800/30 border border-gray-700 opacity-60">
          <p className="text-sm text-gray-400">
            Automatic scheduled backups to cloud storage will be available in a
            future update.
          </p>
        </div>
      </div>

      {/* Info Box */}
      <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
        <h3 className="font-semibold text-blue-400 mb-2">
          About Metadata Sidecars
        </h3>
        <p className="text-sm text-gray-300">
          When exporting to Markdown with metadata enabled, each note will
          include a <code className="px-1 py-0.5 rounded bg-gray-800">.meta.json</code> file.
          This preserves semantic information like tag colors, wiki-link
          relationships, and callout types that can't be represented in pure
          Markdown.
        </p>
      </div>
    </div>
  );
}
