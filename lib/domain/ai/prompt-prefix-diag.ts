/**
 * Prompt-prefix divergence diagnostic (ITERATION-RUN-HARNESS-FIXES §8).
 *
 * Provider prompt caches (OpenAI's included) match the LONGEST identical
 * prefix of a prior prompt. Prod ecf1d0e5 (2026-09-28): inside one request
 * the cached-token count froze at exactly 27,133 for eleven consecutive
 * steps while the prompt grew from 39k to 46k, and the first step of every
 * HTTP request cached nothing — 315k tokens re-sent at full price, ~$0.55
 * of an $0.82 turn. Both patterns mean the prompt differs from its
 * predecessor somewhere BEFORE the tail; nothing in the metadata says
 * where.
 *
 * This module answers "where" without guessing: each step's model input is
 * chunked and hashed, and the first chunk that differs from the previous
 * step (or from the previous request's first step) is logged with a short
 * excerpt of both sides. Pure, so the gate can pin it; gated by
 * `AI_PROMPT_PREFIX_DIAG=1` in the route because hashing a 45k-token prompt
 * per step is work nobody needs on the hot path once the cause is known.
 */

import { createHash } from "node:crypto";

/** Chunk size in characters (~500 tokens) — coarse enough to be cheap, fine
 * enough to name the message that broke the prefix. */
export const PREFIX_CHUNK_CHARS = 2_000;

export interface PrefixFingerprint {
  /** Hash per chunk, in order. */
  chunks: string[];
  /** Total serialized length. */
  length: number;
}

export interface PrefixDivergence {
  /** Index of the first differing chunk; -1 when one is a prefix of the other. */
  chunkIndex: number;
  /** Character offset where the divergence chunk starts. */
  offset: number;
  /** Chunks shared before the divergence. */
  sharedChunks: number;
  /** Approximate shared tokens (chars / 4). */
  sharedTokensApprox: number;
}

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

/**
 * Serialize what the provider will see, in the order it will see it. The
 * system prompt and tool NAMES lead (their schemas are part of the prefix
 * too, but stable per name within a request), then the messages verbatim.
 */
export function serializePromptForDiag(input: {
  system?: string;
  toolNames?: readonly string[];
  messages: unknown;
}): string {
  return (
    `SYSTEM:\n${input.system ?? ""}\nTOOLS:${(input.toolNames ?? []).join(",")}\nMESSAGES:\n` +
    JSON.stringify(input.messages)
  );
}

export function fingerprintPrompt(serialized: string): PrefixFingerprint {
  const chunks: string[] = [];
  for (let i = 0; i < serialized.length; i += PREFIX_CHUNK_CHARS) {
    chunks.push(hash(serialized.slice(i, i + PREFIX_CHUNK_CHARS)));
  }
  return { chunks, length: serialized.length };
}

/** Where two fingerprints stop agreeing; null when they agree entirely. */
export function findPrefixDivergence(
  previous: PrefixFingerprint,
  current: PrefixFingerprint,
): PrefixDivergence | null {
  const n = Math.min(previous.chunks.length, current.chunks.length);
  for (let i = 0; i < n; i++) {
    if (previous.chunks[i] !== current.chunks[i]) {
      return {
        chunkIndex: i,
        offset: i * PREFIX_CHUNK_CHARS,
        sharedChunks: i,
        sharedTokensApprox: Math.round((i * PREFIX_CHUNK_CHARS) / 4),
      };
    }
  }
  // One is a prefix of the other — the cache-friendly case (a grown prompt).
  return null;
}

/** A short, log-safe excerpt around an offset (no secrets by construction: it
 * is the model prompt, which the log's owner already sees in the transcript). */
export function excerptAt(serialized: string, offset: number, width = 160): string {
  const start = Math.max(0, offset - Math.floor(width / 4));
  return serialized.slice(start, start + width).replace(/\s+/g, " ");
}
