/**
 * propose_item_iteration's input contract — PURE (zod only, no Prisma, no
 * React), so the registry and `pnpm proposal:shape:check` read the same
 * schema. The registry's import graph is not tsx-loadable, which is why the
 * contract lives here rather than beside its execute.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RULE — run-loop tool schemas DESCRIBE SHAPE; EXECUTE JUDGES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The AI SDK validates a tool's Zod schema BEFORE `execute` runs. A miss at
 * that layer is fatal to the whole call and comes back as a raw Zod issue
 * list echoing the entire input — it never reaches the code that could have
 * understood it. So for the run-loop tools (propose_item_iteration,
 * record_item_result, record_batch_checkpoint, record_iteration_findings,
 * add_quest_ledger_column) the schema carries:
 *
 *   ✓ field names, primitive types, `.optional()`, `.describe()`, unions of
 *     shapes the model has actually sent
 *   ✗ `.enum()`, `.min()`, `.max()`, `.int()`, `.regex()`, `.refine()`,
 *     required keys inside a nested object
 *
 * Vocabularies are resolved in execute (with aliases, then a refusal that
 * names the accepted words); bounds are clamped or clipped in execute; a
 * nested object is normalized in execute from whatever the model sent.
 * When execute genuinely cannot proceed it returns a RESULT — `ok: false`
 * with `refusal` (what was received, what is accepted) and `nextAction` —
 * which the model reads and fixes in ONE step.
 *
 * Why this is a rule and not a preference (prod conversation fa475acc,
 * 2026-09-21): four consecutive propose_item_iteration calls died at the
 * schema — `captureTo` as a string, then `databaseId` instead of `database`,
 * then `columns: []`, then 21 columns against a `.max(20)` — four steps of
 * an 8-step turn, and both turns ended "out of tool steps, nothing recorded".
 * Every one of those payloads named the right database, the right items and
 * the right columns. Drift gate 7 (`scripts/validate-ai-drift.ts`) fails the
 * build if a refinement creeps back into any run-loop schema; this file's
 * fixtures (`scripts/validate-iteration-proposal.ts`) prove those four
 * payloads now reach execute.
 *
 * Companion principles live in docs/notes-feature/core/AI-ARCHITECTURE.md §5
 * ("Tool input contracts").
 */

import { z } from "zod/v4";

// ── Vocabularies (resolved in execute, never enforced by the schema) ────────

export const QUEST_COLUMN_TYPES = [
  "text",
  "longText",
  "number",
  "url",
  "date",
  "checkbox",
] as const;
export type QuestColumnType = (typeof QUEST_COLUMN_TYPES)[number];

export const ITERATION_ADMISSIONS = ["all", "qualified", "custom"] as const;
export type IterationAdmission = (typeof ITERATION_ADMISSIONS)[number];

/** Bounds the execute clamps to. Kept here so the check script sees them. */
export const PROPOSAL_BOUNDS = {
  itemCap: { min: 1, max: 200 },
  batchSize: { min: 2, max: 50 },
  items: 250,
  rowIds: 200,
  labelChars: 200,
  urlChars: 600,
  questColumns: 8,
  stepsPerItem: { min: 2, max: 20 },
} as const;

// ── Deliverables and the step budget (AI-CONTEXT-ECONOMICS-PLAN §6b) ────────

/**
 * The write tools a run may declare as each item's DELIVERABLES — the tail
 * of tool calls every item must end with, after research. Prod 5e5b739d
 * (2026-09-22): a one-item fulfilment charter (research → resume →
 * create_docx → update_row → record → close) ran under the screening budget
 * `items × 4 + 8` = 12 steps and spent all twelve on reads; nothing had
 * reserved the five write steps its charter required, and the model was
 * never told how many steps remained. Declaring the tail makes the cap fit
 * the work and lets the harness hold the last steps for it.
 */
