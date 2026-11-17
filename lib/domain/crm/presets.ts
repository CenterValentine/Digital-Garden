/**
 * CRM presets — the starter databases a business folder gets on setup.
 *
 * ONE builder makes every preset. A preset contributes only what is truly
 * the business's own: its words (terms), its subject's columns (a yard
 * service's gate instructions, a detailer's make and model), its stages,
 * and whether the subject is a separate table at all. The CRM machinery
 * columns (follow-up state, message direction, activity event keys) are the
 * same everywhere, which is what lets one record view and one pipeline
 * serve every business.
 *
 * Output is plain data: a table list in the shape `applyLinkedSchema`
 * takes (see extensions/crm/server/setup.ts) plus the bindings BY COLUMN
 * NAME that setup turns into id bindings once the columns exist.
 *
 * Client-safe: no Prisma.
 */

import type { DataColumnConfig, DataColumnType, StatusGroup } from "@/lib/domain/data";
import type { CrmColumnBindings, CrmTableRole, CrmTerms } from "./config";

export interface CrmPresetColumn {
  name: string;
  type: DataColumnType;
  primary?: boolean;
  description?: string;
  options?: Array<{ label: string; color?: string; group?: StatusGroup }>;
  /** `relation` — the role of the target table. */
  target?: CrmTableRole;
  backlinkName?: string;
  /** Applied after creation (currency, includeTime) — linked specs carry no config. */
  config?: Partial<DataColumnConfig>;
}

export interface CrmPresetTable {
  role: CrmTableRole;
  title: string;
  description: string;
  columns: CrmPresetColumn[];
}

/** Bindings by column NAME; setup resolves them to ids. */
export type CrmNameBindings = {
  [R in keyof CrmColumnBindings]: { [K in keyof CrmColumnBindings[R]]: string };
};

export interface CrmPreset {
  id: string;
  label: string;
  description: string;
  terms: CrmTerms;
  /** When true there is no subjects table — the contacts table fills the role. */
  subjectIsContact: boolean;
  tables: CrmPresetTable[];
  bindings: CrmNameBindings;
  /** Subject columns shown by the CRM, by name. */
  subjectFields: string[];
  /** Option LABELS the CRM writes; setup resolves them to option ids. */
  optionLabels: {
    followUp: { scheduled: string; paused: string; done: string };
    direction: { inbound: string; outbound: string; draft: string };
    activityKind: {
      message: string;
      followUp: string;
      stage: string;
      note: string;
      automation: string;
    };
  };
}

export interface CrmStageSpec {
  label: string;
  group: StatusGroup;
  color?: string;
}

interface BuildPresetInput {
  id: string;
  label: string;
  description: string;
  terms: CrmTerms;
  subjectIsContact: boolean;
  /** The business's own subject columns (not the name, not the contact link). */
  subjectColumns: CrmPresetColumn[];
  /** Which subject columns the CRM shows (names; may include contact columns when subjectIsContact). */
  subjectFields: string[];
  /** Name of a longText subject column shown as its own "notes" section. */
  notesColumn?: string;
  stages: CrmStageSpec[];
}

const FOLLOW_UP = { scheduled: "Scheduled", paused: "Paused", done: "Done" } as const;
const DIRECTION = { inbound: "Inbound", outbound: "Outbound", draft: "Draft" } as const;
const KIND = {
  message: "Message",
  followUp: "Follow-up",
  stage: "Stage",
  note: "Note",
  automation: "Automation",
} as const;

