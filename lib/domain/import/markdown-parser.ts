/**
 * Markdown Parser
 *
 * Two-pass parser that converts markdown to TipTap JSONContent.
 *
 * Pass 1 (Block): Identifies block-level structures (headings, code blocks,
 * lists, blockquotes, horizontal rules, paragraphs).
 *
 * Pass 2 (Inline): Parses inline content within each block via inline-parser.ts.
 *
 * Phase 1: Core blocks + inline (headings, code blocks, lists, blockquotes, HR, paragraphs)
 * Phase 2 adds: callouts, task lists, tables
 */

import type { JSONContent } from "@tiptap/core";
import type { ImportParseResult, ImportWarning, ParseOptions } from "./types";
import { DEFAULT_PARSE_OPTIONS } from "./types";
import { parseInlineContent } from "./inline-parser";

/**
 * Parse a markdown string into TipTap JSON.
 *
 * This is the main entry point for the import parser.
 */
export function parseMarkdown(
  markdown: string,
  options?: Partial<ParseOptions>
): ImportParseResult {
  const startTime = performance.now();
  const opts: ParseOptions = { ...DEFAULT_PARSE_OPTIONS, ...options };
  const warnings: ImportWarning[] = [];

  if (!markdown || !markdown.trim()) {
    return {
      tiptapJson: { type: "doc", content: [] },
      warnings: [],
      stats: { blockCount: 0, inlineNodeCount: 0, parseTimeMs: 0 },
    };
  }

  // Strip YAML frontmatter
  let lines = markdown.split("\n");
  if (opts.stripFrontmatter) {
    lines = stripFrontmatter(lines, warnings);
  }

  // Pass 1: Parse block structure
  const blocks = parseBlocks(lines, opts, warnings);

  // Count stats
  let inlineNodeCount = 0;
  function countInline(node: JSONContent) {
    if (node.type === "text" || node.type === "hardBreak") inlineNodeCount++;
    if (node.content) node.content.forEach(countInline);
  }
  blocks.forEach(countInline);

  const parseTimeMs = performance.now() - startTime;

  return {
    tiptapJson: { type: "doc", content: blocks },
    warnings,
    stats: {
      blockCount: blocks.length,
      inlineNodeCount,
      parseTimeMs: Math.round(parseTimeMs * 100) / 100,
    },
  };
}

// ─── YAML Frontmatter ────────────────────────────────────────

/** Strip YAML frontmatter (--- ... ---) from lines. Returns remaining lines. */
function stripFrontmatter(
  lines: string[],
  warnings: ImportWarning[]
): string[] {
  if (lines.length < 2 || lines[0].trim() !== "---") return lines;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      return lines.slice(i + 1);
    }
  }

  // Unclosed frontmatter — warn and return all lines
  warnings.push({
    code: "UNCLOSED_FRONTMATTER",
    message: "YAML frontmatter block is not closed (missing closing ---)",
    line: 1,
  });
  return lines;
}

// ─── Block Parser (Pass 1) ──────────────────────────────────

/**
 * Parse lines into block-level TipTap nodes.
 *
 * Consumes lines sequentially, detecting block patterns
 * and delegating inline content to parseInlineContent().
 */