export const DELIVERABLE_TOOLS = [
  "create_docx",
  "create_note",
  "update_note",
  "append_to_document",
  "update_row",
  "update_rows",
  "insert_rows",
  "create_folder",
] as const;
export type DeliverableTool = (typeof DELIVERABLE_TOOLS)[number];

/** Steps of research the budget allows per item before its deliverables. */
export const RESEARCH_ALLOWANCE_PER_ITEM = 3;
/** Setup + close: summon, enumerate, propose, findings, final reply. */
export const RUN_OVERHEAD_STEPS = 8;
/** Tools always in the reserved tail (per item, then the run's close). */
export const TAIL_ALWAYS = ["record_item_result", "record_iteration_findings", "summon"] as const;

const DELIVERABLE_ALIASES: Record<string, DeliverableTool> = {
  docx: "create_docx",
  document: "create_docx",
  resume: "create_docx",
  word: "create_docx",
  note: "create_note",
  "roll-up": "create_note",
  rollup: "create_note",
  append: "append_to_document",
  row: "update_row",
  "update-row": "update_row",
  rows: "update_rows",
  insert: "insert_rows",
  folder: "create_folder",
};

/** Deliverable names as the model may write them → known write tools. Unknown names are reported, never fatal. */
export function resolveDeliverables(
  raw: string[] | string | undefined,
): { deliverables: DeliverableTool[]; unknown: string[] } {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,\n;]/) : [];
  const out: DeliverableTool[] = [];
  const unknown: string[] = [];
  for (const entry of list) {
    const s = String(entry ?? "").trim();
    if (!s) continue;
    const norm = s.toLowerCase().replace(/[\s_]+/g, "_");
    const direct = (DELIVERABLE_TOOLS as readonly string[]).includes(norm) ? (norm as DeliverableTool) : undefined;
    const alias = DELIVERABLE_ALIASES[s.toLowerCase().replace(/[\s_]+/g, "-")];
    const tool = direct ?? alias;
    if (!tool) {
      unknown.push(s);
      continue;
    }
    if (!out.includes(tool)) out.push(tool);
  }
  return { deliverables: out, unknown };
}

/**
 * Steps per item: research allowance + the item's tail (deliverables +
 * record_item_result). With no deliverables this is 4 — exactly the old
 * screening formula — so screening runs are unchanged.
 */
export function stepsPerItemFor(deliverables: readonly string[], override?: number): number {
  const derived = RESEARCH_ALLOWANCE_PER_ITEM + deliverables.length + 1;
  return clampInt(
    override ?? derived,
    PROPOSAL_BOUNDS.stepsPerItem.min,
    PROPOSAL_BOUNDS.stepsPerItem.max,
    derived,
  );
}

/** The turn's step cap for an approved run. `items × perItem + overhead`, capped at 200 items. */
export function computeIterationStepCap(input: {
  itemBudget: number;
  deliverables: readonly string[];
  stepsPerItem?: number;
}): number {
  const items = clampInt(input.itemBudget, 1, 200, 1);
  return items * stepsPerItemFor(input.deliverables, input.stepsPerItem) + RUN_OVERHEAD_STEPS;
}

/** The tools the reserved tail keeps callable: the deliverables plus the record/close tools. */
export function reservedTailTools(deliverables: readonly string[]): string[] {
  return [...new Set([...deliverables, ...TAIL_ALWAYS])];
}

/** How many of the turn's last steps are held for the tail: deliverables + record + close. */
export function reservedTailSize(deliverables: readonly string[]): number {
  return deliverables.length + 2;
}

/**
 * The per-step budget line the harness appends (model-path only, at the END
 * of the messages so the prefix cache stays warm). One sentence: where the
 * turn stands and what the last steps are for.
 */
