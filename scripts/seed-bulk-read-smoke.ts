/**
 * Local smoke fixture for right-sized database reads
 * (AI-BULK-ROW-READING-PLAN §4.9): three linked tables modeled on the
 * Career Evidence Library — Experiences ⇄ Claims ⇄ Sources — with long
 * text, gaps, select vocabularies, a rollup, and enough rows that the
 * default 6k threshold is crossed by "all columns" but not by the index.
 *
 * LOCAL ONLY: refuses any DATABASE_URL that is not localhost.
 *
 *   pnpm exec tsx scripts/seed-bulk-read-smoke.ts             # create (idempotent: reuses existing)
 *   pnpm exec tsx scripts/seed-bulk-read-smoke.ts --cleanup   # delete everything it created
 *   pnpm exec tsx scripts/seed-bulk-read-smoke.ts --realign   # rewrite an existing fixture's claims to the coherent pairing
 *   pnpm exec tsx scripts/seed-bulk-read-smoke.ts --owner you@example.com
 */

import { prisma } from "../lib/database/client";
import { loadTable } from "../lib/domain/data/server/queries";
import {
  createColumn,
  createRelationPair,
  createRows,
  writeCells,
  type CellWrite,
} from "../lib/domain/data/server/mutations";
import { generateUniqueSlug } from "../lib/domain/content/slug";
import type { Prisma } from "../lib/database/generated/prisma";
import { writeRelationLinks } from "../lib/domain/data/server/relation-cells";
import { findColumn, normalizeCellInput, translateOptionValue } from "../lib/domain/data/capture-core";
import type { DataColumn } from "../lib/domain/data/types";

const PREFIX = "Smoke Library —";
const DEFAULT_OWNER = "centervalentine@gmail.com";

function localOnly() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    console.error("Refusing: DATABASE_URL is not localhost. This fixture is for the local database only.");
    process.exit(2);
  }
}

const LOREM = [
  "Reconciled the billing ledger against Stripe payouts after a migration left 1,400 invoices without settlement records; built the SQL reconciliation and the weekly report the finance lead now runs.",
  "Owned the Intercom contact cleanup: identified roughly 250,000 duplicate contacts created by a webhook retry loop, designed the merge rules with support, and ran the dedupe in batches over two weeks.",
  "Led the onboarding redesign for enterprise clinics — mapped the 14-step flow, cut it to 6, and wrote the Appcues tours; time-to-first-value fell from nine days to three.",
  "Investigated an API outage that dropped 3% of Meta lead events; traced it to a token refresh race, added the retry with jitter, and documented the runbook.",
  "Built the Tray.io workflow that routes trial sign-ups to the right rep by segment and territory; replaced a manual spreadsheet handoff.",
  "Coordinated the HubSpot → Salesforce field mapping across sales, marketing and support; 212 properties reviewed, 38 retired.",
];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

async function ownerId(email: string): Promise<string> {
  const u = await prisma.user.findFirst({ where: { email }, select: { id: true } });
  if (!u) {
    console.error(`No user with email ${email} in the local database.`);
    process.exit(2);
  }
  return u.id;
}

async function existing(owner: string) {
  return prisma.contentNode.findMany({
    where: { ownerId: owner, contentType: "data", deletedAt: null, title: { startsWith: PREFIX } },
    select: { id: true, title: true },
  });
}

async function cleanup(owner: string) {
  const nodes = await existing(owner);
  if (nodes.length === 0) {
    console.log("Nothing to clean up.");
    return;
  }
  await prisma.contentNode.deleteMany({ where: { id: { in: nodes.map((n) => n.id) } } });
  console.log(`Deleted ${nodes.length} table(s): ${nodes.map((n) => n.title).join(", ")}`);
}

/**
 * Coherent claim stories: title, numbers and narrative come from the SAME
 * story so a reader never sees a rotated pairing (first fixture did; the
 * model spent its reply explaining the rotation). Each row's title is made
 * distinct with a period qualifier.
 */
