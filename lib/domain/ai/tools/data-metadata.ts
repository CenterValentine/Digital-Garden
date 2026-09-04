/**
 * Database tool metadata (client-safe) — plan Phase 6 / B5.
 *
 * All three are user-configurable: the owner asked for a real opt-out from
 * AI database access, so these get settings toggles rather than
 * harness-internal status. NO server imports here.
 */

export const DATA_TOOL_IDS = [
  "query_database",
  "describe_database",
  "insert_rows",
  "update_row",
  "propose_column_options",
  "propose_output_database",
] as const;

export type DataToolId = (typeof DATA_TOOL_IDS)[number];

export const DATA_TOOL_METADATA: Record<
  DataToolId,
  { name: string; description: string }
> = {
  query_database: {
    name: "Query Database",
    description:
      "Read rows from an associated database — filtered, sorted, and paged server-side (20 rows default, 100 max per call; never the whole table)",
  },
  describe_database: {
    name: "Describe Database",
    description:
      "Read an associated database's full schema: columns, types, option vocabularies, and views",
  },
  insert_rows: {
    name: "Insert Database Rows",
    description:
      "Append new rows to an associated database (append-only — cannot modify or delete existing rows; ≤25 per call, optional dedupe column, batches over 10 require your confirmation)",
  },
  update_row: {
    name: "Update Database Row",
    description:
      "Change cells in ONE existing row — only the columns the user named, all-or-nothing, with compare-and-set protection against overwriting concurrent edits; cannot create or delete rows",
  },
  propose_column_options: {
    name: "Propose Column Options",
    description:
      "Suggest category options for a select, multi-select, or status column as a review card — nothing is written until you click Apply on the card",
  },
  propose_output_database: {
    name: "Propose Output Database",
    description:
      "Design a new capture database (schema, per-column descriptions, initial category options) as a review card — nothing is created until you click Apply on the card",
  },
};
