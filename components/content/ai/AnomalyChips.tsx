"use client";

/**
 * Anomaly surfaces — the chat's single pipeline for "something went wrong in
 * this turn" (owner ask, 2026-08-08). One derivation per assistant message,
 * DERIVED from durable data (persisted parts + turn metadata), never from
 * transient client state — so what shows live shows identically after
 * reload, and historical transcripts grow the surfaces retroactively.
 * Presentation is decided per-kind by ANOMALY_SURFACE below (quiet inline
 * line for flow events, pill chip for turn failures) — one registry, one
 * derivation, renderers only filter.
 *
 * The derivation itself lives in lib/domain/ai/anomalies.ts (pure, shared
 * with the admin Run Inspector); this file owns only the chip rendering.
 * Both are re-exported here so existing importers keep one import path.
 */

import { OctagonX, ShieldAlert, TriangleAlert } from "lucide-react";
import {
  deriveMessageAnomalies,
  type AnomalyKind,
  type MessageAnomaly,
} from "@/lib/domain/ai/anomalies";

export { deriveMessageAnomalies };
export type { AnomalyKind, MessageAnomaly };


/**
 * Presentation registry — the ONE place that decides how an anomaly kind
 * renders. The derivation above never varies by surface and renderers only
 * filter on this map, so a kind can move between surfaces without touching
 * the pipeline (normalization rule, owner 2026-08-08).
 *
 * "line" = a conversation-FLOW event, rendered as a quiet hairline-rule line
 * in the ModelSwitchDivider grammar (industry convention for interruptions).
 * "chip" = a content-anchored failure of the turn itself, rendered as a pill.
 */
const ANOMALY_SURFACE: Record<AnomalyKind, "chip" | "line"> = {
  "output-limit": "chip",
  "tool-error": "chip",
  "tool-failure": "chip",
  interrupted: "line",
  "provider-error": "chip",
  "content-filter": "chip",
  captcha: "chip",
};

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

/**
 * All anomaly surfaces for one message: hairline-rule lines for flow events,
 * then the compact pill row (FolderContextChips grammar) for turn failures.
 * Single mount point — callers never pick a surface themselves.
 */
export function AnomalySurfaces({
  anomalies,
}: {
  anomalies: MessageAnomaly[];
}) {
  if (anomalies.length === 0) return null;
  const lines = anomalies.filter((a) => ANOMALY_SURFACE[a.kind] === "line");
  const chips = anomalies.filter((a) => ANOMALY_SURFACE[a.kind] === "chip");
  return (
    <>
      {lines.map((a, i) => (
        <div
          key={`line-${a.kind}-${i}`}
          title={a.detail}
          className="my-2 flex w-full items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400"
        >
          <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <TriangleAlert className="h-3 w-3 shrink-0 opacity-70" />
            <span className="truncate">{a.label}</span>
          </span>
          <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
        </div>
      ))}
      {chips.length > 0 && (
        <div className="my-1 flex flex-wrap items-center gap-1.5">
          {chips.map((a, i) => (
            <span
              key={`chip-${a.kind}-${i}`}
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
      )}
    </>
  );
}
