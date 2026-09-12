/**
 * Creating a LINKED set of databases as one transaction.
 *
 * Plan: docs/notes-feature/work-tracking/AI-RELATIONAL-DATABASE-REACH-PLAN.md
 * (P2). The origin is a production session where three tables that were meant
 * to reference each other arrived as four separate proposal cards, so the
 * "links" between them could only be hand-typed text ids (EXP-012). Three
 * tables that reference each other cannot be expressed as three independent
 * creates: a relation needs a target that does not exist yet when the first
 * card is applied.
 *
 * So the unit of work here is a whole schema:
 *   - N new tables, each with its columns;
 *   - relation columns on those tables, targeting each other (`$new:Title`)
 *     or tables that already exist;
 *   - relation columns added to EXISTING tables (the "extend" half — how the
 *     user's current table joins a new set instead of being rebuilt as an
 *     index of it);
 *   - lookups and rollups over any of those relations.
 *
 * All of it commits or none of it does. A half-applied linked schema is
 * worse than a failed one: the user is left with orphan tables that look
 * finished, and the model that proposed it has already said it was done.
 *
 * SERVER-ONLY (Prisma).
 */

import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import {
  AI_PROPOSABLE_COLUMN_TYPES,
  ROLLUP_FNS,
  generateColumnKey,
  type DataColumnConfig,
  type DataColumnType,
  type RollupFn,
  type SelectOption,
  type StatusGroup,
} from "@/lib/domain/data";
import {
  createColumnTx,
  createRelationPairTx,
  refreshTableSearchText,
} from "./mutations";
import { generateUniqueSlug } from "@/lib/domain/content";

// ── Spec ─────────────────────────────────────────────────────────────────

/** Prefix marking a relation target that is another table in the SAME spec. */
export const NEW_TABLE_REF_PREFIX = "$new:";

export interface LinkedColumnSpec {
  name: string;
  type: DataColumnType;
  description?: string | null;
  options?: Array<{ label: string; color?: string; group?: StatusGroup }>;
  /** Exactly one per new table — the row's title. */
  primary?: boolean;
  /** `relation` — `$new:<Title>` in this spec, or an existing table's id/title. */
  target?: string;
  /** `relation` — name of the mirrored column minted on the target. */
  backlinkName?: string;
  /** `lookup` · `rollup` — the name of a relation column on THIS table. */
  through?: string;
  /** `lookup` — the target-table column to read. `rollup` — the column to aggregate. */
  column?: string;
  /** `rollup` — defaults to `count`. */
  fn?: RollupFn;
}

export interface LinkedSchemaSpec {
  /** New tables to create, in order. */
  tables?: Array<{
    title: string;
    description?: string | null;
    parentId?: string | null;
    columns: LinkedColumnSpec[];
  }>;
  /**
   * Columns to add to tables that already exist.
   *
   * Already RESOLVED and AUTHORIZED by the caller. Schema access is a ladder
   * (`canAlterSchema`), not plain ownership — a grant can confer it — and the
   * ladder lives with the routes that own it. This function executes; it does
   * not adjudicate who may extend what.
   */
  extend?: Array<{
    tableId: string;
    title: string;
    columns: LinkedColumnSpec[];
  }>;
}

export interface LinkedSchemaResult {
  tables: Array<{ id: string; title: string; slug: string }>;
  extended: Array<{ id: string; title: string; columns: number }>;
  /** Relation PAIRS created (each is a forward column plus its backlink). */
  relations: number;
  /** Lookup and rollup columns created. */
  computed: number;
}

export class LinkedSchemaError extends Error {}

// ── Caps ─────────────────────────────────────────────────────────────────

/** Mirrors the single-table route; a schema is not a bulk import. */
const MAX_TABLES = 6;
const MAX_EXTEND = 6;
const MAX_COLUMNS_PER_TABLE = 30;
/**
 * Interactive-transaction budget. A six-table schema is ~100 inserts, each
 * trivial but round-tripping to Postgres; Prisma's 5s default would abort a
 * legitimate schema on a cold connection and report it as a failure.
 */
