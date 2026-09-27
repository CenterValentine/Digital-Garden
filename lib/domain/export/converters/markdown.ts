/**
 * Enhanced Markdown Converter
 *
 * Converts TipTap JSON to Markdown with optional metadata sidecar
 * Supports custom extensions: wiki-links, tags, callouts
 */

import type {
  DocumentConverter,
  ConversionOptions,
  ConversionResult,
  MarkdownExportSettings,
} from "../types";
import type { JSONContent } from "@tiptap/core";
import {
  normalizeHabitTrackerAttrs,
} from "@/lib/domain/habit-tracker";
import { normalizeStopwatchAttrs } from "@/lib/domain/stopwatch";
import { getHabitTrackerMarkdownLines } from "@/lib/domain/editor/extensions/blocks/habit-tracker";
import { getStopwatchMarkdownLines } from "@/lib/domain/editor/extensions/blocks/stopwatch";

/**
 * Node types that live INSIDE a paragraph. A container whose children are
 * all inline glues them; anything else is a block list and gets blank-line
 * separation. Joining block children with "" — the old default — is how the
 * vault export flattened a 28-accordion ledger into one run of prose.
 */
const INLINE_NODE_TYPES = new Set([
  "text",
  "hardBreak",
  "wikiLink",
  "tag",
  "inlineTimestamp",
  "personMention",
  "mention",
  "unsupportedInline",
]);

/** `headerLevel` is a string attr ("2") on the accordion; clamp to 1–6. */
function clampHeadingLevel(raw: unknown): number {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n >= 1 && n <= 6 ? n : 2;
}

