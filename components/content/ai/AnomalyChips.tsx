"use client";

/**
 * Anomaly chips — the chat's single surface for "something failed in this
 * turn" (owner ask, 2026-08-08). One compact chip row per assistant message,
 * DERIVED from durable data (persisted parts + turn metadata), never from
 * transient client state — so a chip that shows live shows identically after
 * reload, and historical transcripts grow chips retroactively.
 *
 * Derivation, not persistence: failures are already durably encoded (tool
 * parts with state "output-error", tool outputs with ok:false /
 * captchaDetected / snapshotError, metadata.finishReason "length"). Chips are
 * a VIEW over that record — adding a new anomaly kind is a derivation change,
 * not a schema change.
 */

import { OctagonX, ShieldAlert, TriangleAlert } from "lucide-react";

export type AnomalyKind =
  | "output-limit"
  | "tool-error"
  | "tool-failure"
  | "interrupted"
  | "provider-error"
  | "content-filter"
  | "captcha";

export interface MessageAnomaly {
  kind: AnomalyKind;
  /** Chip label — short, human, no tool-internal jargon beyond the tool name. */
  label: string;
  /** Tooltip detail — the cause plus what the user can do about it. */
  detail: string;
  severity: "error" | "warning";
}

interface AnomalousPartShape {
  type?: string;
  state?: string;
  output?: unknown;
  errorText?: unknown;
}

/** Human-ish tool name for chip labels: "read_page_headless_or_browser" → "read page". */
function toolLabel(tool: string): string {
  return tool.replace(/_/g, " ").replace(/ headless or browser$/, "");
}