const TRANSACTION_TIMEOUT_MS = 30_000;

const CREATABLE = new Set<DataColumnType>(AI_PROPOSABLE_COLUMN_TYPES);
const RELATION_TYPES = new Set<DataColumnType>(["relation"]);
const COMPUTED_TYPES = new Set<DataColumnType>(["lookup", "rollup"]);

function fail(message: string): never {
  throw new LinkedSchemaError(message);
}

// ── Normalisation ────────────────────────────────────────────────────────

function normaliseOptions(
  spec: LinkedColumnSpec
): SelectOption[] | undefined {
  if (!spec.options || spec.options.length === 0) return undefined;
  return spec.options
    .filter((o) => typeof o.label === "string" && o.label.trim().length > 0)
    .slice(0, 50)
    .map((o) => ({
      id: generateColumnKey(),
      label: o.label.trim().slice(0, 120),
      ...(typeof o.color === "string" && /^[a-z][a-z0-9-]{0,23}$/.test(o.color)
        ? { color: o.color }
        : {}),
      ...(o.group === "todo" || o.group === "active" || o.group === "done"
        ? { group: o.group }
        : {}),
    }));
}

/** Case- and whitespace-insensitive, so "claim ids" finds "Claim IDs". */
function normaliseName(name: string): string {
  return name.trim().toLowerCase();
}

// ── Target resolution ────────────────────────────────────────────────────

interface ResolvedTarget {
  /** Index into `spec.tables` when the target is being created here. */
  newTableIndex?: number;
  /** Set when the target already exists. */
  existingId?: string;
}

/**
 * Resolve every relation target BEFORE the transaction opens. A target that
 * cannot be resolved is the most likely failure in a model-authored schema,
 * and finding it here means the failure costs nothing and names itself.
 */
