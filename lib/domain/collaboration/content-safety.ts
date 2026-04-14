import { TiptapTransformer } from "@hocuspocus/transformer";
import type { JSONContent } from "@tiptap/core";
import * as Y from "yjs";

const EMPTY_STRUCTURAL_NODE_TYPES = new Set(["doc", "paragraph", "text", "hardBreak"]);

function hasMeaningfulAttrs(attrs: JSONContent["attrs"]): boolean {
  if (!attrs || typeof attrs !== "object") return false;

  return Object.values(attrs).some((value) => {
    if (value === null || value === undefined || value === false) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "number") return Number.isFinite(value);
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  });
}

/**
 * Conservative content preservation check.
 *
 * Text is meaningful, but so are non-structural TipTap nodes even when they are
 * atoms with no child text. This protects documents made mostly of extension
 * blocks from being mistaken for blank content during collaboration bootstrap
 * and persistence guardrails.
 */
export function hasMeaningfulTipTapContent(
  content: JSONContent | null | undefined
): boolean {
  if (!content) return false;

  if (typeof content.text === "string" && content.text.trim().length > 0) {
    return true;
  }

  if (content.type && !EMPTY_STRUCTURAL_NODE_TYPES.has(content.type)) {
    return true;
  }

  if (hasMeaningfulAttrs(content.attrs)) {
    return true;
  }

  return Array.isArray(content.content) && content.content.some(hasMeaningfulTipTapContent);
}

export function ydocHasMeaningfulDefaultContent(doc: Y.Doc): boolean {
  if (doc.getXmlFragment("default").length === 0) {
    return false;
  }

  try {
    const snapshot = TiptapTransformer.fromYdoc(doc, "default") as JSONContent;
    return hasMeaningfulTipTapContent(snapshot);
  } catch {
    // If conversion fails, the field is not known-empty. Treat it as content
    // bearing so callers do not overwrite Yjs state with payload snapshots.
    return doc.getXmlFragment("default").length > 0;
  }
}

export function ydocUpdateHasMeaningfulDefaultContent(update: Uint8Array): boolean {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, update);
    return ydocHasMeaningfulDefaultContent(doc);
  } finally {
    doc.destroy();
  }
}
