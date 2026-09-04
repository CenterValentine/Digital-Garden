/**
 * Quests (EXTRACTION-TO-DATABASE-PLAN P4a — D5/D6/D9/D10).
 *
 * The database-backed successor of the markdown-only run state:
 *
 *  - Each CHARTER owns one MASTER LEDGER ("a ledger of other ledgers"):
 *    a standardized data table, one row per quest, with MANDATORY
 *    contentLinks to the quest ledger / output table / quest log. Found
 *    via `metadata.masterLedgerId` stamped on the charter note (the D10
 *    lazy transition — created on the charter's next run, idempotent).
 *  - Each QUEST (an ongoing matter — one job hunt for months) has ONE
 *    quest ledger: item-state rows upserted by item key, continuous
 *    across sittings. Separate matters never co-mingle; one matter never
 *    fragments. Continue-or-create per run (D9) resolves by quest label
 *    against the master.
 *  - SITTINGS have no artifacts: they are stamps on rows and master
 *    counters (per site, per attempt, per agent).
 *
 * P4a is ADDITIVE: rows accumulate beside the markdown ledger note (the
 * quest log's predecessor); enforcement cutover is P4b. Ledger schemas are
 * a fixed sensible core in this phase — AI sculpting + D8 single-column
 * grace ride PR 4 with the generation machinery.
 *
 * Icons (D6, owner-approved "all distinct"): master = lucide:LibraryBig,
 * quest ledger = lucide:Map — set via `customIcon`, which the tree renders
 * ahead of the contentType switch, so no FileNode changes are needed.
 */

import "server-only";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { logger } from "@/lib/core/logger";
import {
  createColumn,
  createRows,
  writeCells,
  type CellWrite,
} from "@/lib/domain/data/server/mutations";
import { generateUniqueSlug } from "@/lib/domain/content";
import type { DataColumn } from "@/lib/domain/data";

export const QUEST_SCHEMA_VERSION = 1;
/** Charter-note metadata key holding its master ledger's node id (D10 stamp). */
export const MASTER_LEDGER_META_KEY = "masterLedgerId";

// ── Standardized master-ledger schema (versioned constant; never sculpted) ──

const MASTER_COLUMNS: Array<{
  name: string;
  type: "text" | "longText" | "select" | "date" | "number" | "contentLink";
  description: string;
  config?: Record<string, unknown>;
  primary?: boolean;
}> = [
  { name: "Quest", type: "text", description: "The matter's name — one ongoing endeavor (e.g. Job Hunt 2026).", primary: true },
  { name: "Objective", type: "longText", description: "What each sitting works toward, from the proposal." },
  {
    name: "Status",
    type: "select",
    description: "Quest lifecycle — active while sittings continue.",
    config: {
      options: [
        { id: "opt-active", label: "Active", color: "green" },
        { id: "opt-dormant", label: "Dormant", color: "amber" },
        { id: "opt-closed", label: "Closed", color: "gray" },
      ],
    },
  },
  { name: "Started", type: "date", description: "First sitting's date." },
  { name: "Last sitting", type: "date", description: "Most recent sitting's date." },
  { name: "Sittings", type: "number", description: "How many sittings this quest has had." },
  { name: "Items", type: "number", description: "Cumulative items processed across sittings." },
  { name: "Qualified", type: "number", description: "Cumulative items that met the bar." },
  { name: "Tokens", type: "number", description: "Cumulative model tokens across sittings (approximate)." },
  { name: "Est. cost", type: "number", description: "Cumulative estimated USD across sittings." },
  { name: "Quest ledger", type: "contentLink", description: "MANDATORY link — the quest's item-state database." },
  { name: "Output table", type: "contentLink", description: "MANDATORY link when capturing — where admitted rows land." },
  { name: "Quest log", type: "contentLink", description: "MANDATORY link — the quest's narrative note." },
];

// ── Quest-ledger machinery core (fixed in P4a; sculpting arrives PR 4) ─────

