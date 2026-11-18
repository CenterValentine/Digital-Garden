"use client";

/**
 * A CRM record's own fields, rendered by the database's generic field
 * renderer (DataRowFields — the row peek's body). Whatever columns a
 * business's subject table has — gate instructions for a yard, make and
 * model for a vehicle — render and save with no CRM-specific code, through
 * the same rows route and access check as the grid.
 */

import { useCallback } from "react";
import { DataRowFields } from "@/components/content/data/DataRowFields";
import type { ContentRef, DataColumn, DataRow } from "@/lib/domain/data";
import type { CrmTableSnapshot } from "@/lib/domain/crm/model";
import { useContentStore } from "@/state/content-store";
import { commitCrmCell } from "../lib/actions";
import { useCrmStore } from "../state/crm-store";

export function CrmFields({
  folderId,
  table,
  row,
  columns,
}: {
  folderId: string;
  table: CrmTableSnapshot;
  row: DataRow;
  columns: DataColumn[];
}) {
  const editable = table.access === "write" || table.access === "owner";

  const onCommitCell = useCallback(
    (rowId: string, columnKey: string, value: unknown) => {
      void commitCrmCell(folderId, table.id, rowId, columnKey, value);
    },
    [folderId, table.id]
  );

  const onOpenContent = useCallback((ref: ContentRef) => {
    if (ref.restricted) return;
    useContentStore.getState().setSelectedContentId(ref.id, {
      title: ref.title,
      contentType: ref.contentType ?? undefined,
      pin: true,
    });
  }, []);

  const onRefresh = useCallback(() => {
    void useCrmStore.getState().load(folderId);
  }, [folderId]);

  if (columns.length === 0) return null;
  return (
    <div className="space-y-3" data-crm-fields={row.id}>
      <DataRowFields
        tableId={table.id}
        row={row}
        columns={columns}
        editable={editable}
        onOpenContent={onOpenContent}
        onCommitCell={onCommitCell}
        onRefresh={onRefresh}
      />
    </div>
  );
}

/** The subject's own fields for the record view: everything but the name, links and notes. */
export function recordFieldColumns(table: CrmTableSnapshot, excludeIds: Array<string | undefined>): DataColumn[] {
  const exclude = new Set(excludeIds.filter(Boolean));
  return table.columns.filter(
    (c) =>
      !c.isPrimary &&
      !exclude.has(c.id) &&
      c.type !== "relation" &&
      c.type !== "lookup" &&
      c.type !== "rollup" &&
      c.type !== "createdAt" &&
      c.type !== "updatedAt"
  );
}
