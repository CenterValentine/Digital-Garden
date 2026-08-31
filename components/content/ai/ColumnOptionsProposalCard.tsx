"use client";

/**
 * ColumnOptionsProposalCard — renders a __columnOptionsProposal payload
 * from the propose_column_options AI tool.
 *
 * Same contract as the flashcards proposal cards: the tool wrote NOTHING;
 * this card's Apply click is the commit. Apply re-reads the column's live
 * config first (config is replaced wholesale by the columns PATCH, and
 * options may have changed since the proposal), merges the checked
 * options with fresh ids, and PATCHes. `proposalId` keys a localStorage
 * flag so "already applied" survives chat reloads — without it a reload
 * would re-enable Apply and duplicate the vocabulary.
 */

import { useCallback, useState } from "react";
import { Check, ListChecks, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  generateColumnKey,
  type DataColumnConfig,
  type SelectOption,
} from "@/lib/domain/data";
import { dispatchDataSchemaChanged } from "@/components/content/data/events";

export interface ColumnOptionsProposalPayload {
  __columnOptionsProposal: true;
  databaseId: string;
  databaseTitle: string;
  columnId: string;
  columnName: string;
  columnType: "select" | "multiSelect" | "status";
  replace: boolean;
  rationale: string | null;
  options: Array<{
    label: string;
    color?: string;
    group?: "todo" | "active" | "done";
  }>;
  existingLabels: string[];
  skippedExisting: string[];
}

type ApplyState =
  | { status: "idle" }
  | { status: "applying" }
  | { status: "applied"; count: number }
  | { status: "error"; message: string };

/**
 * The applied flag is keyed by WHAT was proposed — database + column +
 * option set — never by message id: a streamed message's id changes once
 * the conversation is persisted, so an id-keyed flag silently vanished on
 * the first reload (observed 2026-08-31: Apply reappeared, a second press
 * applied 0, and only THAT wrote a flag under the stable id).
 */
function storageKey(payload: ColumnOptionsProposalPayload): string {
  const sig = [
    payload.replace ? "replace" : "add",
    ...payload.options.map((o) => o.label.trim().toLowerCase()),
  ].join("");
  // djb2 — collision-tolerant: a colliding proposal would be the same
  // options on the same column, where "already applied" is the truth.
  let hash = 5381;
  for (let i = 0; i < sig.length; i++) {
    hash = ((hash << 5) + hash + sig.charCodeAt(i)) | 0;
  }
  return `dg:data-options-proposal:${payload.databaseId}:${payload.columnId}:${(hash >>> 0).toString(36)}`;
}

/** Module-scope so the compiler's purity analysis stays happy (CLAUDE.md
 * React Compiler notes) — same pattern as loadAddedIndices in the
 * flashcards proposal list. */
function loadAppliedState(payload: ColumnOptionsProposalPayload): ApplyState {
  if (typeof window === "undefined") return { status: "idle" };
  try {
    const saved = window.localStorage.getItem(storageKey(payload));
    if (saved) return { status: "applied", count: Number(saved) || 0 };
  } catch {
    /* storage unavailable — Apply stays enabled */
  }
  return { status: "idle" };
}