const STORIES: Array<{ title: string; narrative: string; before?: number; after?: number; unit?: string; type: string }> = [
  { title: "Recovery rate increased from 65% to 73%", narrative: "Reconciled the billing ledger against Stripe payouts after a migration left 1,400 invoices without settlement records; recovery rate measured from the weekly finance report, baseline the quarter before the change.", before: 65, after: 73, unit: "percent", type: "Quantitative metric" },
  { title: "Approximately 250,000 duplicate contacts cleaned", narrative: "Owned the Intercom contact cleanup: identified roughly 250,000 duplicates created by a webhook retry loop, designed the merge rules with support, and ran the dedupe in batches over two weeks.", before: 250000, after: 0, unit: "contacts", type: "Scope or scale" },
  { title: "Time-to-first-value fell from nine days to three", narrative: "Led the onboarding redesign for enterprise clinics — mapped the 14-step flow, cut it to 6, and wrote the Appcues tours; time-to-first-value measured from the onboarding dashboard.", before: 9, after: 3, unit: "days", type: "Quantitative metric" },
  { title: "Lead-event loss reduced from 3% to under 0.2%", narrative: "Investigated an API outage that dropped 3% of Meta lead events; traced it to a token refresh race, added the retry with jitter, and documented the runbook.", before: 3, after: 0.2, unit: "percent", type: "Quantitative metric" },
  { title: "Manual handoffs eliminated for 40 reps", narrative: "Built the Tray.io workflow that routes trial sign-ups to the right rep by segment and territory; replaced a manual spreadsheet handoff for the whole sales floor.", before: 40, after: 0, unit: "reps", type: "Qualitative outcome" },
  { title: "212 properties reviewed, 38 retired", narrative: "Coordinated the HubSpot → Salesforce field mapping across sales, marketing and support; every property reviewed with its owner, 38 retired as unused.", before: 212, after: 174, unit: "properties", type: "Scope or scale" },
  { title: "Alert noise cut by 60%", narrative: "Tuned Datadog monitors after on-call fatigue reports: thresholds rebased on p95, duplicate monitors merged, and a weekly alert review instituted.", before: 100, after: 40, unit: "percent", type: "Quantitative metric" },
  { title: "$1.37M in recovered revenue over six months", narrative: "Chased failed and dunning invoices surfaced by the reconciliation; recovered revenue tracked against the finance ledger from January to June.", before: 0, after: 1370000, unit: "dollars", type: "Quantitative metric" },
];
const PERIODS = ["Q1 2024", "Q2 2024", "Q3 2024", "Q4 2024", "Q1 2025"];
const STRENGTHS = ["Documented", "Partially documented", "Recollection only", "Needs verification"];

function claimRow(i: number): Record<string, unknown> {
  const gap = i % 13 === 12;
  const story = STORIES[i % STORIES.length];
  const period = PERIODS[Math.floor(i / STORIES.length) % PERIODS.length];
  return {
    "Claim or metric": gap ? `[gap] No quantified result recorded (${period})` : `${story.title} (${period})`,
    "Claim ID": `CLM-${String(i + 1).padStart(3, "0")}`,
    "Claim type": gap ? "Qualitative outcome" : story.type,
    "Before value": gap ? undefined : story.before,
    "After value": gap ? undefined : story.after,
    Unit: gap ? undefined : story.unit,
    Narrative: gap ? "Measure a concrete result; the ledger section records activity only." : `${story.narrative} Period: ${period}.`,
    "Evidence strength": gap ? "Needs verification" : STRENGTHS[i % STRENGTHS.length],
  };
}

