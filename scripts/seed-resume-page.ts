/**
 * Seed / verify the résumé ("resume") SitePage.
 *
 * Mirrors the live Growth Rings page (DEFAULT_RESUME_DATA in
 * lib/domain/page-layout/resume.ts) into a `resume` SitePage, so /resume
 * becomes JSON-editable while rendering identically. The four eras are fixed;
 * everything they say — and the page copy — is the config.
 *
 *   npx tsx scripts/seed-resume-page.ts --verify    # DB-free gate (pnpm resume:page:check)
 *   npx tsx scripts/seed-resume-page.ts             # upsert as a DRAFT (needs DATABASE_URL)
 *   npx tsx scripts/seed-resume-page.ts --publish   # …and make a NEW page Live at once
 *   … --tenant=<slug>                               # target tenant (default: the one that owns `results`)
 *
 * Existing page: only `draftConfig` is replaced — the Live config is never
 * touched; review at /resume?preview=draft, then Publish in the composer.
 */
import { sitePageInput, type SitePageConfig } from "../lib/domain/page-layout/schema";
import {
  DEFAULT_RESUME_DATA,
  resumeFromConfig,
  resumeToConfig,
  validateResumeConfig,
} from "../lib/domain/page-layout/resume";
import type { Prisma } from "../lib/database/generated/prisma";

/** Parse exactly as the API's PUT does — kind "resume" runs the shape validator. */
function parseAsApi(config: unknown) {
  return sitePageInput.safeParse({ title: "Résumé", kind: "resume", config });
}

/** A deep copy of the default config to break in one way. */
function seededConfig(): SitePageConfig {
  const parsed = parseAsApi(resumeToConfig(DEFAULT_RESUME_DATA));
  if (!parsed.success) throw new Error("default résumé does not parse");
  return structuredClone(parsed.data.config);
}

/**
 * Each case breaks the config in one way the validator must catch, at the
 * path it must name. A case the validator misses fails the gate.
 */
const MUST_CATCH: { name: string; path: string; mutate: (c: SitePageConfig) => void }[] = [
  { name: "three eras", path: "sections", mutate: (c) => void c.sections.pop() },
  { name: "five eras", path: "sections", mutate: (c) => void c.sections.push(structuredClone(c.sections[0])) },
  { name: "empty ring label", path: "sections.1.label", mutate: (c) => void (c.sections[1].label = "") },
  { name: "ring label too long", path: "sections.0.label", mutate: (c) => void (c.sections[0].label = "2021–PRESENT DAY") },
  { name: "padded ring label", path: "sections.2.label", mutate: (c) => void (c.sections[2].label = " 2020–23") },
  { name: "section field a résumé ignores", path: "sections.0.heading", mutate: (c) => void (c.sections[0].heading = "x") },
  {
    name: "era with every entry hidden",
    path: "sections.3.items",
    mutate: (c) => void c.sections[3].items.forEach((it) => (it.hidden = true)),
  },
  { name: "entry with a ref", path: "sections.0.items.0.ref", mutate: (c) => void (c.sections[0].items[0].ref = "publicItem:x") },
  { name: "entry with facts", path: "sections.1.items.0.facts", mutate: (c) => void (c.sections[1].items[0].facts = [["a", "b"]]) },
  { name: "missing year", path: "sections.0.items.0.year", mutate: (c) => void delete c.sections[0].items[0].year },
  { name: "blank meta", path: "sections.1.items.0.meta", mutate: (c) => void (c.sections[1].items[0].meta = "   ") },
  { name: "missing blurb", path: "sections.2.items.0.blurb", mutate: (c) => void delete c.sections[2].items[0].blurb },
  { name: "padded title", path: "sections.3.items.0.title", mutate: (c) => void (c.sections[3].items[0].title += " ") },
  {
    name: "unmatched * in title",
    path: "sections.0.items.0.title",
    mutate: (c) => void (c.sections[0].items[0].title = "Execution Engineer — *Independent"),
  },
  {
    name: "unmatched ** in blurb",
    path: "sections.1.items.0.blurb",
    mutate: (c) => void (c.sections[1].items[0].blurb += " **dangling"),
  },
  { name: "no tags", path: "sections.0.items.0.tags", mutate: (c) => void (c.sections[0].items[0].tags = []) },
  {
    name: "duplicate tag (case-insensitive)",
    path: "sections.1.items.0.tags.1",
    mutate: (c) => void (c.sections[1].items[0].tags = ["RevOps", "revops"]),
  },
  { name: "blank tag", path: "sections.2.items.0.tags.0", mutate: (c) => void (c.sections[2].items[0].tags![0] = " ") },
  {
    name: "too many tags",
    path: "sections.2.items.0.tags",
    mutate: (c) => void (c.sections[2].items[0].tags = ["a", "b", "c", "d", "e", "f", "g", "h", "i"]),
  },
  { name: "blank page heading", path: "page.heading", mutate: (c) => void (c.page!.heading = " ") },
  { name: "unmatched * in page heading", path: "page.heading", mutate: (c) => void (c.page!.heading = "The Growth *Rings.") },
  { name: "button with a bad href", path: "page.ctas.1.href", mutate: (c) => void (c.page!.ctas![1].href = "results") },
  { name: "two primary buttons", path: "page.ctas", mutate: (c) => void (c.page!.ctas![1].primary = true) },
  { name: "button with no label", path: "page.ctas.2.label", mutate: (c) => void (c.page!.ctas![2].label = "") },
];

