"use client";

/**
 * LinkedDatabasesProposalCard — renders a __linkedDatabasesProposal payload
 * from the propose_linked_databases AI tool (plan
 * AI-RELATIONAL-DATABASE-REACH P2).
 *
 * Same contract as the sibling proposal cards: the tool wrote NOTHING; this
 * card's Apply click is the commit. What differs is the SHAPE of the thing
 * being consented to. A set of tables that reference each other is one
 * decision, not four, and the interesting part is the edges — so the card
 * leads with the relationships and lists the schemas underneath.
 *
 * Apply is one POST to /api/content/data/batch, which runs the whole spec in
 * a single transaction. There is deliberately no partial state: a half-built
 * graph is worse than none, because the tables that did land look finished.
 */

import { useCallback, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Database, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { dispatchDataSchemaChanged } from "@/components/content/data/events";
import { useContentStore } from "@/state/content-store";

const NEW_PREFIX = "$new:";

interface ProposedColumn {
  name: string;
  type: string;
  description: string;
  options?: Array<{ label: string; color?: string; group?: string }>;
  primary?: boolean;
  target?: string;
  backlinkName?: string;
  through?: string;
  column?: string;
  fn?: string;
}

export interface LinkedDatabasesProposalPayload {
  __linkedDatabasesProposal: true;
  rationale: string | null;
  parentId?: string | null;
  parentTitle?: string | null;
  /** Nest the new tables under this chat/content as references. */
  ownerContentId?: string | null;
  ownerTitle?: string | null;
  tables: Array<{
    title: string;
    purpose: string | null;
    columns: ProposedColumn[];
  }>;
  extend: Array<{
    databaseId: string;
    databaseTitle: string;
    columns: ProposedColumn[];
  }>;
}

type ApplyState =
  | { status: "idle" }
  | { status: "applying" }
  | { status: "applied"; tables: Array<{ id: string; title: string }> }
  | { status: "error"; message: string };

/**
 * Keyed by WHAT was proposed, never by message id: a streamed message's id
 * changes once the conversation is persisted, so an id-keyed flag vanishes on
 * the first reload and Apply comes back live (observed 2026-08-31).
 */
function storageKey(payload: LinkedDatabasesProposalPayload): string {
  const sig = [
    ...payload.tables.map(
      (t) =>
        `${t.title.trim().toLowerCase()}(${t.columns.map((c) => `${c.name.trim().toLowerCase()}:${c.type}`).join(",")})`,
    ),
    ...payload.extend.map(
      (e) =>
        `${e.databaseId}+${e.columns.map((c) => c.name.trim().toLowerCase()).join(",")}`,
    ),
  ].join("|");
  let hash = 5381;
  for (let i = 0; i < sig.length; i++) {
    hash = ((hash << 5) + hash + sig.charCodeAt(i)) | 0;
  }
  return `dg:linked-dbs-proposal:${(hash >>> 0).toString(36)}`;
}

function loadAppliedState(
  payload: LinkedDatabasesProposalPayload,
): ApplyState {
  if (typeof window === "undefined") return { status: "idle" };
  try {
    const saved = window.localStorage.getItem(storageKey(payload));
    if (saved) {
      return { status: "applied", tables: JSON.parse(saved) };
    }
  } catch {
    /* storage unavailable, or a stale shape — Apply stays enabled */
  }
  return { status: "idle" };
}

/** A target reference as the user should read it — "$new:" is our syntax. */
function readableTarget(target: string): string {
  return target.startsWith(NEW_PREFIX) ? target.slice(NEW_PREFIX.length) : target;
}

interface Edge {
  from: string;
  to: string;
  via: string;
  back: string;
}

/**
 * The edges, which are the point of this card. A relation is two-sided, so
 * each one is shown once with both column names — the mirrored column lands
 * on a table the user never asked about, and that should not be a surprise.
 */
function collectEdges(payload: LinkedDatabasesProposalPayload): Edge[] {
  const edges: Edge[] = [];
  const walk = (from: string, columns: ProposedColumn[]) => {
    for (const column of columns) {
      if (column.type !== "relation" || !column.target) continue;
      edges.push({
        from,
        to: readableTarget(column.target),
        via: column.name,
        back: column.backlinkName || from,
      });
    }
  };
  for (const table of payload.tables) walk(table.title, table.columns);
  for (const entry of payload.extend) walk(entry.databaseTitle, entry.columns);
  return edges;
}

function describeComputed(col: ProposedColumn): string | null {
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

export function LinkedDatabasesProposalCard({
  payload,
}: {
  payload: LinkedDatabasesProposalPayload;
}) {
  const [state, setState] = useState<ApplyState>(() =>
    loadAppliedState(payload),
  );

  const edges = collectEdges(payload);
  const tableCount = payload.tables.length;
  const columnCount =
    payload.tables.reduce((n, t) => n + t.columns.length, 0) +
    payload.extend.reduce((n, e) => n + e.columns.length, 0);

  const apply = useCallback(async () => {
    setState({ status: "applying" });
    try {
      const res = await fetch("/api/content/data/batch", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tables: payload.tables.map((t) => ({
            title: t.title,
            ...(t.purpose ? { description: t.purpose } : {}),
            ...(payload.parentId ? { parentId: payload.parentId } : {}),
            ...(payload.ownerContentId
              ? { ownerContentId: payload.ownerContentId }
              : {}),
            columns: t.columns,
          })),
          extend: payload.extend.map((e) => ({
            database: e.databaseId,
            columns: e.columns,
          })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message ?? "Could not create the schema");
      }

      const created = (json.data?.tables ?? []) as Array<{
        id: string;
        title: string;
      }>;
      // Every table in the graph changed shape — the new ones, the extended
      // ones, and any that only received a mirrored column.
      for (const table of [
        ...created,
        ...((json.data?.extended ?? []) as Array<{ id: string }>),
      ]) {
        dispatchDataSchemaChanged(table.id, "chat");
      }

      try {
        localStorage.setItem(storageKey(payload), JSON.stringify(created));
      } catch {
        /* best-effort persistence */
      }
      setState({ status: "applied", tables: created });
      toast.success(
        created.length > 0
          ? `${created.length} database${created.length === 1 ? "" : "s"} created`
          : "Schema applied",
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Network error creating the schema";
      setState({ status: "error", message });
      toast.error(message);
    }
  }, [payload]);

  if (state.status === "applied") {
    return (
      <div className="inline-flex max-w-md flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border border-sky-400/40 bg-sky-500/[0.06] px-3 py-2 text-sm dark:border-sky-400/30 dark:bg-sky-500/[0.08]">
        <Check className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <span className="text-gray-700 dark:text-gray-200">
          Created{" "}
          {state.tables.map((t, i) => (
            <span key={t.id}>
              {i > 0 && ", "}
              <button
                type="button"
                onClick={() =>
                  useContentStore.getState().setSelectedContentId(t.id)
                }
                className="font-medium text-sky-700 underline decoration-sky-400/50 underline-offset-2 hover:decoration-sky-500 dark:text-sky-300"
              >
                {t.title}
              </button>
            </span>
          ))}
          {edges.length > 0 && (
            <span className="text-gray-500 dark:text-gray-400">
              {" "}
              · {edges.length} link{edges.length === 1 ? "" : "s"}
            </span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-2 rounded-xl border border-sky-400/30 bg-sky-500/[0.04] p-3 text-sm dark:border-sky-400/20 dark:bg-sky-500/[0.06]">
      <div className="flex items-start gap-2">
        <Database className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-gray-900 dark:text-gray-100">
            {tableCount > 0
              ? `Create ${tableCount} linked database${tableCount === 1 ? "" : "s"}`
              : "Link these databases"}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            {columnCount} column{columnCount === 1 ? "" : "s"}
            {edges.length > 0 &&
              ` · ${edges.length} relation${edges.length === 1 ? "" : "s"}`}
            {payload.ownerTitle
              ? ` · under ${payload.ownerTitle}`
              : payload.parentTitle
                ? ` · in ${payload.parentTitle}`
                : ""}
          </div>
        </div>
      </div>

      {payload.rationale && (
        <p className="text-[13px] text-gray-700 dark:text-gray-300">
          {payload.rationale}
        </p>
      )}

      {edges.length > 0 && (
        <div className="space-y-1 rounded-md border border-sky-500/15 bg-white/50 p-2 dark:bg-black/20">
          {edges.map((edge, i) => (
            <div
              key={`${edge.from}-${edge.via}-${i}`}
              className="flex flex-wrap items-center gap-1 text-[11px] text-gray-600 dark:text-gray-300"
            >
              <span className="font-medium text-gray-800 dark:text-gray-100">
                {edge.from}
              </span>
              <ArrowRight className="h-3 w-3 shrink-0 text-sky-500" />
              <span className="font-medium text-gray-800 dark:text-gray-100">
                {edge.to}
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                via “{edge.via}”, back as “{edge.back}”
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="max-h-72 space-y-2 overflow-y-auto">
        {payload.tables.map((table) => (
          <div key={table.title}>
            <div className="text-xs font-medium text-gray-900 dark:text-gray-100">
              {table.title}
            </div>
            {table.purpose && (
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                {table.purpose}
              </div>
            )}
            <div className="mt-0.5 flex flex-wrap gap-1">
              {table.columns.map((col) => (
                <span
                  key={col.name}
                  title={col.description}
                  className="rounded border border-black/10 px-1 py-px text-[10px] text-gray-600 dark:border-white/15 dark:text-gray-300"
                >
                  {col.name}
                  <span className="ml-1 text-gray-400 dark:text-gray-500">
                    {col.type}
                  </span>
                </span>
              ))}
            </div>
            {table.columns.map((col) =>
              describeComputed(col) ? (
                <div
                  key={`${col.name}-computed`}
                  className="text-[10px] text-sky-700/80 dark:text-sky-300/80"
                >
                  {col.name}: {describeComputed(col)}
                </div>
              ) : null,
            )}
          </div>
        ))}

        {payload.extend.map((entry) => (
          <div key={entry.databaseId}>
            <div className="text-xs font-medium text-gray-900 dark:text-gray-100">
              {entry.databaseTitle}
              <span className="ml-1 font-normal text-[10px] text-gray-500 dark:text-gray-400">
                existing · {entry.columns.length} column
                {entry.columns.length === 1 ? "" : "s"} added
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {entry.columns.map((col) => (
                <span
                  key={col.name}
                  title={col.description}
                  className="rounded border border-black/10 px-1 py-px text-[10px] text-gray-600 dark:border-white/15 dark:text-gray-300"
                >
                  {col.name}
                  <span className="ml-1 text-gray-400 dark:text-gray-500">
                    {col.type}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {state.status === "error" && (
        <div className="flex items-start gap-1.5 rounded-md bg-red-500/10 px-2 py-1.5 text-[12px] text-red-700 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{state.message} — nothing was created.</span>
        </div>
      )}

      <button
        type="button"
        onClick={apply}
        disabled={state.status === "applying"}
        className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/[0.08] px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-500/[0.14] disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-400/30 dark:bg-sky-500/[0.10] dark:text-sky-300 dark:hover:bg-sky-500/[0.18]"
      >
        {state.status === "applying" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Creating…
          </>
        ) : state.status === "error" ? (
          "Try again"
        ) : (
          "Create all"
        )}
      </button>
    </div>
  );
}
