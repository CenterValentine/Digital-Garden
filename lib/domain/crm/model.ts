/**
 * The CRM read model — raw database rows projected into conversations, a
 * pipeline and subject records.
 *
 * Pure and client-safe. The server ships a snapshot of the five bound tables
 * (columns + hydrated rows, already access-checked); every view projects it
 * through THIS module, so the inbox, the pipeline and the record workspace
 * cannot disagree about which quote a text concerns or what stage a quote is
 * in. The event ingester uses the same `matchReplyToOpportunity`.
 */

import type { DataColumn, DataRow, SelectOption, StatusGroup } from "@/lib/domain/data";
import type { CrmConfig, CrmTableRole } from "./config";

// ── Snapshot (what the server sends) ─────────────────────────────────────

/** Mirrors DataAccessLevel (lib/domain/data/server/access.ts — server-only). */
export type CrmAccessLevel = "none" | "read" | "write" | "owner";

export interface CrmTableSnapshot {
  id: string;
  title: string;
  access: CrmAccessLevel;
  columns: DataColumn[];
  rows: DataRow[];
}

export interface CrmWorkspaceSnapshot {
  folderId: string;
  businessName: string;
  config: CrmConfig;
  /** When the subject is the contact, `subjects` is the contacts snapshot. */
  tables: Record<CrmTableRole, CrmTableSnapshot>;
  automation: { engine: string; label: string; simulated: boolean };
  /** True when a table held more rows than one snapshot carries. */
  truncated: boolean;
  loadedAt: string;
}

// ── Projected shapes ─────────────────────────────────────────────────────

export type CrmFollowUpState = "scheduled" | "paused" | "done";
export type CrmDirection = "inbound" | "outbound" | "draft";

export interface CrmContact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface CrmSubjectField {
  column: DataColumn;
  display: string;
}

export interface CrmSubject {
  id: string;
  name: string;
  contactId: string | null;
  fields: CrmSubjectField[];
  notes: string | null;
  row: DataRow;
}

export interface CrmOpportunity {
  id: string;
  title: string;
  stage: SelectOption | null;
  stageGroup: StatusGroup | null;
  amount: number | null;
  nextAction: string | null;
  nextActionDate: string | null;
  followUp: CrmFollowUpState | null;
  followUpLabel: string | null;
  followUpDue: string | null;
  followUpNote: string | null;
  contactId: string | null;
  subjectId: string | null;
}

export interface CrmMessage {
  id: string;
  body: string;
  direction: CrmDirection | null;
  sentAt: string | null;
  externalId: string | null;
  contactId: string | null;
  opportunityId: string | null;
}

export interface CrmActivity {
  id: string;
  summary: string;
  kind: string | null;
  at: string | null;
  eventKey: string | null;
  detail: string | null;
  contactId: string | null;
  opportunityId: string | null;
  subjectId: string | null;
}

export interface CrmConversation {
  contact: CrmContact;
  /** Sent and received, oldest first. Drafts are separate. */
  messages: CrmMessage[];
  draft: CrmMessage | null;
  lastAt: string | null;
  /** The last real message came FROM the contact — the operator owes a reply. */
  awaitingReply: boolean;
  opportunity: CrmOpportunity | null;
  subject: CrmSubject | null;
  /** Why `opportunity` was chosen, in words the operator can check. */
  opportunityReason: string;
}

export interface CrmModel {
  snapshot: CrmWorkspaceSnapshot;
  contacts: CrmContact[];
  subjects: CrmSubject[];
  opportunities: CrmOpportunity[];
  messages: CrmMessage[];
  activity: CrmActivity[];
  contactById: Map<string, CrmContact>;
  subjectById: Map<string, CrmSubject>;
  opportunityById: Map<string, CrmOpportunity>;
  stages: SelectOption[];
  conversations: CrmConversation[];
}

// ── Cell readers ─────────────────────────────────────────────────────────

function columnById(table: CrmTableSnapshot, columnId: string | undefined): DataColumn | null {
  if (!columnId) return null;
  return table.columns.find((c) => c.id === columnId) ?? null;
}

function cell(row: DataRow, column: DataColumn | null): unknown {
  return column ? row.data[column.key] : undefined;
}

