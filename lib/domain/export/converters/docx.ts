/**
 * DOCX Converter — TipTap JSON → Word document via the `docx` package.
 *
 * Covers the block/mark subset that text documents (notes, resumes,
 * dossiers) actually use: paragraphs, headings 1–6, bullet/ordered lists
 * (both render as bullets — Word numbering config is deferred), block
 * quotes, code blocks, and bold/italic/underline/strike/code marks.
 * Unknown nodes degrade to their extracted text instead of being dropped,
 * matching the editor's unsupported-content philosophy.
 */

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
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

function inlineRuns(node: JSONContent): TextRun[] {
  const runs: TextRun[] = [];
  for (const child of node.content ?? []) {
    if (child.type === "text") {
      const state = marksToState(child);
      runs.push(
        new TextRun({
          text: child.text ?? "",
          bold: state.bold,
          italics: state.italics,
          underline: state.underline ? {} : undefined,
          strike: state.strike,
          font: state.code ? "Courier New" : undefined,
        })
      );
    } else if (child.type === "hardBreak") {
      runs.push(new TextRun({ text: "", break: 1 }));
    } else if (child.content) {
      runs.push(...inlineRuns(child));
    }
  }
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
