/**
 * Wire-level prompt tap (ITERATION-RUN-HARNESS-FIXES §10 L1a), opt-in via
 * `AI_PROMPT_PREFIX_DIAG=1`.
 *
 * A `fetch` wrapper handed to `createOpenAI`: it reads the JSON body the
 * provider package is about to send, compares it with the previous body of
 * the same conversation, and logs `ai:prompt_wire` naming the first part that
 * stopped extending the previous one — the routing key, the tools, the
 * instructions, or the index and kind of the first changed input item, with
 * an excerpt of both sides at the first differing character. The request
 * itself is forwarded untouched; any failure in the tap is swallowed.
 *
 * Nothing secret is read: the Authorization header is never touched, and the
 * body excerpt is the prompt the owner already sees in the transcript.
 */

import "server-only";
import { logger } from "@/lib/core/logger";
import {
  fingerprintWireBody,
  findWireDivergence,
  type WireFingerprint,
} from "./prompt-prefix-diag";

const state = new Map<string, { fingerprint: WireFingerprint; at: number }>();
const MAX_CONVERSATIONS = 20;

function inspect(url: string, body: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return;
  }
  const current = fingerprintWireBody(parsed);
  if (!current?.conversationKey) return;
  const prev = state.get(current.conversationKey);
  if (prev) {
    const d = findWireDivergence(prev.fingerprint, current);
    logger.info({
      layer: "ai",
      event: "ai:prompt_wire",
      summary: d
        ? d.part === "input"
          ? `wire prompt diverges at input[${d.index}] (${d.kindBefore} → ${d.kindAfter ?? "none"}) after ${d.sharedItems} shared items`
          : `wire prompt diverges at ${d.part}`
        : "wire prompt stable — previous body plus appended items",
      attrs: {
        conversation: current.conversationKey,
        endpoint: url.replace(/^https?:\/\/[^/]+/, ""),
        gap_ms: Date.now() - prev.at,
        items_prev: prev.fingerprint.items.length,
        items_curr: current.items.length,
        ...(d
          ? {
              part: d.part,
              index: d.index ?? -1,
              kind_before: d.kindBefore ?? "",
              kind_after: d.kindAfter ?? "",
              prev_excerpt: d.prevExcerpt,
              curr_excerpt: d.currExcerpt,
            }
          : {}),
      },
    });
  }
  state.set(current.conversationKey, { fingerprint: current, at: Date.now() });
  if (state.size > MAX_CONVERSATIONS) {
    const oldest = state.keys().next().value;
    if (oldest !== undefined) state.delete(oldest);
  }
}

/** Wrap `fetch` so every model call's body is fingerprinted before it goes out. */
export function createPromptWireTapFetch(baseFetch: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (/\/(responses|chat\/completions)$/.test(url) && typeof init?.body === "string") {
        inspect(url, init.body);
      }
    } catch {
      // Diagnostic only — never touches the call.
    }
    return baseFetch(input, init);
  };
}

/** `{ fetch }` for a provider factory when the diagnostic is on, else `{}`. */
export function promptWireTapOptions(): { fetch?: typeof fetch } {
  return process.env.AI_PROMPT_PREFIX_DIAG === "1" ? { fetch: createPromptWireTapFetch() } : {};
}
