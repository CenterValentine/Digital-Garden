/**
 * CRM gate — the pure rules the CRM's correctness rests on. No database.
 *
 *  1. Tab ids round-trip and reject anything malformed (they come from URLs
 *     and localStorage, and must never reach a uuid query).
 *  2. Every preset is self-consistent: each name binding names a column the
 *     preset creates, relation targets exist, and the contact-as-subject
 *     preset binds subject ⇒ contact.
 *  3. parseCrmConfig accepts a complete config and REFUSES a partial one
 *     (a half-config must read as "not a CRM", never crash a view).
 *  4. matchReplyToOpportunity — the rule that decides whose follow-up an
 *     incoming text pauses. Wrong here = the wrong customer's follow-up
 *     paused (Tess's rental instead of her home).
 *  5. projectCrm / subjectRecord / pipelineLanes on a synthetic snapshot:
 *     histories stay per subject; a contact-as-subject business works.
 *
 *   pnpm crm:check
 */

import { crmTabId, parseCrmTabId } from "../lib/domain/crm/ids";
import { parseCrmConfig, type CrmConfig, type CrmTableRole } from "../lib/domain/crm/config";
import { CRM_PRESETS, PERSON_SERVICE_PRESET } from "../lib/domain/crm/presets";
import {
  matchReplyToOpportunity,
  normalizePhone,
  pipelineLanes,
  projectCrm,
  subjectRecord,
  type CrmTableSnapshot,
  type CrmWorkspaceSnapshot,
} from "../lib/domain/crm/model";
import type { CellValue, DataColumn, DataColumnType, DataRow, SelectOption } from "../lib/domain/data";

let failures = 0;
function check(ok: boolean, message: string): void {
  if (ok) {
    console.log(`  PASS  ${message}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${message}`);
  }
}

const F = "11111111-1111-4111-8111-111111111111";
const R = "22222222-2222-4222-8222-222222222222";

// ── 1. Tab ids ───────────────────────────────────────────────────────────
console.log("tab ids");
check(parseCrmTabId(crmTabId({ kind: "inbox", folderId: F }))?.kind === "inbox", "inbox id round-trips");
check(parseCrmTabId(crmTabId({ kind: "pipeline", folderId: F }))?.kind === "pipeline", "pipeline id round-trips");
{
  const v = parseCrmTabId(crmTabId({ kind: "record", folderId: F, rowId: R }));
  check(v?.kind === "record" && v.rowId === R && v.folderId === F, "record id round-trips with its row");
}
check(parseCrmTabId("crm:inbox/not-a-uuid") === null, "non-uuid folder is rejected");
check(parseCrmTabId(`crm:record/${F}`) === null, "record without a row is rejected");
check(parseCrmTabId(`crm:inbox/${F}/extra`) === null, "trailing segments are rejected");
check(parseCrmTabId(`reader:inbox/${F}`) === null, "other prefixes are not CRM tabs");

// ── 2. Presets ───────────────────────────────────────────────────────────
console.log("presets");
for (const preset of CRM_PRESETS) {
  const tableFor = (role: CrmTableRole) =>
    preset.tables.find((t) => t.role === (preset.subjectIsContact && role === "subjects" ? "contacts" : role));
  let ok = true;
  for (const [role, names] of Object.entries(preset.bindings)) {
    const table = tableFor(role as CrmTableRole);
    for (const name of Object.values(names as Record<string, string>)) {
      if (!table?.columns.some((c) => c.name === name)) {
        ok = false;
        console.log(`        ${preset.id}: ${role} binding “${name}” has no column`);
      }
    }
  }
  check(ok, `${preset.id}: every binding names a created column`);
  const subjects = tableFor("subjects");
  check(
    preset.subjectFields.every((n) => subjects?.columns.some((c) => c.name === n)),
    `${preset.id}: subject fields exist on the subject table`
  );
  check(
    preset.tables.every((t) =>
      t.columns.every((c) => c.type !== "relation" || (c.target && tableFor(c.target)))
    ),
    `${preset.id}: every relation targets a table in the preset`
  );
  check(
    preset.tables.every((t) => t.columns.filter((c) => c.primary).length === 1),
    `${preset.id}: every table has exactly one primary column`
  );
  check(
    preset.tables.every((t) => new Set(t.columns.map((c) => c.name.toLowerCase())).size === t.columns.length),
    `${preset.id}: no duplicate column names`
  );
}
check(
  PERSON_SERVICE_PRESET.subjectIsContact &&
    !PERSON_SERVICE_PRESET.tables.some((t) => t.role === "subjects") &&
    PERSON_SERVICE_PRESET.bindings.opportunities.subject === PERSON_SERVICE_PRESET.bindings.opportunities.contact,
  "person-service: the contact IS the subject (no subjects table; subject ⇒ contact binding)"
);

