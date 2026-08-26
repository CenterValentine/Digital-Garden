/**
 * Database import — RESERVED SHAPE ONLY (plan Phase 7 / B6).
 *
 * "Reserve the shape, build nothing behind it." These are the contracts a
 * future importer implements; defining them now keeps `DataPayload.source`
 * provenance and the type-inference seam from being invented ad hoc later.
 * `DataPayload.mode: "external"` was reserved by the original stub for
 * live external sources; one-shot file imports stay mode "inline" with
 * provenance recorded in `source`.
 *
 * No implementation lives here by design — `inferColumnsFromSamples`
 * returns a NOT_IMPLEMENTED error result rather than existing half-built.
 */

import type { DataColumnType } from "./types";

/** Where a table's data came from — stored in `DataPayload.source`. */
export interface DataImportProvenance {
  kind: "csv" | "tsv" | "json" | "notion" | "airtable";
  /** Original file name or source label, for the user's memory. */
  sourceName: string;
  importedAt: string;
  /** Row count at import time — drift since then is expected and fine. */
  importedRows: number;
  /**
   * Column-name mapping decided at import (source header → column key),
   * kept so a re-import can offer "same mapping as last time".
   */
  columnMapping?: Record<string, string>;
}

/** One inferred column proposal, shown to the user before anything exists. */
export interface InferredColumn {
  name: string;
  type: DataColumnType;
  /** 0..1 — how much of the sample parsed cleanly as `type`. */
  confidence: number;
  /** Distinct values seen, for select-vocabulary proposals. */
  sampleValues: string[];
}

export type InferenceResult =
  | { ok: true; columns: InferredColumn[] }
  | { ok: false; error: "NOT_IMPLEMENTED" };

/**
 * Propose a schema from sample rows (header + first N data rows).
 * Signature reserved by plan B6; implementation is a later pass.
 */
export function inferColumnsFromSamples(
  _header: string[],
  _rows: string[][]
): InferenceResult {
  return { ok: false, error: "NOT_IMPLEMENTED" };
}