export function stepsRemainingNotice(input: {
  stepNumber: number;
  stepCap: number;
  deliverables: readonly string[];
}): string {
  const remaining = Math.max(0, input.stepCap - input.stepNumber);
  const tail = reservedTailSize(input.deliverables);
  const tools = reservedTailTools(input.deliverables).filter((t) => t !== "summon");
  const reservedNote =
    remaining <= tail
      ? `The remaining steps are RESERVED for the deliverables — only ${tools.join(", ")} are available now; produce the artifacts with what you have, record any gap, and close.`
      : `The last ${tail} are reserved for ${tools.join(", ")} — plan research to finish before then.`;
  return `[Harness notice — not from the user. Steps: ${remaining} of ${input.stepCap} remaining in this turn. ${reservedNote}]`;
}

// ── The schema ───────────────────────────────────────────────────────────────

/**
 * One item as the model may send it. Every key optional: the model has sent
 * `{label, url}`, bare strings, and (from page collects) `{title, href}`.
 * `normalizeProposalItems` reads them all.
 */
const proposalItem = z.union([
  z
    .object({
      label: z.string().optional().describe("Human label — title/company as shown."),
      title: z.string().optional(),
      name: z.string().optional(),
      url: z
        .string()
        .optional()
        .describe("The item's own URL when known (tab URL, link href) — the strongest stable key."),
      href: z.string().optional(),
      link: z.string().optional(),
    })
    .describe("An item with a label and, when known, its url."),
  z.string().describe("A bare string is read as the item's label."),
]);

/**
 * The capture target as the model may send it. A bare string is the database;
 * inside the object every key the model has ever used for the database is
 * accepted (`database`, `databaseId`, `table`, `tableId`, `name`, `id`) — the
 * sibling tools all say `databaseId`, so refusing it here was the harness's
 * inconsistency, not the model's. `columns` may be a list or a comma string;
 * empty means "every writable column of the table" (execute expands it).
 */
const captureTarget = z.union([
  z.string().describe("The target database's id (from the mention capsule) or exact name."),
  z.object({
    database: z
      .string()
      .optional()
      .describe("Target database — its id (from the mention capsule) or exact name."),
    databaseId: z.string().optional(),
    table: z.string().optional(),
    tableId: z.string().optional(),
    name: z.string().optional(),
    id: z.string().optional(),
    admission: z
      .string()
      .optional()
      .describe(
        'Which recorded items get rows: "all" done items (default), "qualified" only, or "custom" (the user\'s stated rule — pass cells only for items meeting it).',
      ),
    admissionNote: z
      .string()
      .optional()
      .describe("One line stating a custom admission rule (shown on the card and in the ledger)."),
    columns: z
      .union([z.array(z.string()), z.string()])
      .optional()
      .describe(
        "Column NAMES this run will write per admitted item. Omit or leave empty to write every writable column of the table.",
      ),
    dedupeColumn: z
      .string()
      .optional()
      .describe("Column holding each item's stable identity; defaults to the table's first url column."),
    dedupeColumnName: z.string().optional(),
    mergeColumns: z
      .union([z.array(z.string()), z.string()])
      .optional()
      .describe(
        "Capture columns that ACCUMULATE across runs instead of being replaced — alias / keyword / wording columns (text, longText or list). A re-encountered row keeps what it had and gains what this run adds.",
      ),
  }),
]);

