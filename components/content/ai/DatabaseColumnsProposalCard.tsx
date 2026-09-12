"use client";

/**
 * DatabaseColumnsProposalCard — renders a __databaseColumnsProposal payload
 * from the propose_database_columns AI tool (D3, owner report 2026-09-10).
 *
 * Same contract as the sibling proposal cards: the tool wrote NOTHING; this
 * card's Apply click is the commit.
 *
 * Apply re-reads the live schema first and drops any name that appeared since
 * the proposal — the model's diff is a snapshot, and the user may have added
 * a column by hand in the meantime — then commits what is left through
 * POST /api/content/data/batch, which applies the whole set in ONE
 * transaction.
 *
 * It used to POST one column at a time and report a PARTIAL result when a
 * column failed midway. That was the honest thing to do given the endpoint,
 * but it left the user to work out which columns to add by hand. It also
 * could not express a relation whose lookup or rollup is in the same
 * proposal, because those name a column id that does not exist until the
 * relation is created. One transaction removes both problems: everything
 * lands, or nothing does and the message names what was wrong.
 */

import { useCallback, useState } from "react";
import { AlertTriangle, Check, Columns3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { dispatchDataSchemaChanged } from "@/components/content/data/events";

export interface DatabaseColumnsProposalPayload {
  __databaseColumnsProposal: true;
  databaseId: string;
  databaseTitle: string;
  rationale: string | null;
  columns: Array<{
    name: string;
    type: string;
    description: string;
    options?: Array<{
      label: string;
      color?: string;
      group?: "todo" | "active" | "done";
    }>;
    /** relation — the database this column links to (title or id). */
    target?: string;
    /** relation — what the mirrored column on the target is called. */
    backlinkName?: string;
    /** lookup · rollup — the relation column on THIS table it reads across. */
    through?: string;
    /** lookup — the target column shown. rollup — the column aggregated. */
    column?: string;
    /** rollup — the aggregation. */
    fn?: string;
  }>;
  /** Names the tool found already on the table — shown, never applied. */
  alreadyPresent: string[];
  existingCount: number;
}

type ApplyState =
  | { status: "idle" }
  | { status: "applying" }
  | { status: "applied"; count: number }
  | { status: "error"; message: string };

/**
 * Keyed by WHAT was proposed — database + column names — never by message
 * id: a streamed message's id changes once the conversation is persisted, so
 * an id-keyed flag vanishes on the first reload and Apply comes back live
 * (observed on the options card, 2026-08-31).
 */
function storageKey(payload: DatabaseColumnsProposalPayload): string {
  const sig = payload.columns
    .map((c) => `${c.name.trim().toLowerCase()}:${c.type}`)
    .join("|");
  let hash = 5381;
  for (let i = 0; i < sig.length; i++) {
    hash = ((hash << 5) + hash + sig.charCodeAt(i)) | 0;
  }
  return `dg:data-columns-proposal:${payload.databaseId}:${(hash >>> 0).toString(36)}`;
}

/** Module-scope so the React Compiler's purity analysis stays happy. */
function loadAppliedState(payload: DatabaseColumnsProposalPayload): ApplyState {
  if (typeof window === "undefined") return { status: "idle" };
  try {
    const saved = window.localStorage.getItem(storageKey(payload));
    if (saved) return { status: "applied", count: Number(saved) || 0 };
  } catch {
    /* storage unavailable — Apply stays enabled */
  }
  return { status: "idle" };
}


/**
 * The one line that tells the user what a graph column actually does. A
 * relation's mirrored column appears on the OTHER table, which is invisible
 * from this card unless it is said out loud.
 */
function describeLink(col: DatabaseColumnsProposalPayload["columns"][number]): string | null {
  if (col.type === "relation" && col.target) {
    return col.backlinkName
      ? `links to ${col.target} · appears there as "${col.backlinkName}"`
      : `links to ${col.target}`;
  }
  if (col.type === "lookup" && col.through) {
    return `reads ${col.column ?? "a value"} through ${col.through}`;
  }
  if (col.type === "rollup" && col.through) {
    const fn = col.fn ?? "count";
    return fn === "count"
      ? `counts linked rows through ${col.through}`
      : `${fn} of ${col.column ?? "a value"} through ${col.through}`;
  }
  return null;
}

export function DatabaseColumnsProposalCard({
  payload,
}: {
  payload: DatabaseColumnsProposalPayload;
}) {
  const [state, setState] = useState<ApplyState>(() =>
    loadAppliedState(payload)
  );
  const [checked, setChecked] = useState<boolean[]>(() =>
    payload.columns.map(() => true)
  );

  const selectedCount = checked.filter(Boolean).length;

  const apply = useCallback(async () => {
    const wanted = payload.columns.filter((_, i) => checked[i]);
    setState({ status: "applying" });
    try {
      // Fresh read: the proposal's diff is a snapshot, and the user may have
      // added one of these by hand since. Dropping them here keeps Apply
      // idempotent rather than failing the batch on a duplicate name.
      const readRes = await fetch(`/api/content/data/${payload.databaseId}`, {
        credentials: "include",
      });
      const readJson = await readRes.json().catch(() => null);
      if (!readRes.ok || !readJson?.success) {
        throw new Error(
          readJson?.error?.message ?? "Could not load the database"
        );
      }
      const liveNames = new Set(
        (
          readJson.data.table.columns as Array<{
            name: string;
            deletedAt?: string | null;
          }>
        )
          .filter((c) => !c.deletedAt)
          .map((c) => c.name.trim().toLowerCase())
      );
      const columns = wanted.filter(
        (c) => !liveNames.has(c.name.trim().toLowerCase())
      );

      if (columns.length === 0) {
        try {
          localStorage.setItem(storageKey(payload), "0");
        } catch {
          /* best-effort persistence */
        }
        setState({ status: "applied", count: 0 });
        toast.success(`"${payload.databaseTitle}" already had those columns`);
        return;
      }

      const res = await fetch("/api/content/data/batch", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extend: [{ database: payload.databaseId, columns }],
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(
          json?.error?.message ?? "Could not add the columns"
        );
      }

      const created = columns.length;
      try {
        localStorage.setItem(storageKey(payload), String(created));
      } catch {
        /* best-effort persistence */
      }
      dispatchDataSchemaChanged(payload.databaseId, "chat");
      // A relation also minted its mirrored column on the target table, whose
      // grid is very likely open in another pane.
      for (const table of (json.data?.extended ?? []) as Array<{ id: string }>) {
        if (table.id !== payload.databaseId) {
          dispatchDataSchemaChanged(table.id, "chat");
        }
      }

      setState({ status: "applied", count: created });
      toast.success(
        `${created} column${created === 1 ? "" : "s"} added to "${payload.databaseTitle}"`
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Network error adding columns";
      // The batch is all-or-nothing, so a failure means the table is
      // untouched — say that plainly rather than leaving it ambiguous.
      setState({ status: "error", message });
      toast.error(message);
    }
  }, [payload, checked]);

  if (state.status === "applied") {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-indigo-400/40 bg-indigo-500/[0.06] px-3 py-2 text-sm dark:border-indigo-400/30 dark:bg-indigo-500/[0.08]">
        <Check className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
        <span className="text-gray-700 dark:text-gray-200">
          {state.count} column{state.count === 1 ? "" : "s"} added to{" "}
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {payload.databaseTitle}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-2 rounded-xl border border-indigo-400/30 bg-indigo-500/[0.04] p-3 text-sm dark:border-indigo-400/20 dark:bg-indigo-500/[0.06]">
      <div className="flex items-start gap-2">
        <Columns3 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-gray-900 dark:text-gray-100">
            Add {payload.columns.length} column
            {payload.columns.length === 1 ? "" : "s"}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            {payload.databaseTitle} · {payload.existingCount} existing column
            {payload.existingCount === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {payload.rationale && (
        <p className="text-[13px] text-gray-700 dark:text-gray-300">
          {payload.rationale}
        </p>
      )}

      <div className="max-h-72 space-y-1 overflow-y-auto">
        {payload.columns.map((col, i) => (
          <label
            key={`${payload.databaseId}-${col.name}-${i}`}
            className="flex items-start gap-2 rounded-md px-1 py-1 hover:bg-indigo-500/[0.06]"
          >
            <input
              type="checkbox"
              checked={checked[i]}
              onChange={(e) =>
                setChecked((cur) =>
                  cur.map((c, j) => (j === i ? e.target.checked : c))
                )
              }
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-current"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1.5">
                <span className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">
                  {col.name}
                </span>
                <span className="shrink-0 rounded bg-indigo-500/10 px-1 text-[10px] uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                  {col.type}
                </span>
              </span>
              <span className="block text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                {col.description}
              </span>
              {col.options && col.options.length > 0 && (
                <span className="block text-[10px] text-gray-400 dark:text-gray-500">
                  {col.options.map((o) => o.label).join(" · ")}
                </span>
              )}
              {describeLink(col) && (
                <span className="block text-[10px] text-indigo-600/80 dark:text-indigo-300/80">
                  {describeLink(col)}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>

      {payload.alreadyPresent.length > 0 && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Already there: {payload.alreadyPresent.join(", ")}
        </p>
      )}

      {state.status === "error" && (
        <div className="flex items-start gap-1.5 rounded-md bg-red-500/10 px-2 py-1.5 text-[12px] text-red-700 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {state.message} — nothing was added.
          </span>
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
            Adding…
          </>
        ) : state.status === "error" ? (
          "Try again"
        ) : (
          `Add ${selectedCount} of ${payload.columns.length}`
        )}
      </button>
    </div>
  );
}