export function buildCrmPreset(input: BuildPresetInput): CrmPreset {
  const { terms, subjectIsContact } = input;
  const contactName = terms.contact.singular;
  const oppSingular = terms.opportunity.singular;
  const subjectSingular = terms.subject.singular;
  // When the contact IS the subject there is no subjects table, and every
  // "→ subject" binding below points at the contact relation instead.

  const contacts: CrmPresetTable = {
    role: "contacts",
    title: terms.contact.plural,
    description: `People ${input.label} talks to. Phone numbers match incoming texts.`,
    columns: [
      { name: "Name", type: "text", primary: true },
      {
        name: "Phone",
        type: "text",
        description: "Incoming texts are matched to a contact by this number.",
      },
      { name: "Email", type: "email" },
      ...(subjectIsContact ? input.subjectColumns : []),
    ],
  };

  const subjects: CrmPresetTable | null = subjectIsContact
    ? null
    : {
        role: "subjects",
        title: terms.subject.plural,
        description: `The ${terms.subject.plural.toLowerCase()} ${input.label} services. Each keeps its own history.`,
        columns: [
          { name: "Name", type: "text", primary: true },
          ...input.subjectColumns,
          {
            name: contactName,
            type: "relation",
            target: "contacts",
            backlinkName: terms.subject.plural,
          },
        ],
      };

  const opportunities: CrmPresetTable = {
    role: "opportunities",
    title: terms.opportunity.plural,
    description: `${terms.opportunity.plural} moving through the pipeline. Follow-up state is owned here; the automation executor only carries it out.`,
    columns: [
      { name: "Title", type: "text", primary: true },
      {
        name: "Stage",
        type: "status",
        options: input.stages.map((s) => ({ label: s.label, group: s.group, color: s.color })),
      },
      { name: "Amount", type: "number", config: { numberFormat: "currency", currencyCode: "USD", precision: 2 } },
      { name: "Next action", type: "text" },
      { name: "Next action date", type: "date" },
      {
        name: "Follow-up",
        type: "select",
        description: "Scheduled = the executor will send it; Paused = held, see Follow-up note for why.",
        options: [
          { label: FOLLOW_UP.scheduled, color: "primary" },
          { label: FOLLOW_UP.paused, color: "warning" },
          { label: FOLLOW_UP.done, color: "success" },
        ],
      },
      { name: "Follow-up due", type: "date" },
      { name: "Follow-up note", type: "text", description: "Why the follow-up is in its current state." },
      { name: contactName, type: "relation", target: "contacts", backlinkName: terms.opportunity.plural },
      ...(subjectIsContact
        ? []
        : [
            {
              name: subjectSingular,
              type: "relation" as const,
              target: "subjects" as const,
              backlinkName: terms.opportunity.plural,
            },
          ]),
    ],
  };

  const messages: CrmPresetTable = {
    role: "messages",
    title: "Messages",
    description: "Texts to and from contacts, plus unsent reply drafts.",
    columns: [
      { name: "Message", type: "text", primary: true },
      {
        name: "Direction",
        type: "select",
        options: [
          { label: DIRECTION.inbound, color: "primary" },
          { label: DIRECTION.outbound, color: "neutral" },
          { label: DIRECTION.draft, color: "warning" },
        ],
      },
      { name: "Sent at", type: "date", config: { includeTime: true } },
      {
        name: "External id",
        type: "text",
        description: "The channel's message id. One inbound event = one row, however often it is replayed.",
      },
      { name: contactName, type: "relation", target: "contacts", backlinkName: "Messages" },
      { name: oppSingular, type: "relation", target: "opportunities", backlinkName: "Messages" },
    ],
  };

  const activity: CrmPresetTable = {
    role: "activity",
    title: "Activity",
    description: "What happened and why — messages, follow-up changes, stage moves, automation.",
    columns: [
      { name: "Summary", type: "text", primary: true },
      {
        name: "Kind",
        type: "select",
        options: [
          { label: KIND.message },
          { label: KIND.followUp },
          { label: KIND.stage },
          { label: KIND.note },
          { label: KIND.automation },
        ],
      },
      { name: "At", type: "date", config: { includeTime: true } },
      {
        name: "Event key",
        type: "text",
        description: "Idempotency key: an event that already has an entry here is not applied again.",
      },
      { name: "Detail", type: "longText" },
      { name: contactName, type: "relation", target: "contacts", backlinkName: "Activity" },
      { name: oppSingular, type: "relation", target: "opportunities", backlinkName: "Activity" },
      ...(subjectIsContact
        ? []
        : [
            {
              name: subjectSingular,
              type: "relation" as const,
              target: "subjects" as const,
              backlinkName: "Activity",
            },
          ]),
    ],
  };

  const tables = [contacts, ...(subjects ? [subjects] : []), opportunities, messages, activity];

  const bindings: CrmNameBindings = {
    contacts: { name: "Name", phone: "Phone", email: "Email" },
    subjects: {
      name: "Name",
      ...(subjectIsContact ? {} : { contact: contactName }),
      ...(input.notesColumn ? { notes: input.notesColumn } : {}),
    },
    opportunities: {
      title: "Title",
      stage: "Stage",
      amount: "Amount",
      nextAction: "Next action",
      nextActionDate: "Next action date",
      followUp: "Follow-up",
      followUpDue: "Follow-up due",
      followUpNote: "Follow-up note",
      contact: contactName,
      subject: subjectIsContact ? contactName : subjectSingular,
    },
    messages: {
      body: "Message",
      direction: "Direction",
      sentAt: "Sent at",
      externalId: "External id",
      contact: contactName,
      opportunity: oppSingular,
    },
    activity: {
      summary: "Summary",
      kind: "Kind",
      at: "At",
      eventKey: "Event key",
      detail: "Detail",
      contact: contactName,
      opportunity: oppSingular,
      subject: subjectIsContact ? contactName : subjectSingular,
    },
  };

  return {
    id: input.id,
    label: input.label,
    description: input.description,
    terms,
    subjectIsContact,
    tables,
    bindings,
    subjectFields: input.subjectFields,
    optionLabels: { followUp: FOLLOW_UP, direction: DIRECTION, activityKind: KIND },
  };
}