const QUEST_LEDGER_COLUMNS: Array<{
  name: string;
  type: "text" | "longText" | "select" | "url" | "number" | "checkbox";
  description: string;
  config?: Record<string, unknown>;
  primary?: boolean;
}> = [
  { name: "Item", type: "text", description: "The item's stable key — its URL when available (upsert identity across sittings).", primary: true },
  { name: "Label", type: "text", description: "Human label — title/company as shown at the source." },
  { name: "URL", type: "url", description: "The item's own page." },
  {
    name: "Key tier",
    type: "select",
    description: "Identity strength: url survives reshuffles; label is weak; row = a database row id.",
    config: {
      options: [
        { id: "opt-url", label: "url", color: "green" },
        { id: "opt-label", label: "label", color: "amber" },
        { id: "opt-row", label: "row", color: "blue" },
      ],
    },
  },
  {
    name: "Status",
    type: "select",
    description: "This item's latest outcome — done means analyzed, whatever the verdict.",
    config: {
      options: [
        { id: "opt-pending", label: "pending", color: "gray" },
        { id: "opt-done", label: "done", color: "green" },
        { id: "opt-unreadable", label: "unreadable", color: "amber" },
        { id: "opt-blocked", label: "blocked", color: "red" },
        { id: "opt-capture-failed", label: "capture-failed", color: "red" },
      ],
    },
  },
  { name: "Pass", type: "number", description: "Refinement pass count — how many sittings have touched this item." },
  { name: "Fit", type: "number", description: "Score when the objective scores items (0–100)." },
  { name: "Qualified", type: "checkbox", description: "Met the objective's bar." },
  { name: "Verdict", type: "longText", description: "Latest one-to-three sentence rationale." },
  { name: "Output row", type: "text", description: "DataRow id of the captured row in the output table, when admitted." },
  { name: "Sitting", type: "text", description: "Sitting id of the latest touch — the per-run enforcement stamp." },
];

// ── Shapes ────────────────────────────────────────────────────────────────

/** Column name → storage key maps, stamped into run metadata so per-item
 *  writes never reload the table. */
export interface QuestInfo {
  sittingId: string;
  masterId: string;
  questRowId: string;
  questLedgerId: string;
  questLabel: string;
  itemBudget: number;
  batchSize: number | null;
  sittingClosed?: boolean;
  masterCols: Record<string, string>;
  ledgerCols: Record<string, string>;
}

export function parseQuestInfo(value: unknown): QuestInfo | null {
  if (!value || typeof value !== "object") return null;
  const q = value as Record<string, unknown>;
  if (
    typeof q.sittingId !== "string" ||
    typeof q.questLedgerId !== "string" ||
    typeof q.questRowId !== "string" ||
    !q.ledgerCols ||
    typeof q.ledgerCols !== "object"
  ) {
    return null;
  }
  return value as unknown as QuestInfo;
}

/** Column name → key map for a table (exported for questInfo stamping). */
export async function tableColumnKeys(
  tableId: string,
): Promise<Record<string, string>> {
  return columnKeysByName(tableId);
}

async function columnKeysByName(tableId: string): Promise<Record<string, string>> {
  const cols = await prisma.dataColumn.findMany({
    where: { tableId, deletedAt: null },
    select: { key: true, name: true },
  });
  return Object.fromEntries(cols.map((c) => [c.name, c.key]));
}

async function liveColumns(tableId: string): Promise<DataColumn[]> {
  const cols = await prisma.dataColumn.findMany({
    where: { tableId, deletedAt: null },
    select: {
      id: true,
      tableId: true,
      key: true,
      name: true,
      type: true,
      position: true,
      isPrimary: true,
      config: true,
      description: true,
    },
  });
  // Prisma types config as JsonValue; these are system tables whose configs
  // this module itself authored — the shape is by construction.
  return cols.map((c) => ({
    ...c,
    config: (c.config ?? {}) as DataColumn["config"],
    deletedAt: null,
  })) as unknown as DataColumn[];
}