function text(row: DataRow, column: DataColumn | null): string | null {
  const v = cell(row, column);
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (typeof v === "number") return String(v);
  return null;
}

function num(row: DataRow, column: DataColumn | null): number | null {
  const v = cell(row, column);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function option(row: DataRow, column: DataColumn | null): SelectOption | null {
  const v = cell(row, column);
  if (typeof v !== "string" || !column) return null;
  return column.config.options?.find((o) => o.id === v) ?? null;
}

/** First linked row id of a relation cell (links are hydrated by column id). */
function firstLink(row: DataRow, columnId: string | undefined): string | null {
  if (!columnId) return null;
  const links = row.links?.[columnId];
  return links && links.length > 0 ? links[0].rowId : null;
}

/** A cell rendered for reading: option labels, joined lists, plain values. */
export function displayCell(row: DataRow, column: DataColumn): string {
  const v = row.data[column.key];
  if (v === undefined || v === null || v === "") {
    const links = row.links?.[column.id];
    return links?.map((l) => (l.restricted ? "Restricted" : l.title)).join(", ") ?? "";
  }
  if (column.type === "select" || column.type === "status") {
    return column.config.options?.find((o) => o.id === v)?.label ?? "";
  }
  if (column.type === "multiSelect" && Array.isArray(v)) {
    return v
      .map((id) => column.config.options?.find((o) => o.id === id)?.label)
      .filter(Boolean)
      .join(", ");
  }
  if (column.type === "checkbox") return v ? "Yes" : "No";
  return String(v);
}

function byTime(a: string | null, b: string | null): number {
  return (a ? Date.parse(a) : 0) - (b ? Date.parse(b) : 0);
}

// ── Reply → opportunity ──────────────────────────────────────────────────

export interface ReplyMatchInput {
  contactId: string;
  /** Every non-draft message on file (any contact — filtered here). */
  messages: Pick<CrmMessage, "contactId" | "direction" | "sentAt" | "opportunityId">[];
  opportunities: Pick<
    CrmOpportunity,
    "id" | "title" | "contactId" | "followUp" | "stageGroup"
  >[];
}

export interface ReplyMatch {
  opportunityId: string | null;
  reason: string;
}

/**
 * Which opportunity does a contact's incoming text concern?
 *
 * The rule, in order — each step is one the operator can verify by looking
 * at the thread:
 *  1. A reply answers what WE last sent: the most recent outbound message to
 *     this contact that is linked to an opportunity.
 *  2. Otherwise, the contact's single OPEN opportunity (stage not done) that
 *     has a follow-up in flight (scheduled or paused).
 *  3. Otherwise — none, or several equally plausible — no match. Guessing
 *     wrong would pause the wrong customer's follow-up (a rental's, say), so
 *     an ambiguous reply is left for the operator instead.
 */
export function matchReplyToOpportunity(input: ReplyMatchInput): ReplyMatch {
  const mine = input.opportunities.filter((o) => o.contactId === input.contactId);
  const known = new Set(mine.map((o) => o.id));

  const lastOutbound = input.messages
    .filter(
      (m) =>
        m.contactId === input.contactId &&
        m.direction === "outbound" &&
        m.opportunityId &&
        known.has(m.opportunityId)
    )
    .sort((a, b) => byTime(b.sentAt, a.sentAt))[0];
  if (lastOutbound?.opportunityId) {
    const opp = mine.find((o) => o.id === lastOutbound.opportunityId);
    return {
      opportunityId: lastOutbound.opportunityId,
      reason: `Reply to the last text we sent about “${opp?.title ?? "this opportunity"}”.`,
    };
  }

  const inFlight = mine.filter(
    (o) => o.stageGroup !== "done" && (o.followUp === "scheduled" || o.followUp === "paused")
  );
  if (inFlight.length === 1) {
    return {
      opportunityId: inFlight[0].id,
      reason: `Only open item with a follow-up in flight: “${inFlight[0].title}”.`,
    };
  }
  return {
    opportunityId: null,
    reason:
      inFlight.length > 1
        ? "Several open items have follow-ups in flight — left for you to choose."
        : "No open item with a follow-up for this contact.",
  };
}

// ── Projection ───────────────────────────────────────────────────────────

export function projectCrm(snapshot: CrmWorkspaceSnapshot): CrmModel {
  const { config, tables } = snapshot;
  const cb = config.columns;

  const t = tables;
  const contactCols = {
    name: columnById(t.contacts, cb.contacts.name),
    phone: columnById(t.contacts, cb.contacts.phone),
    email: columnById(t.contacts, cb.contacts.email),
  };
  const contacts: CrmContact[] = t.contacts.rows.map((row) => ({
    id: row.id,
    name: text(row, contactCols.name) ?? "Unnamed",
    phone: text(row, contactCols.phone),
    email: text(row, contactCols.email),
  }));

  const subjectFieldCols = config.subjectFields
    .map((id) => columnById(t.subjects, id))
    .filter((c): c is DataColumn => c !== null);
  const subjectName = columnById(t.subjects, cb.subjects.name);
  const subjectNotes = columnById(t.subjects, cb.subjects.notes);
  const subjectIsContact = t.subjects.id === t.contacts.id;
  const subjects: CrmSubject[] = t.subjects.rows.map((row) => ({
    id: row.id,
    name: text(row, subjectName) ?? "Unnamed",
    contactId: subjectIsContact ? row.id : firstLink(row, cb.subjects.contact),
    fields: subjectFieldCols.map((column) => ({ column, display: displayCell(row, column) })),
    notes: text(row, subjectNotes),
    row,
  }));

  const stageCol = columnById(t.opportunities, cb.opportunities.stage);
  const followCol = columnById(t.opportunities, cb.opportunities.followUp);
  const o = config.options;
  const followState = (id: string | undefined): CrmFollowUpState | null =>
    id === o.followUp.scheduled
      ? "scheduled"
      : id === o.followUp.paused
        ? "paused"
        : id === o.followUp.done
          ? "done"
          : null;
  const opportunities: CrmOpportunity[] = t.opportunities.rows.map((row) => {
    const stage = option(row, stageCol);
    const follow = option(row, followCol);
    return {
      id: row.id,
      title: text(row, columnById(t.opportunities, cb.opportunities.title)) ?? "Untitled",
      stage,
      stageGroup: stage?.group ?? null,
      amount: num(row, columnById(t.opportunities, cb.opportunities.amount)),
      nextAction: text(row, columnById(t.opportunities, cb.opportunities.nextAction)),
      nextActionDate: text(row, columnById(t.opportunities, cb.opportunities.nextActionDate)),
      followUp: followState(follow?.id),
      followUpLabel: follow?.label ?? null,
      followUpDue: text(row, columnById(t.opportunities, cb.opportunities.followUpDue)),
      followUpNote: text(row, columnById(t.opportunities, cb.opportunities.followUpNote)),
      contactId: firstLink(row, cb.opportunities.contact),
      subjectId: firstLink(row, cb.opportunities.subject),
    };
  });

  const dirCol = columnById(t.messages, cb.messages.direction);
  const dirState = (id: string | undefined): CrmDirection | null =>
    id === o.direction.inbound
      ? "inbound"
      : id === o.direction.outbound
        ? "outbound"
        : id === o.direction.draft
          ? "draft"
          : null;
  const messages: CrmMessage[] = t.messages.rows.map((row) => ({
    id: row.id,
    body: text(row, columnById(t.messages, cb.messages.body)) ?? "",
    direction: dirState(option(row, dirCol)?.id),
    sentAt: text(row, columnById(t.messages, cb.messages.sentAt)),
    externalId: text(row, columnById(t.messages, cb.messages.externalId)),
    contactId: firstLink(row, cb.messages.contact),
    opportunityId: firstLink(row, cb.messages.opportunity),
  }));

  const kindCol = columnById(t.activity, cb.activity.kind);
  const activity: CrmActivity[] = t.activity.rows
    .map((row) => ({
      id: row.id,
      summary: text(row, columnById(t.activity, cb.activity.summary)) ?? "",
      kind: option(row, kindCol)?.label ?? null,
      at: text(row, columnById(t.activity, cb.activity.at)) ?? row.createdAt,
      eventKey: text(row, columnById(t.activity, cb.activity.eventKey)),
      detail: text(row, columnById(t.activity, cb.activity.detail)),
      contactId: firstLink(row, cb.activity.contact),
      opportunityId: firstLink(row, cb.activity.opportunity),
      subjectId: firstLink(row, cb.activity.subject),
    }))
    .sort((a, b) => byTime(b.at, a.at));

  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const opportunityById = new Map(opportunities.map((x) => [x.id, x]));

  const stages = stageCol?.config.options ?? [];

  const realMessages = messages.filter((m) => m.direction !== "draft");
  const conversations: CrmConversation[] = contacts
    .map((contact) => {
      const thread = realMessages
        .filter((m) => m.contactId === contact.id)
        .sort((a, b) => byTime(a.sentAt, b.sentAt));
      const draft =
        messages.find((m) => m.direction === "draft" && m.contactId === contact.id) ?? null;
      if (thread.length === 0 && !draft) return null;
      const last = thread.at(-1) ?? null;

      // The conversation concerns what the latest linked message names;
      // with no linked message, fall back to the reply-matching rule.
      const lastLinked = [...thread].reverse().find((m) => m.opportunityId);
      const match: ReplyMatch = lastLinked?.opportunityId
        ? {
            opportunityId: lastLinked.opportunityId,
            reason:
              lastLinked.direction === "inbound"
                ? "Their latest text was matched to this item when it arrived."
                : "Our latest text was about this item.",
          }
        : matchReplyToOpportunity({ contactId: contact.id, messages: realMessages, opportunities });
      const opportunity = match.opportunityId
        ? (opportunityById.get(match.opportunityId) ?? null)
        : null;
      const subject = opportunity?.subjectId
        ? (subjectById.get(opportunity.subjectId) ?? null)
        : null;
      return {
        contact,
        messages: thread,
        draft,
        lastAt: last?.sentAt ?? draft?.sentAt ?? null,
        awaitingReply: last?.direction === "inbound",
        opportunity,
        subject,
        opportunityReason: match.reason,
      } satisfies CrmConversation;
    })
    .filter((c): c is CrmConversation => c !== null)
    .sort((a, b) => byTime(b.lastAt, a.lastAt));

  return {
    snapshot,
    contacts,
    subjects,
    opportunities,
    messages,
    activity,
    contactById,
    subjectById,
    opportunityById,
    stages,
    conversations,
  };
}

/** Everything the record workspace shows for one subject. */
export interface CrmSubjectRecord {
  subject: CrmSubject;
  contact: CrmContact | null;
  opportunities: CrmOpportunity[];
  activity: CrmActivity[];
}

/**
 * One subject's own history. Activity belongs to a subject when it names the
 * subject or one of the subject's opportunities — a contact-level entry
 * (a text with no opportunity) is NOT pulled in, which is what keeps a
 * customer's rental history separate from their home's.
 */
export function subjectRecord(model: CrmModel, subjectId: string): CrmSubjectRecord | null {
  const subject = model.subjectById.get(subjectId);
  if (!subject) return null;
  const opportunities = model.opportunities.filter((x) => x.subjectId === subjectId);
  const oppIds = new Set(opportunities.map((x) => x.id));
  const subjectIsContact = model.snapshot.tables.subjects.id === model.snapshot.tables.contacts.id;
  const activity = model.activity.filter(
    (a) =>
      a.subjectId === subjectId ||
      (a.opportunityId !== null && oppIds.has(a.opportunityId)) ||
      (subjectIsContact && a.contactId === subjectId)
  );
  return {
    subject,
    contact: subject.contactId ? (model.contactById.get(subject.contactId) ?? null) : null,
    opportunities,
    activity,
  };
}

/** Pipeline lanes in status-group order (todo → active → done), options in their own order. */
export function pipelineLanes(model: CrmModel): Array<{ stage: SelectOption; items: CrmOpportunity[] }> {
  const order: Record<string, number> = { todo: 0, active: 1, done: 2 };
  return model.stages
    .map((stage, i) => ({ stage, i }))
    .sort((a, b) => (order[a.stage.group ?? ""] ?? 3) - (order[b.stage.group ?? ""] ?? 3) || a.i - b.i)
    .map(({ stage }) => ({
      stage,
      items: model.opportunities.filter((x) => x.stage?.id === stage.id),
    }));
}

/** Digits only, last 10 — enough to match "+1 (435) 555-0142" to "435-555-0142". */
export function normalizePhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}
