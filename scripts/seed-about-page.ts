/**
 * Seed / verify the About ("about") SitePage.
 *
 * Mirrors the canonical About narrative (lib/domain/page-layout/about-default)
 * into a prose SitePage so /about becomes composer-editable while rendering
 * identically. Each ProseSection → a listSection (kicker → label, heading,
 * aside; each paragraph → an item's blurb). Hero / intro / CTAs stay in code.
 *
 *   npx tsx scripts/seed-about-page.ts --verify   # DB-free: validate + round-trip fidelity
 *   npx tsx scripts/seed-about-page.ts            # upsert the about SitePage (needs DATABASE_URL)
 */
import { sitePageConfig } from "../lib/domain/page-layout/schema";
import { DEFAULT_ABOUT_DATA } from "../lib/domain/page-layout/about-default";
import type { Prisma } from "../lib/database/generated/prisma";

/** ProseData → SitePage prose config (the shape the composer edits). */
function proseToConfig(data: typeof DEFAULT_ABOUT_DATA) {
  return {
    sections: data.sections.map((s) => ({
      label: s.kicker,
      sort: "manual" as const,
      heading: s.heading,
      aside: s.aside,
      items: s.paragraphs.map((p) => ({ blurb: p })),
    })),
  };
}

async function main() {
  const verify = process.argv.includes("--verify");
  const rawConfig = proseToConfig(DEFAULT_ABOUT_DATA);

  // (1) Validate through the REAL Zod schema — proves the prose shape
  // (heading + aside + paragraph blurbs) is accepted.
  const parsed = sitePageConfig.parse(rawConfig);
  console.log(`✓ config parses: ${parsed.sections.length} sections`);

  if (verify) {
    // (2) Round-trip: rebuild what fetchProseData emits and compare to the
    // canonical narrative — kicker / heading / paragraphs / aside.
    const problems: string[] = [];
    DEFAULT_ABOUT_DATA.sections.forEach((orig, i) => {
      const s = parsed.sections[i];
      const paragraphs = s.items
        .filter((it) => !it.hidden)
        .map((it) => it.blurb ?? "")
        .filter((p) => p.trim().length > 0);
      if (s.label !== orig.kicker) problems.push(`#${i} kicker ${s.label} != ${orig.kicker}`);
      if ((s.heading ?? "") !== orig.heading) problems.push(`#${i} heading mismatch`);
      if ((s.aside ?? undefined) !== orig.aside) problems.push(`#${i} aside mismatch`);
      if (paragraphs.length !== orig.paragraphs.length)
        problems.push(`#${i} paragraph count ${paragraphs.length} != ${orig.paragraphs.length}`);
      orig.paragraphs.forEach((p, j) => {
        if (paragraphs[j] !== p) problems.push(`#${i}.${j} paragraph text mismatch`);
      });
    });
    if (problems.length) {
      console.error("✗ fidelity problems:\n  " + problems.join("\n  "));
      process.exit(1);
    }
    const paras = parsed.sections.reduce((n, s) => n + s.items.length, 0);
    console.log(`✓ round-trip fidelity: ${parsed.sections.length} sections, ${paras} paragraphs match the narrative`);
    console.log("VERIFY PASS");
    return;
  }

  // Seed mode — needs a DB.
  const { prisma } = await import("../lib/database/client");
  const anchor = await prisma.sitePage.findFirst({ where: { slug: "results" } });
  const tenantId =
    anchor?.tenantId ??
    (await prisma.tenant.findFirst({ where: { isPersonal: true } }))?.id;
  if (!tenantId) throw new Error("No target tenant (no results page, no personal tenant)");

  const config = parsed as unknown as Prisma.InputJsonValue;
  const page = await prisma.sitePage.upsert({
    where: { tenantId_slug: { tenantId, slug: "about" } },
    update: { draftConfig: config },
    create: {
      tenantId,
      slug: "about",
      title: "About",
      kind: "prose",
      visibility: "draft",
      config,
      draftConfig: config,
    },
  });
  console.log(`✓ seeded about SitePage ${page.id} (tenant ${tenantId}) as DRAFT`);
  console.log("  Preview it at /about?preview=draft, then Publish in the composer.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
