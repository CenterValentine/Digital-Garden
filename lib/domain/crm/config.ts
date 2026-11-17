/**
 * CRM configuration — what turns a folder of databases into a CRM.
 *
 * Product principle 1 (docs/notes-feature/core/PRODUCT-PRINCIPLES.md): the
 * CRM is a PROJECTION of structure the business already owns — a folder
 * holding ordinary databases (contacts, the service subject, opportunities,
 * messages, activity). Nothing here is a parallel store. The config lives on
 * the business folder at `FolderPayload.viewPrefs.crm` (the same place
 * `treeSort` keeps folder-level behaviour), so it moves, trashes and
 * restores with the folder.
 *
 * What a business configures (the user-facing part):
 *   - `terms`        — its own words: Property/Properties, Vehicle/Vehicles…
 *   - `tables.subjects` — WHICH table fills the service-subject role. It may
 *                      be the contacts table itself: a business that serves
 *                      people directly uses the contact as the subject.
 *   - `subjectFields` — which of the subject's own columns the CRM shows.
 *
 * What setup writes (machine-owned): column and option BINDINGS by id.
 * Ids, never names — a rename in the grid is metadata-only and must not
 * detach the CRM (the same reason DataColumn.key is opaque).
 *
 * Client-safe: no Prisma.
 */

export interface CrmTerm {
  singular: string;
  plural: string;
}

export interface CrmTerms {
  /** The thing the service is performed on: Property, Vehicle, Client… */
  subject: CrmTerm;
  /** The sales unit tracked through stages: Quote, Job, Package… */
  opportunity: CrmTerm;
  contact: CrmTerm;
}

export type CrmTableRole =
  | "contacts"
  | "subjects"
  | "opportunities"
  | "messages"
  | "activity";

export const CRM_TABLE_ROLES: readonly CrmTableRole[] = [
  "contacts",
  "subjects",
  "opportunities",
  "messages",
  "activity",
];

/** Column bindings, by DataColumn.id. Optional roles may be absent. */
export interface CrmColumnBindings {
  contacts: { name: string; phone: string; email?: string };
  subjects: {
    name: string;
    /** Relation → contacts. ABSENT when the subject IS the contact. */
    contact?: string;
    /** Long-form notes shown as their own section in the record view. */
    notes?: string;
  };
  opportunities: {
    title: string;
    stage: string;
    amount?: string;
    nextAction?: string;
    nextActionDate?: string;
    followUp: string;
    followUpDue?: string;
    followUpNote?: string;
    contact: string;
    /** Relation → subjects. EQUALS `contact` when the subject is the contact. */
    subject: string;
  };
  messages: {
    body: string;
    direction: string;
    sentAt: string;
    externalId: string;
    contact: string;
    opportunity: string;
  };
  activity: {
    summary: string;
    kind: string;
    at: string;
    eventKey: string;
    detail?: string;
    contact: string;
    opportunity: string;
    /** Relation → subjects; equals `contact` when the subject is the contact. */
    subject: string;
  };
}

/** Option bindings, by SelectOption.id — the states the CRM itself writes. */
export interface CrmOptionBindings {
  followUp: { scheduled: string; paused: string; done: string };
  direction: { inbound: string; outbound: string; draft: string };
  activityKind: {
    message: string;
    followUp: string;
    stage: string;
    note: string;
    automation: string;
  };
}

export type CrmAutomationEngineId = "simulator" | "n8n";

export interface CrmConfig {
  version: 1;
  /** Which preset set it up — informational; behaviour never branches on it. */
  preset: string;
  terms: CrmTerms;
  tables: Record<CrmTableRole, string>;
  /** Subject columns (ids) the CRM shows on cards, headers and the record. */
  subjectFields: string[];
  columns: CrmColumnBindings;
  options: CrmOptionBindings;
  /** Who executes follow-ups. DG owns the state either way. */
  automation: { engine: CrmAutomationEngineId };
}

/** True when the business serves people directly: the contact IS the subject. */
export function subjectIsContact(config: CrmConfig): boolean {
  return config.tables.subjects === config.tables.contacts;
}