// ── The presets this milestone ships ─────────────────────────────────────

const SERVICE_STAGES: CrmStageSpec[] = [
  { label: "New lead", group: "todo", color: "neutral" },
  { label: "Quoted", group: "active", color: "primary" },
  { label: "Scheduled", group: "active", color: "primary" },
  { label: "Won", group: "done", color: "success" },
  { label: "Lost", group: "done", color: "danger" },
];

/** Property-based field service — Barefoot Yard Co. is the first user. */
export const YARD_SERVICE_PRESET = buildCrmPreset({
  id: "property-service",
  label: "Property service",
  description: "Service performed at a customer's property: yards, lots, rentals.",
  terms: {
    subject: { singular: "Property", plural: "Properties" },
    opportunity: { singular: "Quote", plural: "Quotes" },
    contact: { singular: "Contact", plural: "Contacts" },
  },
  subjectIsContact: false,
  subjectColumns: [
    { name: "Address", type: "text" },
    {
      name: "Gate instructions",
      type: "longText",
      description: "How the crew gets in. Shown wherever this property is.",
    },
    { name: "Lot size", type: "text" },
    { name: "Field notes", type: "longText", description: "What the crew saw on site." },
  ],
  subjectFields: ["Address", "Gate instructions", "Lot size"],
  notesColumn: "Field notes",
  stages: SERVICE_STAGES,
});

/** Same record view, different subject: a mobile detailer services vehicles. */
export const VEHICLE_SERVICE_PRESET = buildCrmPreset({
  id: "vehicle-service",
  label: "Vehicle service",
  description: "Service performed on a customer's vehicle.",
  terms: {
    subject: { singular: "Vehicle", plural: "Vehicles" },
    opportunity: { singular: "Quote", plural: "Quotes" },
    contact: { singular: "Contact", plural: "Contacts" },
  },
  subjectIsContact: false,
  subjectColumns: [
    { name: "Make", type: "text" },
    { name: "Model", type: "text" },
    { name: "Year", type: "number", config: { precision: 0, useGrouping: false } },
    { name: "Parking notes", type: "longText", description: "Where the vehicle is and how to reach it." },
    { name: "Field notes", type: "longText" },
  ],
  subjectFields: ["Make", "Model", "Year", "Parking notes"],
  notesColumn: "Field notes",
  stages: SERVICE_STAGES,
});

/** A business that serves people directly: the contact IS the subject. */
export const PERSON_SERVICE_PRESET = buildCrmPreset({
  id: "person-service",
  label: "Personal service",
  description: "Service delivered to the client themselves — lessons, coaching, care.",
  terms: {
    subject: { singular: "Client", plural: "Clients" },
    opportunity: { singular: "Package", plural: "Packages" },
    contact: { singular: "Client", plural: "Clients" },
  },
  subjectIsContact: true,
  subjectColumns: [
    { name: "Preferred time", type: "text" },
    { name: "Session notes", type: "longText" },
  ],
  subjectFields: ["Phone", "Email", "Preferred time"],
  notesColumn: "Session notes",
  stages: [
    { label: "Inquiry", group: "todo", color: "neutral" },
    { label: "Offered", group: "active", color: "primary" },
    { label: "Enrolled", group: "done", color: "success" },
    { label: "Declined", group: "done", color: "danger" },
  ],
});

export const CRM_PRESETS: readonly CrmPreset[] = [
  YARD_SERVICE_PRESET,
  VEHICLE_SERVICE_PRESET,
  PERSON_SERVICE_PRESET,
];

export function findCrmPreset(id: string): CrmPreset | undefined {
  return CRM_PRESETS.find((p) => p.id === id);
}
