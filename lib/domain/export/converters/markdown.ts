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
          }
        }

        return text;
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

      default:
        // Unknown node type - try to serialize children
        return (
          node.content?.map((n) => this.serializeNode(n, settings)).join("") ||
          ""
        );
    }
  }
}