function markdownCell(value: unknown): string {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

/** statsTable stores its rows as a JSON string in `attrs.items`. */
function serializeStatsTable(node: JSONContent): string {
  const attrs = node.attrs ?? {};
  let items: Array<{ label?: unknown; value?: unknown }> = [];
  try {
    const parsed: unknown = JSON.parse(String(attrs.items ?? "[]"));
    if (Array.isArray(parsed)) {
      items = parsed as Array<{ label?: unknown; value?: unknown }>;
    }
  } catch {
    items = [];
  }
  const caption = String(attrs.caption ?? "").trim();
  const lines: string[] = [];
  if (caption) lines.push(`**${caption}**`, "");
  if (items.length === 0) return lines.join("\n").trim();
  lines.push("| Label | Value |", "| --- | --- |");
  for (const item of items) {
    lines.push(`| ${markdownCell(item.label)} | ${markdownCell(item.value)} |`);
  }
  return lines.join("\n");
}

/**
 * Render a TipTap document (or any node) to markdown with the export's own
 * rules and default settings — for scripts and packet builders that want
 * the export rendering without the converter's file plumbing.
 */
export function tiptapToMarkdownDocument(
  json: JSONContent,
  overrides: Partial<MarkdownExportSettings> = {}
): string {
  const settings: MarkdownExportSettings = {
    includeMetadata: false,
    includeFrontmatter: false,
    preserveSemantics: true,
    wikiLinkStyle: "[[]]",
    codeBlockLanguagePrefix: true,
    ...overrides,
  };
  return new MarkdownConverter().render(json, settings);
}

export class MarkdownConverter implements DocumentConverter {
  async convert(
    tiptapJson: JSONContent,
    options: ConversionOptions
  ): Promise<ConversionResult> {
    const startTime = performance.now();
    const settings = options.settings.markdown;

    // Convert to markdown
    const markdown = this.tiptapToMarkdown(tiptapJson, settings);

    const files: ConversionResult["files"] = [
      {
        name: "document.md",
        content: markdown,
        mimeType: "text/markdown",
        size: Buffer.byteLength(markdown, "utf-8"),
      },
    ];

    // Add metadata sidecar if requested
    if (settings.includeMetadata && options.metadata?.customMetadata) {
      const metadataJson = JSON.stringify(
        options.metadata.customMetadata,
        null,
        2
      );

      files.push({
        name: "document.meta.json",
        content: metadataJson,
        mimeType: "application/json",
        size: Buffer.byteLength(metadataJson, "utf-8"),
      });
    }

    return {
      success: true,
      files,
      metadata: {
        conversionTime: performance.now() - startTime,
        format: "markdown",
      },
    };
  }

  /**
   * Convert TipTap JSON to Markdown
   */
  private tiptapToMarkdown(
    json: JSONContent,
    settings: MarkdownExportSettings
  ): string {
    const lines: string[] = [];

    // Add YAML frontmatter if requested
    if (settings.includeFrontmatter) {
      lines.push("---");
      lines.push(`created: ${new Date().toISOString()}`);
      lines.push("---");
      lines.push("");
    }

    // Serialize content
    const content = this.serializeNode(json, settings);
    lines.push(content.trim());

    return lines.join("\n");
  }

  /** Public entry for callers that already hold a document and settings. */
  render(json: JSONContent, settings: MarkdownExportSettings): string {
    return this.serializeNode(json, settings).trim();
  }

  /** Children joined as blocks (blank-line separated) or inline (glued). */
  private serializeChildren(
    node: JSONContent,
    settings: MarkdownExportSettings
  ): string {
    const children = node.content ?? [];
    if (children.length === 0) return "";
    const parts = children.map((n) => this.serializeNode(n, settings));
    const inline = children.every((n) => INLINE_NODE_TYPES.has(n.type ?? ""));
    return inline
      ? parts.join("")
      : parts.filter((p) => p.length > 0).join("\n\n");
  }

  /**
   * Header-bearing containers (accordion, card panel): the header is an
   * ATTR, not content, so it never reached the export — the vault export of
   * a 28-accordion ledger came out as untitled prose. The header now exports
   * as a heading at the block's own level, the body beneath it.
   */
  private serializeHeaderedContainer(
    node: JSONContent,
    settings: MarkdownExportSettings
  ): string {
    const headerText = String(node.attrs?.headerText ?? "").trim();
    const body = this.serializeChildren(node, settings);
    if (!headerText) return body;
    const heading =
      "#".repeat(clampHeadingLevel(node.attrs?.headerLevel)) + " " + headerText;
    return body ? `${heading}\n\n${body}` : heading;
  }

  /**
   * Serialize a TipTap node to Markdown (recursive)
   */
  private serializeNode(
    node: JSONContent,
    settings: MarkdownExportSettings,
    depth: number = 0
  ): string {
    if (!node) return "";

    switch (node.type) {
      case "doc":
        return (
          node.content
            ?.map((n) => this.serializeNode(n, settings))
            .join("\n\n") || ""
        );

      case "paragraph":
        return (
          node.content?.map((n) => this.serializeNode(n, settings)).join("") ||
          ""
        );

      case "heading": {
        const level = node.attrs?.level || 1;
        const text =
          node.content?.map((n) => this.serializeNode(n, settings)).join("") ||
          "";
        return "#".repeat(level) + " " + text;
      }

      case "text": {
        let text = node.text || "";

        // Apply marks
        if (node.marks) {
          for (const mark of node.marks) {
            if (mark.type === "bold") text = `**${text}**`;
            if (mark.type === "italic") text = `*${text}*`;
            if (mark.type === "code") text = `\`${text}\``;
            if (mark.type === "strike") text = `~~${text}~~`;
            if (mark.type === "link") {
              const href = mark.attrs?.href || "";
              text = `[${text}](${href})`;
            }
            // Private (commented-out) text exports as an Obsidian comment —
            // the file is the author's, so the comment travels with it.
            if (mark.type === "privateText") text = `%%${text}%%`;
          }
        }

        return text;
      }

      case "privateBlock": {
        // Obsidian multi-line comment: `%%` fence lines around the body.
        const body = this.serializeChildren(node, settings);
        return body ? `%%\n${body}\n%%` : "";
      }

      case "codeBlock": {
        const lang = node.attrs?.language || "";
        const code =
          node.content?.map((n) => n.text || "").join("") || "";
        const langPrefix = settings.codeBlockLanguagePrefix ? lang : "";
        return `\`\`\`${langPrefix}\n${code}\n\`\`\``;
      }

      case "bulletList":
        return (
          node.content
            ?.map((n) => {
              const item = this.serializeNode(n, settings, depth);
              return "  ".repeat(depth) + "- " + item;
            })
            .join("\n") || ""
        );

      case "orderedList":
        return (
          node.content
            ?.map((n, i) => {
              const item = this.serializeNode(n, settings, depth);
              return "  ".repeat(depth) + `${i + 1}. ` + item;
            })
            .join("\n") || ""
        );

      case "listItem": {
        // Handle nested lists
        const textContent: string[] = [];
        const nestedLists: string[] = [];

        node.content?.forEach((child) => {
          if (child.type === "bulletList" || child.type === "orderedList") {
            nestedLists.push(this.serializeNode(child, settings, depth + 1));
          } else {
            textContent.push(this.serializeNode(child, settings, depth));
          }
        });

        const text = textContent.join(" ");
        if (nestedLists.length > 0) {
          return text + "\n" + nestedLists.join("\n");
        }
        return text;
      }

      case "taskList":
        return (
          node.content
            ?.map((n) => {
              const checked = n.attrs?.checked ? "x" : " ";
              const text = this.serializeNode(n, settings, depth);
              return "  ".repeat(depth) + `- [${checked}] ${text}`;
            })
            .join("\n") || ""
        );

      case "taskItem": {
        const checked = node.attrs?.checked ? "x" : " ";
        const text =
          node.content?.map((n) => this.serializeNode(n, settings)).join("") ||
          "";
        return `[${checked}] ${text}`;
      }

      case "blockquote": {
        const content =
          node.content?.map((n) => this.serializeNode(n, settings)).join("\n") ||
          "";
        return content
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
      }

      case "image": {
        const alt = node.attrs?.alt || "";
        const src = node.attrs?.src || "";
        const title = node.attrs?.title || "";

        // Standard markdown image syntax
        const titlePart = title ? ` "${title}"` : "";
        const imgMarkdown = `![${alt}](${src}${titlePart})`;

        if (settings.preserveSemantics) {
          // Preserve contentId, source, and width in HTML comment for lossless round-trip
          const contentId = node.attrs?.contentId || "";
          const source = node.attrs?.source || "";
          const width = node.attrs?.width || "";
          const meta = [contentId, source, width].join(":");
          return `<!-- image:${meta} -->\n${imgMarkdown}\n<!-- /image -->`;
        }

        return imgMarkdown;
      }

      case "horizontalRule":
        return "---";

      case "hardBreak":
        return "  \n"; // Two spaces + newline (markdown line break)

      case "wikiLink": {
        const target = node.attrs?.targetTitle || "";
        const display = node.attrs?.displayText || "";

        if (settings.wikiLinkStyle === "[[]]") {
          // Obsidian style
          const result = display ? `[[${target}|${display}]]` : `[[${target}]]`;

          if (settings.preserveSemantics) {
            const contentId = node.attrs?.contentId || "";
            return `<!-- wikilink:${contentId} -->${result}<!-- /wikilink -->`;
          }

          return result;
        } else {
          // Standard markdown link
          return `[${display || target}](${target})`;
        }
      }

      case "tag": {
        const tagName = node.attrs?.tagName || "";
        const tagId = node.attrs?.tagId || "";
        const color = node.attrs?.color || "";

        if (settings.preserveSemantics) {
          // Embed metadata in HTML comment
          return `<!-- tag:${tagId}:${color} -->#${tagName}<!-- /tag -->`;
        } else {
          return `#${tagName}`;
        }
      }

      case "callout": {
        const calloutType = node.attrs?.type || "note";
        const calloutTitle = node.attrs?.title || "";
        const calloutContent =
          node.content?.map((n) => this.serializeNode(n, settings)).join("\n") ||
          "";

        // Obsidian-style callout syntax
        const titlePart = calloutTitle ? ` ${calloutTitle}` : "";
        const header = `> [!${calloutType}]${titlePart}`;

        // Prefix each line of content with "> "
        const quotedContent = calloutContent
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");

        return `${header}\n${quotedContent}`;
      }

      case "habitTracker": {
        const attrs = normalizeHabitTrackerAttrs(
          (node.attrs || {}) as Record<string, unknown>
        );
        return getHabitTrackerMarkdownLines(attrs).join("\n");
      }

      case "stopwatch": {
        const attrs = normalizeStopwatchAttrs(
          (node.attrs || {}) as Record<string, unknown>
        );
        return getStopwatchMarkdownLines(attrs).join("\n");
      }

      case "table": {
        // Basic table support (markdown tables)
        const rows = node.content || [];

        if (rows.length === 0) return "";

        const tableLines: string[] = [];

        // Process each row
        rows.forEach((row, rowIndex) => {
          if (row.type === "tableRow") {
            const cells = row.content || [];
            const cellContents = cells.map((cell) =>
              this.serializeNode(cell, settings).trim()
            );

            // Create markdown table row
            tableLines.push(`| ${cellContents.join(" | ")} |`);

            // Add separator after first row (header)
            if (rowIndex === 0) {
              const separator = cellContents.map(() => "---").join(" | ");
              tableLines.push(`| ${separator} |`);
            }
          }
        });

        return tableLines.join("\n");
      }

      case "tableRow":
        // Handled by table case
        return "";

      case "tableCell":
      case "tableHeader":
        return (
          node.content?.map((n) => this.serializeNode(n, settings)).join(" ") ||
          ""
        );

      case "accordion":
      case "cardPanel":
        return this.serializeHeaderedContainer(node, settings);

      case "statsTable":
        return serializeStatsTable(node);

      case "dailySummary":
      case "weeklySummary":
        // Computed from activity at render time — nothing to export.
        return "";

      default:
        // Unknown node type — keep whatever it holds, with block children
        // blank-line separated and inline children glued.
        return this.serializeChildren(node, settings);
    }
  }
}
