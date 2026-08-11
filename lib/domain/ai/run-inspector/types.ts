/**
 * Run Inspector — diagnostic types over persisted conversation turns.
 *
 * Pure data shapes shared by the analyzer (lib/domain/ai/run-inspector/),
 * the admin API (app/api/admin/ai-runs/), and the inspector UI. Findings
 * extend the shared anomaly catalog in lib/domain/ai/anomalies.ts — one
 * vocabulary for chips (compact chat view) and inspector (deep admin view).
 */

import type { AnomalyKind, MessageAnomaly } from "@/lib/domain/ai/anomalies";

/** Inspector-only anomaly kinds, extending the shared chip catalog. */
export type InspectorOnlyAnomalyKind =
  | "silent-turn"
  | "trailing-reasoning"
  | "unexecuted-tool-call"
  | "approval-denied"
  | "step-cap-suspect"
  | "stalled-auto-continue"
  | "legacy-metadata"
  | "metadata-mismatch";

export type InspectorAnomalyKind = AnomalyKind | InspectorOnlyAnomalyKind;

/**
 * A single diagnostic finding on a turn. `source` distinguishes heuristic
 * derivation from authoritative recorded data ("recorded" is reserved for
 * the self-describing-turns metadata, consumed in a post-merge follow-up).
 */
export interface InspectorFinding extends Omit<MessageAnomaly, "kind"> {
  kind: InspectorAnomalyKind;
  source: "derived" | "recorded";
  /** Pointer to the evidencing data, when it is a specific part or key. */
  evidence?: {
    partIndex?: number;
    metadataKey?: string;
  };
}

export interface ToolCallDiagnostics {
  /** Bare tool name, e.g. "co_browse_open". */
  tool: string;
  /** AI SDK part state, e.g. "output-available", "output-denied". */
  state: string;
  /** True when the tool executes client-side (browser/co-browse tools). */
  clientExecuted: boolean;
  /** Index of the part within the message's parts array. */
  partIndex: number;
  errorText?: string;
  /** Serialized size of the tool output, when present. */
  outputChars?: number;
}

export interface StepDiagnostics {
  index: number;
  /** Part-array bounds [start, end) for this step. */
  partStart: number;
  partEnd: number;
  reasoningChars: number;
  textChars: number;
  textPreview?: string;
  toolCalls: ToolCallDiagnostics[];
  /**
   * True when this step ends an HTTP request (INFERRED: the step's tools are
   * client-executed, or an approval paused the stream). The terminal step
   * always ends the turn's final request regardless of this flag.
   */
  endsRequest: boolean;
  isTerminal: boolean;
}

/**
 * Which metadata generation a persisted turn carries:
 * - "summed"  — post-reliability accumulator: usage summed across requests,
 *               `requestCount` present, terminal finishReason. Trustworthy.
 * - "legacy"  — pre-fix rows frozen at request #1. Usage/finishReason
 *               unreliable for multi-request turns.
 * - "none"    — no finish metadata (user messages, or never persisted).
 */
export type MetadataGeneration = "summed" | "legacy" | "none";

export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

export interface TurnDiagnostics {
  messageId: string;
  role: string;
  createdAt?: string;
  providerId?: string;
  modelId?: string;
  metadataGeneration: MetadataGeneration;
  finishReason?: string;
  usage?: TurnUsage;
  durationMs?: number;
  /** From summed metadata; absent on legacy/none rows. */
  requestCountRecorded?: number;
  /** From segment inference over parts (assistant turns only). */
  requestCountInferred: number;
  stepCount: number;
  steps: StepDiagnostics[];
  hasVisibleText: boolean;
  /** First visible text, trimmed, for list/timeline display. */
  textPreview?: string;
  findings: InspectorFinding[];
}

export interface ConversationDiagnostics {
  conversationId?: string;
  title?: string;
  turns: TurnDiagnostics[];
  totals: {
    assistantTurns: number;
    findingsBySeverity: { error: number; warning: number };
    findingsByKind: Partial<Record<InspectorAnomalyKind, number>>;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    requestCount: number;
  };
  /** Distinct "providerId/modelId" stamps seen on assistant turns. */
  modelsUsed: string[];
}

/** Minimal persisted-message shape the analyzer accepts (Prisma row or fixture). */
export interface AnalyzableMessage {
  id: string;
  role: string;
  parts: unknown;
  metadata?: unknown;
  createdAt?: string | Date;
  providerId?: string | null;
  modelId?: string | null;
}