// ── Synthetic snapshot builder ───────────────────────────────────────────
let seq = 0;
const id = (p: string) => `${p}-${++seq}`;
function col(name: string, type: DataColumnType, options?: SelectOption[]): DataColumn {
  return {
    id: id("col"),
    key: id("k"),
    name,
    type,
    position: "a",
    isPrimary: false,
    config: options ? { options } : {},
    description: null,
    deletedAt: null,
  };
}
const opt = (label: string, group?: "todo" | "active" | "done"): SelectOption => ({
  id: id("opt"),
  label,
  ...(group ? { group } : {}),
});

function row(tableId: string, cells: Array<[DataColumn, CellValue]>, links: Array<[DataColumn, string]> = []): DataRow {
  return {
    id: id("row"),
    tableId,
    sortKey: "a",
    data: Object.fromEntries(cells.map(([c, v]) => [c.key, v])),
    links: Object.fromEntries(links.map(([c, to]) => [c.id, [{ linkId: id("l"), rowId: to, title: "", restricted: false }]])),
    contentId: null,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
  };
}

function table(tid: string, columns: DataColumn[]): CrmTableSnapshot {
  return { id: tid, title: tid, access: "owner", columns, rows: [] };
}

function buildSnapshot(subjectIsContact: boolean) {
  const stages = [opt("New lead", "todo"), opt("Quoted", "active"), opt("Won", "done")];
  const follow = { scheduled: opt("Scheduled"), paused: opt("Paused"), done: opt("Done") };
  const dir = { inbound: opt("Inbound"), outbound: opt("Outbound"), draft: opt("Draft") };
  const kind = { message: opt("Message"), followUp: opt("Follow-up"), stage: opt("Stage"), note: opt("Note"), automation: opt("Automation") };

  const cName = col("Name", "text"), cPhone = col("Phone", "text"), cNotes = col("Notes", "longText");
  const contacts = table("contacts", [cName, cPhone, cNotes]);
  const sName = col("Name", "text"), sGate = col("Gate instructions", "longText"), sContact = col("Contact", "relation");
  const subjects = subjectIsContact ? contacts : table("subjects", [sName, sGate, sContact]);
  const oTitle = col("Title", "text"), oStage = col("Stage", "status", stages), oFollow = col("Follow-up", "select", Object.values(follow));
  const oContact = col("Contact", "relation"), oSubject = subjectIsContact ? oContact : col("Subject", "relation");
  const opps = table("opps", subjectIsContact ? [oTitle, oStage, oFollow, oContact] : [oTitle, oStage, oFollow, oContact, oSubject]);
  const mBody = col("Message", "text"), mDir = col("Direction", "select", Object.values(dir)), mAt = col("Sent at", "date");
  const mExt = col("External id", "text"), mContact = col("Contact", "relation"), mOpp = col("Opp", "relation");
  const messages = table("messages", [mBody, mDir, mAt, mExt, mContact, mOpp]);
  const aSum = col("Summary", "text"), aKind = col("Kind", "select", Object.values(kind)), aAt = col("At", "date");
  const aKey = col("Event key", "text"), aContact = col("Contact", "relation"), aOpp = col("Opp", "relation");
  const aSubject = subjectIsContact ? aContact : col("Subject", "relation");
  const activity = table("activity", subjectIsContact ? [aSum, aKind, aAt, aKey, aContact, aOpp] : [aSum, aKind, aAt, aKey, aContact, aOpp, aSubject]);

  const config: CrmConfig = {
    version: 1,
    preset: "test",
    terms: {
      subject: { singular: "Property", plural: "Properties" },
      opportunity: { singular: "Quote", plural: "Quotes" },
      contact: { singular: "Contact", plural: "Contacts" },
    },
    tables: { contacts: "contacts", subjects: subjects.id, opportunities: "opps", messages: "messages", activity: "activity" },
    subjectFields: subjectIsContact ? [cPhone.id] : [sGate.id],
    columns: {
      contacts: { name: cName.id, phone: cPhone.id },
      subjects: subjectIsContact ? { name: cName.id, notes: cNotes.id } : { name: sName.id, contact: sContact.id },
      opportunities: { title: oTitle.id, stage: oStage.id, followUp: oFollow.id, contact: oContact.id, subject: oSubject.id },
      messages: { body: mBody.id, direction: mDir.id, sentAt: mAt.id, externalId: mExt.id, contact: mContact.id, opportunity: mOpp.id },
      activity: { summary: aSum.id, kind: aKind.id, at: aAt.id, eventKey: aKey.id, contact: aContact.id, opportunity: aOpp.id, subject: aSubject.id },
    },
    options: {
      followUp: { scheduled: follow.scheduled.id, paused: follow.paused.id, done: follow.done.id },
      direction: { inbound: dir.inbound.id, outbound: dir.outbound.id, draft: dir.draft.id },
      activityKind: { message: kind.message.id, followUp: kind.followUp.id, stage: kind.stage.id, note: kind.note.id, automation: kind.automation.id },
    },
    automation: { engine: "simulator" },
  };

  const snapshot: CrmWorkspaceSnapshot = {
    folderId: F,
    businessName: "Test Co",
    config,
    tables: { contacts, subjects, opportunities: opps, messages, activity },
    automation: { engine: "simulator", label: "sim", simulated: true },
    truncated: false,
    loadedAt: "2026-11-17T00:00:00Z",
  };
  return {
    snapshot,
    c: { cName, cPhone, sName, sGate, sContact, oTitle, oStage, oFollow, oContact, oSubject, mBody, mDir, mAt, mExt, mContact, mOpp, aSum, aKind, aAt, aKey, aContact, aOpp, aSubject },
    stages,
    follow,
    dir,
  };
}

