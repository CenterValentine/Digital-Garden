/**
 * Run Inspector analyzer — turns persisted conversation rows into
 * diagnostics. Pure functions over plain data (no Prisma, no React): the
 * admin API feeds it Prisma rows, the check script feeds it fixtures.
 *
 * Reading order per turn: split parts into steps on `step-start`, profile
 * each step (reasoning/text volume, tool calls + states), infer request
 * segments, classify the metadata generation, then run the shared chip
 * derivation plus the inspector-only detectors.
 */

import { deriveMessageAnomalies } from "@/lib/domain/ai/anomalies";
import { deriveInspectorFindings } from "./anomalies";
import {
  inferRequestCount,
  isClientExecutedTool,
  stepEndsRequest,
} from "./segments";
import type {
  AnalyzableMessage,
  ConversationDiagnostics,
  InspectorAnomalyKind,
  InspectorFinding,
  MetadataGeneration,
  StepDiagnostics,
  ToolCallDiagnostics,
  TurnDiagnostics,
  TurnUsage,
} from "./types";

const TEXT_PREVIEW_CHARS = 160;

interface PartShape {
  type?: unknown;
  text?: unknown;
  state?: unknown;
  output?: unknown;
  errorText?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function optionalNum(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function partText(part: PartShape): string {
  return typeof part.text === "string" ? part.text : "";
}

// ------------------------------------------------------------------
// Steps
// ------------------------------------------------------------------

function buildSteps(parts: unknown[]): StepDiagnostics[] {
  const steps: StepDiagnostics[] = [];
  let current: StepDiagnostics | null = null;

  const open = (partStart: number): StepDiagnostics => ({
    index: steps.length,
    partStart,
    partEnd: partStart,
    reasoningChars: 0,
    textChars: 0,
    toolCalls: [],
    endsRequest: false,
    isTerminal: false,
  });

  const close = (partEnd: number) => {
    if (!current) return;
    current.partEnd = partEnd;
    current.endsRequest = stepEndsRequest(current);
    steps.push(current);
    current = null;
  };

  parts.forEach((raw, index) => {
    const part = raw as PartShape;
    const type = typeof part.type === "string" ? part.type : "";

    if (type === "step-start") {
      close(index);
      current = open(index);
      return;
    }
    if (!current) current = open(index);

    if (type === "reasoning") {
      current.reasoningChars += partText(part).length;
    } else if (type === "text") {
      const text = partText(part);
      current.textChars += text.length;
      if (!current.textPreview && text.trim()) {
        current.textPreview = text.trim().slice(0, TEXT_PREVIEW_CHARS);
      }
    } else if (type.startsWith("tool-")) {
      const tool = type.slice(5);
      const call: ToolCallDiagnostics = {
        tool,
        state: str(part.state) ?? "unknown",
        clientExecuted: isClientExecutedTool(tool),
        partIndex: index,
      };
      const errorText = str(part.errorText);
      if (errorText) call.errorText = errorText;
      if (part.output !== undefined) {
        try {
          call.outputChars = JSON.stringify(part.output)?.length ?? 0;
        } catch {
          call.outputChars = 0;
        }
      }
      current.toolCalls.push(call);
    }
  });
  close(parts.length);

  if (steps.length > 0) steps[steps.length - 1].isTerminal = true;
  return steps;
}

// ------------------------------------------------------------------
// Metadata
// ------------------------------------------------------------------

function classifyMetadata(
  metadata: Record<string, unknown> | undefined,
): MetadataGeneration {
  if (!metadata) return "none";
  const hasFinishData =
    metadata.usage !== undefined ||
    metadata.finishReason !== undefined ||
    metadata.durationMs !== undefined;
  if (!hasFinishData) return "none";
  return typeof metadata.requestCount === "number" ? "summed" : "legacy";
}

function readUsage(
  metadata: Record<string, unknown> | undefined,
): TurnUsage | undefined {
  const usage = asRecord(metadata?.usage);
  if (!usage) return undefined;
  return {
    inputTokens: num(usage.inputTokens),
    outputTokens: num(usage.outputTokens),
    totalTokens: num(usage.totalTokens),
    reasoningTokens: optionalNum(usage.reasoningTokens),
    cachedInputTokens: optionalNum(usage.cachedInputTokens),
  };
}

// ------------------------------------------------------------------
// Turns
// ------------------------------------------------------------------

export function analyzeTurn(message: AnalyzableMessage): TurnDiagnostics {
  const parts: unknown[] = Array.isArray(message.parts) ? message.parts : [];
  const metadata = asRecord(message.metadata);
  const isAssistant = message.role === "assistant";

  const hasVisibleText = parts.some((raw) => {
    const part = raw as PartShape;
    return part.type === "text" && partText(part).trim().length > 0;
  });
  const firstText = parts
    .map((raw) => raw as PartShape)
    .find((part) => part.type === "text" && partText(part).trim().length > 0);

  const steps = isAssistant ? buildSteps(parts) : [];
  const metadataGeneration = classifyMetadata(metadata);
  const usage = readUsage(metadata);
  const finishReason = str(metadata?.finishReason);
  const modelRoute = asRecord(metadata?.modelRoute);

  const findings: InspectorFinding[] = [];
  if (isAssistant) {
    for (const anomaly of deriveMessageAnomalies(
      parts,
      metadata,
      hasVisibleText,
    )) {
      findings.push({ ...anomaly, source: "derived" });
    }
    findings.push(
      ...deriveInspectorFindings({
        steps,
        stepCount: steps.length,
        hasVisibleText,
        metadataGeneration,
        finishReason,
        usage,
      }),
    );
  }

  return {
    messageId: message.id,
    role: message.role,
    createdAt:
      message.createdAt instanceof Date
        ? message.createdAt.toISOString()
        : message.createdAt,
    providerId: message.providerId ?? str(modelRoute?.providerId),
    modelId: message.modelId ?? str(modelRoute?.modelId),
    metadataGeneration,
    finishReason,
    usage,
    durationMs: optionalNum(metadata?.durationMs),
    requestCountRecorded: optionalNum(metadata?.requestCount),
    requestCountInferred: isAssistant ? inferRequestCount(steps) : 0,
    stepCount: steps.length,
    steps,
    hasVisibleText,
    textPreview: firstText
      ? partText(firstText).trim().slice(0, TEXT_PREVIEW_CHARS)
      : undefined,
    findings,
  };
}

// ------------------------------------------------------------------
// Conversations
// ------------------------------------------------------------------

export function analyzeConversation(
  conversation: { id?: string; title?: string | null },
  messages: AnalyzableMessage[],
): ConversationDiagnostics {
  const turns = messages.map(analyzeTurn);

  const totals: ConversationDiagnostics["totals"] = {
    assistantTurns: 0,
    findingsBySeverity: { error: 0, warning: 0 },
    findingsByKind: {},
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    requestCount: 0,
  };
  const models = new Set<string>();

  for (const turn of turns) {
    if (turn.role !== "assistant") continue;
    totals.assistantTurns += 1;
    totals.inputTokens += turn.usage?.inputTokens ?? 0;
    totals.outputTokens += turn.usage?.outputTokens ?? 0;
    totals.reasoningTokens += turn.usage?.reasoningTokens ?? 0;
    totals.requestCount +=
      turn.requestCountRecorded ?? turn.requestCountInferred;
    if (turn.providerId || turn.modelId) {
      models.add(`${turn.providerId ?? "?"}/${turn.modelId ?? "?"}`);
    }
    for (const finding of turn.findings) {
      totals.findingsBySeverity[finding.severity] += 1;
      const kind = finding.kind as InspectorAnomalyKind;
      totals.findingsByKind[kind] = (totals.findingsByKind[kind] ?? 0) + 1;
    }
  }

  return {
    conversationId: conversation.id,
    title: conversation.title ?? undefined,
    turns,
    totals,
    modelsUsed: [...models].sort(),
  };
}
