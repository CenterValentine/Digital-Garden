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

// ── Wire level (plan §10 L1a) ────────────────────────────────────────────────
//
// The fingerprint above sees the SDK's message array. The provider cache sees
// the HTTP body the provider package builds from it — approval parts,
// reasoning items and provider-executed search calls are shaped THERE, and a
// divergence introduced in that conversion is invisible one layer up. These
// helpers fingerprint the body itself, part by part, in provider order:
// routing key → model → tools → instructions → input items.

export type WirePart = "cacheKey" | "model" | "tools" | "instructions" | "input";

export interface WireItemFingerprint {
  /** `message:<role>`, or the item's own `type` (function_call, reasoning, …). */
  kind: string;
  hash: string;
  /** The item serialized — kept so a divergence can be excerpted precisely. */
  json: string;
}

export interface WireFingerprint {
  cacheKey: string | null;
  model: string | null;
  tools: string;
  instructions: string;
  items: WireItemFingerprint[];
  /** Stable per conversation: the first user item's hash (null when none). */
  conversationKey: string | null;
}

export interface WireDivergence {
  part: WirePart;
  /** Index of the first differing input item (part === "input"). */
  index?: number;
  kindBefore?: string;
  kindAfter?: string;
  /** Input items shared before the divergence. */
  sharedItems: number;
  prevExcerpt: string;
  currExcerpt: string;
}

function itemKind(item: unknown): string {
  if (!item || typeof item !== "object") return typeof item;
  const rec = item as Record<string, unknown>;
  if (typeof rec.type === "string" && rec.type !== "message") return rec.type;
  return `message:${typeof rec.role === "string" ? rec.role : "?"}`;
}

/** Fingerprint a Responses (`input`) or Chat Completions (`messages`) body. */
export function fingerprintWireBody(body: unknown): WireFingerprint | null {
  if (!body || typeof body !== "object") return null;
  const rec = body as Record<string, unknown>;
  const rawItems = Array.isArray(rec.input)
    ? rec.input
    : Array.isArray(rec.messages)
      ? rec.messages
      : null;
  if (!rawItems) return null;
  const items = rawItems.map((item) => {
    const json = JSON.stringify(item) ?? "";
    return { kind: itemKind(item), hash: hash(json), json };
  });
  const firstUser = items.find((i) => i.kind === "message:user");
  return {
    cacheKey: typeof rec.prompt_cache_key === "string" ? rec.prompt_cache_key : null,
    model: typeof rec.model === "string" ? rec.model : null,
    tools: hash(JSON.stringify(rec.tools ?? null)),
    instructions: hash(JSON.stringify(rec.instructions ?? null)),
    items,
    conversationKey: firstUser ? firstUser.hash : null,
  };
}

/** Excerpt both sides at the first character where two strings differ. */
function excerptPair(a: string, b: string, width = 180): [string, string] {
  let i = 0;
  const n = Math.min(a.length, b.length);
  while (i < n && a[i] === b[i]) i++;
  const start = Math.max(0, i - 40);
  const cut = (s: string) => s.slice(start, start + width).replace(/\s+/g, " ");
  return [cut(a), cut(b)];
}

/**
 * The first part where `current` stops extending `previous`; null when the
 * new body is the old one plus appended input items (the cache-friendly
 * shape). A trailing item that CHANGED counts as a divergence only when it is
 * not the last item of `previous` — the per-step notice is appended at the
 * end and legitimately differs step to step.
 */
export function findWireDivergence(
  previous: WireFingerprint,
  current: WireFingerprint,
): WireDivergence | null {
  const scalar = (part: WirePart, a: string | null, b: string | null): WireDivergence | null =>
    a === b ? null : { part, sharedItems: 0, prevExcerpt: String(a), currExcerpt: String(b) };
  const head =
    scalar("cacheKey", previous.cacheKey, current.cacheKey) ??
    scalar("model", previous.model, current.model) ??
    scalar("tools", previous.tools, current.tools) ??
    scalar("instructions", previous.instructions, current.instructions);
  if (head) return head;

  const n = Math.min(previous.items.length, current.items.length);
  for (let i = 0; i < n; i++) {
    if (previous.items[i].hash === current.items[i].hash) continue;
    if (i === previous.items.length - 1) return null; // the replaced trailing notice
    const [prevExcerpt, currExcerpt] = excerptPair(previous.items[i].json, current.items[i].json);
    return {
      part: "input",
      index: i,
      kindBefore: previous.items[i].kind,
      kindAfter: current.items[i].kind,
      sharedItems: i,
      prevExcerpt,
      currExcerpt,
    };
  }
  if (current.items.length < previous.items.length) {
    return {
      part: "input",
      index: n,
      kindBefore: previous.items[n]?.kind,
      kindAfter: undefined,
      sharedItems: n,
      prevExcerpt: previous.items[n]?.json.slice(0, 180) ?? "",
      currExcerpt: "(input ended — items were removed)",
    };
  }
  return null;
}