// ── 3. Config parsing ────────────────────────────────────────────────────
console.log("config");
{
  const { snapshot } = buildSnapshot(false);
  const parsed = parseCrmConfig(JSON.parse(JSON.stringify(snapshot.config)));
  check(parsed !== null && parsed.terms.subject.plural === "Properties", "a complete config parses with its terms");
  const broken = JSON.parse(JSON.stringify(snapshot.config));
  delete broken.columns.opportunities.followUp;
  check(parseCrmConfig(broken) === null, "a config missing a required binding is refused");
  check(parseCrmConfig({ ...snapshot.config, version: 2 }) === null, "an unknown version is refused");
  check(parseCrmConfig(null) === null && parseCrmConfig("crm") === null, "garbage is refused");
  check(parseCrmConfig({ ...snapshot.config, automation: { engine: "zapier" } })?.automation.engine === "simulator", "unknown executor falls back to the simulator");
}

// ── 4. Reply matching ────────────────────────────────────────────────────
console.log("reply matching");
{
  const opps = [
    { id: "home", title: "Home", contactId: "tess", followUp: "scheduled" as const, stageGroup: "active" as const },
    { id: "rental", title: "Rental", contactId: "tess", followUp: "scheduled" as const, stageGroup: "done" as const },
    { id: "other", title: "Other", contactId: "marco", followUp: "scheduled" as const, stageGroup: "active" as const },
  ];
  const msgs = [
    { contactId: "tess", direction: "outbound" as const, sentAt: "2026-10-08T00:00:00Z", opportunityId: "rental" },
    { contactId: "tess", direction: "outbound" as const, sentAt: "2026-11-14T00:00:00Z", opportunityId: "home" },
    { contactId: "marco", direction: "outbound" as const, sentAt: "2026-11-16T00:00:00Z", opportunityId: "other" },
  ];
  check(
    matchReplyToOpportunity({ contactId: "tess", messages: msgs, opportunities: opps }).opportunityId === "home",
    "a reply answers the most recent outbound text (home, not the older rental thread)"
  );
  check(
    matchReplyToOpportunity({ contactId: "tess", messages: [], opportunities: opps }).opportunityId === "home",
    "with no outbound text, the single OPEN item with a follow-up in flight wins (the won rental is not open)"
  );
  check(
    matchReplyToOpportunity({
      contactId: "tess",
      messages: [],
      opportunities: [...opps, { id: "home2", title: "Shed", contactId: "tess", followUp: "paused", stageGroup: "active" }],
    }).opportunityId === null,
    "two open items in flight → no match (left for the operator, never guessed)"
  );
  check(
    matchReplyToOpportunity({ contactId: "tess", messages: msgs.slice(2), opportunities: opps }).opportunityId === "home",
    "another contact's outbound text never decides this contact's match"
  );
  check(
    matchReplyToOpportunity({ contactId: "nobody", messages: msgs, opportunities: opps }).opportunityId === null,
    "an unknown contact matches nothing"
  );
  check(normalizePhone("+1 (435) 555-0142") === normalizePhone("435.555.0142"), "phone numbers match across formats");
}