/** Create a system data node (mode inline, no seed rows) with an icon. */
async function createSystemTable(input: {
  userId: string;
  title: string;
  parentId: string | null;
  ownedByNoteId?: string;
  icon: string;
  columns: Array<{
    name: string;
    type: string;
    description: string;
    config?: Record<string, unknown>;
    primary?: boolean;
  }>;
}): Promise<string> {
  const slug = await generateUniqueSlug(input.title, input.userId);
  const node = await prisma.contentNode.create({
    data: {
      ownerId: input.userId,
      title: input.title,
      slug,
      contentType: "data",
      parentId: input.parentId,
      displayOrder: 0,
      customIcon: input.icon,
      ...(input.ownedByNoteId
        ? { role: "referenced" as const, ownedByNoteId: input.ownedByNoteId }
        : {}),
      dataPayload: {
        create: {
          mode: "inline",
          source: {} as unknown as Prisma.InputJsonValue,
          searchText: input.title.toLowerCase(),
        },
      },
    },
    select: { id: true },
  });
  // Primary column first (createColumn appends positions in call order and
  // never sets isPrimary, so flip it after creation).
  for (const col of input.columns) {
    await createColumn(node.id, {
      name: col.name,
      type: col.type as Parameters<typeof createColumn>[1]["type"],
      description: col.description,
      config: col.config as Parameters<typeof createColumn>[1]["config"],
    });
  }
  const primaryName = input.columns.find((c) => c.primary)?.name;
  if (primaryName) {
    await prisma.dataColumn.updateMany({
      where: { tableId: node.id, name: primaryName },
      data: { isPrimary: true },
    });
  }
  return node.id;
}

// ── Master ledger (D10 find-or-create) ────────────────────────────────────

export async function ensureMasterLedger(
  userId: string,
  charter: { contentId: string; title: string },
): Promise<{
  masterId: string;
  masterCols: Record<string, string>;
  /** The charter's folder — quest artifacts nest here so the charter
   *  neighborhood is their one findable home (owner: no root scatter). */
  charterParentId: string | null;
} | null> {
  const note = await prisma.contentNode.findFirst({
    where: { id: charter.contentId, ownerId: userId, deletedAt: null },
    select: { id: true, parentId: true, notePayload: { select: { metadata: true } } },
  });
  if (!note) return null;
  const meta =
    note.notePayload?.metadata && typeof note.notePayload.metadata === "object"
      ? (note.notePayload.metadata as Record<string, unknown>)
      : {};

  const stamped = meta[MASTER_LEDGER_META_KEY];
  if (typeof stamped === "string") {
    const alive = await prisma.contentNode.findFirst({
      where: { id: stamped, ownerId: userId, contentType: "data", deletedAt: null },
      select: { id: true },
    });
    if (alive) {
      return {
        masterId: alive.id,
        masterCols: await columnKeysByName(alive.id),
        charterParentId: note.parentId,
      };
    }
    // Stamp points at a deleted node — self-heal by re-creating below.
  }

  const masterId = await createSystemTable({
    userId,
    title: `${charter.title} — Master Ledger`,
    parentId: note.parentId,
    ownedByNoteId: charter.contentId,
    icon: "lucide:LibraryBig",
    columns: MASTER_COLUMNS,
  });
  await prisma.notePayload.update({
    where: { contentId: charter.contentId },
    data: {
      metadata: {
        ...meta,
        [MASTER_LEDGER_META_KEY]: masterId,
      } as unknown as Prisma.InputJsonValue,
    },
  });
  logger.info({
    layer: "ai",
    event: "quests:master_created",
    summary: `master ledger created for charter ${charter.title}`,
    attrs: { masterId, charterId: charter.contentId },
  });
  return {
    masterId,
    masterCols: await columnKeysByName(masterId),
    charterParentId: note.parentId,
  };
}

// ── Continue-or-create a quest (D9) ───────────────────────────────────────

