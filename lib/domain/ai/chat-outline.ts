/**
 * Chat Outline Extractor — Sprint 41
 *
 * Extracts a navigable outline from chat messages (UIMessage[]).
 * Two granularity modes:
 *   - "compact": One entry per message (user prompt first line, assistant summary)
 *   - "expanded": Assistant messages expand into sub-items (headers, list previews)
 *
 * Used by ChatOutlinePanel in the right sidebar when viewing a ChatPayload node.
 */

import type { UIMessage } from "ai";

// ─── Types ────────────────────────────────────────────────────

export type ChatOutlineGranularity = "compact" | "expanded";

export interface ChatOutlineEntry {
  /** Unique ID for this entry (message ID or sub-item ID) */
  id: string;
  /** "user" | "assistant" | "tool" for top-level; "heading" | "list" | "image" for sub-items */
  entryType: "user" | "assistant" | "tool" | "heading" | "list" | "image";
  /** Display text (truncated prompt, heading text, list preview, etc.) */
  text: string;
  /** Index of the message in the messages array (for scroll-to) */
  messageIndex: number;
  /** Heading level (1-6) for heading sub-items, undefined for others */
  level?: number;
  /** Child entries (expanded mode only — headers/lists inside assistant messages) */
  children?: ChatOutlineEntry[];
}

// ─── Extraction ───────────────────────────────────────────────

/**
 * Extract chat outline entries from a message array.
 *
 * @param messages - AI SDK UIMessage array
 * @param granularity - "compact" (messages only) or "expanded" (with sub-items)
 * @returns Flat or two-level array of ChatOutlineEntry
 */
export function extractChatOutline(
  messages: UIMessage[],
  granularity: ChatOutlineGranularity = "compact"
): ChatOutlineEntry[] {
  const entries: ChatOutlineEntry[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // Get text content from parts
    const textContent = msg.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("");

    // Check for tool calls
    const hasToolCalls = msg.parts.some((p) => p.type === "dynamic-tool");

    if (msg.role === "user") {
      entries.push({
        id: `outline-${msg.id}`,
        entryType: "user",
        text: truncateLine(textContent, 60),
        messageIndex: i,
      });
    } else if (msg.role === "assistant") {
      const children =
        granularity === "expanded"
          ? extractAssistantSubItems(textContent, i, msg.id)
          : undefined;

      entries.push({
        id: `outline-${msg.id}`,
        entryType: "assistant",
        text: getAssistantSummary(textContent),
        messageIndex: i,
        children: children && children.length > 0 ? children : undefined,
      });

      // Tool call entries (if any)
      if (hasToolCalls) {
        const toolParts = msg.parts.filter((p) => p.type === "dynamic-tool");
        for (const part of toolParts) {
          const toolPart = part as { toolName: string; toolCallId?: string };
          entries.push({
            id: `outline-tool-${toolPart.toolCallId ?? `${msg.id}-${i}`}`,
            entryType: "tool",
            text: toolPart.toolName,
            messageIndex: i,
          });
        }
      }
    }
  }

  return entries;
}

// ─── Sub-item extraction (expanded mode) ──────────────────────

/**
 * Parse markdown-ish assistant text for headers, lists, and images.
 * Returns child entries for the expanded outline view.
 */
function extractAssistantSubItems(
  text: string,
  messageIndex: number,
  messageId: string
): ChatOutlineEntry[] {
  if (!text) return [];

  const children: ChatOutlineEntry[] = [];
  const lines = text.split("\n");
  let subIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Headings: # H1, ## H2, ### H3, etc.
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      children.push({
        id: `outline-${messageId}-sub-${subIndex++}`,
        entryType: "heading",
        text: headingMatch[2].trim(),
        messageIndex,
        level,
      });
      continue;
    }

    // List items: - item, * item, 1. item (first few only, avoid noise)
    const listMatch = trimmed.match(/^(?:[-*+]|\d+\.)\s+(.+)/);
    if (listMatch && children.filter((c) => c.entryType === "list").length < 8) {
      children.push({
        id: `outline-${messageId}-sub-${subIndex++}`,
        entryType: "list",
        text: truncateLine(listMatch[1], 50),
        messageIndex,
      });
      continue;
    }

    // Images: ![alt](url)
    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\([^)]+\)/);
    if (imageMatch) {
      children.push({
        id: `outline-${messageId}-sub-${subIndex++}`,
        entryType: "image",
        text: imageMatch[1] || "Image",
        messageIndex,
      });
    }
  }

  return children;
}

// ─── Helpers ──────────────────────────────────────────────────

/** Get first meaningful line of assistant response as summary */
function getAssistantSummary(text: string): string {
  if (!text) return "Empty response";

  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return "Empty response";

  // Prefer first heading if present
  const firstHeading = lines.find((l) => /^#{1,6}\s+/.test(l.trim()));
  if (firstHeading) {
    return truncateLine(firstHeading.replace(/^#+\s+/, ""), 60);
  }

  // Otherwise first non-empty line
  return truncateLine(lines[0], 60);
}

/** Truncate text to maxLen, appending "..." if truncated */
function truncateLine(text: string, maxLen: number): string {
  const cleaned = text.replace(/\n/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 3) + "...";
}
