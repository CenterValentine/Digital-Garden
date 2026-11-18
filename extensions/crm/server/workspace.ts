/**
 * Loading a CRM — a business folder plus the databases its config binds.
 *
 * Access boundary (the same ladder every database route uses):
 *  - the FOLDER must be viewable by the caller (owner, or a ViewGrant);
 *  - EVERY table the config names is re-resolved with
 *    `resolveDataTableAccess`. The config is user-writable folder state and
 *    could name anyone's table id; it confers nothing. A table the caller
 *    cannot read makes the whole CRM "not found" — the 404 stance of the
 *    data routes, which never confirm that something exists.
 *
 * SERVER-ONLY (Prisma).
 */

import { prisma } from "@/lib/database/client";
import { resolveContentAccess } from "@/lib/domain/collaboration/access";
import {
  canRead,
  resolveDataTableAccess,
  type DataAccessLevel,
} from "@/lib/domain/data/server/access";
import { loadRowPage, loadTable } from "@/lib/domain/data/server/queries";
import { MAX_ROW_PAGE_SIZE, type DataTable } from "@/lib/domain/data";
import {
  CRM_TABLE_ROLES,
  CRM_VIEW_PREFS_KEY,
  parseCrmConfig,
  type CrmConfig,
  type CrmTableRole,
} from "@/lib/domain/crm/config";
import type { CrmTableSnapshot, CrmWorkspaceSnapshot } from "@/lib/domain/crm/model";
import { isUuid } from "@/lib/domain/crm/ids";
import { describeCrmAutomation } from "./automation/registry";

export interface CrmBusinessSummary {
  folderId: string;
  name: string;
  terms: CrmConfig["terms"];
}

/** Read the config straight off a folder. Null = not a CRM. */
export async function readFolderCrmConfig(folderId: string): Promise<CrmConfig | null> {
  if (!isUuid(folderId)) return null;
  const payload = await prisma.folderPayload.findUnique({
    where: { contentId: folderId },
    select: { viewPrefs: true },
  });
  const prefs = (payload?.viewPrefs ?? {}) as Record<string, unknown>;
  return parseCrmConfig(prefs[CRM_VIEW_PREFS_KEY]);
}

/**
 * The CRM businesses this user can open: folders they own whose viewPrefs
 * carry a CRM config. (Shared CRMs reach a grantee by link — listing other
 * people's folders is not something the tree does either.)
 */
export async function listCrmBusinesses(userId: string): Promise<CrmBusinessSummary[]> {
  const folders = await prisma.contentNode.findMany({
    where: {
      ownerId: userId,
      contentType: "folder",
      deletedAt: null,
      folderPayload: { viewPrefs: { path: [CRM_VIEW_PREFS_KEY, "version"], equals: 1 } },
    },
    select: { id: true, title: true, folderPayload: { select: { viewPrefs: true } } },
    orderBy: { title: "asc" },
  });
  return folders.flatMap((f) => {
    const prefs = (f.folderPayload?.viewPrefs ?? {}) as Record<string, unknown>;
    const config = parseCrmConfig(prefs[CRM_VIEW_PREFS_KEY]);
    return config ? [{ folderId: f.id, name: f.title, terms: config.terms }] : [];
  });
}

export interface ResolvedCrm {
  folderId: string;
  businessName: string;
  config: CrmConfig;
  tables: Record<CrmTableRole, DataTable>;
  access: Record<CrmTableRole, DataAccessLevel>;
}

/**
 * Resolve a CRM for a caller: folder view access + read access on every
 * bound table. Null when any of it fails (→ 404 at the route).
 */
export async function resolveCrm(folderId: string, userId: string): Promise<ResolvedCrm | null> {
  if (!isUuid(folderId)) return null;
  let folderTitle: string;
  try {
    const access = await resolveContentAccess(prisma, { contentId: folderId, userId });
    if (!access.canView) return null;
    const node = await prisma.contentNode.findFirst({
      where: { id: folderId, contentType: "folder", deletedAt: null },
      select: { title: true },
    });
    if (!node) return null;
    folderTitle = node.title;
  } catch {
    return null;
  }

  const config = await readFolderCrmConfig(folderId);
  if (!config) return null;

  const tables = {} as Record<CrmTableRole, DataTable>;
  const access = {} as Record<CrmTableRole, DataAccessLevel>;
  for (const role of CRM_TABLE_ROLES) {
    const tableId = config.tables[role];
    if (!isUuid(tableId)) return null;
    const level = await resolveDataTableAccess(tableId, userId);
    if (!canRead(level)) return null;
    const table = await loadTable(tableId, userId);
    if (!table || table.mode !== "inline") return null;
    tables[role] = table;
    access[role] = level;
  }

  return { folderId, businessName: folderTitle, config, tables, access };
}

/** The full read model input for the views. */
export async function loadCrmWorkspace(
  folderId: string,
  userId: string
): Promise<CrmWorkspaceSnapshot | null> {
  const crm = await resolveCrm(folderId, userId);
  if (!crm) return null;

  let truncated = false;
  const loaded = new Map<string, CrmTableSnapshot>();
  for (const role of CRM_TABLE_ROLES) {
    const table = crm.tables[role];
    const cached = loaded.get(table.contentId);
    if (cached) continue;
    // One page per table: a CRM this size is a working set, not an archive.
    // Past the cap the snapshot says so instead of silently dropping rows.
    const page = await loadRowPage({
      tableId: table.contentId,
      view: null,
      columns: table.columns,
      limit: MAX_ROW_PAGE_SIZE,
      viewerId: userId,
    });
    if (page.nextCursor) truncated = true;
    loaded.set(table.contentId, {
      id: table.contentId,
      title: table.title,
      access: crm.access[role],
      columns: table.columns,
      rows: page.rows,
    });
  }

  const tables = {} as Record<CrmTableRole, CrmTableSnapshot>;
  for (const role of CRM_TABLE_ROLES) {
    tables[role] = loaded.get(crm.tables[role].contentId)!;
  }

  return {
    folderId,
    businessName: crm.businessName,
    config: crm.config,
    tables,
    automation: describeCrmAutomation(crm.config),
    truncated,
    loadedAt: new Date().toISOString(),
  };
}