/** Rewrite an existing fixture's claim titles/narratives/numbers to the coherent pairing. */
async function realign(owner: string) {
  const claims = (await existing(owner)).find((n) => n.title === `${PREFIX} Claims`);
  if (!claims) {
    console.log("No Claims fixture to realign.");
    return;
  }
  const table = (await loadTable(claims.id, owner))!;
  const live = table.columns.filter((c) => !c.deletedAt) as DataColumn[];
  const rows = await prisma.dataRow.findMany({ where: { tableId: claims.id, deletedAt: null }, orderBy: { sortKey: "asc" }, select: { id: true } });
  const writes: CellWrite[] = [];
  rows.forEach((row, i) => {
    const next = claimRow(i);
    for (const name of ["Claim or metric", "Claim type", "Before value", "After value", "Unit", "Narrative"]) {
      const column = findColumn(live, name)!;
      const raw = next[name];
      writes.push({ rowId: row.id, columnKey: column.key, value: raw === undefined ? undefined : normalizeCellInput(column, translateOptionValue(column, raw)) });
    }
  });
  const out = await writeCells(claims.id, live, writes);
  const bad = out.results.filter((r) => r.status === "error" || r.status === "stale");
  console.log(`Realigned ${rows.length} claims (${bad.length} rejected writes). Their AI digests are now stale by hash.`);
}

