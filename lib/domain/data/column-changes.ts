/**
 * Column-change planning (propose_column_changes).
 *
 * The AI tool resolves the database and the permission level; everything it
 * then DECIDES lives here, pure, so the refusals that matter — a charter
 * ledger's system columns, the primary column, a name collision — are
 * pinned by `pnpm column:changes:check` instead of only by a live chat.
 *
 * Shape vs judgement (repo doctrine): the Zod schema says a change is
 * `{column, op, to?}`; this says whether that change may happen.
 *
 * Retyping is absent on purpose. Changing a column's type is forbidden
 * (plan O4 — coercing every existing cell is lossy in ways no preview
 * conveys), so the honest path is a new column plus a migration the user
 * can see, and the tool's description says so.
 */

import type { DataColumn } from "./types";

/** One change as the model asked for it. */
export interface RequestedColumnChange {
  /** The column's exact current name, or its id. */
  column: string;
  op: "rename" | "remove";
  /** rename only. */
  to?: string;
  reason?: string;
}

/** One change as the card will offer it. */
export interface PlannedColumnChange {
  columnId: string;
  columnName: string;
  columnType: string;
  /** The card speaks the API's verb: a remove is a soft delete. */
  op: "rename" | "delete";
  to?: string;
  reason?: string;
}

export interface ColumnChangePlan {
  changes: PlannedColumnChange[];
  /** Asked for, not offered — shown on the card with the reason. */
  refused: Array<{ column: string; reason: string }>;
}

/** Resolve a column by exact name (case-insensitive) or by id. */
function findLiveColumn(
  live: DataColumn[],
  ref: string
): DataColumn | undefined {
  const needle = ref.trim().toLowerCase();
  return (
    live.find((c) => c.name.trim().toLowerCase() === needle) ??
    live.find((c) => c.id === ref.trim())
  );
}

/**
 * Diff a requested set of changes against the live schema.
 *
 * Refusals RIDE THE PLAN rather than failing the whole call: the user asked
 * for a set, and "these four, not that one, and why" beats dropping the ask
 * on the floor. A plan with no surviving changes is the caller's signal to
 * answer in prose instead of rendering a card.
 */
export function planColumnChanges(
  live: DataColumn[],
  requested: RequestedColumnChange[]
): ColumnChangePlan {
  const changes: PlannedColumnChange[] = [];
  const refused: Array<{ column: string; reason: string }> = [];
  const touched = new Set<string>();
  // Names in play, kept current as renames are accepted, so two renames in
  // one proposal can swap through a free name without a false collision.
  const taken = new Set(live.map((c) => c.name.trim().toLowerCase()));

  for (const raw of requested) {
    const ref = raw.column.trim();
    const column = findLiveColumn(live, ref);
    if (!column) {
      refused.push({
        column: ref,
        reason: `no column by that name — this table has ${live
          .map((c) => c.name)
          .join(", ")}`,
      });
      continue;
    }
    if (touched.has(column.id)) {
      refused.push({
        column: column.name,
        reason: "named twice in one proposal — send one change per column",
      });
      continue;
    }
    // The charter-ledger machinery reads these BY NAME and writes option ids
    // it minted, so a rename or a removal detaches the ledger from its
    // charter at the next sitting. Refused while the model can still revise.
    if (column.config?.system === true) {
      refused.push({
        column: column.name,
        reason:
          "a SYSTEM column of a charter ledger — its name and existence are locked; add a new column instead",
      });
      continue;
    }

    if (raw.op === "remove") {
      if (column.isPrimary) {
        refused.push({
          column: column.name,
          reason:
            "the primary column — every row is titled from it, so it cannot be removed",
        });
        continue;
      }
      touched.add(column.id);
      changes.push({
        columnId: column.id,
        columnName: column.name,
        columnType: column.type,
        op: "delete",
        ...(raw.reason?.trim() ? { reason: raw.reason.trim() } : {}),
      });
      continue;
    }

    const to = raw.to?.trim();
    if (!to) {
      refused.push({
        column: column.name,
        reason: "a rename needs `to` — the new name was missing",
      });
      continue;
    }
    if (to.toLowerCase() === column.name.trim().toLowerCase()) {
      refused.push({
        column: column.name,
        reason: "already called that — nothing to rename",
      });
      continue;
    }
    if (taken.has(to.toLowerCase())) {
      refused.push({
        column: column.name,
        reason: `"${to}" is already another column on this table`,
      });
      continue;
    }
    taken.delete(column.name.trim().toLowerCase());
    taken.add(to.toLowerCase());
    touched.add(column.id);
    changes.push({
      columnId: column.id,
      columnName: column.name,
      columnType: column.type,
      op: "rename",
      to: to.slice(0, 120),
      ...(raw.reason?.trim() ? { reason: raw.reason.trim() } : {}),
    });
  }

  return { changes, refused };
}
