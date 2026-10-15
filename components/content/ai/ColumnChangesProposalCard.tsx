"use client";

/**
 * ColumnChangesProposalCard — renders a __columnChangesProposal payload from
 * the propose_column_changes AI tool.
 *
 * The counterpart to propose_database_columns, which is add-only by design:
 * this is the RESHAPE path (rename, delete). Same contract as every other
 * proposal card — the tool wrote NOTHING; this card's Apply click is the
 * commit.
 *
 * Applied ONE change at a time (rename → PATCH, delete → DELETE), so a
 * mid-way failure reports what actually landed instead of an all-or-nothing
 * lie. Deletes are SOFT server-side: cell data stays and the column can be
 * restored, which is what makes a mistaken Apply a metadata flip to undo
 * rather than a recovery job.
 *
 * Retyping is deliberately absent: changing a column's type is forbidden
 * (plan O4 — coercing every existing cell is lossy), so the tool refuses it
 * and the answer stays "add a new column and migrate".
 */

import { useCallback, useState } from "react";
import {
  AlertTriangle,
  Check,
  Loader2,
  PencilLine,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { dispatchDataSchemaChanged } from "@/components/content/data/events";
import {
  dispatchProposalApplied,
  useProposalObsolete,
  useProposalRevision,
} from "./use-proposal-revision";
import {
  ModifyProposalButton,
  ProposalObsoleteNotice,
  ProposalSupersededNotice,
  ProposalWithdrawnNotice,
  useSupersededGuard,
} from "./ProposalRevisionControls";

export interface ColumnChangePlan {
  columnId: string;
  columnName: string;
  columnType: string;
  op: "rename" | "delete";
  /** rename only — the proposed new name. */
  to?: string;
  reason?: string;
}

export interface ColumnChangesProposalPayload {
  __columnChangesProposal: true;
  databaseId: string;
  databaseTitle: string;
  rationale: string | null;
  changes: ColumnChangePlan[];
  /**
   * Changes the tool REFUSED while building the proposal (a system column of
   * a charter ledger, the primary column, a name that no longer resolves).
   * Shown so the user sees the whole ask and what became of it — never
   * applied.
   */
  refused: Array<{ column: string; reason: string }>;
}

type ApplyState =
  | { status: "idle" }
  | { status: "applying" }
  | { status: "applied"; applied: number; failed: number }
  | { status: "error"; message: string };

/**
 * Keyed by WHAT was proposed — database + each change — never by message id:
 * a streamed message's id changes once the conversation persists, so an
 * id-keyed flag vanishes on the first reload (Database II lesson).
 */
function storageKey(payload: ColumnChangesProposalPayload): string {
  const sig = payload.changes
    .map((c) => `${c.op}:${c.columnId}:${(c.to ?? "").trim().toLowerCase()}`)
    .join("|");
  let hash = 5381;
  for (let i = 0; i < sig.length; i++) {
    hash = ((hash << 5) + hash + sig.charCodeAt(i)) | 0;
  }
  return `dg:data-column-changes-proposal:${payload.databaseId}:${(hash >>> 0).toString(36)}`;
}

/** Module scope keeps the React Compiler's purity analysis happy. */
function loadAppliedState(payload: ColumnChangesProposalPayload): ApplyState {
  if (typeof window === "undefined") return { status: "idle" };
  try {
    const saved = window.localStorage.getItem(storageKey(payload));
    if (saved) {
      const [applied, failed] = saved.split("/").map((n) => Number(n) || 0);
      return { status: "applied", applied, failed };
    }
  } catch {
    /* storage unavailable — Apply stays enabled */
  }
  return { status: "idle" };
}

export function ColumnChangesProposalCard({
  payload,
  superseded = false,
}: {
  payload: ColumnChangesProposalPayload;
  /** A later message carries a newer proposal of this kind. */
  superseded?: boolean;
}) {
  const [state, setState] = useState<ApplyState>(() =>
    loadAppliedState(payload)
  );
  const [checked, setChecked] = useState<boolean[]>(() =>
    // Deletes start UNCHECKED: a rename is recoverable by renaming back, a
    // delete needs a restore. The destructive half asks to be opted into.
    payload.changes.map((c) => c.op !== "delete")
  );
  const revision = useProposalRevision(storageKey(payload), !superseded);
  const obsolete = useProposalObsolete("columnChanges", storageKey(payload));

  const selectedCount = checked.filter(Boolean).length;

  const askForChanges = useCallback(() => {
    revision.requestRevision(
      `I've sent the proposed column changes for ${payload.databaseTitle} back for changes — nothing was applied. Re-propose the complete corrected version with these changes: `
    );
  }, [payload, revision]);

  const apply = useCallback(async () => {
    setState({ status: "applying" });
    const failures: string[] = [];
    let applied = 0;
    try {
      for (let i = 0; i < payload.changes.length; i++) {
        if (!checked[i]) continue;
        const change = payload.changes[i];
        const url = `/api/content/data/${payload.databaseId}/columns`;
        const res =
          change.op === "rename"
            ? await fetch(url, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  columnId: change.columnId,
                  name: change.to,
                }),
              })
            : await fetch(url, {
                method: "DELETE",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ columnId: change.columnId }),
              });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          failures.push(
            `${change.columnName}: ${json?.error?.message ?? `request failed (${res.status})`}`
          );
          continue;
        }
        applied++;
      }

      try {
        localStorage.setItem(
          storageKey(payload),
          `${applied}/${failures.length}`
        );
      } catch {
        /* best-effort persistence */
      }
      // Any open grid or schema rail for this table reloads.
      dispatchDataSchemaChanged(payload.databaseId, "chat");
      setState({ status: "applied", applied, failed: failures.length });
      dispatchProposalApplied("columnChanges", storageKey(payload));
      if (failures.length > 0) {
        toast.warning(
          `${applied} change${applied === 1 ? "" : "s"} applied, ${failures.length} refused`,
          { description: failures.slice(0, 3).join(" · "), duration: 9000 }
        );
      } else {
        toast.success(
          `${applied} column change${applied === 1 ? "" : "s"} applied to "${payload.databaseTitle}"`
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Network error applying changes";
      setState({ status: "error", message });
      toast.error(message);
    }
  }, [payload, checked]);

  const guard = useSupersededGuard(superseded, apply);

  if (obsolete && state.status !== "applied") {
    return <ProposalObsoleteNotice label="set of column changes" />;
  }

  if (revision.withdrawn) {
    return (
      <ProposalWithdrawnNotice
        label="column changes"
        onRestore={revision.restore}
      />
    );
  }

  if (state.status === "applied") {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-indigo-400/40 bg-indigo-500/[0.06] px-3 py-2 text-sm dark:border-indigo-400/30 dark:bg-indigo-500/[0.08]">
        <Check className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
        <span className="text-gray-700 dark:text-gray-200">
          {state.applied} column change{state.applied === 1 ? "" : "s"} applied
          to{" "}
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {payload.databaseTitle}
          </span>
          {state.failed > 0 && ` · ${state.failed} refused`}
        </span>
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-2 rounded-xl border border-indigo-400/30 bg-indigo-500/[0.04] p-3 text-sm dark:border-indigo-400/20 dark:bg-indigo-500/[0.06]">
      <div className="flex items-start gap-2">
        <PencilLine className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-gray-900 dark:text-gray-100">
            Change {payload.changes.length} column
            {payload.changes.length === 1 ? "" : "s"}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            {payload.databaseTitle} · a removed column keeps its data and can
            be restored
          </div>
        </div>
      </div>

      {payload.rationale && (
        <p className="text-[13px] text-gray-700 dark:text-gray-300">
          {payload.rationale}
        </p>
      )}

      <div className="max-h-56 space-y-1 overflow-y-auto">
        {payload.changes.map((change, i) => (
          <label
            key={`${change.columnId}-${change.op}`}
            className="flex items-start gap-2 rounded-md px-1 py-0.5 hover:bg-indigo-500/[0.06]"
          >
            <input
              type="checkbox"
              checked={checked[i]}
              onChange={(e) =>
                setChecked((cur) =>
                  cur.map((c, j) => (j === i ? e.target.checked : c))
                )
              }
              className="mt-1 h-3.5 w-3.5 shrink-0 accent-current"
            />
            <span className="min-w-0 flex-1 text-[12px] leading-snug">
              {change.op === "delete" ? (
                <span className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-300">
                  <Trash2 className="h-3 w-3 shrink-0" />
                  Remove {change.columnName}
                </span>
              ) : (
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {change.columnName} → {change.to}
                </span>
              )}{" "}
              <span className="rounded bg-black/[0.05] px-1 py-px text-[10px] text-gray-500 dark:bg-white/[0.08] dark:text-gray-400">
                {change.columnType}
              </span>
              {change.reason && (
                <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                  {change.reason}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>

      {payload.refused.length > 0 && (
        <div className="space-y-0.5 rounded-md bg-black/[0.03] px-2 py-1.5 text-[11px] text-gray-600 dark:bg-white/[0.05] dark:text-gray-400">
          {payload.refused.map((r) => (
            <div key={r.column}>
              <span className="font-medium">{r.column}</span>: {r.reason}
            </div>
          ))}
        </div>
      )}

      {state.status === "error" && (
        <div className="flex items-start gap-1.5 rounded-md bg-red-500/10 px-2 py-1.5 text-[12px] text-red-700 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{state.message}</span>
        </div>
      )}

      {superseded && <ProposalSupersededNotice />}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={guard.onClick}
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
          ) : guard.confirming ? (
            "Apply anyway?"
          ) : (
            `Apply ${selectedCount} of ${payload.changes.length}`
          )}
        </button>
        <ModifyProposalButton
          onClick={askForChanges}
          disabled={state.status === "applying"}
        />
      </div>
    </div>
  );
}
