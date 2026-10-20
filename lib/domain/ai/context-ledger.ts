/**
 * Context ledger — what the next request will carry, per part and per
 * bucket (CONTEXT-WINDOW-EDITOR-PLAN §6–§7). Client-safe: pure functions
 * over UIMessages plus the last persisted segment.
 *
 * One precedence resolves every part's displayed state, so the chat chips
 * and the ledger never disagree:
 *   live > locked > stripped > removed > behind-line > duplicate > fold >
 *   write-folded > bulk-folded > kept
 * The fold maps are the SAME functions the chat route applies, computed on
 * the same shape (user marks first, then the rule folds).
 */

import type { UIMessage } from "ai";
import {
  applyUserContextMarks,
  bulkReadFoldStates,
  duplicatePartStates,
  isLockedReasoning,
  perceptionFoldStates,
  supersedeBulkReads,
  supersedePerceptionHistory,
  userMarkStates,
  writeInputFoldStates,
  type BulkReadFoldState,
  type DuplicatePartState,
  type PerceptionFoldState,
  type UserMarkState,
  type WriteInputFoldState,
} from "./context-diet";
import {
  contextLineIndex,
  isMarkablePart,
  lastUserMessageIndex,
  partMarkKey,
} from "./context-marks";
import { readTurnSegment, type TurnSegment } from "./turn-diagnostics";

export type ContextPartState =
  | "live"
  | "locked"
  | "stripped"
  | "removed"
  | "behind-line"
  | "dropped-duplicate-call"
  | "identical-output"
  | "folded-distilled"
  | "folded-turn"
  | "write-folded"
  | "bulk-folded"
  | "kept";

export interface ContextLedgerPart {
  messageIdx: number;
  partIdx: number;
  /** The mark key (`call:<id>` / `<type>#<idx>`). */
  key: string;
  role: "user" | "assistant" | "system";
  type: string;
  tool: string | null;
  label: string;
  state: ContextPartState;
  /** Tokens the next request carries for this part (estimate, chars/4). */
  tokens: number;
  /** Tokens the part holds in full. */
  fullTokens: number;
  /** Whether a user mark may toggle this part. */
  markable: boolean;
}

export interface ContextLedgerTurn {
  /** 1-based turn number. */
  n: number;
  userIdx: number;
  assistantIdx: number | null;
  userMessageId: string;
  assistantMessageId: string | null;
  preview: string;
  /** What the provider billed for this turn's requests (sum of segments). */
  measuredInputTokens: number | null;
  requestCount: number;
  /** Tokens the next request carries from this turn. */
  carriedTokens: number;
  parts: ContextLedgerPart[];
  /** True when this turn is the live tail (never markable). */
  live: boolean;
}

export interface ContextLedgerFixed {
  /** Measured from the last request's segment; null until one exists. */
  promptTokens: number | null;
  toolTokens: number | null;
  charterTokens: number;
  mentionsTokens: number;
  rootedTokens: number;
  pageTokens: number;
  toolCount: number | null;
  measured: boolean;
}

export interface ContextLedger {
  turns: ContextLedgerTurn[];
  historyTokens: number;
  fixed: ContextLedgerFixed;
  /** Fixed + history when the fixed part is measured; history alone otherwise. */
  estimatedNextTokens: number;
  /** Tokens removed by user marks (removed + behind the line). */
  removedByUserTokens: number;
  /** Tokens the rule folds already reclaimed. */
  foldedByRuleTokens: number;
  lastMeasuredInputTokens: number | null;
  lastMeasuredCachedTokens: number | null;
  liveFrom: number;
  lineIdx: number | null;
  /** Largest kept, markable results — the ledger's suggestion chips. */
  largestKept: ContextLedgerPart[];
}

const STUB_TOKENS = 45;

export function estimateTokens(text: string): number {
  return tokensForChars(text.length);
}

