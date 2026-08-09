"use client";

/**
 * Run Inspector turn card — one persisted message rendered as a diagnostic
 * timeline: findings, per-step reasoning/text volume, tool calls with
 * states, inferred request boundaries, and the raw parts JSON (the
 * psql-replacement view). Presentational only; data comes from
 * /api/admin/ai-runs/[conversationId].
 */

import { toast } from "sonner";
import type {
  InspectorFinding,
  StepDiagnostics,
  TurnDiagnostics,
} from "@/lib/domain/ai/run-inspector/types";
import type { AiRunRawMessage } from "@/lib/domain/ai/run-inspector/api-types";

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

function formatDuration(ms?: number): string | null {
  if (ms === undefined) return null;
  return ms >= 10_000 ? `${Math.round(ms / 1000)}s` : `${(ms / 1000).toFixed(1)}s`;
}

// ------------------------------------------------------------------
// Findings
// ------------------------------------------------------------------

function FindingBadge({ finding }: { finding: InspectorFinding }) {
  return (
    <span
      title={finding.detail}
      className={[
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
        finding.severity === "error"
          ? "border-red-500/40 bg-red-500/[0.06] text-red-600 dark:text-red-400"
          : "border-amber-500/40 bg-amber-500/[0.06] text-amber-600 dark:text-amber-400",
      ].join(" ")}
    >
      <span className="font-medium">{finding.kind}</span>
      <span className="truncate opacity-80">{finding.label}</span>
    </span>
  );
}

// ------------------------------------------------------------------
// Tool chips
// ------------------------------------------------------------------

function toolChipClasses(state: string): string {
  if (state === "output-available") {
    return "border-emerald-500/40 bg-emerald-500/[0.06] text-emerald-700 dark:text-emerald-400";
  }
  if (state === "output-error" || state === "output-denied") {
    return "border-red-500/40 bg-red-500/[0.06] text-red-600 dark:text-red-400";
  }
  if (state === "approval-requested") {
    return "border-blue-500/40 bg-blue-500/[0.06] text-blue-600 dark:text-blue-400";
  }
  // input-available / input-streaming / unknown — the call never ran.
  return "border-amber-500/40 bg-amber-500/[0.06] text-amber-600 dark:text-amber-400";
}

function ToolChip({
  tool,
}: {
  tool: StepDiagnostics["toolCalls"][number];
}) {
  const tooltip = [
    tool.state,
    tool.clientExecuted ? "client-executed" : "server-executed",
    tool.outputChars !== undefined ? `${formatInt(tool.outputChars)} chars out` : null,
    tool.errorText ? `error: ${tool.errorText}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] ${toolChipClasses(tool.state)}`}
    >
      {tool.tool}
      {tool.clientExecuted ? <span className="opacity-60">⇄</span> : null}
    </span>
  );
}

// ------------------------------------------------------------------
// Step timeline
// ------------------------------------------------------------------