function parseBlocks(
  lines: string[],
  opts: ParseOptions,
  warnings: ImportWarning[]
): JSONContent[] {
  const blocks: JSONContent[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    // ── Blank line: skip ──
    if (trimmed === "") {
      i++;
      continue;
    }

    // ── Code block: ``` ──
    if (trimmed.startsWith("```")) {
      const result = parseCodeBlock(lines, i, warnings);
      blocks.push(result.node);
      i = result.nextLine;
      continue;
    }

    // ── Heading: # ──
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      const inlineNodes = parseInlineContent(content, opts);
      blocks.push({
        type: "heading",
        attrs: { level },
        content: inlineNodes.length > 0 ? inlineNodes : undefined,
      });
      i++;
      continue;
    }

    // ── Horizontal rule: ---, ***, ___ ──
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: "horizontalRule" });
      i++;
      continue;
    }

    // ── Callout or Blockquote: > ──
    if (trimmed.startsWith("> ") || trimmed === ">") {
      // Check for callout pattern: > [!type] optional title
      const calloutMatch = trimmed.match(/^> \[!(note|tip|warning|danger|info|success)\]\s*(.*)?$/i);
      if (calloutMatch) {
        const result = parseCallout(lines, i, opts, warnings);
        blocks.push(result.node);
        i = result.nextLine;
      } else {
        const result = parseBlockquote(lines, i, opts, warnings);
        blocks.push(result.node);
        i = result.nextLine;
      }
      continue;
    }

    // ── Table: | col | col | ──
    if (trimmed.startsWith("|") && i + 1 < lines.length && /^\|[\s-:|]+\|$/.test(lines[i + 1].trim())) {
      const result = parseTable(lines, i, opts);
      blocks.push(result.node);
      i = result.nextLine;
      continue;
    }

    // ── Task list: - [ ] or - [x] ──
    if (/^\s*[-*]\s\[[ xX]\]\s/.test(line)) {
      const result = parseTaskList(lines, i, opts);
      blocks.push(result.node);
      i = result.nextLine;
      continue;
    }

    // ── Unordered list: - or * ──
    if (/^(\s*)([-*])\s/.test(line)) {
      const result = parseList(lines, i, "bullet", opts, warnings);
      blocks.push(result.node);
      i = result.nextLine;
      continue;
    }

    // ── Ordered list: 1. ──
    if (/^(\s*)\d+\.\s/.test(line)) {
      const result = parseList(lines, i, "ordered", opts, warnings);
      blocks.push(result.node);
      i = result.nextLine;
      continue;
    }

    // ── Default: paragraph ──
    {
      const result = parseParagraph(lines, i, opts);
      if (result.node.content && result.node.content.length > 0) {
        blocks.push(result.node);
      }
      i = result.nextLine;
    }
  }

  return blocks;
}

// ─── Code Block ─────────────────────────────────────────────

function parseCodeBlock(
  lines: string[],
  startLine: number,
  warnings: ImportWarning[]
): { node: JSONContent; nextLine: number } {
  const openLine = lines[startLine].trimEnd();
  const language = openLine.slice(3).trim() || "";
  const codeLines: string[] = [];

  let i = startLine + 1;
  while (i < lines.length) {
    if (lines[i].trimEnd() === "```") {
      i++; // consume closing fence
      break;
    }
    codeLines.push(lines[i]);
    i++;
  }

  // If we reached EOF without closing, warn
  if (i >= lines.length && lines[lines.length - 1]?.trimEnd() !== "```") {
    warnings.push({
      code: "UNCLOSED_CODE_BLOCK",
      message: "Code block is not closed (missing closing ```)",
      line: startLine + 1,
    });
  }

  const code = codeLines.join("\n");
  return {
    node: {
      type: "codeBlock",
      attrs: { language },
      content: code ? [{ type: "text", text: code }] : undefined,
    },
    nextLine: i,
  };
}

// ─── Blockquote ─────────────────────────────────────────────

function parseBlockquote(
  lines: string[],
  startLine: number,
  opts: ParseOptions,
  warnings: ImportWarning[]
): { node: JSONContent; nextLine: number } {
  const quotedLines: string[] = [];
  let i = startLine;

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("> ")) {
      quotedLines.push(line.slice(2));
      i++;
    } else if (line === ">") {
      quotedLines.push("");
      i++;
    } else {
      break;
    }
  }

  // Recursively parse the quoted content as blocks
  const innerBlocks = parseBlocks(quotedLines, opts, warnings);

  return {
    node: {
      type: "blockquote",
      content:
        innerBlocks.length > 0
          ? innerBlocks
          : [{ type: "paragraph" }],
    },
    nextLine: i,
  };
}

// ─── Callout ────────────────────────────────────────────────