// ── Tolerant read ────────────────────────────────────────────────────────

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function term(value: unknown, fallback: CrmTerm): CrmTerm {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    singular: (str(v.singular) ?? fallback.singular).slice(0, 40),
    plural: (str(v.plural) ?? fallback.plural).slice(0, 40),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Pick `required` + `optional` string keys; null if any required key is missing. */
function pick<T>(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): T | null {
  const v = record(value);
  const out: Record<string, string> = {};
  for (const key of required) {
    const s = str(v[key]);
    if (!s) return null;
    out[key] = s;
  }
  for (const key of optional) {
    const s = str(v[key]);
    if (s) out[key] = s;
  }
  return out as T;
}

/**
 * Read a stored config. Returns null — "this folder is not a CRM" — for
 * anything incomplete, rather than a half-config the views would trip on.
 *
 * NOT an authorization step: a config is user-writable folder state and may
 * name any table id. Every table it names is re-checked against the reader's
 * access on the server (extensions/crm/server/workspace.ts).
 */
export function parseCrmConfig(value: unknown): CrmConfig | null {
  const v = record(value);
  if (v.version !== 1) return null;

  const tablesIn = record(v.tables);
  const tables = {} as Record<CrmTableRole, string>;
  for (const role of CRM_TABLE_ROLES) {
    const id = str(tablesIn[role]);
    if (!id) return null;
    tables[role] = id;
  }

  const c = record(v.columns);
  const columns: CrmColumnBindings | null = (() => {
    const contacts = pick<CrmColumnBindings["contacts"]>(c.contacts, ["name", "phone"], ["email"]);
    const subjects = pick<CrmColumnBindings["subjects"]>(c.subjects, ["name"], ["contact", "notes"]);
    const opportunities = pick<CrmColumnBindings["opportunities"]>(
      c.opportunities,
      ["title", "stage", "followUp", "contact", "subject"],
      ["amount", "nextAction", "nextActionDate", "followUpDue", "followUpNote"]
    );
    const messages = pick<CrmColumnBindings["messages"]>(c.messages, [
      "body",
      "direction",
      "sentAt",
      "externalId",
      "contact",
      "opportunity",
    ]);
    const activity = pick<CrmColumnBindings["activity"]>(
      c.activity,
      ["summary", "kind", "at", "eventKey", "contact", "opportunity", "subject"],
      ["detail"]
    );
    if (!contacts || !subjects || !opportunities || !messages || !activity) return null;
    return { contacts, subjects, opportunities, messages, activity };
  })();
  if (!columns) return null;

  const o = record(v.options);
  const followUp = pick<CrmOptionBindings["followUp"]>(o.followUp, ["scheduled", "paused", "done"]);
  const direction = pick<CrmOptionBindings["direction"]>(o.direction, ["inbound", "outbound", "draft"]);
  const activityKind = pick<CrmOptionBindings["activityKind"]>(o.activityKind, [
    "message",
    "followUp",
    "stage",
    "note",
    "automation",
  ]);
  if (!followUp || !direction || !activityKind) return null;

  const t = record(v.terms);
  const terms: CrmTerms = {
    subject: term(t.subject, { singular: "Subject", plural: "Subjects" }),
    opportunity: term(t.opportunity, { singular: "Opportunity", plural: "Opportunities" }),
    contact: term(t.contact, { singular: "Contact", plural: "Contacts" }),
  };

  const subjectFields = Array.isArray(v.subjectFields)
    ? v.subjectFields.filter((f): f is string => typeof f === "string").slice(0, 20)
    : [];

  const engine = record(v.automation).engine === "n8n" ? "n8n" : "simulator";

  return {
    version: 1,
    preset: str(v.preset) ?? "custom",
    terms,
    tables,
    subjectFields,
    columns,
    options: { followUp, direction, activityKind },
    automation: { engine },
  };
}

/** The viewPrefs key the config lives under. */
export const CRM_VIEW_PREFS_KEY = "crm";
