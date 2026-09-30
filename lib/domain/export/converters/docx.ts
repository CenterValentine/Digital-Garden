/**
 * DOCX Converter — TipTap JSON → Word document via the `docx` package.
 *
 * Covers the block/mark subset that text documents (notes, resumes,
 * dossiers) actually use: paragraphs, headings 1–6, bullet/ordered lists
 * (both render as bullets — Word numbering config is deferred), block
 * quotes, code blocks, bold/italic/underline/strike/code marks, and links
 * (real hyperlinks — the URL used to be dropped and only the label kept,
 * so a resume's "LinkedIn" went out pointing nowhere; plan §10 round 3).
 * Unknown nodes degrade to their extracted text instead of being dropped,
 * matching the editor's unsupported-content philosophy.
 */

import {
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type {
  DocumentConverter,
  ConversionOptions,
  ConversionResult,
} from "../types";
import type { JSONContent } from "@tiptap/core";

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

interface MarkState {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
}

function marksToState(node: JSONContent): MarkState {
  const state: MarkState = {};
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") state.bold = true;
    if (mark.type === "italic") state.italics = true;
    if (mark.type === "underline") state.underline = true;
    if (mark.type === "strike") state.strike = true;
    if (mark.type === "code") state.code = true;
  }
  return state;
}

/** The href of a text node's link mark, if it has one. */
function linkHref(node: JSONContent): string | null {
  const mark = node.marks?.find((m) => m.type === "link");
  const href = mark?.attrs?.href;
  return typeof href === "string" && href.trim() ? href.trim() : null;
}

type InlineChild = TextRun | ExternalHyperlink;

function inlineRuns(node: JSONContent): InlineChild[] {
  const runs: InlineChild[] = [];
  // Consecutive text nodes under the SAME link (a label split by a bold
  // mark, say) become one hyperlink, not several adjacent ones.
  let pending: { href: string; runs: TextRun[] } | null = null;
  const flush = () => {
    if (pending) {
      runs.push(new ExternalHyperlink({ link: pending.href, children: pending.runs }));
      pending = null;
    }
  };
  for (const child of node.content ?? []) {
    if (child.type === "text") {
      const state = marksToState(child);
      const href = linkHref(child);
      const run = new TextRun({
        text: child.text ?? "",
        bold: state.bold,
        italics: state.italics,
        underline: state.underline || href ? {} : undefined,
        strike: state.strike,
        font: state.code ? "Courier New" : undefined,
        ...(href ? { style: "Hyperlink" } : {}),
      });
      if (href) {
        if (pending && pending.href !== href) flush();
        pending ??= { href, runs: [] };
        pending.runs.push(run);
        continue;
      }
      flush();
      runs.push(run);
    } else if (child.type === "hardBreak") {
      flush();
      runs.push(new TextRun({ text: "", break: 1 }));
    } else if (child.content) {
      flush();
      runs.push(...inlineRuns(child));
    }
  }
  flush();
  return runs;
}

function extractText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(extractText).join(" ").trim();
}

function blockToParagraphs(
  node: JSONContent,
  context: { bulletLevel?: number; indent?: boolean } = {}
): Paragraph[] {
  const indent = context.indent ? { left: 720 } : undefined;
  switch (node.type) {
    case "paragraph":
      return [
        new Paragraph({
          children: inlineRuns(node),
          indent,
          bullet:
            context.bulletLevel !== undefined
              ? { level: context.bulletLevel }
              : undefined,
        }),
      ];
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6);
      return [
        new Paragraph({
          children: inlineRuns(node),
          heading: HEADING_LEVELS[level - 1],
        }),
      ];
    }
    case "bulletList":
    case "orderedList": {
      const level = (context.bulletLevel ?? -1) + 1;
      const paragraphs: Paragraph[] = [];
      for (const item of node.content ?? []) {
        for (const block of item.content ?? []) {
          paragraphs.push(
            ...blockToParagraphs(block, { ...context, bulletLevel: level })
          );
        }
      }
      return paragraphs;
    }
    case "blockquote": {
      const paragraphs: Paragraph[] = [];
      for (const block of node.content ?? []) {
        paragraphs.push(...blockToParagraphs(block, { ...context, indent: true }));
      }
      return paragraphs;
    }
    case "codeBlock":
      return [
        new Paragraph({
          children: [
            new TextRun({ text: extractText(node), font: "Courier New" }),
          ],
          indent,
        }),
      ];
    case "horizontalRule":
      return [new Paragraph({ children: [new TextRun({ text: "———" })] })];
    default: {
      // Unknown block — degrade to extracted text rather than dropping it.
      const text = extractText(node);
      if (!text) return [];
      return [new Paragraph({ children: [new TextRun({ text })], indent })];
    }
  }
}

export class DOCXConverter implements DocumentConverter {
  async convert(
    tiptapJson: JSONContent,
    options: ConversionOptions
  ): Promise<ConversionResult> {
    const startTime = performance.now();
    void options;

    const children: Paragraph[] = [];
    for (const block of tiptapJson.content ?? []) {
      children.push(...blockToParagraphs(block));
    }
    if (children.length === 0) {
      children.push(new Paragraph({ children: [new TextRun({ text: "" })] }));
    }

    const document = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(document);

    return {
      success: true,
      files: [
        {
          name: "document.docx",
          content: Buffer.from(buffer),
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size: buffer.byteLength,
        },
      ],
      metadata: {
        conversionTime: performance.now() - startTime,
        format: "docx",
      },
    };
  }
}