async function resolveTargets(
  ownerId: string,
  spec: LinkedSchemaSpec,
  newTitles: string[]
): Promise<Map<string, ResolvedTarget>> {
  const wanted = new Set<string>();
  for (const table of spec.tables ?? []) {
    for (const column of table.columns) {
      if (RELATION_TYPES.has(column.type) && column.target) wanted.add(column.target);
    }
  }
  for (const entry of spec.extend ?? []) {
    for (const column of entry.columns) {
      if (RELATION_TYPES.has(column.type) && column.target) wanted.add(column.target);
    }
  }

  const resolved = new Map<string, ResolvedTarget>();
  const byTitle = new Map(newTitles.map((t, i) => [normaliseName(t), i]));

  for (const ref of wanted) {
    if (ref.startsWith(NEW_TABLE_REF_PREFIX)) {
      const title = ref.slice(NEW_TABLE_REF_PREFIX.length);
      const index = byTitle.get(normaliseName(title));
      if (index === undefined) {
        fail(
          `Relation target "${ref}" names no table in this schema. New-table targets must match a title in this proposal exactly.`
        );
      }
      resolved.set(ref, { newTableIndex: index });
      continue;
    }
    // A bare title that also names a table in this spec means the new one:
    // a model writing `target: "Experiences"` beside a new "Experiences" is
    // pointing at what it just proposed, not at an older namesake.
    const sameSpec = byTitle.get(normaliseName(ref));
    if (sameSpec !== undefined) {
      resolved.set(ref, { newTableIndex: sameSpec });
      continue;
    }
    // Otherwise an existing table, by id or exact title. Ownership is part of
    // the lookup, so a relation can never point at someone else's table.
    const node = await prisma.contentNode.findFirst({
      where: {
        ownerId,
        contentType: "data",
        deletedAt: null,
        OR: [{ id: isUuid(ref) ? ref : undefined }, { title: ref }],
      },
      select: { id: true },
    });
    if (!node) {
      fail(
        `Relation target "${ref}" is not one of your databases. Use the exact title, its id, or "${NEW_TABLE_REF_PREFIX}<Title>" for a table in this same proposal.`
      );
    }
    resolved.set(ref, { existingId: node.id });
  }
  return resolved;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// ── Validation ───────────────────────────────────────────────────────────

function validateColumns(
  tableLabel: string,
  columns: LinkedColumnSpec[],
  { requirePrimary }: { requirePrimary: boolean }
): void {
  if (columns.length === 0 || columns.length > MAX_COLUMNS_PER_TABLE) {
    fail(`${tableLabel}: 1-${MAX_COLUMNS_PER_TABLE} columns required.`);
  }
  const seen = new Set<string>();
  for (const column of columns) {
    const name = column.name?.trim();
    if (!name) fail(`${tableLabel}: every column needs a name.`);
    const key = normaliseName(name);
    if (seen.has(key)) fail(`${tableLabel}: duplicate column name "${name}".`);
    seen.add(key);
    // One list for every create path (plan P1). Before this, the route kept
    // its own set and silently diverged from what the product supports.
    if (!CREATABLE.has(column.type)) {
      fail(
        `${tableLabel}: column "${name}" has unsupported type "${column.type}". One of: ${AI_PROPOSABLE_COLUMN_TYPES.join(", ")}.`
      );
    }
    if (RELATION_TYPES.has(column.type)) {
      if (!column.target) {
        fail(`${tableLabel}: relation column "${name}" needs a target database.`);
      }
    }
    if (COMPUTED_TYPES.has(column.type)) {
      if (!column.through) {
        fail(
          `${tableLabel}: ${column.type} column "${name}" needs \`through\` — the name of a relation column on this table.`
        );
      }
      if (column.type === "lookup" && !column.column) {
        fail(`${tableLabel}: lookup column "${name}" needs \`column\` — what to read on the target.`);
      }
      const fn = column.fn ?? "count";
      if (column.type === "rollup") {
        if (!ROLLUP_FNS.includes(fn)) {
          fail(
            `${tableLabel}: rollup "${name}" has unknown function "${fn}". One of: ${ROLLUP_FNS.join(", ")}.`
          );
        }
        if (fn !== "count" && !column.column) {
          fail(`${tableLabel}: rollup "${name}" (${fn}) needs \`column\` — what to aggregate.`);
        }
      }
    }
  }
  if (requirePrimary && columns.filter((c) => c.primary).length > 1) {
    fail(`${tableLabel}: only one column can be the primary.`);
  }
}

// ── Apply ────────────────────────────────────────────────────────────────

/**
 * Create the whole linked schema, or nothing.
 *
 * Order inside the transaction matters and is forced by the data model:
 * plain columns exist before relations (a relation's backlink lands beside
 * them), relations exist before lookups and rollups (which name a relation
 * column by id), and search text refreshes last per table.
 */
export async function applyLinkedSchema(
  ownerId: string,
  spec: LinkedSchemaSpec
): Promise<LinkedSchemaResult> {
  const newTables = spec.tables ?? [];
  const extend = spec.extend ?? [];
  if (newTables.length === 0 && extend.length === 0) {
    fail("Nothing to create: give at least one new table or one table to extend.");
  }
  if (newTables.length > MAX_TABLES) {
    fail(`At most ${MAX_TABLES} new tables per schema.`);
  }
  if (extend.length > MAX_EXTEND) {
    fail(`At most ${MAX_EXTEND} existing tables can be extended per schema.`);
  }

  const titles = newTables.map((t) => t.title?.trim().slice(0, 120) ?? "");
  titles.forEach((title, i) => {
    if (!title) fail(`Table ${i + 1} needs a title.`);
    validateColumns(`"${title}"`, newTables[i].columns, { requirePrimary: true });
  });

  // Existing tables to extend — authorized by the caller, still checked for
  // existence so a stale id fails with a name instead of a foreign-key error.
  const extendTargets: Array<{ id: string; title: string }> = [];
  for (const entry of extend) {
    const node = await prisma.contentNode.findFirst({
      where: { id: entry.tableId, contentType: "data", deletedAt: null },
      select: { id: true, title: true },
    });
    if (!node) fail(`"${entry.title}" no longer exists.`);
    validateColumns(`"${node.title}"`, entry.columns, { requirePrimary: false });
    extendTargets.push(node);
  }

  const targets = await resolveTargets(ownerId, spec, titles);

  // Slugs are generated before the transaction (they query for collisions).
  // Within one batch, later titles must see earlier ones, so they are taken
  // one at a time and the claimed set is carried forward.
  const slugs: string[] = [];
  const claimed = new Set<string>();
  for (const title of titles) {
    let slug = await generateUniqueSlug(title, ownerId);
    let n = 2;
    while (claimed.has(slug)) slug = `${await generateUniqueSlug(title, ownerId)}-${n++}`;
    claimed.add(slug);
    slugs.push(slug);
  }

  // Parent folders — each must be the caller's own live node.
  const parentIds: Array<string | null> = [];
  for (const table of newTables) {
    if (!table.parentId) {
      parentIds.push(null);
      continue;
    }
    const parent = await prisma.contentNode.findFirst({
      where: { id: table.parentId, ownerId, deletedAt: null },
      select: { id: true },
    });
    parentIds.push(parent?.id ?? null);
  }

  return prisma.$transaction(
    async (tx) => {
      const createdIds: string[] = [];
      const result: LinkedSchemaResult = {
        tables: [],
        extended: [],
        relations: 0,
        computed: 0,
      };

      // 1. Tables.
      for (const [i, table] of newTables.entries()) {
        const node = await tx.contentNode.create({
          data: {
            ownerId,
            title: titles[i],
            slug: slugs[i],
            contentType: "data",
            parentId: parentIds[i],
            displayOrder: 0,
            dataPayload: {
              create: {
                mode: "inline",
                source: {} as unknown as Prisma.InputJsonValue,
                searchText: titles[i].toLowerCase(),
                ...(table.description
                  ? { description: table.description.trim().slice(0, 280) }
                  : {}),
              },
            },
          },
          select: { id: true },
        });
        createdIds.push(node.id);
        result.tables.push({ id: node.id, title: titles[i], slug: slugs[i] });
      }

      const tableIdFor = (ref: string): string => {
        const target = targets.get(ref);
        if (!target) fail(`Unresolved relation target "${ref}".`);
        return target.existingId ?? createdIds[target.newTableIndex!];
      };

      // Every table this call touches, for the final search-text refresh and
      // for the caller's context-dirty marking.
      const touched = new Set<string>([
        ...createdIds,
        ...extendTargets.map((t) => t.id),
      ]);

      // 2. Plain columns (everything that is not part of the graph).
      const plan: Array<{ tableId: string; title: string; columns: LinkedColumnSpec[] }> = [
        ...newTables.map((t, i) => ({
          tableId: createdIds[i],
          title: titles[i],
          columns: t.columns,
        })),
        ...extend.map((e, i) => ({
          tableId: extendTargets[i].id,
          title: extendTargets[i].title,
          columns: e.columns,
        })),
      ];

      for (const entry of plan) {
        for (const column of entry.columns) {
          if (RELATION_TYPES.has(column.type) || COMPUTED_TYPES.has(column.type)) {
            continue;
          }
          const options = normaliseOptions(column);
          await createColumnTx(tx, entry.tableId, {
            name: column.name.trim().slice(0, 120),
            type: column.type,
            description: column.description?.trim().slice(0, 500) || null,
            ...(options ? { config: { options } } : {}),
          });
        }
      }

      // 3. Relation pairs. The backlink's default name is the source table's
      //    title, which is what the column route already does for a
      //    hand-created relation — "Experiences" showing up on Claims.
      const relationIds = new Map<string, string>(); // `${tableId}::${name}` → columnId
      for (const entry of plan) {
        for (const column of entry.columns) {
          if (!RELATION_TYPES.has(column.type)) continue;
          const targetId = tableIdFor(column.target!);
          const backlinkName = await uniqueColumnName(
            tx,
            targetId,
            column.backlinkName?.trim() || entry.title
          );
          const pair = await createRelationPairTx(
            tx,
            entry.tableId,
            targetId,
            {
              name: column.name.trim().slice(0, 120),
              description: column.description?.trim().slice(0, 500) || null,
            },
            backlinkName
          );
          relationIds.set(
            `${entry.tableId}::${normaliseName(column.name)}`,
            pair.forwardId
          );
          touched.add(targetId);
          result.relations += 1;
        }
      }

      // 4. Lookups and rollups, which need both ids from step 3.
      for (const entry of plan) {
        for (const column of entry.columns) {
          if (!COMPUTED_TYPES.has(column.type)) continue;
          const throughKey = `${entry.tableId}::${normaliseName(column.through!)}`;
          let relationColumnId = relationIds.get(throughKey);
          if (!relationColumnId) {
            // A relation that already existed on an extended table.
            const existing = await tx.dataColumn.findFirst({
              where: {
                tableId: entry.tableId,
                type: "relation",
                deletedAt: null,
                name: column.through!.trim(),
              },
              select: { id: true },
            });
            if (!existing) {
              fail(
                `"${entry.title}": ${column.type} "${column.name}" points through "${column.through}", which is not a relation column on that table.`
              );
            }
            relationColumnId = existing.id;
          }

          const relation = await tx.dataColumn.findUnique({
            where: { id: relationColumnId },
            select: { config: true },
          });
          const relConfig = (relation?.config ?? {}) as unknown as DataColumnConfig;
          const targetTableId = relConfig.relationTableId;
          if (!targetTableId) {
            fail(
              `"${entry.title}": relation "${column.through}" has no target, so "${column.name}" cannot read through it.`
            );
          }

          const config: DataColumnConfig = { relationColumnId };
          if (column.column) {
            const targetColumn = await tx.dataColumn.findFirst({
              where: {
                tableId: targetTableId,
                deletedAt: null,
                name: column.column.trim(),
              },
              select: { id: true },
            });
            if (!targetColumn) {
              fail(
                `"${entry.title}": ${column.type} "${column.name}" reads "${column.column}", which that relation's target table does not have.`
              );
            }
            if (column.type === "lookup") config.lookupColumnId = targetColumn.id;
            else config.rollupColumnId = targetColumn.id;
          }
          if (column.type === "rollup") config.rollupFn = column.fn ?? "count";

          await createColumnTx(tx, entry.tableId, {
            name: column.name.trim().slice(0, 120),
            type: column.type,
            description: column.description?.trim().slice(0, 500) || null,
            config,
          });
          result.computed += 1;
        }
      }

      // 5. Primary columns, by name, on the new tables only.
      for (const [i, table] of newTables.entries()) {
        const primaryName = table.columns.find((c) => c.primary)?.name.trim();
        if (!primaryName) continue;
        await tx.dataColumn.updateMany({
          where: { tableId: createdIds[i], name: primaryName },
          data: { isPrimary: true },
        });
      }

      for (const tableId of touched) await refreshTableSearchText(tx, tableId);

      result.extended = extendTargets.map((t, i) => ({
        id: t.id,
        title: t.title,
        columns: extend[i].columns.length,
      }));
      return result;
    },
    { timeout: TRANSACTION_TIMEOUT_MS, maxWait: 10_000 }
  );
}

/**
 * A backlink lands on a table the proposer may not have looked at, so its
 * name can collide with a column already there. Suffixing beats failing:
 * the schema is still exactly what was approved, and the user renames.
 */
async function uniqueColumnName(
  tx: Prisma.TransactionClient,
  tableId: string,
  wanted: string
): Promise<string> {
  const base = wanted.slice(0, 120);
  const existing = await tx.dataColumn.findMany({
    where: { tableId, deletedAt: null },
    select: { name: true },
  });
  const taken = new Set(existing.map((c) => normaliseName(c.name)));
  if (!taken.has(normaliseName(base))) return base;
  for (let n = 2; n < 50; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(normaliseName(candidate))) return candidate;
  }
  return `${base} ${Date.now()}`;
}

/** Every table a result touched — what the caller marks context-dirty. */
export function touchedTableIds(result: LinkedSchemaResult): string[] {
  return [
    ...result.tables.map((t) => t.id),
    ...result.extended.map((t) => t.id),
  ];
}