export async function ensureQuest(input: {
  userId: string;
  charterTitle: string;
  masterId: string;
  masterCols: Record<string, string>;
  questLabel: string;
  objective: string;
  targetFolderId: string | null;
  outputTableId?: string;
  questLogId?: string;
  /**
   * AI-sculpted ledger columns (§3.6): shaped per matter at CREATION only —
   * a scoring task adds its criteria, a collection task adds none. Merged
   * after the machinery core; names colliding with core columns are
   * dropped. Ignored when continuing an existing quest.
   */
  extraColumns?: Array<{ name: string; type: string; description: string }>;
}): Promise<{
  questRowId: string;
  questLedgerId: string;
  continued: boolean;
} | null> {
  const { userId, masterId, masterCols } = input;
  const label = input.questLabel.trim().slice(0, 120);
  const questKey = masterCols["Quest"];
  const ledgerLinkKey = masterCols["Quest ledger"];
  if (!questKey || !ledgerLinkKey) return null;

  // Continue: case-insensitive label match over the master's rows (a master
  // holds dozens of quests at most — a scan is the simple, correct lookup).
  const rows = await prisma.dataRow.findMany({
    where: { tableId: masterId, deletedAt: null },
    select: { id: true, data: true },
  });
  const existing = rows.find((r) => {
    const v = ((r.data ?? {}) as Record<string, unknown>)[questKey];
    return typeof v === "string" && v.trim().toLowerCase() === label.toLowerCase();
  });
  if (existing) {
    const links = ((existing.data ?? {}) as Record<string, unknown>)[
      ledgerLinkKey
    ];
    const ledgerId = Array.isArray(links) && typeof links[0] === "string" ? links[0] : null;
    if (!ledgerId) return null;
    // Sitting stamp: count + date + status active.
    const d = (existing.data ?? {}) as Record<string, unknown>;
    const sittings =
      typeof d[masterCols["Sittings"]] === "number"
        ? (d[masterCols["Sittings"]] as number)
        : 0;
    const writes: CellWrite[] = [
      { rowId: existing.id, columnKey: masterCols["Sittings"], value: sittings + 1 },
      { rowId: existing.id, columnKey: masterCols["Last sitting"], value: new Date().toISOString().slice(0, 10) },
      { rowId: existing.id, columnKey: masterCols["Status"], value: "opt-active" },
      ...(input.questLogId
        ? [{ rowId: existing.id, columnKey: masterCols["Quest log"], value: [input.questLogId] }]
        : []),
      ...(input.outputTableId
        ? [{ rowId: existing.id, columnKey: masterCols["Output table"], value: [input.outputTableId] }]
        : []),
    ] as CellWrite[];
    await writeCells(masterId, await liveColumns(masterId), writes);
    return { questRowId: existing.id, questLedgerId: ledgerId, continued: true };
  }

  // Create: quest ledger (machinery core + sculpted columns, D6 Map icon)
  // + master row.
  const coreNames = new Set(
    QUEST_LEDGER_COLUMNS.map((c) => c.name.toLowerCase()),
  );
  const sculpted = (input.extraColumns ?? [])
    .filter((c) => c.name.trim() && !coreNames.has(c.name.trim().toLowerCase()))
    .slice(0, 8)
    .map((c) => ({
      name: c.name.trim().slice(0, 60),
      type: c.type,
      description: c.description.trim().slice(0, 300),
    }));
  const questLedgerId = await createSystemTable({
    userId,
    title: `${label} — Quest Ledger`,
    parentId: input.targetFolderId,
    icon: "lucide:Map",
    columns: [...QUEST_LEDGER_COLUMNS, ...sculpted],
  });
  const today = new Date().toISOString().slice(0, 10);
  const [questRowId] = await createRows(masterId, await liveColumns(masterId), 1, userId);
  const writes: CellWrite[] = [
    { rowId: questRowId, columnKey: questKey, value: label },
    { rowId: questRowId, columnKey: masterCols["Objective"], value: input.objective.slice(0, 2000) },
    { rowId: questRowId, columnKey: masterCols["Status"], value: "opt-active" },
    { rowId: questRowId, columnKey: masterCols["Started"], value: today },
    { rowId: questRowId, columnKey: masterCols["Last sitting"], value: today },
    { rowId: questRowId, columnKey: masterCols["Sittings"], value: 1 },
    { rowId: questRowId, columnKey: ledgerLinkKey, value: [questLedgerId] },
    ...(input.outputTableId
      ? [{ rowId: questRowId, columnKey: masterCols["Output table"], value: [input.outputTableId] }]
      : []),
    ...(input.questLogId
      ? [{ rowId: questRowId, columnKey: masterCols["Quest log"], value: [input.questLogId] }]
      : []),
  ] as CellWrite[];
  await writeCells(masterId, await liveColumns(masterId), writes);
  logger.info({
    layer: "ai",
    event: "quests:created",
    summary: `quest "${label}" created (ledger + master row)`,
    attrs: { masterId, questRowId, questLedgerId },
  });
  return { questRowId, questLedgerId, continued: false };
}

