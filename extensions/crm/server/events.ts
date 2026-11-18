/**
 * Inbound CRM events — the one seam every executor feeds.
 *
 * Today the local simulator (the inbox's "Simulate incoming text") and the
 * demo seed post here; later an n8n webhook relaying an SMS provider will
 * post the same payload. Same code either way.
 *
 * Idempotency — a replayed or double-delivered event must change nothing:
 *  - the whole event runs under an advisory lock keyed by (folder, eventId),
 *    so two deliveries never interleave;
 *  - each effect carries its own key, checked before it is applied:
 *      message row     → Messages."External id" = `sms:<eventId>`
 *      "received" entry → Activity."Event key"  = `msg:<eventId>`
 *      pause + entry   → Activity."Event key"  = `pause:<eventId>`
 *    so a delivery that died halfway is completed by its replay, and a
 *    complete one is a no-op. Replaying Tess's text yields ONE pause.
 *
 * SERVER-ONLY (Prisma).
 */

import { canWrite } from "@/lib/domain/data/server/access";
import {
  matchReplyToOpportunity,
  normalizePhone,
  projectCrm,
  type CrmModel,
} from "@/lib/domain/crm/model";
import { getCrmAutomation } from "./automation/registry";
import { createRow, findRowIdsByCell, setCells, withCrmLock } from "./writes";
import { loadCrmWorkspace, resolveCrm, type ResolvedCrm } from "./workspace";

export interface CrmInboundText {
  type: "message.received";
  /** The channel's id for this message. Replays carry the same id. */
  eventId: string;
  from: string;
  body: string;
  receivedAt?: string;
}

export interface CrmEventResult {
  /** True when every effect of this event had already been applied. */
  duplicate: boolean;
  contactId: string;
  messageId: string;
  opportunityId: string | null;
  matchReason: string;
  paused: boolean;
  automationDetail: string | null;
}

export class CrmEventError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export function parseInboundText(value: unknown): CrmInboundText | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.type !== "message.received") return null;
  const eventId = typeof v.eventId === "string" ? v.eventId.trim() : "";
  const from = typeof v.from === "string" ? v.from.trim() : "";
  const body = typeof v.body === "string" ? v.body.trim() : "";
  if (!/^[\w.:-]{1,80}$/.test(eventId) || !from || !body) return null;
  const receivedAt =
    typeof v.receivedAt === "string" && !Number.isNaN(Date.parse(v.receivedAt))
      ? new Date(v.receivedAt).toISOString()
      : undefined;
  return { type: "message.received", eventId, from: from.slice(0, 40), body: body.slice(0, 2000), receivedAt };
}

