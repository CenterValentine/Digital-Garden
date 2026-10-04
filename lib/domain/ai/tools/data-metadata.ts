/**
 * Database tool metadata (client-safe) — plan Phase 6 / B5.
 *
 * All of these are user-configurable: the owner asked for a real opt-out
 * from AI database access, so they get settings toggles rather than
 * harness-internal status. NO server imports here.
 */

export const DATA_TOOL_IDS = [
  "query_database",
  "describe_database",
  "insert_rows",
  "update_row",
  "update_rows",
  "propose_column_options",
  "propose_database_columns",
  "propose_output_database",
  "propose_linked_databases",
] as const;

export type DataToolId = (typeof DATA_TOOL_IDS)[number];

export const DATA_TOOL_METADATA: Record<
  DataToolId,
  { name: string; description: string }
> = {
  query_database: {
    name: "Query Database",
    description:
      "Read rows from a reachable database (one that is open, mentioned, or linked by a relation) — filtered, searched, and sized in tokens server-side; whole-table reads above your approval threshold (Settings → AI) pause for your approval with the estimate on the card",
  },
  describe_database: {
    name: "Describe Database",
    description:
      "Read a reachable database's schema with column profiles (fill rates, vocabularies, ranges, read cost), sample rows, and views",
  },
  insert_rows: {
    name: "Insert Database Rows",
    description:
      "Append new rows to a reachable database, linking them to rows in other databases where the schema has relations (append-only — cannot modify or delete existing rows; ≤25 per call, optional dedupe column, batches over 10 require your confirmation)",
  },
  update_row: {
    name: "Update Database Row",
    description:
      "Change cells in ONE existing row, including the rows it links to — only the columns the user named, all-or-nothing, with compare-and-set protection against overwriting concurrent edits; cannot create or delete rows",
  },
  update_rows: {
    name: "Update Database Rows",
    description:
      "Change cells across several existing rows in one transaction — sweeping a column or backfilling a field as a single write and a single undo, all-or-nothing across every row, with the same compare-and-set protection as a single-row edit (\u226425 rows per call; more than 10 requires your confirmation; cannot create or delete rows)",
  },
  propose_column_options: {
    name: "Propose Column Options",
    description:
      "Suggest category options for a select, multi-select, or status column as a review card — nothing is written until you click Apply on the card",
  },
  propose_database_columns: {
    name: "Propose Database Columns",
    description:
      "Suggest NEW columns for an existing database as a review card — add-only (never renames, retypes, or deletes), and nothing is written until you click Apply",
  },
  propose_output_database: {
    name: "Propose Output Database",
    description:
      "Design a new capture database (schema, per-column descriptions, initial category options) as a review card — nothing is created until you click Apply on the card",
  },
  propose_linked_databases: {
    name: "Propose Linked Databases",
    description:
      "Design a set of databases that reference each other — relations, backlinks, and rollups included — as one review card; Apply creates all of them in a single transaction, or none of them",
  },
};