export function deriveMessageAnomalies(
  parts: unknown[],
  metadata: Record<string, unknown> | undefined,
  hasVisibleText: boolean,
  /** True while this message is still streaming — suppresses the
   * "interrupted" kind, since in-flight tool calls are normal then. */
  isStreaming?: boolean,
): MessageAnomaly[] {
  const anomalies: MessageAnomaly[] = [];

  // Output-limit truncation — the terminal finishReason of the whole turn
  // (metadata persistence sums requests and keeps the terminal reason).
  if (metadata?.finishReason === "length") {
    anomalies.push({
      kind: "output-limit",
      label: hasVisibleText
        ? "Output limit hit"
        : "Output limit hit — nothing produced",
      detail:
        "The response was cut off by the output-token limit before it finished. " +
        "Raise or clear “Max tokens” in AI settings (empty = model maximum), then ask the model to continue.",
      severity: "error",
    });
  }
  // Provider-terminal states — the stream just ends on these; without a chip
  // they are indistinguishable from a normal (if abrupt) finish.
  if (metadata?.finishReason === "error") {
    anomalies.push({
      kind: "provider-error",
      label: "Provider error ended the turn",
      detail:
        "The model provider reported an error mid-turn (after automatic retries). Try again; if it persists, check the provider's status page or your connection key.",
      severity: "error",
    });
  }
  if (metadata?.finishReason === "content-filter") {
    anomalies.push({
      kind: "content-filter",
      label: "Content filtered by provider",
      detail:
        "The provider stopped this response with its content filter. Rephrase the request or try a different model.",
      severity: "warning",
    });
  }

  const errorsByTool = new Map<string, number>();
  const failuresByTool = new Map<string, string>();
  const stuckTools: string[] = [];
  let captcha = false;
  // A user-pressed Stop marks in-flight tool parts output-error with
  // "Stopped by the user…" — a deliberate act, not an anomaly. It also
  // freezes text/reasoning parts mid-stream, so when detected it suppresses
  // the interrupted chips too.
  let userStopped = false;
  // Text/reasoning frozen at state "streaming" on a finished message = the
  // stream died mid-response (connection drop, failed resumable replay,
  // app closed mid-answer). Only an EXPLICIT "streaming" state counts —
  // older persisted parts carry no state at all.
  let frozenResponse = false;
  for (const raw of parts) {
    const p = raw as AnomalousPartShape;
    if (typeof p.type !== "string") continue;
    if (
      !isStreaming &&
      (p.type === "text" || p.type === "reasoning") &&
      p.state === "streaming"
    ) {
      frozenResponse = true;
    }
    if (!p.type.startsWith("tool-")) continue;
    const tool = toolLabel(p.type.slice(5));
    if (p.state === "output-error") {
      const err = typeof p.errorText === "string" ? p.errorText : "";
      if (err.startsWith("Stopped by the user")) {
        userStopped = true;
        continue;
      }
      errorsByTool.set(tool, (errorsByTool.get(tool) ?? 0) + 1);
      continue;
    }
    // A tool call frozen mid-flight on a FINISHED message = the turn was
    // interrupted (panel/tab closed or reloaded while a client-executed tool
    // ran — observed live: a co-browse run orphaned by a side-panel reload
    // surfaced only as a bare "network error"). "approval-requested" is a
    // legitimate pause, not an interruption.
    if (
      !isStreaming &&
      (p.state === "input-available" || p.state === "input-streaming")
    ) {
      stuckTools.push(tool);
      continue;
    }
    if (
      p.state !== "output-available" ||
      p.output == null ||
      typeof p.output !== "object"
    ) {
      continue;
    }
    const out = p.output as {
      ok?: unknown;
      note?: unknown;
      captchaDetected?: unknown;
      snapshotError?: unknown;
    };
    if (out.captchaDetected === true) captcha = true;
    if (out.ok === false) {
      failuresByTool.set(
        tool,
        typeof out.note === "string" && out.note
          ? out.note
          : "The tool ran but reported a failure.",
      );
    } else if (typeof out.snapshotError === "string" && out.snapshotError) {
      failuresByTool.set(tool, out.snapshotError);
    }
  }

  for (const [tool, count] of errorsByTool) {
    anomalies.push({
      kind: "tool-error",
      label: count > 1 ? `${tool} errored ×${count}` : `${tool} errored`,
      detail: `A ${tool} call errored${count > 1 ? ` ${count} times` : ""} in this turn. The model may have recovered — the tool card carries the error text.`,
      severity: "error",
    });
  }
  for (const [tool, note] of failuresByTool) {
    anomalies.push({
      kind: "tool-failure",
      label: `${tool}: failed`,
      detail: note,
      severity: "warning",
    });
  }
  if (!userStopped && stuckTools.length > 0) {
    anomalies.push({
      kind: "interrupted",
      label: `Interrupted — ${stuckTools[0]} never returned`,
      detail:
        `The turn ended while ${stuckTools.join(", ")} was still running — usually the panel or tab closed/reloaded mid-run. ` +
        "Recorded progress is preserved; resend or say “continue” to resume.",
      severity: "warning",
    });
  } else if (!userStopped && frozenResponse) {
    anomalies.push({
      kind: "interrupted",
      label: "Interrupted mid-response",
      detail:
        "The turn ended while the response was still streaming — the connection dropped or the app closed mid-answer. What arrived is preserved; resend or say “continue”.",
      severity: "warning",
    });
  }
  if (captcha) {
    anomalies.push({
      kind: "captcha",
      label: "Captcha halted browsing",
      detail:
        "An anti-bot challenge appeared on the co-browsed page. The agent never acts on captchas — solve it in the tab yourself, then tell the assistant to continue.",
      severity: "warning",
    });
  }
  return anomalies;
}

function chipIcon(anomaly: MessageAnomaly) {
  if (anomaly.kind === "captcha") {
    return <ShieldAlert className="h-3 w-3 shrink-0" />;
  }
  return anomaly.severity === "error" ? (
    <OctagonX className="h-3 w-3 shrink-0" />
  ) : (
    <TriangleAlert className="h-3 w-3 shrink-0" />
  );
}

/** Compact chip row — mirrors the FolderContextChips visual grammar. */
export function AnomalyChipRow({
  anomalies,
}: {
  anomalies: MessageAnomaly[];
}) {
  if (anomalies.length === 0) return null;
  return (
    <div className="my-1 flex flex-wrap items-center gap-1.5">
      {anomalies.map((a, i) => (
        <span
          key={`${a.kind}-${i}`}
          title={a.detail}
          className={[
            "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
            a.severity === "error"
              ? "border-red-500/40 bg-red-500/[0.06] text-red-600 dark:text-red-400"
              : "border-amber-500/40 bg-amber-500/[0.06] text-amber-600 dark:text-amber-400",
          ].join(" ")}
        >
          {chipIcon(a)}
          <span className="truncate">{a.label}</span>
        </span>
      ))}
    </div>
  );
}