function excerpt(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function hasActivityKey(model: CrmModel, key: string): boolean {
  return model.activity.some((a) => a.eventKey === key);
}

export async function ingestCrmEvent(
  folderId: string,
  userId: string,
  event: CrmInboundText
): Promise<CrmEventResult> {
  return withCrmLock(`crm:${folderId}:${event.eventId}`, async () => {
    const crm = await resolveCrm(folderId, userId);
    if (!crm) throw new CrmEventError("CRM not found", 404);
    for (const role of ["contacts", "messages", "activity", "opportunities"] as const) {
      if (!canWrite(crm.access[role])) throw new CrmEventError("Read-only access to this CRM", 403);
    }
    return applyInboundText(crm, userId, event);
  });
}

async function readModel(crm: ResolvedCrm, userId: string): Promise<CrmModel> {
  const snapshot = await loadCrmWorkspace(crm.folderId, userId);
  if (!snapshot) throw new CrmEventError("CRM not found", 404);
  return projectCrm(snapshot);
}

async function applyInboundText(
  crm: ResolvedCrm,
  userId: string,
  event: CrmInboundText
): Promise<CrmEventResult> {
  const { config, tables } = crm;
  const cb = config.columns;
  const opt = config.options;
  const at = event.receivedAt ?? new Date().toISOString();
  let model = await readModel(crm, userId);
  let applied = false;

  // 1. Who sent it — by phone. An unknown number becomes a contact rather
  //    than a dropped message: the operator should see every text.
  const phone = normalizePhone(event.from);
  let contact = model.contacts.find((c) => phone && normalizePhone(c.phone) === phone) ?? null;
  if (!contact) {
    const id = await createRow(tables.contacts, userId, {
      [cb.contacts.name]: `Unknown ${event.from}`,
      [cb.contacts.phone]: event.from,
    });
    applied = true;
    model = await readModel(crm, userId);
    contact = model.contactById.get(id) ?? null;
    if (!contact) throw new CrmEventError("Could not record the sender", 500);
  }

  // 2. Which opportunity it concerns — the shared, inspectable rule.
  const match = matchReplyToOpportunity({
    contactId: contact.id,
    messages: model.messages.filter((m) => m.direction !== "draft"),
    opportunities: model.opportunities,
  });
  const opportunity = match.opportunityId
    ? (model.opportunityById.get(match.opportunityId) ?? null)
    : null;

  // 3. The message row, keyed by the channel's id.
  const externalId = `sms:${event.eventId}`;
  let [messageId] = await findRowIdsByCell(tables.messages, cb.messages.externalId, externalId);
  if (!messageId) {
    messageId = await createRow(
      tables.messages,
      userId,
      {
        [cb.messages.body]: event.body,
        [cb.messages.direction]: opt.direction.inbound,
        [cb.messages.sentAt]: at,
        [cb.messages.externalId]: externalId,
      },
      {
        [cb.messages.contact]: [contact.id],
        ...(opportunity ? { [cb.messages.opportunity]: [opportunity.id] } : {}),
      }
    );
    applied = true;
  }

  // 4. "Received" in the activity history.
  const receivedKey = `msg:${event.eventId}`;
  if (!hasActivityKey(model, receivedKey)) {
    await createRow(
      tables.activity,
      userId,
      {
        [cb.activity.summary]: `Text from ${contact.name}: “${excerpt(event.body)}”`,
        [cb.activity.kind]: opt.activityKind.message,
        [cb.activity.at]: at,
        [cb.activity.eventKey]: receivedKey,
        ...(cb.activity.detail ? { [cb.activity.detail]: match.reason } : {}),
      },
      activityLinks(crm, contact.id, opportunity)
    );
    applied = true;
  }

  // 5. Pause the matching follow-up — once. Only a SCHEDULED follow-up
  //    pauses; an already-paused or finished one is left as the operator set it.
  const pauseKey = `pause:${event.eventId}`;
  let paused = false;
  let automationDetail: string | null = null;
  if (opportunity && opportunity.followUp === "scheduled" && !hasActivityKey(model, pauseKey)) {
    const when = new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const why = `${contact.name} replied on ${when}: “${excerpt(event.body, 80)}” — the scheduled follow-up would talk over them.`;
    await setCells(tables.opportunities, opportunity.id, {
      [cb.opportunities.followUp]: opt.followUp.paused,
      ...(cb.opportunities.followUpNote ? { [cb.opportunities.followUpNote]: why } : {}),
    });
    const outcome = await getCrmAutomation(config).pauseFollowUp(
      {
        ownerId: userId,
        folderId: crm.folderId,
        opportunityId: opportunity.id,
        opportunityTitle: opportunity.title,
        contactId: contact.id,
      },
      why
    );
    automationDetail = outcome.detail;
    await createRow(
      tables.activity,
      userId,
      {
        [cb.activity.summary]: `Follow-up paused: ${contact.name} replied`,
        [cb.activity.kind]: opt.activityKind.followUp,
        [cb.activity.at]: at,
        [cb.activity.eventKey]: pauseKey,
        ...(cb.activity.detail
          ? { [cb.activity.detail]: `${why}\n${match.reason}\n${outcome.detail}` }
          : {}),
      },
      activityLinks(crm, contact.id, opportunity)
    );
    paused = true;
    applied = true;
  }

  return {
    duplicate: !applied,
    contactId: contact.id,
    messageId,
    opportunityId: opportunity?.id ?? null,
    matchReason: match.reason,
    paused,
    automationDetail,
  };
}

/** Activity links: contact, opportunity, and the opportunity's subject. */
export function activityLinks(
  crm: ResolvedCrm,
  contactId: string | null,
  opportunity: { id: string; subjectId: string | null } | null
): Record<string, string[]> {
  const cb = crm.config.columns.activity;
  const links: Record<string, string[]> = {};
  if (contactId) links[cb.contact] = [contactId];
  if (opportunity) {
    links[cb.opportunity] = [opportunity.id];
    // When the subject IS the contact, the subject binding is the contact
    // column and is already set above.
    if (opportunity.subjectId && cb.subject !== cb.contact) {
      links[cb.subject] = [opportunity.subjectId];
    }
  }
  return links;
}