/** chars/4 — the same rough rule the tool bubbles use. */
export function tokensForChars(chars: number): number {
  return Math.max(0, Math.round(chars / 4));
}

function partChars(part: unknown): number {
  try {
    return JSON.stringify(part).length;
  } catch {
    return 0;
  }
}

function inputChars(part: unknown): number {
  const input = (part as { input?: unknown })?.input;
  if (input === undefined) return 0;
  try {
    return JSON.stringify(input).length;
  } catch {
    return 0;
  }
}

function shorten(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function toolLabel(tool: string, part: Record<string, unknown>): string {
  const input = (part.input ?? {}) as Record<string, unknown>;
  const pick = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : null);
  if (tool === "record_item_result") {
    return `${pick("status") ?? "recorded"} · ${shorten(pick("url") ?? pick("itemKey") ?? "", 60)}`;
  }
  if (tool === "propose_item_iteration") {
    const items = Array.isArray(input.items) ? input.items.length : null;
    return items != null ? `${items} items` : "proposal";
  }
  const addr = pick("url") ?? pick("query") ?? pick("title") ?? pick("rollupTitle") ?? pick("contentId") ?? pick("table") ?? "";
  return shorten(addr, 80);
}

function partLabel(part: Record<string, unknown>, type: string): string {
  if (type === "text") return shorten(String(part.text ?? ""), 90);
  if (type === "reasoning") return "Thinking";
  if (type === "file") return String(part.filename ?? part.mediaType ?? "file");
  if (type.startsWith("tool-")) return toolLabel(type.slice(5), part);
  if (type === "dynamic-tool") return toolLabel(String(part.toolName ?? "tool"), part);
  return type;
}

/** The executed vendor of a message stamp: the namespace of a gateway id, else the provider. */
export function vendorOf(providerId: string | null | undefined, modelId: string | null | undefined): string {
  if (modelId && modelId.includes("/")) return modelId.split("/")[0];
  return providerId ?? "";
}

export function lastSegmentOf(messages: UIMessage[]): TurnSegment | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const meta = (m as { metadata?: Record<string, unknown> }).metadata;
    if (!meta) continue;
    const segs = Array.isArray(meta.segments) ? meta.segments : [];
    const last = segs.length > 0 ? readTurnSegment(segs[segs.length - 1]) : readTurnSegment(meta.segment);
    if (last) return last;
  }
  return null;
}

function segmentsOf(message: UIMessage): TurnSegment[] {
  const meta = (message as { metadata?: Record<string, unknown> }).metadata;
  if (!meta) return [];
  const segs = Array.isArray(meta.segments)
    ? meta.segments.map(readTurnSegment).filter((s): s is TurnSegment => s != null)
    : [];
  if (segs.length > 0) return segs;
  const single = readTurnSegment(meta.segment);
  return single ? [single] : [];
}

interface FoldMaps {
  marks: Map<string, UserMarkState>;
  perception: Map<string, PerceptionFoldState>;
  write: Map<string, WriteInputFoldState>;
  bulk: Map<string, BulkReadFoldState>;
  dup: Map<string, DuplicatePartState>;
}

/** Every fold map the route applies, computed on the shape it applies them to. */
export function computeFoldMaps(messages: UIMessage[], vendor: string): FoldMaps {
  const marked = applyUserContextMarks(messages, vendor);
  return {
    marks: userMarkStates(messages),
    perception: perceptionFoldStates(marked),
    write: writeInputFoldStates(marked),
    bulk: bulkReadFoldStates(marked),
    dup: duplicatePartStates(supersedeBulkReads(supersedePerceptionHistory(marked))),
  };
}