function parseCallout(
  lines: string[],
  startLine: number,
  opts: ParseOptions,
  warnings: ImportWarning[]
): { node: JSONContent; nextLine: number } {
  // First line: > [!type] optional title
  const firstLine = lines[startLine].trimEnd();
  const match = firstLine.match(/^> \[!(note|tip|warning|danger|info|success)\]\s*(.*)?$/i);

  if (!match) {
    // Shouldn't happen — caller already verified
    return parseBlockquote(lines, startLine, opts, warnings);
  }

  const calloutType = match[1].toLowerCase();
  const calloutTitle = match[2]?.trim() || null;

  // Collect body lines (subsequent > lines)
  const bodyLines: string[] = [];
  let i = startLine + 1;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("> ")) {
      bodyLines.push(line.slice(2));
      i++;
    } else if (line === ">") {
      bodyLines.push("");
      i++;
    } else {
      break;
    }
  }

  // Recursively parse body as blocks
  const innerBlocks = bodyLines.length > 0
    ? parseBlocks(bodyLines, opts, warnings)
    : [{ type: "paragraph" as const }];

  return {
    node: {
      type: "callout",
      attrs: { type: calloutType, title: calloutTitle },
      content: innerBlocks.length > 0 ? innerBlocks : [{ type: "paragraph" }],
    },
    nextLine: i,
  };
}

// ─── Task List ──────────────────────────────────────────────

function parseTaskList(
  lines: string[],
  startLine: number,
  opts: ParseOptions
): { node: JSONContent; nextLine: number } {
  const items: JSONContent[] = [];
  let i = startLine;

  while (i < lines.length) {
    const line = lines[i];
    const match = line.match(/^\s*[-*]\s\[([ xX])\]\s(.*)$/);
    if (!match) break;

    const checked = match[1].toLowerCase() === "x";
    const content = match[2];
    const inlineNodes = parseInlineContent(content, opts);

    items.push({
      type: "taskItem",
      attrs: { checked },
      content: [
        {
          type: "paragraph",
          content: inlineNodes.length > 0 ? inlineNodes : undefined,
        },
      ],
    });
    i++;
  }

  return {
    node: {
      type: "taskList",
      content: items.length > 0 ? items : [{ type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph" }] }],
    },
    nextLine: i,
  };
}

// ─── Table ──────────────────────────────────────────────────

function parseTable(
  lines: string[],
  startLine: number,
  opts: ParseOptions
): { node: JSONContent; nextLine: number } {
  const rows: JSONContent[] = [];
  let i = startLine;

  // Header row
  const headerCells = parseTableRow(lines[i], "tableHeader", opts);
  rows.push({ type: "tableRow", content: headerCells });
  i++;

  // Separator row (skip it)
  if (i < lines.length && /^\|[\s-:|]+\|$/.test(lines[i].trim())) {
    i++;
  }

  // Body rows
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith("|")) break;

    const bodyCells = parseTableRow(lines[i], "tableCell", opts);
    rows.push({ type: "tableRow", content: bodyCells });
    i++;
  }

  return {
    node: {
      type: "table",
      content: rows,
    },
    nextLine: i,
  };
}

function parseTableRow(
  line: string,
  cellType: "tableHeader" | "tableCell",
  opts: ParseOptions
): JSONContent[] {
  // Split by | but ignore leading/trailing pipes
  const trimmed = line.trim();
  const withoutPipes = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const withoutTrailing = withoutPipes.endsWith("|")
    ? withoutPipes.slice(0, -1)
    : withoutPipes;

  const cells = withoutTrailing.split("|").map((cell) => {
    const content = cell.trim();
    const inlineNodes = parseInlineContent(content, opts);
    return {
      type: cellType,
      content: [
        {
          type: "paragraph",
          content: inlineNodes.length > 0 ? inlineNodes : undefined,
        },
      ],
    } as JSONContent;
  });

  return cells;
}

// ─── Lists ──────────────────────────────────────────────────

/** Detect indentation level (2 spaces per level) */
function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? Math.floor(match[1].length / 2) : 0;
}

