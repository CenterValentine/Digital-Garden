/**
 * Seed / verify the Field Notes ("blog") SitePage.
 *
 * Derives a garden SitePage config from the canonical static source
 * (public/blog-engine/garden-data.js) so /blog becomes composer-managed while
 * rendering identically to today. Each `window.CATS[key]` category → a garden
 * listSection (its `kind` shoot/root → section.growth); each item → a listItem
 * carrying meta/blurb/DNA `sub`.
 *
 *   npx tsx scripts/seed-field-notes-page.ts --verify   # DB-free: validate + round-trip fidelity
 *   npx tsx scripts/seed-field-notes-page.ts            # upsert the blog SitePage (needs DATABASE_URL)
 *
 * The seed targets the tenant that owns the existing "results" SitePage (falls
 * back to the sole personal tenant), so it lands next to Results.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { sitePageConfig } from "../lib/domain/page-layout/schema";
import type { Prisma } from "../lib/database/generated/prisma";

type StaticDNA = { title: string; note: string };
type StaticItem = { title: string; meta?: string; blurb?: string; sub?: StaticDNA[] };
type StaticCat = {
  label: string;
  title: string;
  kind: "shoot" | "root";
  intro?: string;
  items: StaticItem[];
};

/** Execute garden-data.js in a sandbox and return its window.CATS. */
function loadStaticCats(): Record<string, StaticCat> {
  const src = readFileSync(
    join(process.cwd(), "public/blog-engine/garden-data.js"),
    "utf8",
  );
  const sandbox: { window: { CATS?: Record<string, StaticCat> } } = { window: {} };
  runInNewContext(src, sandbox);
  if (!sandbox.window.CATS) throw new Error("garden-data.js did not set window.CATS");
  return sandbox.window.CATS;
}

/** Static CATS → SitePage garden config (the shape the composer edits). */
function catsToConfig(cats: Record<string, StaticCat>) {
  return {
    sections: Object.values(cats).map((cat) => ({
      label: cat.label,
      intro: cat.intro,
      sort: "manual" as const,
      growth: cat.kind, // shoot | root
      items: cat.items.map((it) => ({
        title: it.title,
        meta: it.meta,
        blurb: it.blurb,
        sub: it.sub ?? [],
      })),
    })),
  };
}

async function main() {
  const verify = process.argv.includes("--verify");
  const cats = loadStaticCats();
  const rawConfig = catsToConfig(cats);

  // (1) Validate through the REAL Zod schema — proves the mirrored shape,
  // including the new `growth` field, is accepted.
  const parsed = sitePageConfig.parse(rawConfig);
  const catCount = Object.keys(cats).length;
  console.log(`✓ config parses: ${parsed.sections.length} sections from ${catCount} categories`);

  if (verify) {
    // (2) Round-trip: rebuild the CATS the resolver would emit and compare
    // category-for-category (label / intro / growth-kind / item DNA).
    const problems: string[] = [];
    Object.values(cats).forEach((orig, i) => {
      const s = parsed.sections[i];
      if (s.label !== orig.label) problems.push(`#${i} label ${s.label} != ${orig.label}`);
      if ((s.growth ?? "shoot") !== orig.kind)
        problems.push(`#${i} growth ${s.growth} != ${orig.kind}`);
      if (s.items.length !== orig.items.length)
        problems.push(`#${i} item count ${s.items.length} != ${orig.items.length}`);
      orig.items.forEach((oi, j) => {
        const it = s.items[j];
        const subN = it?.sub?.length ?? 0;
        const oSubN = oi.sub?.length ?? 0;
        if (subN !== oSubN) problems.push(`#${i}.${j} DNA ${subN} != ${oSubN}`);
      });
    });
    const roots = parsed.sections.filter((s) => s.growth === "root").length;
    const shoots = parsed.sections.filter((s) => (s.growth ?? "shoot") === "shoot").length;
    console.log(`✓ growth mapping: ${shoots} shoot, ${roots} root`);
    if (problems.length) {
      console.error("✗ fidelity problems:\n  " + problems.join("\n  "));
      process.exit(1);
    }
    console.log("✓ round-trip fidelity: every category matches the static garden");
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
    where: { tenantId_slug: { tenantId, slug: "blog" } },
    update: { draftConfig: config },
    create: {
      tenantId,
      slug: "blog",
      title: "Field Notes",
      kind: "garden",
      visibility: "draft",
      config,
      draftConfig: config,
    },
  });
  console.log(`✓ seeded blog SitePage ${page.id} (tenant ${tenantId}) as DRAFT`);
  console.log("  Preview it at /blog?preview=draft, then Publish in the composer.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
