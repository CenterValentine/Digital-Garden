/**
 * Operator actions that need more than one cell write: saving a reply draft
 * and moving an opportunity's stage (which also leaves a history entry).
 *
 * Plain field edits — gate instructions, notes, next action — do NOT come
 * through here: the record views commit them through the database's own
 * rows route (PATCH /api/content/data/[id]/rows), exactly like the grid.
 *
 * SERVER-ONLY (Prisma).
 */

import { canWrite } from "@/lib/domain/data/server/access";
import { softDeleteRows } from "@/lib/domain/data/server/mutations";
import { projectCrm } from "@/lib/domain/crm/model";
import { activityLinks } from "./events";
import { createRow, rowBelongsTo, setCells, setLinks } from "./writes";
import { loadCrmWorkspace, resolveCrm } from "./workspace";

export class CrmActionError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function requireCrm(folderId: string, userId: string, writes: Array<"messages" | "opportunities" | "activity">) {
  const crm = await resolveCrm(folderId, userId);
  if (!crm) throw new CrmActionError("CRM not found", 404);
  for (const role of writes) {
    if (!canWrite(crm.access[role])) throw new CrmActionError("Read-only access to this CRM", 403);
  }
  return crm;
}

/**
 * Save (or clear) the one reply draft for a contact. A draft is a Messages
 * row with Direction = Draft: it lives with the conversation, survives
 * reload, and is never sent — live SMS is a later milestone.
 */
export async function saveReplyDraft(
  folderId: string,
  userId: string,
  input: { contactId: string; opportunityId?: string | null; body: string }
): Promise<{ draftId: string | null }> {
  const crm = await requireCrm(folderId, userId, ["messages"]);
  const { tables, config } = crm;
  const cb = config.columns.messages;

  if (!(await rowBelongsTo(tables.contacts, input.contactId))) {
    throw new CrmActionError("Unknown contact", 400);
  }
  const opportunityId =
    input.opportunityId && (await rowBelongsTo(tables.opportunities, input.opportunityId))
      ? input.opportunityId
      : null;

  const snapshot = await loadCrmWorkspace(folderId, userId);
  if (!snapshot) throw new CrmActionError("CRM not found", 404);
  const existing = projectCrm(snapshot).messages.find(
    (m) => m.direction === "draft" && m.contactId === input.contactId
  );
  const body = input.body.trim().slice(0, 2000);

  if (!body) {
    if (existing) await softDeleteRows(tables.messages.contentId, [existing.id], userId);
    return { draftId: null };
  }

  const cells = {
    [cb.body]: body,
    [cb.direction]: config.options.direction.draft,
    [cb.sentAt]: new Date().toISOString(),
  };
  const links = {
    [cb.contact]: [input.contactId],
    [cb.opportunity]: opportunityId ? [opportunityId] : [],
  };
  if (existing) {
    await setCells(tables.messages, existing.id, cells);
    await setLinks(tables.messages, existing.id, links);
    return { draftId: existing.id };
  }
  return { draftId: await createRow(tables.messages, userId, cells, links) };
}

/** Move an opportunity to another stage and record the move. */
export async function setOpportunityStage(
  folderId: string,
  userId: string,
  input: { opportunityId: string; stageId: string }
): Promise<{ changed: boolean }> {
  const crm = await requireCrm(folderId, userId, ["opportunities", "activity"]);
  const { tables, config } = crm;
  const cb = config.columns;

  const stageColumn = tables.opportunities.columns.find((c) => c.id === cb.opportunities.stage);
  const next = stageColumn?.config.options?.find((o) => o.id === input.stageId);
  if (!stageColumn || !next) throw new CrmActionError("Unknown stage", 400);

  const snapshot = await loadCrmWorkspace(folderId, userId);
  if (!snapshot) throw new CrmActionError("CRM not found", 404);
  const model = projectCrm(snapshot);
  const opportunity = model.opportunityById.get(input.opportunityId);
  if (!opportunity) throw new CrmActionError(`Unknown ${config.terms.opportunity.singular.toLowerCase()}`, 400);
  if (opportunity.stage?.id === next.id) return { changed: false };

  await setCells(tables.opportunities, opportunity.id, { [cb.opportunities.stage]: next.id });
  const now = new Date().toISOString();
  await createRow(
    tables.activity,
    userId,
    {
      [cb.activity.summary]: `${opportunity.title}: ${opportunity.stage?.label ?? "No stage"} → ${next.label}`,
      [cb.activity.kind]: config.options.activityKind.stage,
      [cb.activity.at]: now,
      [cb.activity.eventKey]: `stage:${opportunity.id}:${now}`,
    },
    activityLinks(crm, opportunity.contactId, opportunity)
  );
  return { changed: true };
}
