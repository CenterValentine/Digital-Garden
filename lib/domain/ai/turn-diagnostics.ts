/**
 * Turn diagnostics — the shared, client-safe vocabulary for "what did the
 * harness decide and why did this turn stop" (AI maintenance item 1,
 * self-describing turns).
 *
 * Persisted per assistant turn in `ConversationMessage.metadata`:
 * - `segments[]` — one fixed-shape record per HTTP request of the turn (a
 *   turn with client-executed tools spans several), carrying the step cap in
 *   force, steps used, per-step summaries, and the output ceiling applied.
 * - `flags[]` — derived anomaly flags (terminal state, recomputed on every
 *   persistence fold).
 * - `diagnosticsVersion` — marks merged/self-described blobs; raw per-request
 *   SDK metadata never carries it, which is how the persistence fold tells a
 *   seed (already-merged) blob from a live request blob.
 *
 * Flag names deliberately reuse the AnomalyChips vocabulary
 * (components/content/ai/AnomalyChips.tsx: "output-limit" / "tool-error" /
 * "tool-failure" / "captcha") and extend it with harness-level causes chips
 * cannot see from parts alone ("step-cap-hit", "awaiting-continuation").
 * Part-scanning semantics mirror deriveMessageAnomalies so the render-time
 * and persist-time views cannot drift apart.
 *
 * This module must stay importable from client components, the chat route,
 * scripts, and the future Run Inspector: no Prisma, no zod, no React.
 */

export const DIAGNOSTICS_VERSION = 1;

/** Where the turn's `stopWhen` step cap came from. */
export type StepCapSource = "item-iteration" | "research" | "editable" | "base";

/** Where the applied output-token ceiling came from. */
export type MaxTokensSource = "user" | "catalog" | "provider-default";

export type TurnFlag =
  /** Terminal request ended at the output-token limit (finishReason "length"). */
  | "output-limit"
  /** Output-limit AND nothing visible after the last step start — the whole
   *  budget went to reasoning (the 2026-08-08 DeepSeek death mode). */
  | "silent-truncation"
  /** Terminal request used every allowed step and still wanted tools — the
   *  harness, not the model, ended the loop. */
  | "step-cap-hit"
  /** At least one tool call errored (part state "output-error"). */
  | "tool-error"
  /** At least one tool ran but reported failure (output ok:false / snapshotError). */
  | "tool-failure"
  /** A co-browsed page surfaced an anti-bot challenge (captchaDetected). */
  | "captcha"
  /** The user denied a tool approval in this turn. */
  | "approval-denied"
  /** The turn's last part is an unexecuted tool call — the loop ended
   *  expecting a client-side resume that has not happened. */
  | "awaiting-continuation";

/** Bounded per-step summary — parts remain the source of truth for content. */
export interface TurnStepSummary {
  finishReason: string | null;
  tools: string[];
  outputTokens: number | null;
}

export interface TurnSegmentUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
}

/**
 * One HTTP request of an assistant turn. FIXED SHAPE — every key is always
 * emitted (null over absent): the AI SDK deep-merges metadata across a turn's
 * requests in client memory, so an omitted key would silently inherit the
 * previous request's value.
 */
export interface TurnSegment {
  /** ISO timestamp of the request's stream start — per-request identity. */
  startedAt: string;
  finishReason: string | null;
  usage: TurnSegmentUsage;
  durationMs: number;
  stepsUsed: number;
  stepCap: number;
  capSource: StepCapSource;
  steps: TurnStepSummary[];
  /** Count of step summaries dropped beyond MAX_STEP_SUMMARIES. */
  stepsTruncated: number;
  maxOutputTokens: number | null;
  maxTokensSource: MaxTokensSource;
  /** Compact description of the reasoning config applied (e.g. "deepseek:adaptive+low"). */
  reasoningConfig: string | null;
  toolCount: number;
}

export interface TurnDiagnostics {
  version: number;
  segments: TurnSegment[];
  segmentsTruncated: number;
  flags: TurnFlag[];
  finishReason: string | null;
  requestCount: number | null;
}

/** Hard bounds keeping the metadata blob small (worst case well under ~25KB). */
export const MAX_SEGMENTS = 40;
export const MAX_STEP_SUMMARIES = 30;

// ---------------------------------------------------------------------------
// Part scanning (tolerant of unknown shapes — parts come from any SDK version)
// ---------------------------------------------------------------------------

interface PartShape {
  type?: unknown;
  state?: unknown;
  text?: unknown;
  output?: unknown;
}