function StepRow({
  step,
  maxChars,
  requestNumber,
}: {
  step: StepDiagnostics;
  maxChars: number;
  requestNumber: number | null;
}) {
  const total = step.reasoningChars + step.textChars;
  const widthPct = maxChars > 0 ? Math.max(2, (total / maxChars) * 100) : 0;
  const reasoningPct = total > 0 ? (step.reasoningChars / total) * 100 : 0;

  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-10 shrink-0 text-right font-mono text-[11px] text-gray-500 dark:text-gray-400">
        {requestNumber !== null ? `#${requestNumber}` : ""}
      </span>
      <span className="w-8 shrink-0 font-mono text-[11px] text-gray-500 dark:text-gray-400">
        s{step.index}
      </span>
      <div className="w-36 shrink-0">
        {total > 0 ? (
          <div
            className="flex h-2 overflow-hidden rounded-sm bg-black/5 dark:bg-white/5"
            style={{ width: `${widthPct}%` }}
            title={`${formatInt(step.reasoningChars)} reasoning chars · ${formatInt(step.textChars)} text chars`}
          >
            <div
              className="bg-purple-400/70 dark:bg-purple-500/60"
              style={{ width: `${reasoningPct}%` }}
            />
            <div className="flex-1 bg-sky-400/70 dark:bg-sky-500/60" />
          </div>
        ) : (
          <span className="text-[11px] text-gray-400 dark:text-gray-500">—</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {step.toolCalls.map((tool) => (
          <ToolChip key={tool.partIndex} tool={tool} />
        ))}
        {step.textPreview ? (
          <span className="truncate text-[12px] text-gray-600 dark:text-gray-300">
            “{step.textPreview}”
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Turn card
// ------------------------------------------------------------------

export function TurnCard({
  turn,
  raw,
}: {
  turn: TurnDiagnostics;
  raw?: AiRunRawMessage;
}) {
  const isAssistant = turn.role === "assistant";
  const maxChars = Math.max(
    1,
    ...turn.steps.map((s) => s.reasoningChars + s.textChars),
  );

  // Pre-compute the request number shown at each request-opening step.
  let nextRequest = 1;
  const requestNumbers: (number | null)[] = turn.steps.map((step, i) => {
    const previous = turn.steps[i - 1];
    const opensRequest = i === 0 || previous?.endsRequest;
    return opensRequest ? nextRequest++ : null;
  });

  const copyId = () => {
    navigator.clipboard
      .writeText(turn.messageId)
      .then(() => toast.success("Message id copied"))
      .catch(() => toast.error("Copy failed"));
  };

  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-gray-600 dark:text-gray-300">
        <span
          className={`font-semibold uppercase tracking-wide ${
            isAssistant
              ? "text-indigo-600 dark:text-indigo-400"
              : "text-gray-700 dark:text-gray-200"
          }`}
        >
          {turn.role}
        </span>
        {turn.providerId || turn.modelId ? (
          <span className="font-mono">
            {turn.providerId ?? "?"}/{turn.modelId ?? "?"}
          </span>
        ) : null}
        {turn.createdAt ? (
          <span>{new Date(turn.createdAt).toLocaleString()}</span>
        ) : null}
        {formatDuration(turn.durationMs) ? (
          <span>{formatDuration(turn.durationMs)}</span>
        ) : null}
        {turn.usage ? (
          <span title={`reasoning tokens: ${turn.usage.reasoningTokens ?? "n/a"}`}>
            {formatInt(turn.usage.inputTokens)} in /{" "}
            {formatInt(turn.usage.outputTokens)} out
          </span>
        ) : null}
        {isAssistant ? (
          <span
            title={
              turn.requestCountRecorded !== undefined
                ? "HTTP requests recorded by the usage accumulator"
                : "HTTP requests inferred from client-tool boundaries (legacy row)"
            }
          >
            {turn.requestCountRecorded ?? `~${turn.requestCountInferred}`} req ·{" "}
            {turn.stepCount} steps
          </span>
        ) : null}
        {turn.finishReason ? (
          <span
            className={`font-mono ${
              turn.finishReason === "length"
                ? "text-red-600 dark:text-red-400"
                : ""
            }`}
          >
            {turn.finishReason}
          </span>
        ) : null}
        {turn.metadataGeneration === "legacy" ? (
          <span className="rounded border border-amber-500/40 px-1.5 text-[10px] text-amber-600 dark:text-amber-400">
            legacy metadata
          </span>
        ) : null}
        {raw?.isHidden ? (
          <span className="rounded border border-gray-400/40 px-1.5 text-[10px] text-gray-500">
            hidden (superseded)
          </span>
        ) : null}
        <button
          type="button"
          onClick={copyId}
          className="ml-auto text-[11px] text-gray-400 underline-offset-2 hover:underline dark:text-gray-500"
        >
          copy id
        </button>
      </div>

      {/* Findings */}
      {turn.findings.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {turn.findings.map((finding, i) => (
            <FindingBadge key={`${finding.kind}-${i}`} finding={finding} />
          ))}
        </div>
      ) : null}

      {/* User text / assistant timeline */}
      {!isAssistant && turn.textPreview ? (
        <p className="mt-2 text-[13px] text-gray-700 dark:text-gray-200">
          {turn.textPreview}
        </p>
      ) : null}
      {isAssistant && turn.steps.length > 0 ? (
        <div className="mt-2 divide-y divide-black/5 dark:divide-white/5">
          {turn.steps.map((step, i) => (
            <StepRow
              key={step.index}
              step={step}
              maxChars={maxChars}
              requestNumber={requestNumbers[i]}
            />
          ))}
        </div>
      ) : null}

      {/* Raw parts */}
      {raw ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-gray-500 dark:text-gray-400">
            Raw parts JSON (
            {Array.isArray(raw.parts) ? raw.parts.length : 0} parts
            {raw.metadata !== null && raw.metadata !== undefined
              ? " + metadata"
              : ""}
            )
          </summary>
          <pre className="mt-1 max-h-96 overflow-auto rounded bg-black/5 p-2 text-[11px] leading-snug dark:bg-white/5">
            {JSON.stringify(
              { metadata: raw.metadata, parts: raw.parts },
              null,
              2,
            )}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
