/**
 * CRM demo fixtures — fictional businesses for the CRM workspace.
 *
 *  - Barefoot Yard Co. (Property)   — Tess Walker's home + rental scenario
 *  - Redrock Mobile Detailing (Vehicle) — same record view, make/model fields
 *  - Hartley Piano Studio (contact as subject) — a business serving people
 *
 * Setup and every row go through the CRM's own server code (setup.ts,
 * writes.ts); Tess's "Saturday works…" text arrives through the real event
 * seam (`ingestCrmEvent`), so the follow-up pause in the demo is produced by
 * the same path n8n will feed — not written by hand.
 *
 * LOCAL ONLY: refuses any DATABASE_URL that is not localhost.
 *
 *   pnpm crm:demo                         # create (skips businesses that exist)
 *   pnpm crm:demo --reset                 # delete the demo businesses, then create
 *   pnpm crm:demo --cleanup               # delete the demo businesses
 *   pnpm crm:demo --owner you@example.com # default: the first owner-role user
 *   pnpm crm:demo --no-reply              # leave Tess's text for the simulator
 */

import { prisma } from "../lib/database/client";
import { createCrmBusiness } from "../extensions/crm/server/setup";
import { resolveCrm, type ResolvedCrm } from "../extensions/crm/server/workspace";
import { createRow } from "../extensions/crm/server/writes";
import { activityLinks, ingestCrmEvent } from "../extensions/crm/server/events";
import type { CrmConfig } from "../lib/domain/crm/config";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const ownerArg = (() => {
  const i = args.indexOf("--owner");
  return i >= 0 ? args[i + 1] : null;
})();

export const TESS_REPLY_EVENT_ID = "demo-sms-tess-0001";

function localOnly() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    console.error("Refusing: DATABASE_URL is not localhost. The CRM demo seeds the local database only.");
    process.exit(2);
  }
}

async function resolveOwner(): Promise<{ id: string; email: string }> {
  const user = ownerArg
    ? await prisma.user.findFirst({ where: { email: ownerArg }, select: { id: true, email: true } })
    : await prisma.user.findFirst({
        where: { role: "owner" },
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true },
      });
  if (!user) {
    console.error(ownerArg ? `No user with email ${ownerArg}.` : "No owner-role user; pass --owner.");
    process.exit(2);
  }
  return user;
}

const BUSINESSES = ["Barefoot Yard Co.", "Redrock Mobile Detailing", "Hartley Piano Studio"];

async function existing(ownerId: string) {
  return prisma.contentNode.findMany({
    where: { ownerId, contentType: "folder", deletedAt: null, title: { in: BUSINESSES } },
    select: { id: true, title: true },
  });
}

/** Delete a demo business folder and everything inside it (tables cascade their rows). */
async function removeBusiness(folderId: string) {
  const children = await prisma.contentNode.findMany({
    where: { parentId: folderId },
    select: { id: true },
  });
  const ids = children.map((c) => c.id);
  // Relation links Restrict on column delete; drop them with their rows first.
  await prisma.dataRowLink.deleteMany({ where: { from: { tableId: { in: ids } } } });
  await prisma.contentNode.deleteMany({ where: { id: { in: ids } } });
  await prisma.contentNode.delete({ where: { id: folderId } });
}

// ── Small row helpers over the CRM write path ────────────────────────────

interface Ctx {
  crm: ResolvedCrm;
  owner: string;
}

const c = (ctx: Ctx) => ctx.crm.config.columns;
const o = (ctx: Ctx) => ctx.crm.config.options;

async function contact(ctx: Ctx, name: string, phone: string, email?: string, extra: Record<string, unknown> = {}) {
  return createRow(ctx.crm.tables.contacts, ctx.owner, {
    [c(ctx).contacts.name]: name,
    [c(ctx).contacts.phone]: phone,
    ...(email && c(ctx).contacts.email ? { [c(ctx).contacts.email!]: email } : {}),
    ...extra,
  });
}

/** Subject cells by COLUMN NAME (the business's own fields). */
function subjectCells(ctx: Ctx, fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(fields)) {
    const column = ctx.crm.tables.subjects.columns.find((col) => col.name === name);
    if (!column) throw new Error(`No subject column “${name}”`);
    out[column.id] = value;
  }
  return out;
}

async function subject(ctx: Ctx, name: string, contactId: string, fields: Record<string, unknown>) {
  const cb = c(ctx).subjects;
  return createRow(
    ctx.crm.tables.subjects,
    ctx.owner,
    { [cb.name]: name, ...subjectCells(ctx, fields) },
    cb.contact ? { [cb.contact]: [contactId] } : {}
  );
}