export const ITERATION_PROPOSAL_INPUT = z.object({
  objective: z
    .string()
    .describe(
      "What to do with EACH item, and what 'qualifies' means. This is the rubric the run is judged by.",
    ),
  source: z
    .string()
    .optional()
    .describe(
      'Where the items were enumerated from: "list-page", "open-tabs", "urls", or "database-rows". "database-rows" = a stage-2 pass over an existing table: requires captureTo (the table is both source and stamp-back target); omit items — the server enumerates rows itself (optionally narrowed by rowIds).',
    ),
  items: z
    .array(proposalItem)
    .optional()
    .describe(
      'The enumerated items, in processing order. REQUIRED for every source except "database-rows" (where the server enumerates).',
    ),
  rowIds: z
    .array(z.string())
    .optional()
    .describe(
      "database-rows only: iterate exactly these rows, in this order ([handles] or ids from query_database). Omit to iterate the whole table in grid order (capped by itemCap).",
    ),
  itemCap: z
    .number()
    .optional()
    .describe(
      "Max items to process this run (1–200). PROPOSE a sensible default (~10-15); raise it yourself ONLY when the user explicitly asked for more. If the user wants a different cap after seeing the plan, they will say so — re-propose with their number.",
    ),
  budget: z
    .number()
    .optional()
    .describe("Alias for itemCap. Prefer itemCap; this exists because the harness calls every other ceiling a budget."),
  batchSize: z
    .number()
    .optional()
    .describe(
      "Optional batch cadence (2–50): checkpoint the run every N items (dedupe the batch, record a batch checkpoint in the ledger) before starting the next batch. Omit when one batch covers the whole run. RECOMMEND 10 or fewer — larger batches raise drift and context risk; go higher only when the user asks for it.",
    ),
  ledgerLabel: z
    .string()
    .optional()
    .describe("Short label for the run's ledger; omit to derive from the objective."),
  deliverables: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .describe(
      'The WRITE tools each item must end with, after its research — e.g. ["create_docx", "update_row"] for "draft a resume and attach it to the row". Omit for a screening run (read → record). The harness sizes the step budget from this and RESERVES the last steps of each turn for these tools, so research can never consume them.',
    ),
  stepsPerItem: z
    .number()
    .optional()
    .describe(
      "Override the steps budgeted per item (2–20). Default: 3 research steps + one per deliverable + the record. Raise it only when the charter's per-item work is genuinely deeper.",
    ),
  captureTo: captureTarget
    .optional()
    .describe(
      "Capture admitted items as DATABASE ROWS in addition to the ledger. Declare it when the user asked for results in a database — approving this card is the user's consent to write there, and each admitted item's record_item_result must then include capture.cells.",
    ),
  quest: z
    .string()
    .optional()
    .describe(
      'The ongoing MATTER this run belongs to (continue-or-create): pass the quest\'s name when the user mentions a past matter to continue ("my job hunt") — the same quest across sittings shares one ledger and skips already-scored items. Omit for a brand-new matter (a quest is then created from the run\'s label).',
    ),
  questColumns: z
    .array(
      z.object({
        name: z.string(),
        type: z
          .string()
          .optional()
          .describe('One of "text", "longText", "number", "url", "date", "checkbox" (default text).'),
        description: z
          .string()
          .optional()
          .describe("What goes in it — same load-bearing context as every capture column."),
      }),
    )
    .optional()
    .describe(
      "NEW quests only (up to 8): extra ledger columns sculpted to this matter (a scoring task adds its criteria columns; a collection task adds none). The machinery core (Item/Status/Pass/Fit/Qualified/Verdict/…) always exists — never re-declare it. Write their values via questCells on record_item_result. Ignored when continuing an existing quest.",
    ),
});

export type IterationProposalInput = z.infer<typeof ITERATION_PROPOSAL_INPUT>;

// ── Resolution (execute-side judgement, pure) ───────────────────────────────

/** Clamp to [min, max]; a non-finite value takes `fallback`. Rounds to an integer. */
export function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

