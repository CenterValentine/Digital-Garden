/**
 * Per-family workspace layout records (layout-intent spec R2/R5/F2).
 *
 * A layout record captures how ONE surface family arranges a workspace:
 * layout mode, per-pane tab order, and a lastActive inheritance seed. The
 * single family="desktop" row (deviceId sentinel "shared") is the desktop
 * coupling — every desktop session reads/writes that one row. All other
 * families ("native-phone", "web-tablet", "ext:<surface>", …) write one row
 * per device. Records are read at workspace-open (R5 inheritance chain) or
 * explicit adoption (F2) — never live-pushed (R8).
 *
 * R3 by construction: nothing here re-applies lastActive to a live session;
 * it exists solely as a seed for a session inheriting the record.
 * R6 by construction: no field anywhere records "which workspace is open".
 */

import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";

export const DESKTOP_FAMILY = "desktop";
export const SHARED_DEVICE_ID = "shared";
/** F2: records older than this drop out of inheritance/adoption. */
export const LAYOUT_RECORD_MAX_AGE_DAYS = 30;

const STATIC_FAMILIES = new Set([
  DESKTOP_FAMILY,
  "native-phone",
  "native-tablet",
  "web-phone",
  "web-tablet",
]);
const EXT_FAMILY_PATTERN = /^ext:[a-z0-9][a-z0-9-]{0,40}$/;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const LAYOUT_MODES = new Set([
  "single",
  "dual-vertical",
  "dual-horizontal",
  "quad",
]);

export function isValidWorkspaceFamily(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (STATIC_FAMILIES.has(value) || EXT_FAMILY_PATTERN.test(value))
  );
}

export interface LayoutRecordPaneOrder {
  paneOrdinal: number;
  tabOrder: string[];
}

export interface LayoutRecordInput {
  layoutMode: string;
  paneOrder: LayoutRecordPaneOrder[];
  lastActive: { paneOrdinal: number; contentId: string } | null;
}

function normalizeLayoutRecordInput(value: unknown): LayoutRecordInput | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;

  const layoutMode =
    typeof record.layoutMode === "string" && LAYOUT_MODES.has(record.layoutMode)
      ? record.layoutMode
      : "single";

  const paneOrder: LayoutRecordPaneOrder[] = [];
  if (Array.isArray(record.paneOrder)) {
    for (const entry of record.paneOrder) {
      if (typeof entry !== "object" || entry === null) continue;
      const pane = entry as Record<string, unknown>;
      const ordinal = pane.paneOrdinal;
      if (typeof ordinal !== "number" || ordinal < 1 || ordinal > 4) continue;
      const tabOrder = Array.isArray(pane.tabOrder)
        ? pane.tabOrder.filter((id): id is string => typeof id === "string")
        : [];
      paneOrder.push({ paneOrdinal: ordinal, tabOrder });
    }
  }

  let lastActive: LayoutRecordInput["lastActive"] = null;
  if (typeof record.lastActive === "object" && record.lastActive !== null) {
    const seed = record.lastActive as Record<string, unknown>;
    if (
      typeof seed.paneOrdinal === "number" &&
      seed.paneOrdinal >= 1 &&
      seed.paneOrdinal <= 4 &&
      typeof seed.contentId === "string"
    ) {
      lastActive = { paneOrdinal: seed.paneOrdinal, contentId: seed.contentId };
    }
  }

  return { layoutMode, paneOrder, lastActive };
}

/**
 * Upsert this surface's layout record for a workspace.
 *
 * deviceId is forced to the "shared" sentinel for the desktop family (the
 * coupling row); other families must present a stable per-device id. Tab ids
 * in paneOrder/lastActive are filtered against the workspace's MEMBERSHIP
 * rows (already ownership-verified at open), so a record can never smuggle
 * foreign content ids into another session's inheritance.
 */
export async function upsertLayoutRecord(
  ownerId: string,
  workspaceId: string,
  family: unknown,
  deviceId: unknown,
  input: unknown,
) {
  if (!isValidWorkspaceFamily(family)) return null;
  const resolvedDeviceId =
    family === DESKTOP_FAMILY
      ? SHARED_DEVICE_ID
      : typeof deviceId === "string" && DEVICE_ID_PATTERN.test(deviceId)
        ? deviceId
        : null;
  if (!resolvedDeviceId) return null;

  const normalized = normalizeLayoutRecordInput(input);
  if (!normalized) return null;

  const workspace = await prisma.contentWorkspace.findFirst({
    where: { id: workspaceId, ownerId, status: "active" },
    select: { id: true },
  });
  if (!workspace) return null;

  const membership = await prisma.contentWorkspaceTab.findMany({
    where: { workspaceId },
    select: { contentId: true },
  });
  const memberIds = new Set(membership.map((row) => row.contentId));

  const paneOrder = normalized.paneOrder.map((pane) => ({
    paneOrdinal: pane.paneOrdinal,
    tabOrder: pane.tabOrder.filter((id) => memberIds.has(id)),
  }));
  const lastActive =
    normalized.lastActive && memberIds.has(normalized.lastActive.contentId)
      ? normalized.lastActive
      : null;

  return prisma.contentWorkspaceLayoutRecord.upsert({
    where: {
      workspaceId_family_deviceId: {
        workspaceId,
        family,
        deviceId: resolvedDeviceId,
      },
    },
    create: {
      workspaceId,
      family,
      deviceId: resolvedDeviceId,
      layoutMode: normalized.layoutMode,
      paneOrder: paneOrder as unknown as Prisma.InputJsonValue,
      lastActive: lastActive as unknown as Prisma.InputJsonValue,
    },
    update: {
      layoutMode: normalized.layoutMode,
      paneOrder: paneOrder as unknown as Prisma.InputJsonValue,
      lastActive: lastActive as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * List a workspace's fresh layout records (R5 inheritance + the F2 picker).
 * Stale records (> LAYOUT_RECORD_MAX_AGE_DAYS) are excluded — expired leads
 * fall back to the default chain by simply not appearing.
 */
export async function listLayoutRecords(ownerId: string, workspaceId: string) {
  const workspace = await prisma.contentWorkspace.findFirst({
    where: { id: workspaceId, ownerId, status: "active" },
    select: { id: true },
  });
  if (!workspace) return null;

  const cutoff = new Date(
    Date.now() - LAYOUT_RECORD_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
  );
  return prisma.contentWorkspaceLayoutRecord.findMany({
    where: { workspaceId, updatedAt: { gte: cutoff } },
    orderBy: { updatedAt: "desc" },
    select: {
      family: true,
      deviceId: true,
      layoutMode: true,
      paneOrder: true,
      lastActive: true,
      updatedAt: true,
    },
  });
}