function stageId(ctx: Ctx, label: string): string {
  const col = ctx.crm.tables.opportunities.columns.find((x) => x.id === c(ctx).opportunities.stage)!;
  const opt = col.config.options?.find((x) => x.label === label);
  if (!opt) throw new Error(`No stage “${label}”`);
  return opt.id;
}

async function opportunity(
  ctx: Ctx,
  input: {
    title: string;
    stage: string;
    amount?: number;
    nextAction?: string;
    nextActionDate?: string;
    followUp?: keyof CrmConfig["options"]["followUp"];
    followUpDue?: string;
    followUpNote?: string;
    contactId: string;
    subjectId: string;
  }
) {
  const cb = c(ctx).opportunities;
  const cells: Record<string, unknown> = {
    [cb.title]: input.title,
    [cb.stage]: stageId(ctx, input.stage),
  };
  if (input.amount !== undefined && cb.amount) cells[cb.amount] = input.amount;
  if (input.nextAction && cb.nextAction) cells[cb.nextAction] = input.nextAction;
  if (input.nextActionDate && cb.nextActionDate) cells[cb.nextActionDate] = input.nextActionDate;
  if (input.followUp) cells[cb.followUp] = o(ctx).followUp[input.followUp];
  if (input.followUpDue && cb.followUpDue) cells[cb.followUpDue] = input.followUpDue;
  if (input.followUpNote && cb.followUpNote) cells[cb.followUpNote] = input.followUpNote;
  const links: Record<string, string[]> = { [cb.contact]: [input.contactId] };
  if (cb.subject !== cb.contact) links[cb.subject] = [input.subjectId];
  return createRow(ctx.crm.tables.opportunities, ctx.owner, cells, links);
}

async function message(
  ctx: Ctx,
  input: { body: string; direction: "inbound" | "outbound"; at: string; contactId: string; opportunityId?: string; externalId: string }
) {
  const cb = c(ctx).messages;
  return createRow(
    ctx.crm.tables.messages,
    ctx.owner,
    {
      [cb.body]: input.body,
      [cb.direction]: o(ctx).direction[input.direction],
      [cb.sentAt]: input.at,
      [cb.externalId]: input.externalId,
    },
    {
      [cb.contact]: [input.contactId],
      ...(input.opportunityId ? { [cb.opportunity]: [input.opportunityId] } : {}),
    }
  );
}

async function activity(
  ctx: Ctx,
  input: {
    summary: string;
    kind: keyof CrmConfig["options"]["activityKind"];
    at: string;
    key: string;
    detail?: string;
    contactId: string;
    opportunityId?: string;
    subjectId?: string;
  }
) {
  const cb = c(ctx).activity;
  return createRow(
    ctx.crm.tables.activity,
    ctx.owner,
    {
      [cb.summary]: input.summary,
      [cb.kind]: o(ctx).activityKind[input.kind],
      [cb.at]: input.at,
      [cb.eventKey]: input.key,
      ...(input.detail && cb.detail ? { [cb.detail]: input.detail } : {}),
    },
    activityLinks(
      ctx.crm,
      input.contactId,
      input.opportunityId ? { id: input.opportunityId, subjectId: input.subjectId ?? null } : null
    )
  );
}

async function open(folderId: string, owner: string): Promise<Ctx> {
  const crm = await resolveCrm(folderId, owner);
  if (!crm) throw new Error("Business was created but cannot be resolved");
  return { crm, owner };
}

// ── Barefoot Yard Co. ────────────────────────────────────────────────────

