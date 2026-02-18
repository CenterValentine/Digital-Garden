/**
 * JSON Debug View
 *
 * Displays raw TipTap JSON document structure with syntax highlighting.
 * Read-only view for debugging document structure during development.
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/glass/button";
import { toast } from "sonner";
import type { JSONContent } from "@tiptap/core";

interface JSONDebugViewProps {
  content: JSONContent;
  title: string;
}

export function JSONDebugView({ content, title }: JSONDebugViewProps) {
  const [copied, setCopied] = useState(false);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLPreElement>(null);

  // Format JSON with proper indentation
  const formattedJSON = JSON.stringify(content, null, 2);
  const lineCount = formattedJSON.split("\n").length;

  // Sync scroll between line numbers and content
  useEffect(() => {
    const contentEl = contentRef.current;
    const lineNumbers = lineNumbersRef.current;

    if (!contentEl || !lineNumbers) return;

    const handleScroll = () => {
      lineNumbers.scrollTop = contentEl.scrollTop;
    };

    contentEl.addEventListener("scroll", handleScroll);
    return () => contentEl.removeEventListener("scroll", handleScroll);
  }, []);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(formattedJSON);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col bg-black/40">
      {/* Header */}
      <div className="flex-none px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">TipTap JSON</h3>
          <p className="text-xs text-gray-400">{title}</p>
        </div>
        <Button
          onClick={copyToClipboard}
          size="sm"
          variant="ghost"
          className="gap-2"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </Button>
      </div>

      {/* JSON Editor with line numbers */}
      <div className="flex-1 flex overflow-hidden">
        {/* Line numbers */}
        <div
          ref={lineNumbersRef}
          className="flex-none w-12 overflow-hidden select-none bg-black/30 border-r border-white/10 py-4"
          style={{
            fontFamily: '"JetBrains Mono", "Fira Code", "Courier New", monospace',
            fontSize: "12px",
            lineHeight: "1.6",
          }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div
              key={i + 1}
              className="text-right pr-3 text-gray-500"
              style={{ height: "19.2px" }}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* JSON content */}
        <pre
          ref={contentRef}
          className="flex-1 overflow-auto px-4 py-4 text-xs text-gray-200"
          style={{
            fontFamily: '"JetBrains Mono", "Fira Code", "Courier New", monospace',
            fontSize: "12px",
            lineHeight: "1.6",
            tabSize: 2,
          }}
        >
          <code>{formattedJSON}</code>
        </pre>
      </div>

      {/* Stats footer */}
      <div className="flex-none px-4 py-2 border-t border-white/10 flex items-center gap-4 text-xs text-gray-400">
        <span>{lineCount} lines</span>
        <span>•</span>
        <span>{formattedJSON.length} characters</span>
        <span>•</span>
        <span>Document type: {content.type}</span>
      </div>
    </div>
  );
}