/** Clip prose to `max` characters with an ellipsis; undefined passes through. */
export function clipText(text: string | undefined, max: number): string | undefined {
  if (text === undefined) return undefined;
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

export interface NormalizedProposalItem {
  label: string;
  url?: string;
}

export interface NormalizedProposalItems {
  items: NormalizedProposalItem[];
  /** Items with no usable label under any accepted key — skipped, not fatal. */
  dropped: number;
  /** True when more than PROPOSAL_BOUNDS.items arrived and the tail was cut. */
  clipped: boolean;
}

/**
 * Every item shape the model has sent → `{ label, url? }`. A bare string is
 * the label; `title` / `name` stand in for `label`; `href` / `link` for
 * `url`. Over-long labels and urls are clipped, never rejected.
 */
export function normalizeProposalItems(
  raw: IterationProposalInput["items"],
): NormalizedProposalItems {
  const out: NormalizedProposalItem[] = [];
  let dropped = 0;
  const source = raw ?? [];
  const clipped = source.length > PROPOSAL_BOUNDS.items;
  for (const entry of source.slice(0, PROPOSAL_BOUNDS.items)) {
    const labelRaw =
      typeof entry === "string"
        ? entry
        : (entry.label ?? entry.title ?? entry.name ?? entry.url ?? entry.href ?? entry.link);
    const label = clipText(labelRaw, PROPOSAL_BOUNDS.labelChars);
    if (!label) {
      dropped += 1;
      continue;
    }
    const urlRaw = typeof entry === "string" ? undefined : (entry.url ?? entry.href ?? entry.link);
    const url = clipText(urlRaw, PROPOSAL_BOUNDS.urlChars);
    out.push(url ? { label, url } : { label });
  }
  return { items: out, dropped, clipped };
}

export interface ResolvedCaptureTarget {
  database: string;
  admission: IterationAdmission;
  admissionNote?: string;
  /** Empty = every writable column of the table (the preflight expands it). */
  columns: string[];
  dedupeColumn?: string;
  /** Columns that merge across runs (validated by the preflight). */
  mergeColumns: string[];
}

/**
 * Flat result (repo convention — the tsconfig is not strict, so a
 * discriminated union does not narrow): `target` is present exactly when
 * `ok` is true; `refusal` when false.
 */
export interface CaptureTargetResolution {
  ok: boolean;
  target?: ResolvedCaptureTarget;
  notes: string[];
  refusal?: string;
}

/** Flat, same convention: `admission` when resolved, `refusal` otherwise. */
export interface AdmissionResolution {
  admission?: IterationAdmission;
  note?: string;
  refusal?: string;
}

/**
 * The admission vocabulary, by meaning rather than spelling. Missing means
 * "all" — the same default the approval card shows. Anything unrecognizable
 * is a refusal that names the three words, so the fix is one step.
 */
export function resolveAdmission(raw: string | undefined): AdmissionResolution {
  const s = raw?.trim().toLowerCase();
  if (!s) return { admission: "all", note: "admission defaulted to \"all\"" };
  if ((ITERATION_ADMISSIONS as readonly string[]).includes(s)) {
    return { admission: s as IterationAdmission };
  }
  if (/qualif|pass(ed|ing)?\b|meet|met\b|fit\b|match/.test(s)) {
    return { admission: "qualified", note: `admission "${raw}" read as "qualified"` };
  }
  if (/^(all|every|everything|any|each|done|none)\b/.test(s)) {
    return { admission: "all", note: `admission "${raw}" read as "all"` };
  }
  if (/custom|rule|only|where|when|if\b|unless|except/.test(s)) {
    return { admission: "custom", note: `admission "${raw}" read as "custom"` };
  }
  return {
    refusal: `captureTo.admission "${raw}" is not a rule I know. Use "all" (every recorded item gets a row), "qualified" (only items that met the bar) or "custom" (your stated rule, with admissionNote).`,
  };
}

/** Column names from a list or a comma/newline-separated string; trimmed, deduped, empties dropped. */
export function resolveColumnNames(raw: string[] | string | undefined): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,\n;]/) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of list) {
    const name = typeof entry === "string" ? entry.trim() : "";
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * `captureTo` in every shape the model has sent → one resolved target, or a
 * teaching refusal. Returns null when no capture was requested at all.
 */
export function resolveCaptureTarget(
  raw: IterationProposalInput["captureTo"],
): CaptureTargetResolution | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "string") {
    const database = raw.trim();
    if (!database) return null;
    return {
      ok: true,
      target: { database, admission: "all", columns: [], mergeColumns: [] },
      notes: ["captureTo given as a bare database — admission \"all\", every writable column"],
    };
  }
  const database = [raw.database, raw.databaseId, raw.table, raw.tableId, raw.name, raw.id]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .find((v) => v.length > 0);
  if (!database) {
    return {
      ok: false,
      notes: [],
      refusal:
        "captureTo names no database. Pass its id (from the mention capsule) or exact name as captureTo.database (databaseId is accepted too) and re-propose — keep the items you already enumerated.",
    };
  }
  const admission = resolveAdmission(raw.admission);
  if (!admission.admission) {
    return { ok: false, notes: [], refusal: admission.refusal ?? "captureTo.admission could not be read." };
  }
  const notes: string[] = [];
  if (admission.note) notes.push(admission.note);
  const columns = resolveColumnNames(raw.columns);
  if (columns.length === 0) notes.push("no columns named — every writable column of the table");
  const mergeColumns = resolveColumnNames(raw.mergeColumns);
  // A merge column is a capture column; naming it only in mergeColumns is
  // read as "capture it, and merge it" rather than refused.
  for (const name of mergeColumns) {
    if (columns.length > 0 && !columns.some((c) => c.toLowerCase() === name.toLowerCase())) {
      columns.push(name);
      notes.push(`"${name}" added to captureTo.columns because it is a merge column`);
    }
  }
  const dedupeColumn = clipText(raw.dedupeColumn ?? raw.dedupeColumnName, 120);
  const admissionNote = clipText(raw.admissionNote, 300);
  return {
    ok: true,
    target: {
      database,
      admission: admission.admission,
      ...(admissionNote ? { admissionNote } : {}),
      columns,
      ...(dedupeColumn ? { dedupeColumn } : {}),
      mergeColumns,
    },
    notes,
  };
}