/** Check if a line is a list item at a given indent level */
function isListItem(
  line: string,
  listType: "bullet" | "ordered"
): { indent: number; content: string } | null {
  if (listType === "bullet") {
    const match = line.match(/^(\s*)([-*])\s(.*)$/);
    if (match) {
      return {
        indent: Math.floor(match[1].length / 2),
        content: match[3],
      };
    }
  } else {
    const match = line.match(/^(\s*)\d+\.\s(.*)$/);
    if (match) {
      return {
        indent: Math.floor(match[1].length / 2),
        content: match[2],
      };
    }
  }
  return null;
}

function parseList(
  lines: string[],
  startLine: number,
  listType: "bullet" | "ordered",
  opts: ParseOptions,
  warnings: ImportWarning[]
): { node: JSONContent; nextLine: number } {
  const items: JSONContent[] = [];
  let i = startLine;
  const baseIndent = getIndentLevel(lines[startLine]);

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    // Blank line can separate list items but may also end the list
    if (trimmed === "") {
      // Check if next non-blank line is still a list item at this level
      let nextNonBlank = i + 1;
      while (nextNonBlank < lines.length && lines[nextNonBlank].trimEnd() === "") {
        nextNonBlank++;
      }
      if (nextNonBlank < lines.length) {
        const nextItem = isListItem(lines[nextNonBlank], listType);
        const nextItemOther = isListItem(
          lines[nextNonBlank],
          listType === "bullet" ? "ordered" : "bullet"
        );
        if (
          (nextItem && nextItem.indent === baseIndent) ||
          (nextItemOther && nextItemOther.indent > baseIndent)
        ) {
          i = nextNonBlank;
          continue;
        }
      }
      break;
    }

    const item = isListItem(line, listType);
    if (!item || item.indent < baseIndent) {
      break;
    }

    if (item.indent > baseIndent) {
      // Nested list — determine its type
      const nestedType = isListItem(line, "bullet") ? "bullet" : "ordered";
      const nestedResult = parseList(lines, i, nestedType, opts, warnings);

      // Attach nested list to the last item's content
      if (items.length > 0) {
        const lastItem = items[items.length - 1];
        if (!lastItem.content) lastItem.content = [];
        lastItem.content.push(nestedResult.node);
      }
      i = nestedResult.nextLine;
      continue;
    }

    // Same level item
    const inlineNodes = parseInlineContent(item.content, opts);
    items.push({
      type: "listItem",
      content: [
        {
          type: "paragraph",
          content: inlineNodes.length > 0 ? inlineNodes : undefined,
        },
      ],
    });
    i++;
  }

  return {
    node: {
      type: listType === "bullet" ? "bulletList" : "orderedList",
      content: items.length > 0 ? items : [{ type: "listItem", content: [{ type: "paragraph" }] }],
    },
    nextLine: i,
  };
}

// ─── Paragraph ──────────────────────────────────────────────

function parseParagraph(
  lines: string[],
  startLine: number,
  opts: ParseOptions
): { node: JSONContent; nextLine: number } {
  const paraLines: string[] = [];
  let i = startLine;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    // End paragraph on blank line
    if (trimmed === "") break;

    // End paragraph on block-level construct
    if (
      trimmed.startsWith("```") ||
      /^#{1,6}\s/.test(trimmed) ||
      /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed) ||
      trimmed.startsWith("> ") ||
      trimmed === ">" ||
      /^\s*[-*]\s/.test(line) ||
      /^\s*\d+\.\s/.test(line) ||
      (trimmed.startsWith("|") && i + 1 < lines.length && /^\|[\s-:|]+\|$/.test(lines[i + 1].trim()))
    ) {
      break;
    }

    paraLines.push(line);
    i++;
  }

  // Join paragraph lines, preserving hard breaks (trailing double space)
  const text = paraLines.join("\n");
  const inlineNodes = parseInlineContent(text, opts);

  return {
    node: {
      type: "paragraph",
      content: inlineNodes.length > 0 ? inlineNodes : undefined,
    },
    nextLine: i,
  };
}
