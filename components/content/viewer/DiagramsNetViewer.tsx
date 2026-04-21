/**
 * Diagrams.net Viewer Component
 *
 * Features:
 * - Iframe-based editor with postMessage API
 * - Theme selector (kennedy, atlas, dark, minimal)
 * - Auto-save with 2s debounce → Database only (no bucket)
 * - Full-screen mode (opens in new browser tab)
 * - Export: PNG, SVG, PDF, XML
 * - Y.js collaboration via collaborationRuntime prop
 *
 * Autosave Chain:
 * User Edit → postMessage → onChange → debounced → onSave prop →
 * PATCH API → Prisma.visualizationPayload.update() → PostgreSQL
 *
 * Collaboration:
 * Remote Y.js change → observer → editorRef.current.loadXml() → iframe postMessage
 * Local user edit → onChange → ydoc.transact(LOCAL_ORIGIN) → observer skipped (echo guard)
 */

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Network, ExternalLink, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/glass/button";
import { toast } from "sonner";
import { DiagramsNetEditor, type DiagramsNetEditorHandle } from "./DiagramsNetEditor";
import { DiagramsNetToolbar } from "./DiagramsNetToolbar";
import type { DiagramsNetConfig, DiagramsNetData, DiagramsNetTheme } from "@/lib/domain/visualization/types";
import type { CollaborationRuntimeHandle } from "@/lib/domain/collaboration/runtime";

// Transaction origin tag for local edits — lets the Y.js observer skip its own writes.
const LOCAL_ORIGIN = "diagramsnet-local";

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
  isFullScreen?: boolean;
  collaborationRuntime?: CollaborationRuntimeHandle | null;
}

export function DiagramsNetViewer({
  contentId,
  title,
  config = {},
  data = { xml: "" },
  onSave,
  isFullScreen = false,
  collaborationRuntime,
}: DiagramsNetViewerProps) {
  const [xml, setXml] = useState(data.xml || "");
  const xmlRef = useRef(data.xml || "");
  const [isModified, setIsModified] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [theme, setTheme] = useState<DiagramsNetTheme>(
    (config.theme as DiagramsNetTheme) || "kennedy"
  );

  // Ref to the editor's imperative handle so we can push remote updates into
  // the live iframe without re-triggering React state (which can't send
  // postMessages since the iframe's init event already fired).
  const editorRef = useRef<DiagramsNetEditorHandle | null>(null);

  // Auto-save with 2-second debounce
  const debouncedSave = useCallback(
    debounce(async (newXml: string) => {
      setIsSaving(true);
      try {
        await onSave?.(newXml);
        setLastSaved(new Date());
        setIsModified(false);
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

  // ── Y.js collaboration binding ──────────────────────────────────────────
  // Seed + remote-change observer. Uses LOCAL_ORIGIN echo guard so that
  // local edits written in handleChange don't loop back through here.
  useEffect(() => {
    const ydoc = collaborationRuntime?.ydoc;
    if (!ydoc) return;

    const ydocXml = ydoc.getText("xml");

    // Seed from Y.js if the shared doc already has content, otherwise seed
    // Y.js from the database snapshot so latecomers see the latest state.
    const existing = ydocXml.toString();
    if (existing.length > 0) {
      if (existing !== xmlRef.current) {
        xmlRef.current = existing;
        setXml(existing);
        // Push into the iframe immediately (if it's already ready; otherwise
        // DiagramsNetEditor will flush the pending xml on its next init).
        editorRef.current?.loadXml(existing);
      }
    } else if (data.xml && data.xml.length > 0) {
      ydoc.transact(() => {
        ydocXml.insert(0, data.xml!);
      }, LOCAL_ORIGIN);
    }

    const handleRemoteChange = (_event: unknown, transaction: { origin: unknown }) => {
      // Skip echo — this transaction was created by our own handleChange call.
      if (transaction.origin === LOCAL_ORIGIN) return;
      const remoteXml = ydocXml.toString();
      if (remoteXml !== xmlRef.current) {
        xmlRef.current = remoteXml;
        setXml(remoteXml);
        // Push directly to the live iframe via the imperative handle.
        editorRef.current?.loadXml(remoteXml);
      }
    };

    ydocXml.observe(handleRemoteChange);
    return () => ydocXml.unobserve(handleRemoteChange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collaborationRuntime?.ydoc]);

  // Handle diagram changes from iframe
  const handleChange = (newXml: string) => {
    xmlRef.current = newXml;
    setXml(newXml);
    setIsModified(true);

    // Sync to Y.js. Tag with LOCAL_ORIGIN so the observer above skips the echo.
    const ydoc = collaborationRuntime?.ydoc;
    if (ydoc) {
      const ydocXml = ydoc.getText("xml");
      ydoc.transact(() => {
        ydocXml.delete(0, ydocXml.length);
        ydocXml.insert(0, newXml);
      }, LOCAL_ORIGIN);
    }

    debouncedSave(newXml);
  };

  // Open in new browser tab (full-screen mode)
  const openFullscreen = () => {
    const url = `/content/visualization/${contentId}/fullscreen`;
    const newWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (!newWindow) {
      toast.error("Popup blocked", { description: "Please allow popups to open full-screen mode." });
    }
  };

  // Theme change → Update local state and re-render iframe
  const handleThemeChange = (newTheme: DiagramsNetTheme) => {
    setTheme(newTheme);
    toast.success(`Theme changed to ${newTheme}`);
  };

  // Export handler (PNG, SVG, PDF, XML)
  const handleExport = async (format: "png" | "svg" | "pdf" | "xml") => {
    try {
      if (format === "xml") {
        const blob = new Blob([xml], { type: "application/xml" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${title}.xml`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 100);
        toast.success("Exported as XML");
        return;
      }

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
            <Button onClick={openFullscreen} variant="ghost" size="sm" type="button">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Iframe Editor */}
      <div className="flex-1 relative">
        <DiagramsNetEditor
          ref={editorRef}
          xml={xml}
          theme={theme}
          onChange={handleChange}
        />
      </div>

      {/* Toolbelt (hidden in full-screen) */}
      {!isFullScreen && (
        <DiagramsNetToolbar
          theme={theme}
          onThemeChange={handleThemeChange}
          onExport={handleExport}
          onFullView={openFullscreen}
          isModified={isModified}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}
