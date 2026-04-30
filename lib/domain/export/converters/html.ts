/**
 * HTML Converter
 *
 * Converts TipTap JSON to standalone HTML or fragment
 */

import { generateHTML } from "@tiptap/core";
import { getServerExtensions } from "@/lib/domain/editor";
import { sanitizeTipTapJsonWithExtensions } from "@/lib/domain/editor/unsupported-content";
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
    const sanitized = sanitizeTipTapJsonWithExtensions(tiptapJson, extensions).json;
    const htmlContent = generateHTML(sanitized, extensions);

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

      /* Habit tracker */
      .habit-tracker-static {
        border: 1px solid var(--border-color);
        border-radius: 16px;
        padding: 1rem;
        margin: 1.25rem 0;
        background: ${isDark ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.03)"};
      }

      .habit-tracker-static[data-show-background="false"] {
        background: transparent;
      }

      .habit-tracker-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
        margin-bottom: 1rem;
      }

      .habit-tracker-title {
        font-size: 1rem;
        font-weight: 600;
      }

      .habit-tracker-subtitle {
        font-size: 0.875rem;
        color: var(--text-secondary);
        margin-top: 0.2rem;
      }

      .habit-tracker-empty {
        border: 1px dashed var(--border-color);
        border-radius: 12px;
        padding: 1rem;
        color: var(--text-secondary);
      }

      .habit-tracker-empty-title {
        font-weight: 600;
        color: var(--text-primary);
      }

      .habit-tracker-grid-scroll {
        overflow-x: auto;
      }

      .habit-tracker-grid {
        width: 100%;
        min-width: 540px;
        border-collapse: collapse;
      }

      .habit-tracker-grid-header {
        font-size: 0.75rem;
        color: var(--text-secondary);
        white-space: nowrap;
      }

      .habit-tracker-grid-weekday,
      .habit-tracker-grid-day {
        display: block;
      }

      .habit-tracker-habit-cell {
        min-width: 180px;
      }

      .habit-tracker-habit-chip {
        display: flex;
        align-items: center;
        gap: 0.65rem;
      }

      .habit-tracker-habit-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.5rem;
        height: 1.5rem;
        font-size: 1rem;
      }

      .habit-tracker-habit-name {
        font-weight: 500;
      }

      .habit-tracker-habit-target {
        font-size: 0.75rem;
        color: var(--text-secondary);
      }

      .habit-tracker-grid-cell {
        text-align: center;
      }

      .habit-tracker-cell-static {
        display: inline-flex;
        min-width: 2rem;
        min-height: 2rem;
        align-items: center;
        justify-content: center;
        border-radius: 10px;
        border: 1px solid var(--border-color);
        background: ${isDark ? "rgba(255,255,255,0.02)" : "rgba(15,23,42,0.03)"};
      }

      .habit-tracker-cell-static[data-complete="true"] {
        border-color: rgba(34, 197, 94, 0.45);
        background: rgba(34, 197, 94, 0.14);
      }

      .habit-tracker-row-stats {
        min-width: 160px;
      }

      .habit-tracker-stat-badges,
      .habit-tracker-row-stats {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
      }

      .habit-tracker-stat {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.2rem 0.5rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
      }

      .habit-tracker-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 0.75rem;
      }

      .habit-tracker-card {
        border: 1px solid var(--border-color);
        border-radius: 14px;
        padding: 0.85rem;
        background: ${isDark ? "rgba(255,255,255,0.02)" : "rgba(15,23,42,0.02)"};
      }

      .habit-tracker-card-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.75rem;
        margin-bottom: 0.75rem;
      }

      .habit-tracker-card-identity {
        display: flex;
        align-items: center;
        gap: 0.65rem;
      }

      .habit-tracker-card-strip {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 0.35rem;
      }

      .habit-tracker-card-day {
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 0.35rem 0.2rem;
        text-align: center;
        background: ${isDark ? "rgba(255,255,255,0.02)" : "rgba(15,23,42,0.02)"};
      }

      .habit-tracker-card-day[data-complete="true"] {
        border-color: rgba(34, 197, 94, 0.45);
        background: rgba(34, 197, 94, 0.12);
      }

      .habit-tracker-card-day-label,
      .habit-tracker-card-day-value {
        display: block;
        font-size: 0.72rem;
      }

      .block-stopwatch {
        --stopwatch-accent: #ff6b57;
        margin: 1rem 0;
      }

      .stopwatch-static[data-show-background="true"] {
        border-radius: 18px;
        padding: 1rem;
        background: ${isDark ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.03)"};
      }

      .stopwatch-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
      }

      .stopwatch-title {
        font-size: 1rem;
        font-weight: 600;
      }

      .stopwatch-status {
        margin-top: 0.15rem;
        font-size: 0.72rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--text-secondary);
      }

      .stopwatch-display {
        display: flex;
        gap: 0.5rem;
        margin: 0.85rem 0 0.45rem;
        overflow-x: auto;
      }

      .stopwatch-segment {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.1rem;
        flex-shrink: 0;
      }

      .stopwatch-separator {
        align-self: center;
        font-size: 1.9rem;
        font-weight: 600;
        line-height: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .stopwatch-segment-value {
        font-size: 2rem;
        font-weight: 600;
        line-height: 1;
      }

      .stopwatch-segment-label {
        font-size: 0.62rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-secondary);
      }

      .stopwatch-meta {
        font-size: 0.78rem;
        color: var(--text-secondary);
      }

      .stopwatch-laps {
        margin-top: 0.85rem;
        padding-top: 0.85rem;
        border-top: 1px solid var(--border-color);
      }

      .stopwatch-laps-header,
      .stopwatch-lap-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
        gap: 0.75rem;
        align-items: center;
      }

      .stopwatch-laps-header {
        margin-bottom: 0.45rem;
        font-size: 0.66rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-secondary);
      }

      .stopwatch-lap-row {
        padding: 0.45rem 0;
        border-top: 1px solid var(--border-color);
        font-variant-numeric: tabular-nums;
      }

      .stopwatch-lap-value,
      .stopwatch-lap-split {
        text-align: right;
      }

      .stopwatch-laps-empty {
        font-size: 0.78rem;
        color: var(--text-secondary);
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