function asPart(raw: unknown): PartShape {
  return raw && typeof raw === "object" ? (raw as PartShape) : {};
}

function isToolPart(p: PartShape): boolean {
  return typeof p.type === "string" && p.type.startsWith("tool-");
}

function hasVisibleTextAfterLastStepStart(parts: unknown[]): boolean {
  let lastStepStart = -1;
  for (let i = 0; i < parts.length; i++) {
    if (asPart(parts[i]).type === "step-start") lastStepStart = i;
  }
  // No step boundaries → judge the whole message.
  const from = lastStepStart === -1 ? 0 : lastStepStart + 1;
  for (let i = from; i < parts.length; i++) {
    const p = asPart(parts[i]);
    if (p.type === "text" && typeof p.text === "string" && p.text.trim()) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Flag derivation
// ---------------------------------------------------------------------------

/**
 * Derive the turn's anomaly flags from its durable record. Pure and
 * idempotent — the persistence fold recomputes on every request, so a resumed
 * turn naturally clears "awaiting-continuation".
 */
export function deriveTurnFlags(
  parts: unknown[],
  segments: TurnSegment[],
): TurnFlag[] {
  const flags: TurnFlag[] = [];
  const terminal = segments.length > 0 ? segments[segments.length - 1] : null;

  if (terminal?.finishReason === "length") {
    flags.push("output-limit");
    if (!hasVisibleTextAfterLastStepStart(parts)) {
      flags.push("silent-truncation");
    }
  }

  if (
    terminal &&
    terminal.stepCap > 0 &&
    terminal.stepsUsed >= terminal.stepCap &&
    terminal.finishReason === "tool-calls"
  ) {
    flags.push("step-cap-hit");
  }

  let toolError = false;
  let toolFailure = false;
  let captcha = false;
  let approvalDenied = false;
  for (const raw of parts) {
    const p = asPart(raw);
    if (!isToolPart(p)) continue;
    if (p.state === "output-error") toolError = true;
    if (p.state === "output-denied") approvalDenied = true;
    if (p.state === "output-available" && p.output && typeof p.output === "object") {
      const out = p.output as {
        ok?: unknown;
        snapshotError?: unknown;
        captchaDetected?: unknown;
      };
      if (out.ok === false) toolFailure = true;
      else if (typeof out.snapshotError === "string" && out.snapshotError) {
        toolFailure = true;
      }
      if (out.captchaDetected === true) captcha = true;
    }
  }
  if (toolError) flags.push("tool-error");
  if (toolFailure) flags.push("tool-failure");
  if (captcha) flags.push("captcha");
  if (approvalDenied) flags.push("approval-denied");

  // Loop ended on an unexecuted tool call (client-executed tool whose resume
  // never arrived). "input-available" only — "approval-requested" is a normal
  // paused state with its own visible card, not an anomaly.
  const last = asPart(parts[parts.length - 1]);
  if (isToolPart(last) && last.state === "input-available") {
    flags.push("awaiting-continuation");
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Segment list maintenance (used by the persistence fold)
// ---------------------------------------------------------------------------

/**
 * Append a segment to the bounded list, deduped by `startedAt` (a repeated
 * fold of the same request's blob must not double-record). Returns the new
 * list plus the cumulative dropped-count.
 */
export function appendTurnSegment(
  segments: TurnSegment[],
  segment: TurnSegment,
  priorTruncated: number,
): { segments: TurnSegment[]; segmentsTruncated: number } {
  if (segments.some((s) => s.startedAt === segment.startedAt)) {
    return { segments, segmentsTruncated: priorTruncated };
  }
  const next = [...segments, segment];
  if (next.length <= MAX_SEGMENTS) {
    return { segments: next, segmentsTruncated: priorTruncated };
  }
  const overflow = next.length - MAX_SEGMENTS;
  return {
    segments: next.slice(overflow),
    segmentsTruncated: priorTruncated + overflow,
  };
}

// ---------------------------------------------------------------------------
// Tolerant readers (rows of any age; absence ⇒ pre-v1, never "healthy")
// ---------------------------------------------------------------------------

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

const CAP_SOURCES: readonly StepCapSource[] = [
  "item-iteration",
  "research",
  "editable",
  "base",
];
const MAX_TOKENS_SOURCES: readonly MaxTokensSource[] = [
  "user",
  "catalog",
  "provider-default",
];

/** Parse one segment blob; null when it isn't recognizably a segment. */
export function readTurnSegment(raw: unknown): TurnSegment | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.startedAt !== "string" || !s.startedAt) return null;
  const usage =
    s.usage && typeof s.usage === "object"
      ? (s.usage as Record<string, unknown>)
      : {};
  const steps: TurnStepSummary[] = Array.isArray(s.steps)
    ? s.steps.flatMap((step) => {
        if (!step || typeof step !== "object") return [];
        const st = step as Record<string, unknown>;
        return [
          {
            finishReason: strOrNull(st.finishReason),
            tools: Array.isArray(st.tools)
              ? st.tools.filter((t): t is string => typeof t === "string")
              : [],
            outputTokens: numOrNull(st.outputTokens),
          },
        ];
      })
    : [];
  return {
    startedAt: s.startedAt,
    finishReason: strOrNull(s.finishReason),
    usage: {
      inputTokens: num(usage.inputTokens),
      outputTokens: num(usage.outputTokens),
      totalTokens: num(usage.totalTokens),
      reasoningTokens: num(usage.reasoningTokens),
      cachedInputTokens: num(usage.cachedInputTokens),
    },
    durationMs: num(s.durationMs),
    stepsUsed: num(s.stepsUsed),
    stepCap: num(s.stepCap),
    capSource: CAP_SOURCES.includes(s.capSource as StepCapSource)
      ? (s.capSource as StepCapSource)
      : "base",
    steps,
    stepsTruncated: num(s.stepsTruncated),
    maxOutputTokens: numOrNull(s.maxOutputTokens),
    maxTokensSource: MAX_TOKENS_SOURCES.includes(
      s.maxTokensSource as MaxTokensSource,
    )
      ? (s.maxTokensSource as MaxTokensSource)
      : "provider-default",
    reasoningConfig: strOrNull(s.reasoningConfig),
    toolCount: num(s.toolCount),
  };
}

// ---------------------------------------------------------------------------
// Per-turn accumulator fold (used by use-conversation-binding's persister;
// lives here so the diagnostics check script can exercise it without pulling
// the client hook's React/store import graph)
// ---------------------------------------------------------------------------

/** Running turn totals for one assistant message (see mergeTurnUsageMetadata). */
export interface TurnUsageAccum {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  durationMs: number;
  requestCount: number;
  finishReason?: string;
  /** Per-request segment records (self-describing turns), bounded. */
  segments: TurnSegment[];
  /** Count of segment records dropped beyond the bound. */
  segmentsTruncated: number;
  /**
   * Signature of the last per-request metadata folded in — the persister can
   * run repeatedly for the same finish event, and a repeat pass with
   * unchanged metadata must not double-count.
   */
  lastRequestSig?: string;
}

interface RequestUsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  durationMs: number;
  requestCount: number;
  finishReason?: string;
}

function readUsageSnapshot(
  metadata: Record<string, unknown> | undefined,
): RequestUsageSnapshot | null {
  if (!metadata) return null;
  const usage = metadata.usage as Record<string, unknown> | undefined;
  if (
    usage === undefined &&
    metadata.finishReason === undefined &&
    metadata.durationMs === undefined
  ) {
    return null;
  }
  return {
    inputTokens: num(usage?.inputTokens),
    outputTokens: num(usage?.outputTokens),
    totalTokens: num(usage?.totalTokens),
    reasoningTokens: num(usage?.reasoningTokens),
    cachedInputTokens: num(usage?.cachedInputTokens),
    durationMs: num(metadata.durationMs),
    // Merged blobs (persisted by this module) carry their own requestCount;
    // raw per-request metadata from the SDK counts as one request.
    requestCount: Math.max(1, num(metadata.requestCount) || 1),
    finishReason:
      typeof metadata.finishReason === "string"
        ? metadata.finishReason
        : undefined,
  };
}

/**
 * Fold one finish-metadata blob into the per-turn accumulator and return the
 * metadata to persist: usage and duration SUMMED across every HTTP request of
 * the turn, finishReason from the TERMINAL request, segments appended per
 * request, flags re-derived.
 *
 * Why: a turn with client-executed tools (browser reads, co-browse) spans
 * several requests, each emitting its own finish metadata. Persisting any
 * single request's values misreports the turn — the 2026-08-08 DeepSeek
 * failure was mis-diagnosed from metadata frozen at request #1
 * ("tool-calls", 659 tokens) while the terminal request actually died at the
 * output cap ("length", 4096 tokens).
 */
export function mergeTurnUsageMetadata(
  accum: Map<string, TurnUsageAccum>,
  messageId: string,
  incoming: Record<string, unknown> | undefined,
  parts: unknown[],
): Record<string, unknown> | undefined {
  const request = readUsageSnapshot(incoming);
  if (!request) return incoming;
  const sig = JSON.stringify(request);
  const entry: TurnUsageAccum = accum.get(messageId) ?? {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    reasoningTokens: 0,
    cachedInputTokens: 0,
    durationMs: 0,
    requestCount: 0,
    segments: [],
    segmentsTruncated: 0,
  };
  // A blob stamped with diagnosticsVersion was merged BY this module (the
  // seed path folds persisted rows back in on load) — its segments restore
  // wholesale and must never re-append. Raw per-request SDK blobs never
  // carry the stamp; their `segment` record appends (deduped by startedAt).
  const isMergedBlob = typeof incoming?.diagnosticsVersion === "number";
  if (entry.lastRequestSig !== sig) {
    entry.inputTokens += request.inputTokens;
    entry.outputTokens += request.outputTokens;
    entry.totalTokens += request.totalTokens;
    entry.reasoningTokens += request.reasoningTokens;
    entry.cachedInputTokens += request.cachedInputTokens;
    entry.durationMs += request.durationMs;
    entry.requestCount += request.requestCount;
    entry.lastRequestSig = sig;
    if (request.finishReason) entry.finishReason = request.finishReason;
  }
  if (isMergedBlob) {
    if (entry.segments.length === 0 && Array.isArray(incoming?.segments)) {
      entry.segments = incoming.segments.flatMap((s) => {
        const parsed = readTurnSegment(s);
        return parsed ? [parsed] : [];
      });
      const truncated = incoming?.segmentsTruncated;
      entry.segmentsTruncated =
        typeof truncated === "number" && Number.isFinite(truncated)
          ? truncated
          : 0;
    }
  } else {
    const segment = readTurnSegment(
      (incoming as { segment?: unknown } | undefined)?.segment,
    );
    if (segment) {
      const appended = appendTurnSegment(
        entry.segments,
        segment,
        entry.segmentsTruncated,
      );
      entry.segments = appended.segments;
      entry.segmentsTruncated = appended.segmentsTruncated;
    }
  }
  accum.set(messageId, entry);
  // The raw per-request `segment` key is transient transport — the merged
  // `segments` array is its durable home.
  const { segment: _transientSegment, ...base } = (incoming ?? {}) as Record<
    string,
    unknown
  > & { segment?: unknown };
  return {
    ...base,
    usage: {
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      totalTokens: entry.totalTokens,
      reasoningTokens: entry.reasoningTokens,
      cachedInputTokens: entry.cachedInputTokens,
    },
    durationMs: entry.durationMs,
    requestCount: entry.requestCount,
    ...(entry.finishReason ? { finishReason: entry.finishReason } : {}),
    segments: entry.segments,
    segmentsTruncated: entry.segmentsTruncated,
    // Recomputed on every fold — a resumed turn naturally clears transient
    // flags like awaiting-continuation.
    flags: deriveTurnFlags(parts, entry.segments),
    diagnosticsVersion: DIAGNOSTICS_VERSION,
  };
}

const KNOWN_FLAGS: readonly TurnFlag[] = [
  "output-limit",
  "silent-truncation",
  "step-cap-hit",
  "tool-error",
  "tool-failure",
  "captcha",
  "approval-denied",
  "awaiting-continuation",
];

/**
 * Read a message's persisted diagnostics. Returns null for pre-v1 rows (no
 * `diagnosticsVersion`) — readers must treat that as "unknown", never as "no
 * anomalies".
 */
export function readTurnDiagnostics(
  metadata: unknown,
): TurnDiagnostics | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  if (typeof m.diagnosticsVersion !== "number") return null;
  const segments = Array.isArray(m.segments)
    ? m.segments.flatMap((s) => {
        const parsed = readTurnSegment(s);
        return parsed ? [parsed] : [];
      })
    : [];
  const flags = Array.isArray(m.flags)
    ? m.flags.filter((f): f is TurnFlag =>
        KNOWN_FLAGS.includes(f as TurnFlag),
      )
    : [];
  return {
    version: m.diagnosticsVersion,
    segments,
    segmentsTruncated: num(m.segmentsTruncated),
    flags,
    finishReason: strOrNull(m.finishReason),
    requestCount: numOrNull(m.requestCount),
  };
}
