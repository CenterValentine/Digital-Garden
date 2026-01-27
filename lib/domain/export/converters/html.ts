/**
 * HTML Converter
 *
 * Converts TipTap JSON to standalone HTML or fragment
 */

import { generateHTML } from "@tiptap/core";
import { getServerExtensions } from "@/lib/domain/editor";
import type {
  DocumentConverter,
  ConversionOptions,
  ConversionResult,
  HTMLExportSettings,
} from "../types";
import type { JSONContent } from "@tiptap/core";

export class HTMLConverter implements DocumentConverter {
  async convert(
    tiptapJson: JSONContent,
    options: ConversionOptions
  ): Promise<ConversionResult> {
    const startTime = performance.now();
    const settings = options.settings.html;

    // Generate HTML from TipTap JSON using server extensions
    const extensions = getServerExtensions();
    const htmlContent = generateHTML(tiptapJson, extensions);

    let finalHTML = htmlContent;

    if (settings.standalone) {
      finalHTML = this.wrapInHTMLDocument(
        htmlContent,
        settings,
        options.metadata?.customMetadata
      );
    }

    return {
      success: true,
      files: [
        {
          name: "document.html",
          content: finalHTML,
          mimeType: "text/html",
          size: Buffer.byteLength(finalHTML, "utf-8"),
        },
      ],
      metadata: {
        conversionTime: performance.now() - startTime,
        format: "html",
      },
    };
  }

  /**
   * Wrap HTML content in full HTML document
   */
  private wrapInHTMLDocument(
    content: string,
    settings: HTMLExportSettings,
    metadata?: Record<string, unknown>
  ): string {
    const theme = settings.theme === "auto" ? "light" : settings.theme;
    const title = (metadata?.title as string) || "Document";

    return `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  ${settings.includeCSS ? this.getCSS(theme, settings.syntaxHighlight) : ""}
</head>
<body>
  <div class="content-wrapper">
    ${content}
  </div>
</body>
</html>`;
  }

  /**
   * Get embedded CSS for document styling
   */
  private getCSS(theme: string, syntaxHighlight: boolean): string {
    const isDark = theme === "dark";

    return `<style>
      :root {
        --bg-primary: ${isDark ? "#1a1a1a" : "#ffffff"};
        --bg-secondary: ${isDark ? "#2a2a2a" : "#f5f5f5"};
        --text-primary: ${isDark ? "#e0e0e0" : "#1a1a1a"};
        --text-secondary: ${isDark ? "#aaaaaa" : "#666666"};
        --border-color: ${isDark ? "#333333" : "#dddddd"};
        --link-color: #3b82f6;
        --code-bg: ${isDark ? "#2a2a2a" : "#f5f5f5"};
      }

      * {
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        line-height: 1.6;
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem;
        background: var(--bg-primary);
        color: var(--text-primary);
      }

      .content-wrapper {
        background: var(--bg-primary);
      }

      /* Typography */
      h1, h2, h3, h4, h5, h6 {
        margin-top: 1.5em;
        margin-bottom: 0.5em;
        font-weight: 600;
        line-height: 1.3;
      }

      h1 { font-size: 2em; }
      h2 { font-size: 1.5em; }
      h3 { font-size: 1.25em; }
      h4 { font-size: 1.1em; }
      h5 { font-size: 1em; }
      h6 { font-size: 0.9em; }

      p {
        margin: 1em 0;
      }

      /* Code */
      code {
        background: var(--code-bg);
        padding: 0.2em 0.4em;
        border-radius: 3px;
        font-family: 'Courier New', 'Monaco', monospace;
        font-size: 0.9em;
      }

      pre {
        background: var(--code-bg);
        padding: 1em;
        border-radius: 5px;
        overflow-x: auto;
        margin: 1em 0;
      }

      pre code {
        background: none;
        padding: 0;
      }

      /* Links */
      a {
        color: var(--link-color);
        text-decoration: underline;
      }

      a:hover {
        text-decoration: none;
      }

      /* Blockquotes */
      blockquote {
        border-left: 4px solid var(--border-color);
        margin-left: 0;
        padding-left: 1em;
        color: var(--text-secondary);
        font-style: italic;
      }

      /* Lists */
      ul, ol {
        padding-left: 2em;
        margin: 1em 0;
      }

      li {
        margin: 0.5em 0;
      }

      /* Task lists */
      ul[data-type="taskList"] {
        list-style: none;
        padding-left: 0;
      }

      li[data-type="taskItem"] {
        display: flex;
        align-items: flex-start;
        gap: 0.5em;
      }

      /* Tables */
      table {
        border-collapse: collapse;
        width: 100%;
        margin: 1em 0;
      }

      th, td {
        border: 1px solid var(--border-color);
        padding: 0.5em;
        text-align: left;
      }

      th {
        background: var(--bg-secondary);
        font-weight: 600;
      }

      /* Horizontal rule */
      hr {
        border: none;
        border-top: 2px solid var(--border-color);
        margin: 2em 0;
      }

      /* Wiki links */
      .wiki-link {
        color: var(--link-color);
        text-decoration: underline;
        cursor: pointer;
      }

      /* Tags */
      .tag-node {
        display: inline-flex;
        align-items: center;
        padding: 0.125rem 0.5rem;
        border-radius: 9999px;
        font-size: 0.875rem;
        font-weight: 500;
        margin: 0 0.25rem;
      }

      /* Callouts */
      .callout {
        padding: 1em;
        border-left: 4px solid;
        margin: 1em 0;
        border-radius: 4px;
        background: rgba(128, 128, 128, 0.1);
      }

      .callout-title {
        font-weight: 600;
        margin-bottom: 0.5em;
        display: flex;
        align-items: center;
        gap: 0.5em;
      }

      .callout-note {
        border-color: #3b82f6;
        background: ${isDark ? "rgba(59, 130, 246, 0.1)" : "rgba(59, 130, 246, 0.1)"};
      }

      .callout-tip {
        border-color: #10b981;
        background: ${isDark ? "rgba(16, 185, 129, 0.1)" : "rgba(16, 185, 129, 0.1)"};
      }

      .callout-warning {
        border-color: #f59e0b;
        background: ${isDark ? "rgba(245, 158, 11, 0.1)" : "rgba(245, 158, 11, 0.1)"};
      }

      .callout-danger {
        border-color: #ef4444;
        background: ${isDark ? "rgba(239, 68, 68, 0.1)" : "rgba(239, 68, 68, 0.1)"};
      }

      .callout-info {
        border-color: #06b6d4;
        background: ${isDark ? "rgba(6, 182, 212, 0.1)" : "rgba(6, 182, 212, 0.1)"};
      }

      ${syntaxHighlight ? this.getSyntaxHighlightCSS(isDark) : ""}
    </style>`;
  }

  /**
   * Get syntax highlighting CSS
   */
  private getSyntaxHighlightCSS(isDark: boolean): string {
    if (!isDark) {
      return `
        /* Light theme syntax highlighting */
        .hljs-comment { color: #6a737d; }
        .hljs-keyword { color: #d73a49; }
        .hljs-string { color: #032f62; }
        .hljs-number { color: #005cc5; }
        .hljs-function { color: #6f42c1; }
      `;
    } else {
      return `
        /* Dark theme syntax highlighting */
        .hljs-comment { color: #8b949e; }
        .hljs-keyword { color: #ff7b72; }
        .hljs-string { color: #a5d6ff; }
        .hljs-number { color: #79c0ff; }
        .hljs-function { color: #d2a8ff; }
      `;
    }
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return text.replace(/[&<>"']/g, (char) => map[char]);
  }
}
