/**
 * Export Settings Client Component
 *
 * Interactive settings panel for export & backup configuration.
 * Markdown options are session-local (they configure the next export,
 * not persisted preferences — same behavior as before, now controlled).
 */

"use client";

import { useState } from "react";
import { CalendarClock, Info } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/client/ui/button";
import { Checkbox } from "@/components/client/ui/checkbox";
import {
  RadioCardGroup,
  SettingRow,
  SettingSection,
  SettingsEmptyState,
} from "@/components/settings/ui";
import type { ExportBackupSettings } from "@/lib/domain/export/types";

interface Props {
  initialSettings: Partial<ExportBackupSettings>;
  userId: string;
}

type ExportFormat = "markdown" | "html" | "json" | "txt" | "pdf" | "docx";

const FORMAT_OPTIONS = [
  { value: "markdown" as ExportFormat, title: "Markdown", description: "Obsidian-compatible." },
  { value: "html" as ExportFormat, title: "HTML", description: "Standalone document." },
  { value: "json" as ExportFormat, title: "JSON", description: "Lossless TipTap." },
  { value: "txt" as ExportFormat, title: "Plain text", description: "Text only, no formatting." },
  { value: "pdf" as ExportFormat, title: "PDF", description: "Not yet implemented.", disabled: true },
  { value: "docx" as ExportFormat, title: "DOCX", description: "Not yet implemented.", disabled: true },
];

export function ExportSettingsClient({ initialSettings }: Props) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>(
    (initialSettings.defaultFormat as ExportFormat) || "markdown"
  );

  // Session-local markdown options for the next export.
  const [markdownOptions, setMarkdownOptions] = useState({
    metadataSidecar: true,
    yamlFrontmatter: true,
    preserveSemantics: true,
    obsidianWikiLinks: true,
  });

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
      toast.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const markdownOptionRows: Array<{
    key: keyof typeof markdownOptions;
    label: string;
    description: string;
  }> = [
    {
      key: "metadataSidecar",
      label: "Include metadata sidecar (.meta.json)",
      description: "Preserves tag colors, wiki-link targets, and callout types.",
    },
    {
      key: "yamlFrontmatter",
      label: "Include YAML frontmatter",
      description: "Title, dates, and tags at the top of each file.",
    },
    {
      key: "preserveSemantics",
      label: "Preserve semantics (HTML comments)",
      description: "Round-trippable markers for tags and custom blocks.",
    },
    {
      key: "obsidianWikiLinks",
      label: "Use Obsidian-style [[wiki links]]",
      description: "Keep [[links]] instead of converting to standard Markdown.",
    },
  ];

  return (
    <>
      <SettingSection
        title="Export Format"
        description="Format used for exports from this page."
      >
        <RadioCardGroup
          aria-label="Export format"
          value={exportFormat}
          onValueChange={(next) => setExportFormat(next)}
          options={FORMAT_OPTIONS}
          columns={3}
        />

        {exportFormat === "markdown" && (
          <div className="space-y-4 border-t border-black/10 pt-4 dark:border-white/10">
            <p className="text-sm font-medium">Markdown options</p>
            {markdownOptionRows.map((option) => (
              <SettingRow
                key={option.key}
                label={option.label}
                description={option.description}
                htmlFor={`md-${option.key}`}
              >
                <Checkbox
                  id={`md-${option.key}`}
                  checked={markdownOptions[option.key]}
                  onCheckedChange={(checked) =>
                    setMarkdownOptions((prev) => ({
                      ...prev,
                      [option.key]: checked === true,
                    }))
                  }
                />
              </SettingRow>
            ))}
          </div>
        )}
      </SettingSection>

      <SettingSection
        title="Bulk Export"
        description="Download your whole vault as a ZIP archive."
      >
        <SettingRow
          label="Export entire vault"
          description={`All notes and files in ${exportFormat.toUpperCase()} format.${
            initialSettings.bulkExport?.includeStructure
              ? " Folder hierarchy will be preserved."
              : ""
          }`}
        >
          <Button onClick={handleBulkExport} disabled={isExporting}>
            {isExporting ? "Exporting…" : "Export vault"}
          </Button>
        </SettingRow>
      </SettingSection>

      <SettingSection
        title="Automated Backup"
        description="Scheduled backups to cloud storage."
        action={
          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
            Soon
          </span>
        }
      >
        <SettingsEmptyState
          icon={<CalendarClock />}
          title="Not available yet"
          description="Automatic scheduled backups to cloud storage will arrive in a future update."
        />
      </SettingSection>

      <div className="flex gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-700 dark:text-blue-400" aria-hidden />
        <div>
          <p className="mb-1 text-sm font-semibold text-blue-700 dark:text-blue-400">
            About metadata sidecars
          </p>
          <p className="text-sm text-muted-foreground">
            When exporting to Markdown with metadata enabled, each note
            includes a{" "}
            <code className="rounded bg-black/10 px-1 py-0.5 dark:bg-white/10">
              .meta.json
            </code>{" "}
            file. This preserves semantic information like tag colors,
            wiki-link relationships, and callout types that can&apos;t be
            represented in pure Markdown.
          </p>
        </div>
      </div>
    </>
  );
}
