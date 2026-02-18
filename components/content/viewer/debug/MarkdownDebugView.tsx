/**
 * Markdown Debug View
 *
 * Displays markdown representation of TipTap document.
 * Shows what the document would look like when exported to Markdown.
 */

"use client";

import { useState, useEffect } from "react";
import { Copy, Check, Download } from "lucide-react";
import { Button } from "@/components/ui/glass/button";
import { toast } from "sonner";
import type { JSONContent } from "@tiptap/core";
import { MarkdownConverter } from "@/lib/domain/export/converters/markdown";

interface MarkdownDebugViewProps {
  content: JSONContent;
  title: string;
}

export function MarkdownDebugView({ content, title }: MarkdownDebugViewProps) {
  const [markdown, setMarkdown] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const convertToMarkdown = async () => {
      try {
        const converter = new MarkdownConverter();
        const result = await converter.convert(content, {
          format: "markdown",
          settings: {
            defaultFormat: "markdown",
            markdown: {
              wikiLinkStyle: "[[]]", // Obsidian-style
              codeBlockLanguagePrefix: true,
              includeFrontmatter: false,
              preserveSemantics: false,
              includeMetadata: false,
            },
            html: {
              theme: "light",
              includeCSS: true,
              standalone: true,
              syntaxHighlight: true,
            },
            pdf: {
              pageSize: "A4",
              margins: { top: 72, right: 72, bottom: 72, left: 72 },
              headerFooter: false,
              includeTableOfContents: false,
              colorScheme: "color",
            },
            autoBackup: {
              enabled: false,
              frequency: "manual",
              formats: ["markdown"],
              storageProvider: "local",
              includeDeleted: false,
              maxBackups: 0,
              lastBackupAt: null,
            },
            bulkExport: {
              batchSize: 1,
              compressionFormat: "none",
              includeStructure: false,
              fileNaming: "title",
            },
          },
          metadata: {
            includeMetadata: false,
            customMetadata: {
              title,
              contentId: "",
              exportDate: new Date().toISOString(),
            },
          },
        });

        if (result.success && result.files.length > 0) {
          const content = result.files[0].content;
          setMarkdown(typeof content === "string" ? content : content.toString("utf-8"));
        }
      } catch (error) {
        console.error("[MarkdownDebugView] Conversion error:", error);
        toast.error("Failed to convert to markdown");
      } finally {
        setIsLoading(false);
      }
    };

    convertToMarkdown();
  }, [content, title]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadMarkdown = () => {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded markdown file");
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-black/40">
        <div className="text-sm text-gray-400">Converting to markdown...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-black/40">
      {/* Header */}
      <div className="flex-none px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Markdown Source</h3>
          <p className="text-xs text-gray-400">{title}</p>
        </div>
        <div className="flex gap-2">
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
          <Button
            onClick={downloadMarkdown}
            size="sm"
            variant="ghost"
            className="gap-2"
          >
            <Download className="h-3 w-3" />
            Download
          </Button>
        </div>
      </div>

      {/* Markdown content */}
      <pre className="flex-1 overflow-auto px-4 py-4 text-xs text-gray-200">
        <code
          style={{
            fontFamily: '"JetBrains Mono", "Fira Code", "Courier New", monospace',
            fontSize: "12px",
            lineHeight: "1.6",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {markdown}
        </code>
      </pre>

      {/* Stats footer */}
      <div className="flex-none px-4 py-2 border-t border-white/10 flex items-center gap-4 text-xs text-gray-400">
        <span>{markdown.split("\n").length} lines</span>
        <span>•</span>
        <span>{markdown.length} characters</span>
        <span>•</span>
        <span>Obsidian-compatible</span>
      </div>
    </div>
  );
}
