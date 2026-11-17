/**
 * CRM virtual tab ids.
 *
 * The CRM's three views are extension-owned virtual content (the `reader:`
 * precedent — `ExtensionRuntime.virtualContent`), so they open as ordinary
 * tabs in any pane and persist with the workspace like everything else.
 *
 *   crm:inbox/<folderId>
 *   crm:pipeline/<folderId>
 *   crm:record/<folderId>/<subjectRowId>
 *
 * `folderId` is the business folder that holds the CRM's databases. These
 * ids are NEVER UUIDs — never pass one to a `@db.Uuid` query.
 *
 * Client-safe: no Prisma.
 */

export const CRM_VIRTUAL_PREFIX = "crm:";
export const CRM_VIRTUAL_CONTENT_TYPE = "crm";

export type CrmView =
  | { kind: "inbox"; folderId: string }
  | { kind: "pipeline"; folderId: string }
  | { kind: "record"; folderId: string; rowId: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCrmTabId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(CRM_VIRTUAL_PREFIX);
}

export function crmTabId(view: CrmView): string {
  switch (view.kind) {
    case "inbox":
      return `${CRM_VIRTUAL_PREFIX}inbox/${view.folderId}`;
    case "pipeline":
      return `${CRM_VIRTUAL_PREFIX}pipeline/${view.folderId}`;
    case "record":
      return `${CRM_VIRTUAL_PREFIX}record/${view.folderId}/${view.rowId}`;
  }
}

/** Parse a CRM tab id. Null for anything malformed — ids come from URLs and storage. */
export function parseCrmTabId(id: string | null | undefined): CrmView | null {
  if (!isCrmTabId(id)) return null;
  const parts = (id as string).slice(CRM_VIRTUAL_PREFIX.length).split("/");
  const [kind, folderId, rowId] = parts;
  if (!folderId || !UUID_RE.test(folderId)) return null;
  if (kind === "inbox" && parts.length === 2) return { kind, folderId };
  if (kind === "pipeline" && parts.length === 2) return { kind, folderId };
  if (kind === "record" && parts.length === 3 && rowId && UUID_RE.test(rowId)) {
    return { kind, folderId, rowId };
  }
  return null;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
