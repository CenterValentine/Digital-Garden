/**
 * Cross-surface events for the database feature.
 *
 * The grid (DataTableViewer) and the context rail (DataSchemaRail) render
 * in unrelated corners of the tree — main panel vs right sidebar — with no
 * shared store, so schema changes travel the repo's CustomEvent seam (same
 * pattern as `dg:data-open-view` and the flashcards change event). The
 * `source` tag lets a surface skip its own echo: both already reload after
 * their own mutations.
 */

export const DATA_SCHEMA_CHANGED_EVENT = "dg:data-schema-changed";

export interface DataSchemaChangedDetail {
  tableId: string;
  source: "grid" | "rail";
}

export function dispatchDataSchemaChanged(
  tableId: string,
  source: DataSchemaChangedDetail["source"]
): void {
  window.dispatchEvent(
    new CustomEvent<DataSchemaChangedDetail>(DATA_SCHEMA_CHANGED_EVENT, {
      detail: { tableId, source },
    })
  );
}