/** The displayed state of one part under the shared precedence. */
export function resolvePartState(
  messages: UIMessage[],
  maps: FoldMaps,
  vendor: string,
  messageIdx: number,
  partIdx: number,
  liveFrom: number,
): ContextPartState {
  const m = messages[messageIdx];
  const part = m.parts[partIdx];
  const type = (part as { type?: string }).type ?? "";
  const key = `${messageIdx}:${partIdx}`;
  if (liveFrom >= 0 && messageIdx >= liveFrom) return "live";
  if (type === "reasoning") {
    if (isLockedReasoning(m, part, vendor)) return "locked";
    if (vendor !== "anthropic") return "stripped";
  }
  const mark = maps.marks.get(key);
  if (mark === "removed") return "removed";
  if (mark === "behind-line") return "behind-line";
  const dup = maps.dup.get(key);
  if (dup) return dup;
  const fold = maps.perception.get(key);
  if (fold === "folded-distilled" || fold === "folded-turn") return fold;
  if (maps.write.get(key) === "folded") return "write-folded";
  if (maps.bulk.get(key) === "folded") return "bulk-folded";
  return "kept";
}

function carriedTokens(state: ContextPartState, part: unknown, type: string, vendor: string): number {
  const full = tokensForChars(partChars(part));
  const inTok = tokensForChars(inputChars(part));
  switch (state) {
    case "live":
      return type === "reasoning" && vendor !== "anthropic" ? 0 : full;
    case "locked":
    case "kept":
      return full;
    case "stripped":
    case "dropped-duplicate-call":
      return 0;
    case "removed":
    case "behind-line":
      if (type.startsWith("tool-") || type === "dynamic-tool") return STUB_TOKENS + inTok;
      if (type === "text") return 8;
      return 0;
    case "identical-output":
    case "folded-distilled":
      return STUB_TOKENS + inTok;
    case "folded-turn":
      return STUB_TOKENS * 2 + inTok;
    case "write-folded":
      return Math.max(STUB_TOKENS, full - inTok + 40);
    case "bulk-folded":
      return STUB_TOKENS + 15 + inTok;
  }
}