// ── Per-item dual-write (upsert by item key; continuous across sittings) ──

export async function recordQuestItem(input: {
  userId: string;
  quest: QuestInfo;
  item: {
    key: string;
    label?: string;
    url?: string;
    keyTier?: "url" | "label" | "row";
    status: "done" | "unreadable" | "blocked" | "capture-failed";
    fit?: number;
    qualified?: boolean;
    verdict?: string;
    outputRowId?: string;
    /**
     * Values for SCULPTED ledger columns (name → value) — resolved through
     * the quest's column map; unknown names are skipped, and the cell
     * encoder inside writeCells still validates every value.
     */
    extraCells?: Record<string, unknown>;
  };
}): Promise<{ rowId: string; updated: boolean } | null> {
  const { quest, item } = input;
  const cols = quest.ledgerCols;
  const itemKeyCol = cols["Item"];
  if (!itemKeyCol) return null;

  const existing = await prisma.dataRow.findFirst({
    where: {
      tableId: quest.questLedgerId,
      deletedAt: null,
      data: { path: [itemKeyCol], equals: item.key },
    },
    select: { id: true, data: true },
  });
  const priorPass = existing
    ? Number(((existing.data ?? {}) as Record<string, unknown>)[cols["Pass"]]) || 0
    : 0;
  const rowId =
    existing?.id ??
    (await createRows(quest.questLedgerId, await liveColumns(quest.questLedgerId), 1, input.userId))[0];

  const statusOption = `opt-${item.status}`;
  const tierOption = item.keyTier ? `opt-${item.keyTier}` : undefined;
  const writes: CellWrite[] = [
    { rowId, columnKey: itemKeyCol, value: item.key },
    ...(item.label ? [{ rowId, columnKey: cols["Label"], value: item.label.slice(0, 255) }] : []),
    ...(item.url ? [{ rowId, columnKey: cols["URL"], value: item.url }] : []),
    ...(tierOption ? [{ rowId, columnKey: cols["Key tier"], value: tierOption }] : []),
    { rowId, columnKey: cols["Status"], value: statusOption },
    { rowId, columnKey: cols["Pass"], value: priorPass + 1 },
    ...(typeof item.fit === "number" ? [{ rowId, columnKey: cols["Fit"], value: Math.round(item.fit) }] : []),
    ...(typeof item.qualified === "boolean" ? [{ rowId, columnKey: cols["Qualified"], value: item.qualified }] : []),
    ...(item.verdict ? [{ rowId, columnKey: cols["Verdict"], value: item.verdict.slice(0, 2000) }] : []),
    ...(item.outputRowId ? [{ rowId, columnKey: cols["Output row"], value: item.outputRowId }] : []),
    { rowId, columnKey: cols["Sitting"], value: quest.sittingId },
    ...(item.extraCells
      ? Object.entries(item.extraCells).flatMap(([name, value]) => {
          const key = cols[name];
          return key ? [{ rowId, columnKey: key, value }] : [];
        })
      : []),
  ] as CellWrite[];
  const result = await writeCells(
    quest.questLedgerId,
    await liveColumns(quest.questLedgerId),
    writes,
  );
  if (!result.ok) return null;
  return { rowId, updated: !!existing };
}

