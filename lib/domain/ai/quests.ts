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
  createRelationPair,
  createRows,
  writeCells,
  type CellWrite,
} from "@/lib/domain/data/server/mutations";
import { keyAtEnd } from "@/lib/domain/data/ordering";
import { generateUniqueSlug } from "@/lib/domain/content";
import type { DataColumn } from "@/lib/domain/data";

/**
 * v2 (2026-09-11): row-level attachment. Every quest ledger carries a system
 * "Quest" relation to its master row, and ONE relation per output table it
 * captures into ("Output row · <table>") — a relation targets a single
 * table, so several output tables mean several columns. Links live in
 * DataRowLink and survive any cell edit. v1 ledgers upgrade in place on
 * their next sitting (ensureQuestRelation / ensureOutputRelation are
 * find-or-create).
 */
export const QUEST_SCHEMA_VERSION = 2;
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
  { name: "Qualified", type: "number", description: "Unique items currently qualified — derived from the quest ledger's rows at each sitting close, never model-asserted." },
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
  /** v2: the ledger's "Quest" relation column id (ledger row → master row). */
  questRelationColumnId?: string;
  /** v2: output-table id → the ledger's relation column id into that table. */
  outputRelations?: Record<string, string>;
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

/** Stamp DataColumnConfig.system onto an existing column (relation pairs
 *  are minted by createRelationPair, which owns their config). */
async function markColumnSystem(columnId: string): Promise<void> {
  const col = await prisma.dataColumn.findUnique({
    where: { id: columnId },
    select: { config: true },
  });
  const config = (
    col?.config && typeof col.config === "object" ? col.config : {}
  ) as Record<string, unknown>;
  await prisma.dataColumn.update({
    where: { id: columnId },
    data: { config: { ...config, system: true } as unknown as Prisma.InputJsonValue },
  });
}

/** The ledger's live FORWARD relation columns, keyed by target table id. */
async function ledgerRelations(
  questLedgerId: string,
): Promise<Record<string, string>> {
  const cols = await prisma.dataColumn.findMany({
    where: { tableId: questLedgerId, type: "relation", deletedAt: null },
    select: { id: true, config: true },
    orderBy: { createdAt: "asc" },
  });
  const out: Record<string, string> = {};
  for (const c of cols) {
    const cfg = (c.config ?? {}) as { relationTableId?: unknown; isBacklink?: unknown };
    if (
      typeof cfg.relationTableId === "string" &&
      cfg.isBacklink !== true &&
      !(cfg.relationTableId in out)
    ) {
      out[cfg.relationTableId] = c.id;
    }
  }
  return out;
}

/**
 * Ledger → master-row relation ("Quest"), find-or-create — the v2 upgrade
 * path for v1 ledgers. Its backlink on the master ("Ledger rows") lists
 * every item of the quest. Both are system columns.
 */
export async function ensureQuestRelation(
  questLedgerId: string,
  masterId: string,
): Promise<string> {
  const existing = (await ledgerRelations(questLedgerId))[masterId];
  if (existing) return existing;
  const pair = await createRelationPair(
    questLedgerId,
    masterId,
    {
      name: "Quest",
      description:
        "The quest this item belongs to — its row in the master ledger. Linked by the machinery on every recorded item.",
    },
    "Ledger rows",
  );
  await markColumnSystem(pair.forwardId);
  await markColumnSystem(pair.backlinkId);
  return pair.forwardId;
}

/**
 * Ledger → output-table-row relation, ONE PER OUTPUT TABLE (a relation
 * targets a single table, so a quest capturing into several tables gets
 * several columns), minted when a sitting first captures into that table.
 * The forward column is system; the backlink lands on the USER's output
 * table under the quest's name and is deliberately not locked — that table
 * is theirs.
 */