export function ColumnOptionsProposalCard({
  payload,
}: {
  payload: ColumnOptionsProposalPayload;
}) {
  const [state, setState] = useState<ApplyState>(() =>
    loadAppliedState(payload)
  );
  const [labels, setLabels] = useState<string[]>(() =>
    payload.options.map((o) => o.label)
  );
  const [checked, setChecked] = useState<boolean[]>(() =>
    payload.options.map(() => true)
  );

  const selectedCount = checked.filter(Boolean).length;

  const apply = useCallback(async () => {
    setState({ status: "applying" });
    try {
      // Fresh read: the PATCH replaces config wholesale, and the column's
      // options may have moved since the proposal was made.
      const readRes = await fetch(`/api/content/data/${payload.databaseId}`, {
        credentials: "include",
      });
      const readJson = await readRes.json().catch(() => null);
      if (!readRes.ok || !readJson?.success) {
        throw new Error(
          readJson?.error?.message ?? "Could not load the database"
        );
      }
      const column = (
        readJson.data.table.columns as Array<{
          id: string;
          config: DataColumnConfig;
          deletedAt?: string | null;
        }>
      ).find((c) => c.id === payload.columnId && !c.deletedAt);
      if (!column) {
        throw new Error(
          `The "${payload.columnName}" column no longer exists — nothing applied.`
        );
      }

      const existing = column.config.options ?? [];
      const existingLower = new Set(
        existing.map((o) => o.label.trim().toLowerCase())
      );
      const fresh: SelectOption[] = [];
      const seen = new Set<string>();
      payload.options.forEach((opt, i) => {
        if (!checked[i]) return;
        const label = (labels[i] ?? opt.label).trim();
        if (!label) return;
        const lower = label.toLowerCase();
        if (seen.has(lower)) return;
        seen.add(lower);
        // In add mode, an option that appeared since the proposal is
        // silently already-there — skipping beats a duplicate label.
        if (!payload.replace && existingLower.has(lower)) return;
        fresh.push({
          id: generateColumnKey(),
          label,
          ...(opt.color ? { color: opt.color } : {}),
          ...(payload.columnType === "status"
            ? { group: opt.group ?? "todo" }
            : {}),
        });
      });

      // Add-mode with nothing new: every checked option already exists on
      // the column. That's "applied", not an error — record it WITHOUT a
      // wholesale-replace PATCH that would only churn updatedAt.
      if (!payload.replace && fresh.length === 0) {
        try {
          localStorage.setItem(storageKey(payload), "0");
        } catch {
          /* best-effort persistence */
        }
        setState({ status: "applied", count: 0 });
        toast.info(`Those options are already on "${payload.columnName}"`);
        return;
      }

      const merged = payload.replace ? fresh : [...existing, ...fresh];
      if (merged.length === 0) {
        throw new Error("Nothing selected to apply.");
      }

      const res = await fetch(
        `/api/content/data/${payload.databaseId}/columns`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            columnId: payload.columnId,
            config: { ...column.config, options: merged },
          }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(
          json?.error?.message ?? "Could not update the column"
        );
      }

      try {
        localStorage.setItem(storageKey(payload), String(fresh.length));
      } catch {
        /* best-effort persistence */
      }
      // Any open grid or context rail for this table reloads.
      dispatchDataSchemaChanged(payload.databaseId, "chat");
      setState({ status: "applied", count: fresh.length });
      toast.success(
        payload.replace
          ? `Options replaced on "${payload.columnName}"`
          : `${fresh.length} option${fresh.length === 1 ? "" : "s"} added to "${payload.columnName}"`
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Network error applying options";
      setState({ status: "error", message });
      toast.error(message);
    }
  }, [payload, labels, checked]);

  if (state.status === "applied") {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-indigo-400/40 bg-indigo-500/[0.06] px-3 py-2 text-sm dark:border-indigo-400/30 dark:bg-indigo-500/[0.08]">
        <Check className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
        <span className="text-gray-700 dark:text-gray-200">
          {payload.replace ? "Options set on" : "Options added to"}{" "}
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {payload.columnName}
          </span>{" "}
          in {payload.databaseTitle}
        </span>
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-2 rounded-xl border border-indigo-400/30 bg-indigo-500/[0.04] p-3 text-sm dark:border-indigo-400/20 dark:bg-indigo-500/[0.06]">
      <div className="flex items-start gap-2">
        <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-gray-900 dark:text-gray-100">
            {payload.replace ? "Replace options on" : "Proposed options for"}{" "}
            {payload.columnName}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            {payload.databaseTitle}
            {payload.existingLabels.length > 0 &&
              !payload.replace &&
              ` · adds to ${payload.existingLabels.length} existing`}
            {payload.replace &&
              payload.existingLabels.length > 0 &&
              ` · replaces ${payload.existingLabels.length} existing (cells keep their data)`}
          </div>
        </div>
      </div>

      {payload.rationale && (
        <p className="text-[13px] text-gray-700 dark:text-gray-300">
          {payload.rationale}
        </p>
      )}

      <div className="max-h-56 space-y-1 overflow-y-auto">
        {payload.options.map((opt, i) => (
          <label
            key={`${payload.columnId}-${i}`}
            className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-indigo-500/[0.06]"
          >
            <input
              type="checkbox"
              checked={checked[i]}
              onChange={(e) =>
                setChecked((cur) =>
                  cur.map((c, j) => (j === i ? e.target.checked : c))
                )
              }
              className="h-3.5 w-3.5 shrink-0 accent-current"
            />
            <input
              value={labels[i]}
              onChange={(e) =>
                setLabels((cur) =>
                  cur.map((l, j) => (j === i ? e.target.value : l))
                )
              }
              className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-gray-900 focus:border-indigo-400/50 focus:outline-none dark:text-gray-100"
              aria-label={`Option ${i + 1} label`}
            />
            {payload.columnType === "status" && (
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-gray-400">
                {opt.group ?? "todo"}
              </span>
            )}
          </label>
        ))}
      </div>

      {payload.skippedExisting.length > 0 && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Already there: {payload.skippedExisting.join(", ")}
        </p>
      )}

      {state.status === "error" && (
        <div className="flex items-start gap-1.5 rounded-md bg-red-500/10 px-2 py-1.5 text-[12px] text-red-700 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{state.message}</span>
        </div>
      )}

      <button
        type="button"
        onClick={apply}
        disabled={state.status === "applying" || selectedCount === 0}
        className="inline-flex items-center gap-1.5 rounded-md border border-indigo-500/40 bg-indigo-500/[0.08] px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-500/[0.14] disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-400/30 dark:bg-indigo-500/[0.10] dark:text-indigo-300 dark:hover:bg-indigo-500/[0.18]"
      >
        {state.status === "applying" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Applying…
          </>
        ) : state.status === "error" ? (
          "Retry"
        ) : (
          `Apply ${selectedCount} of ${payload.options.length}`
        )}
      </button>
    </div>
  );
}
