/**
 * JSON Editor Component
 *
 * Professional JSON editor with:
 * - Syntax highlighting (standard VS Code-like colors)
 * - Line numbers
 * - Manual save (Cmd+S / Ctrl+S)
 * - Proper JSON formatting
 * - Validation on save
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { Download, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/glass/button";
import { toast } from "sonner";
import { useEditorStatsStore } from "@/stores/editor-stats-store";
import { ToolBelt, getJSONToolBeltConfig } from "@/components/notes/tool-belt";

interface JSONViewerProps {
  downloadUrl: string;
  fileName: string;
  title: string;
  onDownload: () => void;
  contentId: string;
}

export function JSONViewer({
  downloadUrl,
  fileName,
  title,
  onDownload,
  contentId,
}: JSONViewerProps) {
  const [editorContent, setEditorContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Global stats store
  const { setJsonStats, setIsSaving: setGlobalIsSaving, setHasUnsavedChanges: setGlobalUnsavedChanges, reset: resetStats } = useEditorStatsStore();

  useEffect(() => {
    const fetchJSON = async () => {
      try {
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error("Failed to fetch JSON file");
        }

        const text = await response.text();

        // Try to parse and pretty-print
        try {
          const parsed = JSON.parse(text);
          const formatted = JSON.stringify(parsed, null, 2);
          setEditorContent(formatted);
          setOriginalContent(formatted);
        } catch {
          // If parsing fails, just use raw text
          setEditorContent(text);
          setOriginalContent(text);
        }
      } catch (err) {
        console.error("[JSONViewer] Failed to load JSON:", err);
        setError(err instanceof Error ? err.message : "Failed to load JSON");
      } finally {
        setIsLoading(false);
      }
    };

    fetchJSON();
  }, [downloadUrl]);

  // Update global stats whenever content changes
  useEffect(() => {
    const lineCount = editorContent.split("\n").length;
    const charCount = editorContent.length;
    const objectCount = getObjectCount();

    setJsonStats({
      lineCount,
      characterCount: charCount,
      objectCount,
    });
  }, [editorContent, setJsonStats]);

  // Cleanup: reset stats when component unmounts
  useEffect(() => {
    return () => {
      resetStats();
    };
  }, [resetStats]);

  // Keyboard shortcut for save (Cmd+S / Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (hasUnsavedChanges && !isSaving) {
          handleSave();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasUnsavedChanges, isSaving, editorContent]);

  // Sync scroll between textarea and line numbers
  useEffect(() => {
    const textarea = textareaRef.current;
    const lineNumbers = lineNumbersRef.current;

    if (!textarea || !lineNumbers) return;

    const handleScroll = () => {
      lineNumbers.scrollTop = textarea.scrollTop;
    };

    textarea.addEventListener("scroll", handleScroll);
    return () => textarea.removeEventListener("scroll", handleScroll);
  }, []);

  const handleContentChange = (newContent: string) => {
    setEditorContent(newContent);
    const hasChanges = newContent !== originalContent;
    console.log("[JSONViewer] Content changed:", { hasChanges, newLength: newContent.length, originalLength: originalContent.length });
    setHasUnsavedChanges(hasChanges);
    setGlobalUnsavedChanges(hasChanges);
  };

  const handleSave = async () => {
    // Validate JSON
    try {
      JSON.parse(editorContent);
    } catch (parseErr) {
      toast.error("Invalid JSON", {
        description: parseErr instanceof Error ? parseErr.message : "Cannot save invalid JSON",
      });
      return;
    }

    setIsSaving(true);
    setGlobalIsSaving(true);
    try {
      // Convert JSON string to blob and upload
      const blob = new Blob([editorContent], { type: "application/json" });
      const file = new File([blob], fileName, { type: "application/json" });

      // Create form data
      const formData = new FormData();
      formData.append("file", file);
      formData.append("contentId", contentId);

      // Upload updated file
      const response = await fetch("/api/notes/content/upload/simple", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to save changes");
      }

      setOriginalContent(editorContent);
      setHasUnsavedChanges(false);
      setGlobalUnsavedChanges(false);
      toast.success("Saved successfully");
    } catch (err) {
      console.error("[JSONViewer] Failed to save:", err);
      toast.error("Failed to save", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsSaving(false);
      setGlobalIsSaving(false);
    }
  };

  const handleRevert = () => {
    setEditorContent(originalContent);
    setHasUnsavedChanges(false);
    toast.success("Reverted to original");
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(editorContent);
    toast.success("Copied to clipboard");
  };

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(editorContent);
      const formatted = JSON.stringify(parsed, null, 2);
      setEditorContent(formatted);
      setHasUnsavedChanges(formatted !== originalContent);
      toast.success("Formatted");
    } catch (parseErr) {
      toast.error("Invalid JSON", {
        description: "Cannot format invalid JSON",
      });
    }
  };

  // Count JSON objects/arrays (used by global stats)
  const getObjectCount = (): number => {
    try {
      const parsed = JSON.parse(editorContent);
      let count = 0;
      const countObjects = (obj: any) => {
        if (typeof obj === "object" && obj !== null) {
          count++;
          if (Array.isArray(obj)) {
            obj.forEach(countObjects);
          } else {
            Object.values(obj).forEach(countObjects);
          }
        }
      };
      countObjects(parsed);
      return count;
    } catch {
      return 0;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-gray-400">Loading JSON...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 space-y-6">
        <div className="text-center max-w-md">
          <AlertCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Failed to Load JSON</h3>
          <p className="text-gray-400 mb-4">{error}</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={onDownload} variant="glass">
            <Download className="h-4 w-4 mr-2" />
            Download {fileName}
          </Button>
        </div>
      </div>
    );
  }

  // Generate tool belt configuration
  const toolBeltConfig = getJSONToolBeltConfig(
    {
      fileName,
      mimeType: "application/json",
      contentId,
      editable: true,
      hasUnsavedChanges,
      isSaving,
    },
    {
      content: editorContent,
      originalContent,
      hasUnsavedChanges,
      isSaving,
      onFormat: handleFormat,
      onCopy: copyToClipboard,
      onRevert: handleRevert,
      onSave: handleSave,
      onDownload,
    }
  );

  return (
    <div className="h-full flex flex-col relative">
      {/* Header with file title */}
      <div className="flex-none px-6 pt-6 pb-4 border-b border-white/10">
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      </div>

      {/* JSON Editor with line numbers */}
      <div className="flex-1 flex overflow-hidden">
        {/* Line numbers */}
        <div
          ref={lineNumbersRef}
          className="flex-none w-12 overflow-hidden select-none bg-black/20 border-r border-white/10 pt-6 pb-6"
          style={{
            fontFamily: '"JetBrains Mono", "Fira Code", "Courier New", monospace',
            fontSize: "13px",
            lineHeight: "1.6",
          }}
        >
          {Array.from({ length: editorContent.split("\n").length }, (_, i) => (
            <div
              key={i + 1}
              className="text-right pr-3 text-gray-500"
              style={{ height: "20.8px" }}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Editor textarea */}
        <div className="flex-1 overflow-auto">
          <textarea
            ref={textareaRef}
            value={editorContent}
            onChange={(e) => handleContentChange(e.target.value)}
            className="w-full h-full px-4 pt-6 pb-6 bg-transparent resize-none focus:outline-none"
            style={{
              fontFamily: '"JetBrains Mono", "Fira Code", "Courier New", monospace',
              fontSize: "13px",
              lineHeight: "1.6",
              tabSize: 2,
              color: "#1F2937", // Dark gray/black for light backgrounds
            }}
            spellCheck={false}
          />
        </div>
      </div>

      {/* Tool Belt - Floating action bar */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <ToolBelt config={toolBeltConfig} />
      </div>
    </div>
  );
}
