/**
 * Mermaid Viewer Component
 *
 * Features:
 * - Text-based diagram creation
 * - Toggle view/edit mode
 * - Live preview with split-pane editor
 * - Auto-save with 2-second debounce
 * - Export to PNG/SVG/Markdown
 * - Syntax validation
 */

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { GitBranch, Loader2, Check, ExternalLink, Code, Eye } from "lucide-react";
import { Button } from "@/components/ui/glass/button";
import { MermaidToolbar } from "./MermaidToolbar";
import { toast } from "sonner";

// Dynamically import mermaid to avoid SSR issues
const initializeMermaid = async () => {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    securityLevel: "strict", // Prevent XSS
    fontFamily: "monospace",
  });
  return mermaid;
};

interface MermaidViewerProps {
  contentId: string;
  title: string;
  config?: Record<string, unknown>;
  data?: {
    source?: string;
  };
  onSave?: (source: string) => Promise<void>;
  isFullScreen?: boolean;
}

export function MermaidViewer({
  contentId,
  title,
  config,
  data,
  onSave,
  isFullScreen = false,
}: MermaidViewerProps) {
  const [source, setSource] = useState(data?.source || "graph TD\n    A[Start] --> B[End]");
  const [isEditMode, setIsEditMode] = useState(false);
  const [isModified, setIsModified] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [mermaidReady, setMermaidReady] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const mermaidRef = useRef<any>(null);

  // Initialize Mermaid
  useEffect(() => {
    initializeMermaid().then((mermaid) => {
      mermaidRef.current = mermaid;
      setMermaidReady(true);
    });
  }, []);

  // Debounced save function
  const debouncedSave = useCallback(
    (() => {
      let timeoutId: NodeJS.Timeout;
      return async (source: string) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(async () => {
          if (!onSave) return;

          setIsSaving(true);
          try {
            await onSave(source);
            setLastSaved(new Date());
            setIsModified(false);
            console.log("[MermaidViewer] Auto-saved successfully");
          } catch (error: any) {
            console.error("[MermaidViewer] Save failed:", error);
            toast.error("Failed to save diagram", {
              description: error.message || "Could not save changes",
            });
          } finally {
            setIsSaving(false);
          }
        }, 2000);
      };
    })(),
    [onSave]
  );

  // Handle source change
  const handleSourceChange = (newSource: string) => {
    setSource(newSource);
    setIsModified(true);
    debouncedSave(newSource);
  };

  // Handle template insertion
  const handleInsertTemplate = (template: string) => {
    setSource(template);
    setIsModified(true);
    debouncedSave(template);
    setIsEditMode(true); // Switch to edit mode to show the inserted template
  };

  // Render Mermaid diagram with validation
  useEffect(() => {
    if (!mermaidReady || !mermaidRef.current || !previewRef.current || !source) {
      return;
    }

    const renderDiagram = async () => {
      try {
        // Pre-validate syntax before rendering
        await mermaidRef.current.parse(source);

        // If valid, render the diagram
        previewRef.current!.innerHTML = "";
        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaidRef.current.render(id, source);
        previewRef.current!.innerHTML = svg;
        setRenderError(null);
      } catch (error: any) {
        console.error("[MermaidViewer] Render error:", error);
        const errorMessage = error.message || "Syntax error";
        setRenderError(errorMessage);

        // Show toast with detailed error
        toast.error("Mermaid Syntax Error", {
          description: errorMessage,
          duration: 5000,
        });

        // Show inline error without the mermaid error icon
        previewRef.current!.innerHTML = `
          <div class="flex items-center justify-center h-full">
            <div class="max-w-2xl p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <h3 class="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">Syntax Error</h3>
              <p class="text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap">${errorMessage}</p>
              <p class="text-xs text-red-600 dark:text-red-400 mt-3">Check your Mermaid syntax and try again.</p>
            </div>
          </div>
        `;
      }
    };

    renderDiagram();
  }, [source, mermaidReady, isEditMode]); // Re-render when toggling edit mode

  // Export handler
  const handleExport = async (format: "png" | "svg" | "md") => {
    if (format === "md") {
      // Direct markdown download
      const markdown = "```mermaid\n" + source + "\n```";
      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${title}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Delay cleanup to ensure download starts
      setTimeout(() => URL.revokeObjectURL(url), 100);
      toast.success("Exported as Markdown");
      return;
    }

    if (format === "svg") {
      // Get SVG from rendered diagram
      const svgElement = previewRef.current?.querySelector("svg");
      if (!svgElement) {
        toast.error("Export failed", {
          description: "No diagram to export. Please ensure the diagram is rendered correctly.",
        });
        return;
      }

      try {
        const svgData = new XMLSerializer().serializeToString(svgElement);
        const blob = new Blob([svgData], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${title}.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Delay cleanup to ensure download starts
        setTimeout(() => URL.revokeObjectURL(url), 100);
        toast.success("Exported as SVG");
      } catch (error: any) {
        console.error("[MermaidViewer] SVG export failed:", error);
        toast.error("SVG export failed", {
          description: error.message || "Could not export as SVG",
        });
      }
      return;
    }

    // PNG export via canvas conversion
    try {
      const svgElement = previewRef.current?.querySelector("svg");
      if (!svgElement) {
        toast.error("Export failed", {
          description: "No diagram to export. Please ensure the diagram is rendered correctly.",
        });
        return;
      }

      const svgData = new XMLSerializer().serializeToString(svgElement);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Could not create canvas context");
      }

      const img = new Image();

      img.onload = () => {
        try {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `${title}.png`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);

              // Delay cleanup to ensure download starts
              setTimeout(() => URL.revokeObjectURL(url), 100);
              toast.success("Exported as PNG");
            } else {
              toast.error("PNG export failed", {
                description: "Could not create PNG blob",
              });
            }
          });
        } catch (error: any) {
          console.error("[MermaidViewer] PNG export canvas error:", error);
          toast.error("PNG export failed", {
            description: error.message || "Could not convert to PNG",
          });
        }
      };

      img.onerror = (error) => {
        console.error("[MermaidViewer] PNG export image load error:", error);
        toast.error("PNG export failed", {
          description: "Could not load SVG image for conversion",
        });
      };

      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
    } catch (error: any) {
      console.error("[MermaidViewer] PNG export failed:", error);
      toast.error("PNG export failed", {
        description: error.message || "Could not export as PNG",
      });
    }
  };

  // Open fullscreen
  const openFullscreen = () => {
    console.log("[MermaidViewer] openFullscreen called, contentId:", contentId);
    try {
      const url = `/content/visualization/${contentId}/fullscreen`;
      console.log("[MermaidViewer] Opening URL:", url);
      const newWindow = window.open(url, "_blank", "noopener,noreferrer");
      if (!newWindow) {
        console.error("[MermaidViewer] window.open returned null - popup may be blocked");
      }
    } catch (error) {
      console.error("[MermaidViewer] Error opening fullscreen:", error);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className={`flex items-center justify-between border-b px-6 py-4 ${
        isFullScreen ? "border-white/10 bg-black" : "border-gray-200"
      }`}>
        <div className="flex items-center gap-3">
          <GitBranch className="h-5 w-5 text-blue-400" />
          <h1 className={`text-lg font-semibold ${
            isFullScreen ? "text-white" : "text-gray-900 dark:text-white"
          }`}>{title}</h1>
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
          {/* Toggle edit mode */}
          <Button
            onClick={() => setIsEditMode(!isEditMode)}
            variant={isEditMode ? "default" : "outline"}
            size="sm"
            type="button"
            className={
              isEditMode
                ? ""
                : isFullScreen
                  ? "bg-white/10 hover:bg-white/20 border-white/20 text-white"
                  : ""
            }
          >
            {isEditMode ? (
              <>
                <Eye className="h-4 w-4 mr-2" />
                View
              </>
            ) : (
              <>
                <Code className="h-4 w-4 mr-2" />
                Edit
              </>
            )}
          </Button>

          {/* Full view button (opens new tab) - hide in fullscreen */}
          {!isFullScreen && (
            <Button onClick={openFullscreen} variant="ghost" size="sm" type="button">
              <ExternalLink className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Mermaid Editor/Preview */}
      <div className="flex-1 overflow-hidden">
        {isEditMode ? (
          // Split view: editor on left, preview on right
          <div className="flex h-full">
            {/* Text editor */}
            <div className="w-1/2 border-r flex flex-col">
              <textarea
                value={source}
                onChange={(e) => handleSourceChange(e.target.value)}
                className="flex-1 w-full p-4 font-mono text-sm resize-none focus:outline-none bg-gray-900 text-gray-100"
                placeholder="Enter Mermaid syntax..."
                spellCheck={false}
              />
              {renderError && (
                <div className="bg-red-900/20 border-t border-red-500/30 p-2 text-xs text-red-400">
                  <strong>Syntax Error:</strong> {renderError}
                </div>
              )}
            </div>

            {/* Live preview */}
            <div className="w-1/2 p-4 overflow-auto bg-gray-50 dark:bg-gray-800">
              {!mermaidReady ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                </div>
              ) : (
                <div ref={previewRef} className="mermaid-preview flex justify-center" />
              )}
            </div>
          </div>
        ) : (
          // View-only mode: centered preview with max width
          <div className="h-full w-full p-8 overflow-auto bg-gray-50 dark:bg-gray-800">
            {!mermaidReady ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
              </div>
            ) : (
              <div className="flex items-center justify-center w-full h-full">
                <div ref={previewRef} className="mermaid-preview max-w-full" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toolbelt */}
      <MermaidToolbar
        onExport={handleExport}
        onFullView={openFullscreen}
        onInsertTemplate={handleInsertTemplate}
        isModified={isModified}
        isSaving={isSaving}
        isEditMode={isEditMode}
        isFullScreen={isFullScreen}
      />
    </div>
  );
}