/** Shapes that are valid and must NOT be refused (a résumé is allowed to grow). */
const MUST_ACCEPT: { name: string; mutate: (c: SitePageConfig) => void }[] = [
  {
    name: "two entries in one era",
    mutate: (c) => void c.sections[2].items.push({ ...structuredClone(c.sections[2].items[0]), year: "2020–21" }),
  },
  { name: "one hidden entry beside a visible one", mutate: (c) => void c.sections[0].items.push({ ...structuredClone(c.sections[0].items[0]), hidden: true }) },
  { name: "no page block (all copy defaults)", mutate: (c) => void delete c.page },
  { name: "partial page block", mutate: (c) => void (c.page = { hint: "hover a ring" }) },
  { name: "external and mail buttons", mutate: (c) => void (c.page!.ctas = [{ label: "PDF", href: "https://example.com/r.pdf", primary: true }, { label: "Email", href: "mailto:x@example.com" }]) },
];

function verify(): void {
  const problems: string[] = [];

  // (1) The live page's content passes the API's own validation…
  const parsed = parseAsApi(resumeToConfig(DEFAULT_RESUME_DATA));
  if (!parsed.success) {
    console.error("✗ default résumé is refused:\n  " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  "));
    process.exit(1);
  }
  console.log(`✓ default résumé parses through sitePageInput (kind resume): ${parsed.data.config.sections.length} eras`);

  // (2) …and comes back out exactly — what /resume renders from the seed is
  // what it renders today.
  const roundTrip = resumeFromConfig(parsed.data.config);
  if (JSON.stringify(roundTrip) !== JSON.stringify(DEFAULT_RESUME_DATA)) {
    problems.push("round trip: resumeFromConfig(seed) differs from DEFAULT_RESUME_DATA");
  } else {
    const entries = roundTrip.eras.reduce((n, e) => n + e.entries.length, 0);
    console.log(`✓ round-trip fidelity: ${roundTrip.eras.length} eras, ${entries} entries, page copy + ${roundTrip.copy.ctas.length} buttons identical`);
  }

  // (2b) The same with EVERY value changed. The default round trip alone can't
  // tell "read the config" from "fell back to the default" — the values are
  // equal — so a mapper ignoring the JSON would pass (2). Here it can't.
  const altered: typeof DEFAULT_RESUME_DATA = {
    eras: DEFAULT_RESUME_DATA.eras.map((era, e) => ({
      label: `ERA ${e + 1}`,
      entries: era.entries.map((entry, j) => ({
        year: `${2000 + e}–${j}`,
        title: `Role ${e}.${j} — *Org ${e}*`,
        meta: `meta ${e}.${j}`,
        blurb: `Did things ${e}.${j}. **Result ${e}.${j}.** After.`,
        tags: [`tag ${e}a`, `tag ${e}b`],
      })),
    })),
    copy: {
      kicker: "alt kicker",
      heading: "Alt *heading.*",
      subtitle: "alt subtitle",
      hint: "alt hint",
      footnote: "alt footnote",
      ctas: [
        { label: "Get PDF", href: "https://example.com/cv.pdf", primary: true },
        { label: "Mail", href: "mailto:me@example.com", ariaLabel: "Send mail" },
      ],
    },
  };
  const alteredParsed = parseAsApi(resumeToConfig(altered));
  if (!alteredParsed.success) {
    problems.push("altered résumé is refused: " + alteredParsed.error.issues[0]?.message);
  } else if (JSON.stringify(resumeFromConfig(alteredParsed.data.config)) !== JSON.stringify(altered)) {
    problems.push("round trip (every value changed): the page would not show what the JSON says");
  } else {
    console.log("✓ round-trip with every value changed: the page renders the JSON, not the defaults");
  }

  // (2c) "Hide from the page" hides: a hidden entry never reaches the renderer.
  const withHidden = seededConfig();
  withHidden.sections[0].items.push({ ...structuredClone(withHidden.sections[0].items[0]), title: "Hidden — *entry*", hidden: true });
  const shown = resumeFromConfig(withHidden).eras[0].entries;
  if (shown.length !== DEFAULT_RESUME_DATA.eras[0].entries.length || shown.some((e) => e.title === "Hidden — *entry*")) {
    problems.push("a hidden entry still renders");
  } else {
    console.log("✓ hidden entries stay off the page");
  }

  // (3) Every broken shape is caught, at the right path.
  for (const c of MUST_CATCH) {
    const config = seededConfig();
    c.mutate(config);
    const issues = validateResumeConfig(config);
    const hit = issues.some((i) => i.path.join(".") === c.path);
    if (!hit) {
      problems.push(
        `missed "${c.name}" — expected an issue at ${c.path}; got ${issues.length ? issues.map((i) => i.path.join(".")).join(", ") : "none"}`,
      );
    }
  }
  console.log(`✓ ${MUST_CATCH.length - problems.filter((p) => p.startsWith("missed")).length}/${MUST_CATCH.length} broken shapes caught at their path`);

  // (4) Valid variations are accepted — the validator doesn't over-reach.
  let accepted = 0;
  for (const c of MUST_ACCEPT) {
    const config = seededConfig();
    c.mutate(config);
    const issues = validateResumeConfig(config);
    if (issues.length) problems.push(`refused valid "${c.name}": ${issues[0].message}`);
    else accepted++;
  }
  console.log(`✓ ${accepted}/${MUST_ACCEPT.length} valid variations accepted`);

  if (problems.length) {
    console.error("✗ résumé page check failed:\n  " + problems.join("\n  "));
    process.exit(1);
  }
  console.log("VERIFY PASS");
}

async function seed(): Promise<void> {
  const publish = process.argv.includes("--publish");
  const tenantArg = process.argv.find((a) => a.startsWith("--tenant="))?.slice("--tenant=".length);

  const parsed = parseAsApi(resumeToConfig(DEFAULT_RESUME_DATA));
  if (!parsed.success) throw new Error("default résumé is refused — run with --verify");
  const config = parsed.data.config as unknown as Prisma.InputJsonValue;

  const { prisma } = await import("../lib/database/client");
  const tenantId = tenantArg
    ? (await prisma.tenant.findFirst({ where: { slug: tenantArg } }))?.id
    : ((await prisma.sitePage.findFirst({ where: { slug: "results" } }))?.tenantId ??
      (await prisma.tenant.findFirst({ where: { isPersonal: true } }))?.id);
  if (!tenantId) throw new Error(tenantArg ? `No tenant with slug "${tenantArg}"` : "No target tenant (no results page, no personal tenant)");

  const existing = await prisma.sitePage.findUnique({
    where: { tenantId_slug: { tenantId, slug: "resume" } },
  });
  if (existing) {
    await prisma.sitePage.update({ where: { id: existing.id }, data: { draftConfig: config } });
    console.log(`✓ resume SitePage ${existing.id} exists — replaced its DRAFT only (Live config untouched).`);
    console.log("  Review at /resume?preview=draft, then Publish in Settings → Site Pages.");
  } else {
    const page = await prisma.sitePage.create({
      data: {
        tenantId,
        slug: "resume",
        title: "Résumé",
        kind: "resume",
        visibility: publish ? "published" : "draft",
        config,
        draftConfig: publish ? undefined : config,
      },
    });
    console.log(`✓ created resume SitePage ${page.id} (tenant ${tenantId}) as ${publish ? "LIVE" : "DRAFT"}.`);
    if (!publish) console.log("  Review at /resume?preview=draft, then Publish in Settings → Site Pages.");
  }
  await prisma.$disconnect();
}

if (process.argv.includes("--verify")) {
  verify();
} else {
  seed().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