async function seed(owner: string) {
  const have = await existing(owner);
  if (have.length > 0) {
    console.log("Fixture already present:");
    for (const n of have) console.log(`  ${n.title}  ${n.id}`);
    console.log("Run with --cleanup first to recreate.");
    return;
  }

  // Tables through the same primitives the linked-schema transaction uses
  // (applyLinkedSchema itself pulls the editor in through the slug helper's
  // barrel, which tsx cannot load standalone).
  type Col = { name: string; type: DataColumn["type"]; description?: string; options?: Array<{ label: string; color?: string; group?: string }> };
  async function makeTable(title: string, description: string, columns: Col[]): Promise<string> {
    const slug = await generateUniqueSlug(title, owner);
    const node = await prisma.contentNode.create({
      data: {
        ownerId: owner,
        title,
        slug,
        contentType: "data",
        parentId: null,
        displayOrder: 0,
        dataPayload: {
          create: {
            mode: "inline",
            source: {} as unknown as Prisma.InputJsonValue,
            description,
            searchText: title.toLowerCase(),
          },
        },
      },
      select: { id: true },
    });
    for (const c of columns) {
      const config = c.options
        ? { options: c.options.map((o, i) => ({ id: `opt-${i}-${o.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, label: o.label, color: o.color ?? "neutral", ...(o.group ? { group: o.group } : {}) })) }
        : undefined;
      await createColumn(node.id, { name: c.name, type: c.type, description: c.description ?? null, config: config as never });
    }
    await prisma.dataColumn.updateMany({ where: { tableId: node.id, name: columns[0].name }, data: { isPrimary: true } });
    return node.id;
  }

  const srcId = await makeTable(`${PREFIX} Sources`, "Original passages, documents, links, and recollections that substantiate experiences and claims.", [
    { name: "Source title", type: "text" },
    { name: "Source ID", type: "text", description: "Stable reference like SRC-004." },
    { name: "Source type", type: "select", options: [{ label: "Original passage" }, { label: "Document" }, { label: "Web link" }, { label: "Personal recollection" }] },
    { name: "Original passage or recollection", type: "longText" },
    { name: "URL", type: "url" },
    { name: "Captured date", type: "date" },
  ]);
  const clmId = await makeTable(`${PREFIX} Claims`, "Individual results linked to an experience and, where possible, to supporting sources.", [
    { name: "Claim or metric", type: "text", description: "The result statement; this is the row title." },
    { name: "Claim ID", type: "text", description: "Stable reference like CLM-012." },
    { name: "Claim type", type: "select", options: [{ label: "Quantitative metric" }, { label: "Qualitative outcome" }, { label: "Scope or scale" }] },
    { name: "Before value", type: "number" },
    { name: "After value", type: "number" },
    { name: "Unit", type: "text" },
    { name: "Narrative", type: "longText", description: "What changed, how it was measured, why it matters." },
    { name: "Evidence strength", type: "select", description: "Confidence based on the available evidence.", options: [{ label: "Documented" }, { label: "Partially documented" }, { label: "Recollection only" }, { label: "Needs verification" }] },
  ]);
  const expId = await makeTable(`${PREFIX} Experiences`, "One project, initiative, or responsibility per record, with contribution, outcome, and readiness.", [
    { name: "Title", type: "text", description: "Short name of the experience." },
    { name: "Experience ID", type: "text", description: "Stable reference like EXP-003." },
    { name: "Employer", type: "text" },
    { name: "Role", type: "text" },
    { name: "Start date", type: "date" },
    { name: "End date", type: "date" },
    { name: "Readiness", type: "status", description: "How usable this is in an application today.", options: [{ label: "Needs detail", color: "red", group: "todo" }, { label: "Usable with qualification", color: "amber", group: "inProgress" }, { label: "Ready for applications", color: "green", group: "done" }] },
    { name: "Ownership", type: "select", options: [{ label: "Owner" }, { label: "Co-owner" }, { label: "Contributor" }] },
    { name: "Problem", type: "longText", description: "The situation before the work." },
    { name: "Your contribution", type: "longText", description: "What you specifically did." },
  ]);
  // Relations (forward on Experiences and Claims; mirrors minted on the far side) + a rollup.
  const expClaimsPair = await createRelationPair(expId, clmId, { name: "Claims and metrics", description: "Results this experience produced." }, "Experience");
  await createRelationPair(expId, srcId, { name: "Sources", description: "Evidence for this experience." }, "Experiences");
  await createRelationPair(clmId, srcId, { name: "Sources", description: "Sources that support this claim." }, "Claims");
  await createColumn(expId, { name: "Claim count", type: "rollup", config: { relationColumnId: expClaimsPair.forwardId, rollupFn: "count" } });

  async function fill(tableId: string, rows: Array<Record<string, unknown>>): Promise<string[]> {
    const table = (await loadTable(tableId, owner))!;
    const live = table.columns.filter((c) => !c.deletedAt) as DataColumn[];
    const ids: string[] = [];
    for (let i = 0; i < rows.length; i += 10) {
      ids.push(...(await createRows(tableId, live, Math.min(10, rows.length - i), owner)));
    }
    const writes: CellWrite[] = [];
    rows.forEach((row, i) => {
      for (const [name, raw] of Object.entries(row)) {
        if (raw === undefined || raw === null || raw === "") continue;
        const column = findColumn(live, name);
        if (!column || column.type === "relation" || column.type === "rollup") continue;
        writes.push({
          rowId: ids[i],
          columnKey: column.key,
          value: normalizeCellInput(column, translateOptionValue(column, raw)),
        });
      }
    });
    for (let i = 0; i < writes.length; i += 200) {
      const out = await writeCells(tableId, live, writes.slice(i, i + 200));
      const bad = out.results.filter((r) => r.status === "error" || r.status === "stale");
      if (bad.length > 0) console.warn(`  ${bad.length} cell write(s) rejected on ${table.title}:`, bad.slice(0, 3));
    }
    return ids;
  }

  // Sources: 24, with long passages on half.
  const sources = Array.from({ length: 24 }, (_, i) => ({
    "Source title": i % 4 === 3 ? `Owner recollection ${i + 1}` : `Original ledger passage — section ${i + 1}`,
    "Source ID": `SRC-${String(i + 1).padStart(3, "0")}`,
    "Source type": pick(["Original passage", "Document", "Web link", "Personal recollection"], i),
    "Original passage or recollection": i % 2 === 0 ? `${pick(LOREM, i)} ${pick(LOREM, i + 2)}` : pick(LOREM, i),
    URL: i % 4 === 2 ? `https://example.com/evidence/${i + 1}` : undefined,
    "Captured date": `2025-0${(i % 9) + 1}-1${i % 9}`,
  }));
  const srcRows = await fill(srcId, sources);

  // Experiences: 12; three Ready, five Usable, four Needs detail; one deliberate gap.
  const readiness = ["Ready for applications", "Usable with qualification", "Needs detail"];
  const experiences = Array.from({ length: 12 }, (_, i) => ({
    Title: pick(
      ["Billing reconciliation after the Stripe migration", "Intercom duplicate contact cleanup", "Enterprise clinic onboarding redesign", "Meta lead-event outage investigation", "Trial routing workflow in Tray.io", "HubSpot to Salesforce field mapping", "Datadog alert tuning", "Quarterly revenue operations review", "Support macro library rebuild", "Vendor evaluation for call recording", "Reflection on career options", "Segment tracking plan"],
      i
    ),
    "Experience ID": `EXP-${String(i + 1).padStart(3, "0")}`,
    Employer: pick(["Northwind Health", "Contoso Labs", "Fabrikam"], i),
    Role: pick(["Revenue Operations Analyst", "Solutions Engineer", "Customer Success Lead"], i),
    "Start date": `202${2 + (i % 3)}-0${(i % 8) + 1}-01`,
    "End date": i % 5 === 4 ? undefined : `202${3 + (i % 3)}-0${(i % 8) + 1}-01`,
    Readiness: i < 3 ? readiness[0] : i < 8 ? readiness[1] : readiness[2],
    Ownership: i === 10 ? undefined : pick(["Owner", "Co-owner", "Contributor"], i),
    Problem: i === 10 ? undefined : `${pick(LOREM, i + 1)} Before this, the team relied on a manual process that nobody owned.`,
    "Your contribution": i === 10 ? "Reflected on career options after graduation." : pick(LOREM, i),
  }));
  const expRows = await fill(expId, experiences);

  // Claims: 40; ~3 per experience; a few gaps and a few unverified.
  const claims = Array.from({ length: 40 }, (_, i) => claimRow(i));
  const clmRows = await fill(clmId, claims);

  // Links: claim → experience (forward on Experiences.Claims and metrics), claim → sources, experience → sources.
  const expTable = (await loadTable(expId, owner))!;
  const clmTable = (await loadTable(clmId, owner))!;
  const expClaims = findColumn(expTable.columns, "Claims and metrics")!;
  const expSources = findColumn(expTable.columns, "Sources")!;
  const clmSources = findColumn(clmTable.columns, "Sources")!;
  let links = 0;
  for (let e = 0; e < expRows.length; e++) {
    const mine = clmRows.filter((_, c) => c % expRows.length === e);
    const r = await writeRelationLinks(expClaims.id, expRows[e], mine);
    links += r.added;
    const s = await writeRelationLinks(expSources.id, expRows[e], [srcRows[e * 2 % srcRows.length], srcRows[(e * 2 + 1) % srcRows.length]]);
    links += s.added;
  }
  for (let c = 0; c < clmRows.length; c++) {
    const n = 1 + (c % 3);
    const targets = Array.from({ length: n }, (_, k) => srcRows[(c + k * 7) % srcRows.length]);
    const r = await writeRelationLinks(clmSources.id, clmRows[c], targets);
    links += r.added;
  }

  console.log("Fixture created:");
  console.log(`  ${PREFIX} Experiences  ${expId}  (12 rows)`);
  console.log(`  ${PREFIX} Claims       ${clmId}  (40 rows)`);
  console.log(`  ${PREFIX} Sources      ${srcId}  (24 rows)`);
  console.log(`  ${links} links`);
}

async function main() {
  localOnly();
  const args = process.argv.slice(2);
  const ownerFlag = args.indexOf("--owner");
  const email = ownerFlag >= 0 ? args[ownerFlag + 1] : DEFAULT_OWNER;
  const owner = await ownerId(email);
  if (args.includes("--cleanup")) await cleanup(owner);
  else if (args.includes("--realign")) await realign(owner);
  else await seed(owner);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