/** Item keys this quest has already scored (REJECTS INCLUDED) — the
 *  plan-time dedup memory that the output table alone cannot provide. */
export async function questSeenKeys(
  userId: string,
  quest: Pick<QuestInfo, "questLedgerId" | "ledgerCols">,
): Promise<Set<string>> {
  const itemKeyCol = quest.ledgerCols["Item"];
  const statusCol = quest.ledgerCols["Status"];
  const seen = new Set<string>();
  if (!itemKeyCol) return seen;
  const rows = await prisma.dataRow.findMany({
    where: { tableId: quest.questLedgerId, deletedAt: null },
    select: { data: true },
  });
  for (const r of rows) {
    const d = (r.data ?? {}) as Record<string, unknown>;
    const key = d[itemKeyCol];
    const status = statusCol ? d[statusCol] : undefined;
    if (typeof key === "string" && key && status !== "opt-pending") {
      seen.add(key.trim().toLowerCase());
    }
  }
  return seen;
}

/** Count of rows this SITTING has touched — P4b's row-derived enforcement. */
export async function sittingRecordedCount(
  quest: Pick<QuestInfo, "questLedgerId" | "ledgerCols" | "sittingId">,
): Promise<number> {
  const sittingCol = quest.ledgerCols["Sitting"];
  if (!sittingCol) return 0;
  return prisma.dataRow.count({
    where: {
      tableId: quest.questLedgerId,
      deletedAt: null,
      data: { path: [sittingCol], equals: quest.sittingId },
    },
  });
}

/** Link the quest-log note onto the master row (called once the ledger
 *  note exists — the note is created after the quest in the propose flow). */
export async function setQuestLog(input: {
  masterId: string;
  questRowId: string;
  masterCols: Record<string, string>;
  questLogId: string;
}): Promise<void> {
  const col = input.masterCols["Quest log"];
  if (!col) return;
  await writeCells(input.masterId, await liveColumns(input.masterId), [
    { rowId: input.questRowId, columnKey: col, value: [input.questLogId] },
  ] as CellWrite[]);
}

// ── Sitting close (cumulative master facts) ───────────────────────────────

export async function closeSitting(input: {
  userId: string;
  quest: QuestInfo;
  totals: { items: number; qualified?: number; tokens?: number; costUsd?: number };
}): Promise<void> {
  const { quest, totals } = input;
  const row = await prisma.dataRow.findFirst({
    where: { id: quest.questRowId, tableId: quest.masterId, deletedAt: null },
    select: { id: true, data: true },
  });
  if (!row) return;
  const d = (row.data ?? {}) as Record<string, unknown>;
  const cols = quest.masterCols;
  const num = (key: string) => (typeof d[key] === "number" ? (d[key] as number) : 0);
  const writes: CellWrite[] = [
    { rowId: row.id, columnKey: cols["Items"], value: num(cols["Items"]) + totals.items },
    ...(typeof totals.qualified === "number"
      ? [{ rowId: row.id, columnKey: cols["Qualified"], value: num(cols["Qualified"]) + totals.qualified }]
      : []),
    ...(typeof totals.tokens === "number"
      ? [{ rowId: row.id, columnKey: cols["Tokens"], value: num(cols["Tokens"]) + totals.tokens }]
      : []),
    ...(typeof totals.costUsd === "number"
      ? [
          {
            rowId: row.id,
            columnKey: cols["Est. cost"],
            value: Math.round((num(cols["Est. cost"]) + totals.costUsd) * 1000) / 1000,
          },
        ]
      : []),
  ] as CellWrite[];
  await writeCells(quest.masterId, await liveColumns(quest.masterId), writes);
}
