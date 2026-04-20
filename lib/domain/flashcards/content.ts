import type { JSONContent } from "@tiptap/core";

export const EMPTY_TIPTAP_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function createTextTiptapDoc(text: string): JSONContent {
  const value = text.trim();
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: value ? [{ type: "text", text: value }] : undefined,
      },
    ],
  };
}

export function isTiptapDoc(value: unknown): value is JSONContent {
  return Boolean(
    value &&
      typeof value === "object" &&
      "type" in value &&
      (value as { type?: unknown }).type === "doc"
  );
}

export function normalizeTiptapDoc(value: unknown): JSONContent {
  return isTiptapDoc(value) ? value : EMPTY_TIPTAP_DOC;
}

export function extractPlainTextFromTiptap(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as { text?: unknown; content?: unknown };
  const ownText = typeof node.text === "string" ? node.text : "";
  const childText = Array.isArray(node.content)
    ? node.content.map(extractPlainTextFromTiptap).filter(Boolean).join(" ")
    : "";
  return [ownText, childText].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function summarizeFlashcardContent(value: unknown, maxLength = 140): string {
  const text = extractPlainTextFromTiptap(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trim()}...`;
}

export function sanitizeFlashcardLabel(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, 80);
}

export function sanitizeFlashcardCategory(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || "General").slice(0, 120);
}

export function sanitizeFlashcardSubcategory(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.slice(0, 120);
}