export async function ensureOutputRelation(
  questLedgerId: string,
  outputTableId: string,
  questLabel: string,
): Promise<string> {
  const existing = (await ledgerRelations(questLedgerId))[outputTableId];
  if (existing) return existing;
  const target = await prisma.contentNode.findFirst({
    where: { id: outputTableId, deletedAt: null },
    select: { title: true },
  });
  const title = target?.title ?? "Output";
  const pair = await createRelationPair(
    questLedgerId,
    outputTableId,
    {
      name: `Output row · ${title}`.slice(0, 255),
      description: `The captured row in "${title}" for this item, when admitted. Linked by the machinery.`.slice(0, 280),
    },
    `Quest · ${questLabel}`.slice(0, 255),
  );
  await markColumnSystem(pair.forwardId);
  return pair.forwardId;
}

/** Every output relation on a ledger (output-table id → column id) —
 *  recomputed each sitting so tables from earlier sittings stay linkable. */
export async function ledgerOutputRelations(
  questLedgerId: string,
  masterId: string,
): Promise<Record<string, string>> {
  const all = await ledgerRelations(questLedgerId);
  delete all[masterId];
  return all;
}

/** Idempotent row link — the same upsert as POST /data/[id]/links. */
async function linkRows(
  columnId: string,
  fromRowId: string,
  toRowId: string,
): Promise<void> {
  const last = await prisma.dataRowLink.findFirst({
    where: { columnId, fromRowId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  await prisma.dataRowLink.upsert({
    where: { columnId_fromRowId_toRowId: { columnId, fromRowId, toRowId } },
    create: { columnId, fromRowId, toRowId, position: keyAtEnd(last?.position ?? null) },
    update: {},
    select: { id: true },
  });
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
    /**
     * Machinery core column: stamped DataColumnConfig.system so the grid,
     * the column routes and the AI tools refuse to rename / retype / re-
     * option / delete it — this module reads it BY NAME and writes the
     * option ids minted here. Sculpted (AI-shaped, per-matter) columns are
     * NOT system: the user owns those.
     */
    system?: boolean;
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
      config: (col.system
        ? { ...(col.config ?? {}), system: true }
        : col.config) as Parameters<typeof createColumn>[1]["config"],
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
  /** Where quest artifacts (ledgers, logs) home: the charter itself when it
   *  is a folder, else its containing folder — one findable cluster, never
   *  root scatter (owner policy 2026-09-02; folder rule 2026-09-11). */
  questHomeFolderId: string | null;
  /** True when THIS call minted the master (mark-time creation reports it). */
  created: boolean;
} | null> {
  const note = await prisma.contentNode.findFirst({
    where: { id: charter.contentId, ownerId: userId, deletedAt: null },
    select: {
      id: true,
      parentId: true,
      contentType: true,
      notePayload: { select: { metadata: true } },
    },
  });
  if (!note) return null;
  // A FOLDER charter (its body lives in the folder "Notes" editor) IS the
  // charter's folder. Storing beside it left "Career Hunt I" empty while its
  // ledgers sat in the parent (prod, 2026-09-11). A note charter homes in
  // its containing folder. Either way the master is ALSO referenced to the
  // charter (ownedByNoteId), so the charter's reference chip shows it.
  const questHomeFolderId =
    note.contentType === "folder" ? note.id : note.parentId;
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
        questHomeFolderId,
        created: false,
      };
    }
    // Stamp points at a deleted node — self-heal by re-creating below.
  }

  const masterId = await createSystemTable({
    userId,
    title: `${charter.title} — Master Ledger`,
    parentId: questHomeFolderId,
    ownedByNoteId: charter.contentId,
    icon: "lucide:LibraryBig",
    columns: MASTER_COLUMNS.map((c) => ({ ...c, system: true })),
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
    questHomeFolderId,
    created: true,
  };
}

// ── Continue-or-create a quest (D9) ───────────────────────────────────────

export async function ensureQuest(input: {
  userId: string;
  charterTitle: string;
  /** The charter this quest belongs to — its ledger is referenced to it. */
  charterId: string;
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
   * dropped. Ignored when continuing a quest that already has a ledger.
   */
  extraColumns?: Array<{ name: string; type: string; description: string }>;
}): Promise<{
  questRowId: string;
  questLedgerId: string;
  /** v2: the ledger's "Quest" relation column (ledger row → master row). */
  questRelationColumnId: string;
  continued: boolean;
} | null> {
  const { userId, masterId, masterCols } = input;
  const label = input.questLabel.trim().slice(0, 120);
  const questKey = masterCols["Quest"];
  const ledgerLinkKey = masterCols["Quest ledger"];
  if (!questKey || !ledgerLinkKey) return null;

  // Quest-ledger schema: machinery core (SYSTEM columns) + sculpted extras.
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
  const mintQuestLedger = () =>
    createSystemTable({
      userId,
      title: `${label} — Quest Ledger`,
      parentId: input.targetFolderId,
      // Referenced to the charter like the master, so the charter's
      // reference chip is the one place every quest artifact is found.
      ownedByNoteId: input.charterId,
      icon: "lucide:Map",
      columns: [
        ...QUEST_LEDGER_COLUMNS.map((c) => ({ ...c, system: true })),
        ...sculpted,
      ],
    });
  const today = new Date().toISOString().slice(0, 10);

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
    const d = (existing.data ?? {}) as Record<string, unknown>;
    const links = d[ledgerLinkKey];
    let ledgerId =
      Array.isArray(links) && typeof links[0] === "string" ? links[0] : null;
    if (ledgerId) {
      const alive = await prisma.contentNode.findFirst({
        where: { id: ledgerId, ownerId: userId, contentType: "data", deletedAt: null },
        select: { id: true },
      });
      if (!alive) ledgerId = null;
    }
    // A quest row with no live ledger is the user's own declaration of a
    // quest — typed into the master grid or inserted by the AI (the master
    // is visible from mark time now) — or a row whose ledger was trashed.
    // This used to return null, and the run silently fell back to the
    // markdown-only path. Mint the ledger and complete the row instead.
    const healed = !ledgerId;
    let relinked = false;
    if (!ledgerId) {
      // RE-LINK before re-minting: cells are the user's to edit (owner,
      // 2026-09-11), so a cleared link cell must not cost a duplicate
      // ledger. The ledger is found the way the tree finds it — referenced
      // to this charter, under the quest's name.
      const orphan = await prisma.contentNode.findFirst({
        where: {
          ownerId: userId,
          ownedByNoteId: input.charterId,
          contentType: "data",
          deletedAt: null,
          title: `${label} — Quest Ledger`,
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      relinked = !!orphan;
      ledgerId = orphan?.id ?? (await mintQuestLedger());
    }
    // Output tables ACCUMULATE (owner question, 2026-09-11: "what if there
    // are multiple output tables?"): the contentLink cell is an array, so a
    // sitting that captures into a new table appends it; nothing is dropped.
    const priorOutputs = Array.isArray(d[masterCols["Output table"]])
      ? (d[masterCols["Output table"]] as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : [];
    const outputs =
      input.outputTableId && !priorOutputs.includes(input.outputTableId)
        ? [...priorOutputs, input.outputTableId]
        : null;
    const sittings =
      typeof d[masterCols["Sittings"]] === "number"
        ? (d[masterCols["Sittings"]] as number)
        : 0;
    const objectiveBlank =
      typeof d[masterCols["Objective"]] !== "string" ||
      !(d[masterCols["Objective"]] as string).trim();
    const writes: CellWrite[] = [
      { rowId: existing.id, columnKey: masterCols["Sittings"], value: sittings + 1 },
      { rowId: existing.id, columnKey: masterCols["Last sitting"], value: today },
      { rowId: existing.id, columnKey: masterCols["Status"], value: "opt-active" },
      ...(healed
        ? [
            { rowId: existing.id, columnKey: ledgerLinkKey, value: [ledgerId] },
            ...(typeof d[masterCols["Started"]] === "string"
              ? []
              : [{ rowId: existing.id, columnKey: masterCols["Started"], value: today }]),
            ...(objectiveBlank
              ? [{ rowId: existing.id, columnKey: masterCols["Objective"], value: input.objective.slice(0, 2000) }]
              : []),
          ]
        : []),
      ...(input.questLogId
        ? [{ rowId: existing.id, columnKey: masterCols["Quest log"], value: [input.questLogId] }]
        : []),
      ...(outputs
        ? [{ rowId: existing.id, columnKey: masterCols["Output table"], value: outputs }]
        : []),
    ] as CellWrite[];
    const stamped = await writeCells(masterId, await liveColumns(masterId), writes);
    if (!stamped.ok) {
      // A refused stamp means the master no longer matches this module (a
      // column the machinery needs is gone or retyped). Say so loudly rather
      // than run a sitting the master will never record.
      logger.warn({
        layer: "ai",
        event: "quests:master_stamp_refused",
        summary: `master ledger refused the sitting stamp for quest "${label}"`,
        attrs: {
          masterId,
          questRowId: existing.id,
          refused: JSON.stringify(stamped.results).slice(0, 2000),
        },
      });
      return null;
    }
    if (healed) {
      logger.info({
        layer: "ai",
        event: "quests:ledger_healed",
        summary: relinked
          ? `quest "${label}" had a cleared ledger link — re-linked its ledger`
          : `quest "${label}" had no live ledger — minted and linked`,
        attrs: { masterId, questRowId: existing.id, questLedgerId: ledgerId, relinked },
      });
    }
    // v2 upgrade path: a v1 ledger gains its "Quest" relation here.
    const questRelationColumnId = await ensureQuestRelation(ledgerId, masterId);
    return {
      questRowId: existing.id,
      questLedgerId: ledgerId,
      questRelationColumnId,
      continued: true,
    };
  }

  // Create: quest ledger (+ its "Quest" relation to the master) + master row.
  const questLedgerId = await mintQuestLedger();
  const questRelationColumnId = await ensureQuestRelation(questLedgerId, masterId);
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
  const written = await writeCells(masterId, await liveColumns(masterId), writes);
  if (!written.ok) {
    logger.warn({
      layer: "ai",
      event: "quests:master_row_refused",
      summary: `master ledger refused the new quest row for "${label}"`,
      attrs: {
        masterId,
        questRowId,
        questLedgerId,
        refused: JSON.stringify(written.results).slice(0, 2000),
      },
    });
    return null;
  }
  logger.info({
    layer: "ai",
    event: "quests:created",
    summary: `quest "${label}" created (ledger + master row)`,
    attrs: { masterId, questRowId, questLedgerId },
  });
  return { questRowId, questLedgerId, questRelationColumnId, continued: false };
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
    /** The output table that row lives in — selects the v2 relation column. */
    outputTableId?: string;
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
  // Row-level attachment (v2): the item links to its quest row, and an
  // admitted item links to its captured row in THAT output table. Links are
  // additive and survive cell edits; a link failure never unwrites the row.
  try {
    if (quest.questRelationColumnId) {
      await linkRows(quest.questRelationColumnId, rowId, quest.questRowId);
    }
    const outCol =
      item.outputRowId && item.outputTableId
        ? quest.outputRelations?.[item.outputTableId]
        : undefined;
    if (outCol && item.outputRowId) {
      await linkRows(outCol, rowId, item.outputRowId);
    }
  } catch (error) {
    logger.warn({
      layer: "ai",
      event: "quests:link_failed",
      summary: "quest item row written, but its relation link failed",
      error,
      attrs: { questLedgerId: quest.questLedgerId, rowId },
    });
  }
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
  // Qualified is DERIVED from ledger rows, never model-asserted arithmetic
  // (checkable-reconciliation doctrine, §3.6): the count of unique items
  // currently marked qualified in the quest ledger. A model-passed total
  // was both trust-the-narrator and double-counting under refresh sittings
  // (owner smoke: 10 "qualified" for 4 unique items).
  const qualifiedKey = quest.ledgerCols["Qualified"];
  const derivedQualified = qualifiedKey
    ? await prisma.dataRow.count({
        where: {
          tableId: quest.questLedgerId,
          deletedAt: null,
          data: { path: [qualifiedKey], equals: true },
        },
      })
    : null;
  const writes: CellWrite[] = [
    { rowId: row.id, columnKey: cols["Items"], value: num(cols["Items"]) + totals.items },
    ...(derivedQualified !== null
      ? [{ rowId: row.id, columnKey: cols["Qualified"], value: derivedQualified }]
      : typeof totals.qualified === "number"
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
