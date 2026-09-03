"use client";

/**
 * OutputDatabaseProposalCard — renders a __outputDatabaseProposal payload
 * from the propose_output_database AI tool (P5, EXTRACTION-TO-DATABASE-PLAN
 * §3.7: the AI structures the output database, descriptions on every
 * column, initial vocabularies inline).
 *
 * Same contract as ColumnOptionsProposalCard: the tool wrote NOTHING; this
 * card's Apply click is the commit (POST /api/content/data creates the
 * table + columns in one call). The applied flag is keyed by proposal
 * CONTENT — never by message id (streamed ids change on persist; Database
 * II lesson) — and stores the created table's id so the applied state can
 * link to it across reloads.
 */

import { useCallback, useState } from "react";
import { Check, Loader2, Table2 } from "lucide-react";
import { toast } from "sonner";
import { useContentStore } from "@/state/content-store";

export interface OutputDatabaseProposalPayload {
  __outputDatabaseProposal: true;
  title: string;
  purpose: string | null;
  columns: Array<{
    name: string;
    type: string;
    description: string;
    options?: Array<{
      label: string;
      color?: string;
      group?: "todo" | "active" | "done";
    }>;
    primary?: boolean;
  }>;
  dedupeColumn: string | null;
}

type ApplyState =
  | { status: "idle" }
  | { status: "applying" }
  | { status: "applied"; tableId: string | null }
  | { status: "error"; message: string };

function storageKey(payload: OutputDatabaseProposalPayload): string {
  const sig = [
    payload.title.trim().toLowerCase(),
    ...payload.columns.map(
      (c) => `${c.name.trim().toLowerCase()}:${c.type}`,
    ),
  ].join("|");
  // djb2 — a collision would be the same schema for the same title, where
  // "already created" is the truth anyway.
  let hash = 5381;
  for (let i = 0; i < sig.length; i++) {
    hash = ((hash << 5) + hash + sig.charCodeAt(i)) | 0;
  }
  return `dg:data-output-db-proposal:${(hash >>> 0).toString(36)}`;
}

/** Module-scope for React Compiler purity (CLAUDE.md compiler notes). */
function loadAppliedState(
  payload: OutputDatabaseProposalPayload,
): ApplyState {
  if (typeof window === "undefined") return { status: "idle" };
  try {
    const saved = window.localStorage.getItem(storageKey(payload));
    if (saved) return { status: "applied", tableId: saved || null };
  } catch {
    /* storage unavailable — Apply stays enabled */
  }
  return { status: "idle" };
}

export function OutputDatabaseProposalCard({
  payload,
}: {
  payload: OutputDatabaseProposalPayload;
}) {
  const [state, setState] = useState<ApplyState>(() =>
    loadAppliedState(payload),
  );

  const apply = useCallback(async () => {
    setState({ status: "applying" });
    try {
      const res = await fetch("/api/content/data", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: payload.title,
          columns: payload.columns,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(
          json?.error?.message ?? "Could not create the database",
        );
      }
      const tableId: string | null =
        typeof json.data?.id === "string" ? json.data.id : null;
      try {
        localStorage.setItem(storageKey(payload), tableId ?? "");
      } catch {
        /* best-effort persistence */
      }
      setState({ status: "applied", tableId });
      toast.success(`"${payload.title}" created`);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Network error creating the database";
      setState({ status: "error", message });
      toast.error(message);
    }
  }, [payload]);

  if (state.status === "applied") {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-sky-400/40 bg-sky-500/[0.06] px-3 py-2 text-sm dark:border-sky-400/30 dark:bg-sky-500/[0.08]">
        <Check className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <span className="text-gray-700 dark:text-gray-200">
          Database{" "}
          {state.tableId ? (
            <button
              type="button"
              onClick={() =>
                useContentStore
                  .getState()
                  .setSelectedContentId(state.tableId!)
              }
              className="font-medium text-sky-700 underline decoration-sky-400/50 underline-offset-2 hover:decoration-sky-500 dark:text-sky-300"
            >
              {payload.title}
            </button>
          ) : (
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {payload.title}
            </span>
          )}{" "}
          created — bind it with captureTo on the next run.
        </span>
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-2 rounded-xl border border-sky-400/30 bg-sky-500/[0.04] p-3 text-sm dark:border-sky-400/20 dark:bg-sky-500/[0.06]">
      <div className="flex items-start gap-2">
        <Table2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-gray-900 dark:text-gray-100">
            New database: {payload.title}
          </div>
          {payload.purpose && (
            <div className="text-[11px] text-gray-500 dark:text-gray-400">
              {payload.purpose}
            </div>
          )}
          {payload.dedupeColumn && (
            <div className="text-[11px] text-gray-500 dark:text-gray-400">
              Identity column: {payload.dedupeColumn}
            </div>
          )}
        </div>
      </div>

      <div className="max-h-56 space-y-1.5 overflow-auto rounded-md border border-black/[0.06] bg-white/60 p-2 dark:border-white/[0.08] dark:bg-black/20">
        {payload.columns.map((col) => (
          <div key={col.name} className="text-[12px] leading-snug">
            <span className="font-medium text-gray-800 dark:text-gray-200">
              {col.name}
            </span>{" "}
            <span className="rounded bg-black/[0.05] px-1 py-px text-[10px] text-gray-500 dark:bg-white/[0.08] dark:text-gray-400">
              {col.type}
            </span>
            {col.primary && (
              <span className="ml-1 rounded bg-sky-500/10 px-1 py-px text-[10px] text-sky-600 dark:text-sky-400">
                primary
              </span>
            )}
            <div className="text-[11px] text-gray-500 dark:text-gray-400">
              {col.description}
            </div>
            {col.options && col.options.length > 0 && (
              <div className="mt-0.5 flex flex-wrap gap-1">
                {col.options.map((o) => (
                  <span
                    key={o.label}
                    className="rounded-full border border-black/10 px-1.5 py-px text-[10px] text-gray-600 dark:border-white/15 dark:text-gray-300"
                  >
                    {o.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {state.status === "error" && (
        <div className="text-[11px] text-red-600 dark:text-red-400">
          {state.message}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={apply}
          disabled={state.status === "applying"}
          className="inline-flex items-center gap-1 rounded-md bg-sky-600/90 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-sky-600 disabled:opacity-50"
        >
          {state.status === "applying" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          Create database
        </button>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          Nothing is created until you click.
        </span>
      </div>
    </div>
  );
}