export function buildContextLedger(messages: UIMessage[], vendor: string): ContextLedger {
  const maps = computeFoldMaps(messages, vendor);
  const liveFrom = lastUserMessageIndex(messages);
  const lineIdx = contextLineIndex(messages);
  const last = lastSegmentOf(messages);

  const turns: ContextLedgerTurn[] = [];
  let historyTokens = 0;
  let removedByUserTokens = 0;
  let foldedByRuleTokens = 0;
  const keptCandidates: ContextLedgerPart[] = [];

  let n = 0;
  for (let i = 0; i < messages.length; i++) {
    const u = messages[i];
    if (u.role !== "user") continue;
    const a = messages[i + 1]?.role === "assistant" ? messages[i + 1] : null;
    n += 1;
    const parts: ContextLedgerPart[] = [];
    let carried = 0;
    const walk = (m: UIMessage, messageIdx: number) => {
      m.parts.forEach((part, partIdx) => {
        const type = (part as { type?: string }).type ?? "";
        // Composer-level data parts (charter, output target, folder context)
        // have their own controls and carry nothing the ledger can toggle.
        if (type === "step-start" || type === "source-url" || type === "source-document" || type.startsWith("data-")) return;
        const state = resolvePartState(messages, maps, vendor, messageIdx, partIdx, liveFrom);
        const full = tokensForChars(partChars(part));
        const tokens = carriedTokens(state, part, type, vendor);
        const row: ContextLedgerPart = {
          messageIdx,
          partIdx,
          key: partMarkKey(part, partIdx),
          role: m.role,
          type,
          tool: type.startsWith("tool-") ? type.slice(5) : type === "dynamic-tool" ? String((part as { toolName?: string }).toolName ?? "tool") : null,
          label: partLabel(part as Record<string, unknown>, type),
          state,
          tokens,
          fullTokens: full,
          markable:
            isMarkablePart(part) &&
            !["live", "locked", "stripped"].includes(state) &&
            !(type.startsWith("data-")),
        };
        parts.push(row);
        carried += tokens;
        if (state === "removed" || state === "behind-line") removedByUserTokens += full - tokens;
        else if (!["live", "locked", "kept", "stripped"].includes(state)) foldedByRuleTokens += full - tokens;
        if (state === "kept" && row.markable && row.tool) keptCandidates.push(row);
      });
    };
    walk(u, i);
    if (a) walk(a, i + 1);
    const segs = a ? segmentsOf(a) : [];
    const measured = segs.length > 0 ? segs.reduce((s, x) => s + x.usage.inputTokens, 0) : null;
    turns.push({
      n,
      userIdx: i,
      assistantIdx: a ? i + 1 : null,
      userMessageId: u.id,
      assistantMessageId: a?.id ?? null,
      preview: shorten(
        u.parts
          .filter((p): p is { type: "text"; text: string } => (p as { type?: string }).type === "text")
          .map((p) => p.text)
          .join(" "),
        70,
      ),
      measuredInputTokens: measured,
      requestCount: segs.length,
      carriedTokens: carried,
      parts,
      live: liveFrom >= 0 && i >= liveFrom,
    });
    historyTokens += carried;
    if (a) i += 1;
  }

  const q = (chars: number | null | undefined) => (chars == null ? null : tokensForChars(chars));
  const breakdown = last?.promptBreakdown ?? null;
  const fixed: ContextLedgerFixed = {
    promptTokens: q(last?.promptChars),
    toolTokens: q(last?.toolDefinitionChars),
    charterTokens: q(breakdown?.charter) ?? 0,
    mentionsTokens: q(breakdown?.mentions) ?? 0,
    rootedTokens: q(breakdown?.rooted) ?? 0,
    pageTokens: q(breakdown?.page) ?? 0,
    toolCount: last?.toolCount ?? null,
    measured: last?.promptChars != null,
  };
  const fixedTotal = (fixed.promptTokens ?? 0) + (fixed.toolTokens ?? 0);
  keptCandidates.sort((x, y) => y.fullTokens - x.fullTokens);

  return {
    turns,
    historyTokens,
    fixed,
    estimatedNextTokens: fixedTotal + historyTokens,
    removedByUserTokens,
    foldedByRuleTokens,
    lastMeasuredInputTokens: last?.usage.inputTokens ?? null,
    lastMeasuredCachedTokens: last?.usage.cachedInputTokens ?? null,
    liveFrom,
    lineIdx,
    largestKept: keptCandidates.slice(0, 4),
  };
}

/** Copy for each state — chips and the ledger share it. */
export const CONTEXT_STATE_COPY: Record<ContextPartState, { label: string; title: string }> = {
  live: { label: "live", title: "The latest exchange is never edited here — edit or regenerate it instead" },
  locked: { label: "locked", title: "Signed thinking on a Claude turn that called tools must be resent; it cannot be removed" },
  stripped: { label: "stripped", title: "Reasoning is model output; this vendor never reads it back, so it is not resent" },
  removed: { label: "removed by you", title: "You removed this from context; the transcript keeps it. Restore any time" },
  "behind-line": { label: "behind the line", title: "Above “the model reads from here” — stubbed for the model, visible to you" },
  "dropped-duplicate-call": { label: "duplicate of an earlier call — not resent", title: "This call already appears earlier in the transcript; the model sees it once" },
  "identical-output": { label: "identical to an earlier result — nothing changed", title: "Same input and output as an earlier call; the model gets a pointer to that one" },
  "folded-distilled": { label: "folded at checkpoint — digested into the run records", title: "Folded at batch checkpoint — the model no longer carries this; expanding is free" },
  "folded-turn": { label: "folded — digested into the reply that followed", title: "Folded after the turn — the model no longer carries this; expanding is free" },
  "write-folded": { label: "write input folded — the data lives where it was written", title: "A successful write keeps its addresses and drops its payload" },
  "bulk-folded": { label: "database read folded", title: "A bulk read from an earlier turn was digested into the reply that followed" },
  kept: { label: "kept", title: "The model carries this in full on the next request" },
};