/** A quest column type by meaning; null when unrecognizable. */
export function resolveQuestColumnType(raw: string | undefined): QuestColumnType | null {
  const s = raw?.trim().toLowerCase();
  if (!s) return "text";
  if ((QUEST_COLUMN_TYPES as readonly string[]).includes(raw!.trim())) {
    return raw!.trim() as QuestColumnType;
  }
  if (/^(long|rich|multi|para|prose|markdown|md)/.test(s) || s === "longtext") return "longText";
  if (/^(str|text|short|label|title)/.test(s)) return "text";
  if (/^(num|int|float|dec|score|percent|count|amount)/.test(s)) return "number";
  if (/^(url|link|href|uri|web)/.test(s)) return "url";
  if (/^(date|time|day|when)/.test(s)) return "date";
  if (/^(bool|check|flag|yes|toggle|tick)/.test(s)) return "checkbox";
  return null;
}

export interface ResolvedQuestColumn {
  name: string;
  type: QuestColumnType;
  description: string;
}

/** Flat result: `columns` is complete exactly when `ok`; `refusal` otherwise. */
export interface QuestColumnsResolution {
  ok: boolean;
  columns: ResolvedQuestColumn[];
  notes: string[];
  refusal?: string;
}

/** Quest columns as sent → resolved types and clipped text; unknown types are a teaching refusal. */
export function resolveQuestColumns(
  raw: IterationProposalInput["questColumns"],
): QuestColumnsResolution {
  const notes: string[] = [];
  const columns: ResolvedQuestColumn[] = [];
  const source = raw ?? [];
  if (source.length > PROPOSAL_BOUNDS.questColumns) {
    notes.push(
      `questColumns clipped to the first ${PROPOSAL_BOUNDS.questColumns} of ${source.length}`,
    );
  }
  for (const entry of source.slice(0, PROPOSAL_BOUNDS.questColumns)) {
    const name = clipText(entry.name, 60);
    if (!name) continue;
    const type = resolveQuestColumnType(entry.type);
    if (!type) {
      return {
        ok: false,
        columns: [],
        notes,
        refusal: `questColumns "${name}" has type "${entry.type}", which I cannot map. Use one of ${QUEST_COLUMN_TYPES.map((t) => `"${t}"`).join(", ")} and re-propose.`,
      };
    }
    if (entry.type && entry.type.trim() !== type) notes.push(`questColumns "${name}": type "${entry.type}" read as "${type}"`);
    columns.push({ name, type, description: clipText(entry.description, 300) ?? "" });
  }
  return { ok: true, columns, notes };
}
