/**
 * Diagrams.net Viewer Component
 *
 * Features:
 * - Iframe-based editor with postMessage API
 * - Theme selector (kennedy, atlas, dark, minimal)
 * - Auto-save with 2s debounce → Database only (no bucket)
 * - Full-screen mode (opens in new browser tab)
 * - Export: PNG, SVG, PDF, XML
 * - Collaboration stub (structure only)
 *
 * Autosave Chain:
 * User Edit → postMessage → onChange → debounced → onSave prop →
 * PATCH API → Prisma.visualizationPayload.update() → PostgreSQL
 */

"use client";

import { useState, useCallback, useEffect } from "react";
import { Network, ExternalLink, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/glass/button";
import { toast } from "sonner";
import { DiagramsNetEditor } from "./DiagramsNetEditor";
import { DiagramsNetToolbar } from "./DiagramsNetToolbar";
import { useCollaboration } from "@/lib/domain/visualization/diagrams-net/use-collaboration";
import type { DiagramsNetConfig, DiagramsNetData, DiagramsNetTheme } from "@/lib/domain/visualization/types";

// Debounce utility
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

interface DiagramsNetViewerProps {
  contentId: string;
  title: string;
  config?: Partial<DiagramsNetConfig>;
  data?: DiagramsNetData;
  onSave?: (xml: string) => Promise<void>;
  isFullScreen?: boolean; // Used in full-screen page
}

export function DiagramsNetViewer({
  contentId,
  title,
  config = {},
  data = { xml: "" },
  onSave,
  isFullScreen = false,
}: DiagramsNetViewerProps) {
  const [xml, setXml] = useState(data.xml || "");
  const [isModified, setIsModified] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [theme, setTheme] = useState<DiagramsNetTheme>(
    (config.theme as DiagramsNetTheme) || "kennedy"
  );

  // Collaboration stub
  const { isConnected, collaborators, startCollaboration } = useCollaboration(contentId);

  // Auto-save with 2-second debounce
  // Chain: onChange → debouncedSave → onSave prop → PATCH API → Prisma → PostgreSQL
  const debouncedSave = useCallback(
    debounce(async (newXml: string) => {
      setIsSaving(true);
      try {
        await onSave?.(newXml);
        setLastSaved(new Date());
        setIsModified(false);
        // Silent success (no toast on auto-save)
      } catch (error: any) {
        console.error("Diagrams.net save failed:", error);
        toast.error("Failed to save diagram", {
          description: error.message || "Could not save changes to database",
        });
      } finally {
        setIsSaving(false);
      }
    }, 2000),
    [onSave]
  );

  // Handle diagram changes from iframe
  const handleChange = (newXml: string) => {
    setXml(newXml);
    setIsModified(true);
    debouncedSave(newXml);
  };

  // Open in new browser tab (full-screen mode)
  const openFullscreen = () => {
    console.log("[DiagramsNetViewer] openFullscreen called, contentId:", contentId);
    try {
      const url = `/content/visualization/${contentId}/fullscreen`;
      console.log("[DiagramsNetViewer] Opening URL:", url);
      const newWindow = window.open(url, "_blank", "noopener,noreferrer");
      console.log("[DiagramsNetViewer] window.open result:", newWindow);
      if (!newWindow) {
        console.error("[DiagramsNetViewer] window.open returned null - popup may be blocked");
      }
    } catch (error) {
      console.error("[DiagramsNetViewer] Error opening fullscreen:", error);
    }
  };

  // Theme change → Update local state and re-render iframe
  const handleThemeChange = (newTheme: DiagramsNetTheme) => {
    setTheme(newTheme);
    toast.success(`Theme changed to ${newTheme}`);
    // Note: Theme is passed to DiagramsNetEditor, which updates iframe URL
  };

  // Export handler (PNG, SVG, PDF, XML)
  const handleExport = async (format: "png" | "svg" | "pdf" | "xml") => {
    try {
      if (format === "xml") {
        // Direct XML download
        const blob = new Blob([xml], { type: "application/xml" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${title}.xml`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Delay cleanup to ensure download starts
        setTimeout(() => URL.revokeObjectURL(url), 100);
        toast.success("Exported as XML");
        return;
      }

      // For PNG/SVG/PDF, use server-side export API
      toast.info(`Exporting as ${format.toUpperCase()}...`);

      const response = await fetch("/api/visualization/diagrams-net/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xml, format, scale: 2 }),
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${title}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Delay cleanup to ensure download starts
      setTimeout(() => URL.revokeObjectURL(url), 100);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (error: any) {
      console.error("Export failed:", error);
      toast.error("Export failed", {
        description: error.message || `Could not export as ${format.toUpperCase()}`,
      });
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header (hidden in full-screen mode) */}
      {!isFullScreen && (
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <Network className="h-5 w-5 text-blue-400" />
            <h1 className="text-lg font-semibold">{title}</h1>
            {/* Auto-save indicator */}
            {isModified && (
              <span className="text-xs text-yellow-400">Unsaved changes</span>
            )}
            {isSaving && (
              <Loader2 className="h-3 w-3 animate-spin text-yellow-400" />
            )}
            {!isModified && !isSaving && lastSaved && (
              <Check className="h-3 w-3 text-green-400" />
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Full view button (opens new tab) */}
            <Button onClick={openFullscreen} variant="ghost" size="sm" type="button">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Iframe Editor */}
      <div className="flex-1 relative">
        <DiagramsNetEditor
          xml={xml}
          theme={theme}
          onChange={handleChange}
        />
      </div>

      {/* Toolbelt (minimal in full-screen) */}
      {!isFullScreen && (
        <DiagramsNetToolbar
          theme={theme}
          onThemeChange={handleThemeChange}
          onExport={handleExport}
          onFullView={openFullscreen}
          isModified={isModified}
          isSaving={isSaving}
          collaborators={collaborators}
          onStartCollaboration={startCollaboration}
        />
      )}
    </div>
  );
}
