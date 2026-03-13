/**
 * Document Chunking — Sprint 39
 *
 * Converts TipTap JSON documents into readable text chunks for AI consumption.
 * Chunks respect paragraph boundaries so the AI never sees a split mid-sentence.
 *
 * The AI reads documents through chunks (read_first_chunk → read_next_chunk),
 * then references chunk indices when applying edits.
 */

import "server-only";
import type { JSONContent } from "@tiptap/core";
import { tiptapToMarkdown } from "@/lib/domain/content/markdown";

/** Default chunk size in characters (~2000 fits comfortably in tool output) */
const DEFAULT_CHUNK_SIZE = 2000;

/** Metadata returned with each chunk */
export interface ChunkResult {
  /** The text content of this chunk */
  text: string;
  /** Zero-based chunk index */
  chunkIndex: number;
  /** Total number of chunks */
  totalChunks: number;
  /** Total character count of the full document */
  totalLength: number;
  /** Whether there are more chunks after this one */
  hasMore: boolean;
  /** Whether there are chunks before this one */
  hasPrevious: boolean;
}

/**
 * Convert TipTap JSON to markdown and split into chunks.
 * Returns all chunks at once — the read tools select by index.
 */
export function chunkDocument(
  tiptapJson: JSONContent,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): string[] {
  const markdown = tiptapToMarkdown(tiptapJson);
  if (!markdown.trim()) return ["(empty document)"];
  return splitIntoParagraphChunks(markdown, chunkSize);
}

/**
 * Get a specific chunk with navigation metadata.
 */
export function getChunk(
  chunks: string[],
  index: number
): ChunkResult {
  const clampedIndex = Math.max(0, Math.min(index, chunks.length - 1));
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);

  return {
    text: chunks[clampedIndex],
    chunkIndex: clampedIndex,
    totalChunks: chunks.length,
    totalLength,
    hasMore: clampedIndex < chunks.length - 1,
    hasPrevious: clampedIndex > 0,
  };
}

/**
 * Format a ChunkResult as a string for tool output.
 */
export function formatChunkOutput(chunk: ChunkResult): string {
  const nav = [];
  if (chunk.hasPrevious) nav.push("← previous available");
  if (chunk.hasMore) nav.push("→ more available");
  const navLine = nav.length > 0 ? `\n[${nav.join(" | ")}]` : "";

  return [
    `--- Chunk ${chunk.chunkIndex + 1} of ${chunk.totalChunks} (${chunk.totalLength} chars total) ---`,
    "",
    chunk.text,
    navLine,
  ].join("\n");
}

// ─── Internal ─────────────────────────────────

/**
 * Split markdown into chunks that respect paragraph boundaries.
 * Never splits mid-paragraph — instead, includes the full paragraph
 * even if it pushes the chunk slightly over the size limit.
 */
function splitIntoParagraphChunks(
  markdown: string,
  maxChunkSize: number
): string[] {
  // Split by double newline (paragraph boundaries)
  const paragraphs = markdown.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // If adding this paragraph would exceed the limit and we have content,
    // close the current chunk
    if (current && current.length + trimmed.length + 2 > maxChunkSize) {
      chunks.push(current.trim());
      current = trimmed;
    } else {
      current += (current ? "\n\n" : "") + trimmed;
    }
  }

  // Don't forget the last chunk
  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : ["(empty document)"];
}
