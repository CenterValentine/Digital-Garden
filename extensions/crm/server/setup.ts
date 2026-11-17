/**
 * Setting up a CRM: a business folder, its linked starter databases (one
 * transaction, `applyLinkedSchema`), and the config that binds them.
 *
 * Everything lands in the user's own tree as ordinary content — they can
 * open any table in the database grid, add columns, rename things. The CRM
 * keeps working through renames because the config binds ids, not names.
 *
 * SERVER-ONLY (Prisma).
 */

import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { generateUniqueSlug } from "@/lib/domain/content/slug";
import { applyLinkedSchema, type LinkedColumnSpec } from "@/lib/domain/data/server/linked-schema";
import { loadTable } from "@/lib/domain/data/server/queries";
import { updateColumn } from "@/lib/domain/data/server/mutations";
import type { DataColumn, DataColumnConfig, DataTable } from "@/lib/domain/data";
import {
  CRM_TABLE_ROLES,
  CRM_VIEW_PREFS_KEY,
  parseCrmConfig,
  type CrmAutomationEngineId,
  type CrmColumnBindings,
  type CrmConfig,
  type CrmTableRole,
} from "@/lib/domain/crm/config";
import { findCrmPreset, type CrmPreset } from "@/lib/domain/crm/presets";

export class CrmSetupError extends Error {}

const ROLE_REF = (preset: CrmPreset, role: CrmTableRole) => {
  const table = preset.tables.find((t) => t.role === (preset.subjectIsContact && role === "subjects" ? "contacts" : role));
  if (!table) throw new CrmSetupError(`Preset ${preset.id} has no ${role} table.`);
  return `$new:${table.title}`;
};

function byName(table: DataTable, name: string): DataColumn {
  const column = table.columns.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (!column) throw new CrmSetupError(`“${table.title}” has no “${name}” column.`);
  return column;
}

function optionId(column: DataColumn, label: string): string {
  const option = column.config.options?.find((o) => o.label === label);
  if (!option) throw new CrmSetupError(`“${column.name}” has no “${label}” option.`);
  return option.id;
}

/** Name bindings → id bindings, once the columns exist. */
function bindColumns(
  preset: CrmPreset,
  tables: Record<CrmTableRole, DataTable>
): CrmColumnBindings {
  const out = {} as Record<string, Record<string, string>>;
  for (const [role, names] of Object.entries(preset.bindings) as Array<
    [keyof CrmColumnBindings, Record<string, string>]
  >) {
    out[role] = {};
    for (const [binding, name] of Object.entries(names)) {
      out[role][binding] = byName(tables[role], name).id;
    }
  }
  return out as unknown as CrmColumnBindings;
}

export async function createCrmBusiness(
  ownerId: string,
  input: {
    name: string;
    presetId: string;
    parentId?: string | null;
    automation?: CrmAutomationEngineId;
  }
): Promise<{ folderId: string; config: CrmConfig }> {
  const preset = findCrmPreset(input.presetId);
  if (!preset) throw new CrmSetupError(`Unknown preset “${input.presetId}”.`);
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new CrmSetupError("A business needs a name.");

  let parentId: string | null = null;
  if (input.parentId) {
    const parent = await prisma.contentNode.findFirst({
      where: { id: input.parentId, ownerId, contentType: "folder", deletedAt: null },
      select: { id: true },
    });
    if (!parent) throw new CrmSetupError("That folder is not yours or no longer exists.");
    parentId = parent.id;
  }

  // 1. The business folder — ordinary content in the user's tree.
  const folder = await prisma.contentNode.create({
    data: {
      ownerId,
      title: name,
      slug: await generateUniqueSlug(name, ownerId),
      contentType: "folder",
      parentId,
      folderPayload: { create: { viewMode: "list", viewPrefs: {} } },
    },
    select: { id: true },
  });

  // 2. The starter databases, linked, in one transaction.
  const result = await applyLinkedSchema(ownerId, {
    tables: preset.tables.map((table) => ({
      title: table.title,
      description: table.description,
      parentId: folder.id,
      columns: table.columns.map(
        (c): LinkedColumnSpec => ({
          name: c.name,
          type: c.type,
          ...(c.primary ? { primary: true } : {}),
          ...(c.description ? { description: c.description } : {}),
          ...(c.options ? { options: c.options } : {}),
          ...(c.target ? { target: ROLE_REF(preset, c.target), backlinkName: c.backlinkName } : {}),
        })
      ),
    })),
  });

  const idByTitle = new Map(result.tables.map((t) => [t.title, t.id]));
  const tables = {} as Record<CrmTableRole, DataTable>;
  for (const role of CRM_TABLE_ROLES) {
    const sourceRole = preset.subjectIsContact && role === "subjects" ? "contacts" : role;
    const spec = preset.tables.find((t) => t.role === sourceRole)!;
    const table = await loadTable(idByTitle.get(spec.title)!);
    if (!table) throw new CrmSetupError(`“${spec.title}” was not created.`);
    tables[role] = table;
  }

  // 3. Column config the linked spec cannot carry (currency, time of day).
  for (const spec of preset.tables) {
    const table = tables[spec.role];
    for (const c of spec.columns) {
      if (!c.config) continue;
      const column = byName(table, c.name);
      await updateColumn(column.id, {
        config: { ...column.config, ...c.config } as DataColumnConfig,
      });
    }
  }

  // 4. Bind by id and store the config on the folder.
  const followUp = byName(tables.opportunities, preset.bindings.opportunities.followUp);
  const direction = byName(tables.messages, preset.bindings.messages.direction);
  const kind = byName(tables.activity, preset.bindings.activity.kind);
  const labels = preset.optionLabels;
  const config: CrmConfig = {
    version: 1,
    preset: preset.id,
    terms: preset.terms,
    tables: Object.fromEntries(
      CRM_TABLE_ROLES.map((role) => [role, tables[role].contentId])
    ) as Record<CrmTableRole, string>,
    subjectFields: preset.subjectFields.map((n) => byName(tables.subjects, n).id),
    columns: bindColumns(preset, tables),
    options: {
      followUp: {
        scheduled: optionId(followUp, labels.followUp.scheduled),
        paused: optionId(followUp, labels.followUp.paused),
        done: optionId(followUp, labels.followUp.done),
      },
      direction: {
        inbound: optionId(direction, labels.direction.inbound),
        outbound: optionId(direction, labels.direction.outbound),
        draft: optionId(direction, labels.direction.draft),
      },
      activityKind: {
        message: optionId(kind, labels.activityKind.message),
        followUp: optionId(kind, labels.activityKind.followUp),
        stage: optionId(kind, labels.activityKind.stage),
        note: optionId(kind, labels.activityKind.note),
        automation: optionId(kind, labels.activityKind.automation),
      },
    },
    automation: { engine: input.automation ?? "simulator" },
  };
  // Round-trip through the reader: setup must never store a config the
  // views would refuse.
  if (!parseCrmConfig(config)) throw new CrmSetupError("Setup produced an incomplete config.");

  await prisma.folderPayload.update({
    where: { contentId: folder.id },
    data: {
      viewPrefs: { [CRM_VIEW_PREFS_KEY]: config } as unknown as Prisma.InputJsonValue,
    },
  });

  return { folderId: folder.id, config };
}