async function seedBarefootYard(owner: string) {
  const { folderId } = await createCrmBusiness(owner, { name: "Barefoot Yard Co.", presetId: "property-service" });
  const ctx = await open(folderId, owner);

  const tess = await contact(ctx, "Tess Walker", "(435) 555-0142", "tess.walker@example.com");
  const marco = await contact(ctx, "Marco Ruiz", "(435) 555-0177");
  const dana = await contact(ctx, "Dana Whitfield", "(435) 555-0119", "dana.w@example.com");

  const home = await subject(ctx, "Walker home — 412 Red Cliffs Dr", tess, {
    Address: "412 Red Cliffs Dr, St. George, UT",
    "Lot size": "0.3 acre",
    "Field notes": "Heavy puncturevine along the back fence line. Dog run on the east side — keep the gate latched.",
  });
  const rental = await subject(ctx, "Walker rental — 88 Juniper Way", tess, {
    Address: "88 Juniper Way, Washington, UT",
    "Gate instructions": "Lockbox on the side gate; the tenant texts the code the morning of.",
    "Lot size": "0.2 acre",
    "Field notes": "Cleared Oct 8. Light regrowth expected along the driveway by spring.",
  });
  const ruizYard = await subject(ctx, "Ruiz backyard — 1530 Sand Hollow Rd", marco, {
    Address: "1530 Sand Hollow Rd, Hurricane, UT",
    "Lot size": "0.6 acre",
  });
  const whitfieldLot = await subject(ctx, "Whitfield lot — 77 Bluff View Ct", dana, {
    Address: "77 Bluff View Ct, Ivins, UT",
    "Gate instructions": "No gate; park on the gravel pad.",
    "Lot size": "0.4 acre",
  });

  const homeQuote = await opportunity(ctx, {
    title: "Home — goathead extraction",
    stage: "Quoted",
    amount: 145,
    nextAction: "Confirm the Saturday crew slot",
    nextActionDate: "2026-11-21",
    followUp: "scheduled",
    followUpDue: "2026-11-19",
    followUpNote: "Reminder text goes out if Tess hasn't replied in 3 days.",
    contactId: tess,
    subjectId: home,
  });
  const rentalQuote = await opportunity(ctx, {
    title: "Rental — fall extraction",
    stage: "Won",
    amount: 95,
    nextAction: "Spring re-check of the driveway strip",
    nextActionDate: "2027-03-15",
    followUp: "scheduled",
    followUpDue: "2027-03-01",
    followUpNote: "Seasonal re-check reminder.",
    contactId: tess,
    subjectId: rental,
  });
  const ruizQuote = await opportunity(ctx, {
    title: "Backyard extraction — half acre+",
    stage: "New lead",
    nextAction: "Site visit to measure the lot",
    nextActionDate: "2026-11-20",
    contactId: marco,
    subjectId: ruizYard,
  });
  const whitfieldQuote = await opportunity(ctx, {
    title: "Lot clearing before listing",
    stage: "Scheduled",
    amount: 320,
    nextAction: "Crew on site",
    nextActionDate: "2026-11-22",
    followUp: "done",
    contactId: dana,
    subjectId: whitfieldLot,
  });

  // Rental: its own, finished history.
  await message(ctx, {
    body: "Hi Tess — the rental at 88 Juniper Way is done. We pulled three buckets of goatheads. Invoice to follow.",
    direction: "outbound",
    at: "2026-10-08T22:10:00Z",
    contactId: tess,
    opportunityId: rentalQuote,
    externalId: "sms:demo-out-rental-1",
  });
  await message(ctx, {
    body: "Thank you! The tenant is thrilled.",
    direction: "inbound",
    at: "2026-10-08T23:02:00Z",
    contactId: tess,
    opportunityId: rentalQuote,
    externalId: "sms:demo-in-rental-1",
  });
  await activity(ctx, {
    summary: "Rental — fall extraction: Quoted → Won",
    kind: "stage",
    at: "2026-10-01T17:00:00Z",
    key: "seed:rental-won",
    contactId: tess,
    opportunityId: rentalQuote,
    subjectId: rental,
  });
  await activity(ctx, {
    summary: "Job completed at 88 Juniper Way",
    kind: "note",
    at: "2026-10-08T22:00:00Z",
    key: "seed:rental-done",
    detail: "Three buckets pulled. Driveway strip will need a spring re-check.",
    contactId: tess,
    opportunityId: rentalQuote,
    subjectId: rental,
  });
  await activity(ctx, {
    summary: "Follow-up scheduled for Mar 1: spring re-check",
    kind: "followUp",
    at: "2026-10-08T22:12:00Z",
    key: "seed:rental-followup",
    detail: "Handed to the local simulator.",
    contactId: tess,
    opportunityId: rentalQuote,
    subjectId: rental,
  });

  // Home: the quote went out, a follow-up is scheduled.
  await message(ctx, {
    body: "Hi Tess, here's your quote for goathead extraction at 412 Red Cliffs Dr: $145 for the front and back yard. We have Saturday open — want it?",
    direction: "outbound",
    at: "2026-11-14T18:30:00Z",
    contactId: tess,
    opportunityId: homeQuote,
    externalId: "sms:demo-out-home-1",
  });
  await activity(ctx, {
    summary: "Quote sent: $145 goathead extraction",
    kind: "message",
    at: "2026-11-14T18:30:00Z",
    key: "seed:home-quote-sent",
    contactId: tess,
    opportunityId: homeQuote,
    subjectId: home,
  });
  await activity(ctx, {
    summary: "Follow-up scheduled for Nov 19",
    kind: "followUp",
    at: "2026-11-14T18:31:00Z",
    key: "seed:home-followup",
    detail: "Reminder text if no reply in 3 days. Handed to the local simulator.",
    contactId: tess,
    opportunityId: homeQuote,
    subjectId: home,
  });

  // Marco: a back-and-forth with no quote yet.
  await message(ctx, {
    body: "Do you do lots over half an acre?",
    direction: "inbound",
    at: "2026-11-15T16:05:00Z",
    contactId: marco,
    opportunityId: ruizQuote,
    externalId: "sms:demo-in-ruiz-1",
  });
  await message(ctx, {
    body: "We do! Happy to come measure this week.",
    direction: "outbound",
    at: "2026-11-15T16:40:00Z",
    contactId: marco,
    opportunityId: ruizQuote,
    externalId: "sms:demo-out-ruiz-1",
  });
  await message(ctx, {
    body: "We're set for the 22nd. See you then!",
    direction: "outbound",
    at: "2026-11-12T20:00:00Z",
    contactId: dana,
    opportunityId: whitfieldQuote,
    externalId: "sms:demo-out-whitfield-1",
  });

  if (!flag("--no-reply")) {
    const result = await ingestCrmEvent(folderId, owner, {
      type: "message.received",
      eventId: TESS_REPLY_EVENT_ID,
      from: "+1 435-555-0142",
      body: "Saturday works. Should I leave the side gate open?",
      receivedAt: "2026-11-17T16:12:00Z",
    });
    console.log(`  Tess's text ingested — paused: ${result.paused}; ${result.matchReason}`);
  }
  return folderId;
}