// ── 5. Projection ────────────────────────────────────────────────────────
console.log("projection");
{
  const { snapshot, c, stages, follow, dir } = buildSnapshot(false);
  const T = snapshot.tables;
  const tess = row("contacts", [[c.cName, "Tess"], [c.cPhone, "435-555-0142"]]);
  T.contacts.rows.push(tess);
  const home = row("subjects", [[c.sName, "Home"], [c.sGate, "Side gate unlocked"]], [[c.sContact, tess.id]]);
  const rental = row("subjects", [[c.sName, "Rental"]], [[c.sContact, tess.id]]);
  T.subjects.rows.push(home, rental);
  const homeQ = row("opps", [[c.oTitle, "Home quote"], [c.oStage, stages[1].id], [c.oFollow, follow.paused.id]], [[c.oContact, tess.id], [c.oSubject, home.id]]);
  const rentalQ = row("opps", [[c.oTitle, "Rental quote"], [c.oStage, stages[2].id], [c.oFollow, follow.scheduled.id]], [[c.oContact, tess.id], [c.oSubject, rental.id]]);
  T.opportunities.rows.push(homeQ, rentalQ);
  T.messages.rows.push(
    row("messages", [[c.mBody, "Quote"], [c.mDir, dir.outbound.id], [c.mAt, "2026-11-14T00:00:00Z"]], [[c.mContact, tess.id], [c.mOpp, homeQ.id]]),
    row("messages", [[c.mBody, "Saturday works"], [c.mDir, dir.inbound.id], [c.mAt, "2026-11-17T00:00:00Z"]], [[c.mContact, tess.id], [c.mOpp, homeQ.id]]),
    row("messages", [[c.mBody, "Draft reply"], [c.mDir, dir.draft.id], [c.mAt, "2026-11-17T01:00:00Z"]], [[c.mContact, tess.id], [c.mOpp, homeQ.id]])
  );
  T.activity.rows.push(
    row("activity", [[c.aSum, "paused"], [c.aAt, "2026-11-17T00:00:00Z"]], [[c.aContact, tess.id], [c.aOpp, homeQ.id], [c.aSubject, home.id]]),
    row("activity", [[c.aSum, "rental done"], [c.aAt, "2026-10-08T00:00:00Z"]], [[c.aContact, tess.id], [c.aOpp, rentalQ.id]]),
    row("activity", [[c.aSum, "contact-level note"], [c.aAt, "2026-11-01T00:00:00Z"]], [[c.aContact, tess.id]])
  );
  const model = projectCrm(snapshot);
  const convo = model.conversations[0];
  check(convo?.opportunity?.id === homeQ.id && convo.subject?.id === home.id, "Tess's conversation concerns the home quote and the home");
  check(convo?.messages.length === 2 && convo.draft?.body === "Draft reply", "drafts are kept out of the thread and surfaced separately");
  check(convo?.awaitingReply === true, "a thread ending in their text is awaiting our reply");
  const homeRec = subjectRecord(model, home.id)!;
  const rentalRec = subjectRecord(model, rental.id)!;
  check(homeRec.activity.map((a) => a.summary).join() === "paused", "home history holds only home activity");
  check(rentalRec.activity.map((a) => a.summary).join() === "rental done", "rental history is its own (contact-level notes do not leak in)");
  check(rentalRec.opportunities[0]?.followUp === "scheduled", "the rental's follow-up reads as scheduled");
  check(homeRec.subject.fields[0]?.display === "Side gate unlocked", "subject fields render the business's own columns");
  const lanes = pipelineLanes(model);
  check(lanes.map((l) => l.stage.label).join() === "New lead,Quoted,Won", "pipeline lanes follow status-group order");
  check(lanes[1].items[0]?.id === homeQ.id, "the home quote sits in the Quoted lane");
}
{
  const { snapshot, c, stages, follow } = buildSnapshot(true);
  const T = snapshot.tables;
  const avery = row("contacts", [[c.cName, "Avery"], [c.cPhone, "555"]]);
  T.contacts.rows.push(avery);
  const pkg = row("opps", [[c.oTitle, "10 lessons"], [c.oStage, stages[1].id], [c.oFollow, follow.scheduled.id]], [[c.oContact, avery.id]]);
  T.opportunities.rows.push(pkg);
  T.activity.rows.push(row("activity", [[c.aSum, "contact note"], [c.aAt, "2026-11-01T00:00:00Z"]], [[c.aContact, avery.id]]));
  const model = projectCrm(snapshot);
  const rec = subjectRecord(model, avery.id);
  check(model.subjects.length === 1 && model.subjects[0].id === avery.id, "contact-as-subject: the contact rows ARE the subjects");
  check(rec?.opportunities[0]?.id === pkg.id && rec?.contact?.id === avery.id, "contact-as-subject: the record finds its package and itself as contact");
  check(rec?.activity.length === 1, "contact-as-subject: contact-linked activity belongs to the record");
}

console.log();
if (failures > 0) {
  console.log(`crm: ${failures} check(s) failed`);
  process.exit(1);
}
console.log("crm: all passed");