// ── Redrock Mobile Detailing (Vehicle) ───────────────────────────────────

async function seedDetailing(owner: string) {
  const { folderId } = await createCrmBusiness(owner, { name: "Redrock Mobile Detailing", presetId: "vehicle-service" });
  const ctx = await open(folderId, owner);
  const jordan = await contact(ctx, "Jordan Pike", "(435) 555-0160");
  const truck = await subject(ctx, "Jordan's Tacoma", jordan, {
    Make: "Toyota",
    Model: "Tacoma",
    Year: 2019,
    "Parking notes": "Street parking out front. Text on arrival; keys stay with Jordan.",
  });
  const quote = await opportunity(ctx, {
    title: "Interior + exterior detail",
    stage: "Quoted",
    amount: 180,
    nextAction: "Pick a morning slot",
    nextActionDate: "2026-11-24",
    followUp: "scheduled",
    followUpDue: "2026-11-20",
    contactId: jordan,
    subjectId: truck,
  });
  await message(ctx, {
    body: "Hi Jordan — full detail on the Tacoma is $180. Mornings work best for us.",
    direction: "outbound",
    at: "2026-11-16T15:00:00Z",
    contactId: jordan,
    opportunityId: quote,
    externalId: "sms:demo-out-jordan-1",
  });
  return folderId;
}

// ── Hartley Piano Studio (the contact is the subject) ────────────────────

async function seedPianoStudio(owner: string) {
  const { folderId } = await createCrmBusiness(owner, { name: "Hartley Piano Studio", presetId: "person-service" });
  const ctx = await open(folderId, owner);
  const prefCol = ctx.crm.tables.contacts.columns.find((x) => x.name === "Preferred time")!;
  const notesCol = ctx.crm.tables.contacts.columns.find((x) => x.name === "Session notes")!;
  const avery = await contact(ctx, "Avery Chen", "(435) 555-0188", "avery@example.com", {
    [prefCol.id]: "Tuesdays after 4pm",
    [notesCol.id]: "Intermediate. Working through Burgmüller Op. 100.",
  });
  const pkg = await opportunity(ctx, {
    title: "10-lesson package",
    stage: "Offered",
    amount: 420,
    nextAction: "Confirm the first Tuesday",
    followUp: "scheduled",
    followUpDue: "2026-11-21",
    contactId: avery,
    subjectId: avery,
  });
  await message(ctx, {
    body: "Hi Avery — the 10-lesson package is $420. Tuesdays at 4:30 are open.",
    direction: "outbound",
    at: "2026-11-15T19:00:00Z",
    contactId: avery,
    opportunityId: pkg,
    externalId: "sms:demo-out-avery-1",
  });
  return folderId;
}

async function main() {
  localOnly();
  const owner = await resolveOwner();
  const found = await existing(owner.id);

  if (flag("--cleanup") || flag("--reset")) {
    for (const f of found) {
      await removeBusiness(f.id);
      console.log(`Removed ${f.title}`);
    }
    if (flag("--cleanup")) return;
  }

  const have = new Set(flag("--reset") ? [] : found.map((f) => f.title));
  console.log(`Seeding CRM demo for ${owner.email}`);
  if (!have.has(BUSINESSES[0])) console.log(`Barefoot Yard Co. → ${await seedBarefootYard(owner.id)}`);
  if (!have.has(BUSINESSES[1])) console.log(`Redrock Mobile Detailing → ${await seedDetailing(owner.id)}`);
  if (!have.has(BUSINESSES[2])) console.log(`Hartley Piano Studio → ${await seedPianoStudio(owner.id)}`);
  if (have.size > 0) console.log(`Skipped (already present): ${[...have].join(", ")} — use --reset to rebuild.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
