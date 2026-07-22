/**
 * SitePage resolver — turns a stored SitePage `config` into the serializable
 * view-models the client pages render.
 *
 * v1.1 unified model: a section is a list of items; each item is a single
 * published page (`publicItem:`), a directory (`publicPath:` → expands to its
 * published pages), or a manual entry. The same shape renders as a record
 * ledger (fetchWorkData) or the Field Notes garden (fetchGardenData) depending
 * on the page.
 *
 * Composition, not new queries: directories lean on the existing tenancy
 * resolver (resolvePublicPath). Every function is tenant-scoped and returns
 * `null` when the page has no sections, so callers fall back to their
 * design-time default without a branch in the view.
 */

import { prisma } from "@/lib/database/client";
import { resolvePublicPath } from "@/lib/domain/tenancy";
import {
  sitePageConfig,
  migrateLegacyConfig,
  isLegacyConfig,
  isDirectoryRef,
  type ListItem,
  type ListSection,
} from "./schema";
import type {
  WorkData,
  GardenData,
  GardenItem,
  ProseData,
  ResolvedRecordEntry,
  ResolvedRecordSection,
  ResolvedTimelineEntry,
} from "./resolved";

/**
 * Parse a stored config blob into the unified shape. Legacy configs (with a
 * section `type`) are migrated forward first — a direct parse would silently
 * strip the old discriminator and section-level bind.
 */
function parseConfig(raw: unknown) {
  const source = isLegacyConfig(raw) ? migrateLegacyConfig(raw) : (raw ?? {});
  const parsed = sitePageConfig.safeParse(source);
  return parsed.success ? parsed.data : { sections: [] };
}

/**
 * `draft: true` is OWNER PREVIEW — reads pending composer edits
 * (`draftConfig ?? config`) and bypasses the Draft/Live gate. Callers must
 * authorize it (only the tenant owner). For everyone else (`draft` falsy) a
 * page that isn't Live (`visibility !== "published"`) resolves to `null`, so
 * the public sees the page's built-in design default instead.
 */
export interface ResolveOptions {
  draft?: boolean;
}

async function loadPage(tenantId: string, slug: string, opts?: ResolveOptions) {
  const page = await prisma.sitePage.findUnique({
    where: { tenantId_slug: { tenantId, slug } },
  });
  if (!page) return null;
  const preview = opts?.draft === true;
  // Draft pages are invisible to the public — fall back to the design default.
  if (!preview && page.visibility !== "published") return null;
  const raw = preview ? (page.draftConfig ?? page.config) : page.config;
  return { page, config: parseConfig(raw) };
}

function yearOf(date: string | null | undefined): string {
  if (!date) return "";
  return String(new Date(date).getFullYear());
}

function refSlug(ref: string | undefined, kind: "publicItem" | "publicPath"): string | null {
  if (!ref) return null;
  const prefix = `${kind}:`;
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : null;
}

/** A published page reduced to the fields the view-models need. */
interface PublishedPage {
  slug: string;
  title: string;
  date?: string; // ISO
  excerpt: string;
  href: string;
}

function toPublishedPage(item: {
  slug: string;
  publicTitle: string | null;
  firstPublishedAt: Date | null;
  path: { slug: string };
  blogPostPayload: { excerpt: string | null } | null;
}): PublishedPage {
  return {
    slug: item.slug,
    title: item.publicTitle ?? item.slug,
    date: item.firstPublishedAt?.toISOString(),
    excerpt: item.blogPostPayload?.excerpt ?? "",
    href: `/${item.path.slug}/${item.slug}`,
  };
}

async function publishedBySlug(tenantId: string, slug: string): Promise<PublishedPage | null> {
  const item = await prisma.publicItem.findFirst({
    where: { tenantId, slug, state: "published", deletedAt: null },
    select: {
      slug: true,
      publicTitle: true,
      firstPublishedAt: true,
      path: { select: { slug: true } },
      blogPostPayload: { select: { excerpt: true } },
    },
  });
  return item ? toPublishedPage(item) : null;
}

async function publishedInDirectory(tenantId: string, path: string): Promise<PublishedPage[]> {
  const resolved = await resolvePublicPath(tenantId, path.split("/").filter(Boolean));
  if (!resolved) return [];
  return resolved.items.map((pub) =>
    toPublishedPage({
      slug: pub.slug,
      publicTitle: pub.publicTitle,
      firstPublishedAt: pub.firstPublishedAt,
      path: { slug: pub.path.slug },
      blogPostPayload: pub.blogPostPayload,
    }),
  );
}

// ── Record ledger (Work / Results) ──────────────────────────────────────────

function recordFromPublished(p: PublishedPage): ResolvedRecordEntry {
  return {
    name: p.title,
    type: "",
    year: yearOf(p.date),
    status: "done",
    statusLabel: "",
    blurb: p.excerpt,
    date: p.date,
    href: p.href,
  };
}

/** Apply a config item's overrides onto a baseline record entry. */
function applyRecordOverrides(base: ResolvedRecordEntry, item: ListItem): ResolvedRecordEntry {
  return {
    ...base,
    name: item.title ?? base.name,
    type: item.type ?? base.type,
    year: item.year ?? base.year,
    status: item.status,
    statusLabel: item.statusLabel ?? base.statusLabel,
    blurb: item.blurb ?? base.blurb,
    // zod/v4 infers tuple elements as optional; runtime values are pairs.
    facts: (item.facts as [string, string][] | undefined) ?? base.facts,
    date: item.date ?? base.date,
    timelineNote: item.timelineNote ?? base.timelineNote,
  };
}

/** Resolve a section's items into record rows (directories expand inline). */
async function resolveRecordEntries(
  tenantId: string,
  section: ListSection,
): Promise<ResolvedRecordEntry[]> {
  const entries: ResolvedRecordEntry[] = [];

  for (const item of section.items) {
    if (item.hidden) continue;

    if (isDirectoryRef(item.ref)) {
      const path = refSlug(item.ref, "publicPath");
      if (path) for (const p of await publishedInDirectory(tenantId, path)) entries.push(recordFromPublished(p));
      continue;
    }

    const itemSlug = refSlug(item.ref, "publicItem");
    const base = itemSlug ? await publishedBySlug(tenantId, itemSlug) : null;
    const seed: ResolvedRecordEntry = base
      ? recordFromPublished(base)
      : { name: item.title ?? "Untitled", type: "", year: "", status: "done", statusLabel: "", blurb: "" };
    entries.push(applyRecordOverrides(seed, item));
  }

  if (section.sort !== "manual") {
    const dir = section.sort === "date-asc" ? 1 : -1;
    entries.sort((a, b) => dir * ((a.date ?? "").localeCompare(b.date ?? "")));
  }
  return entries;
}

/** "— Projects" → "Project" for timeline row types. */
function singularKicker(kicker: string): string {
  const clean = kicker.replace(/^[—\-\s*]+/, "").replace(/\*+$/, "").trim();
  return clean.endsWith("s") ? clean.slice(0, -1) : clean;
}

/** Derive the Timeline tab from all dated record entries (newest first). */
function deriveTimeline(sections: ResolvedRecordSection[]): ResolvedTimelineEntry[] {
  const flat: { kind: string; e: ResolvedRecordEntry }[] = [];
  for (const s of sections) {
    const kind = singularKicker(s.kicker);
    for (const e of s.entries) if (e.date) flat.push({ kind, e });
  }
  flat.sort((a, b) => (b.e.date ?? "").localeCompare(a.e.date ?? ""));
  return flat.map(({ kind, e }, i) => ({
    side: i % 2 === 0 ? "right" : "left",
    isNow: i === 0 && e.status === "active",
    type: `${kind} · ${e.year}`,
    title: e.name,
    meta: e.type,
    body: e.blurb,
    note: e.timelineNote,
  }));
}

/**
 * Resolve the Work/Results page. Null when the `results` SitePage has no
 * sections, so the view keeps its design-time default.
 */
export async function fetchWorkData(
  tenantId: string,
  opts?: ResolveOptions,
): Promise<WorkData | null> {
  const loaded = await loadPage(tenantId, "results", opts);
  if (!loaded || loaded.config.sections.length === 0) return null;

  const ledger: ResolvedRecordSection[] = [];
  for (const section of loaded.config.sections) {
    ledger.push({
      kicker: section.label,
      entries: await resolveRecordEntries(tenantId, section),
    });
  }
  return { ledger, timeline: deriveTimeline(ledger) };
}

// ── Garden (Field Notes) ────────────────────────────────────────────────────

function slugifyKey(label: string, index: number): string {
  const key = label
    .replace(/\*+/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return key || `category-${index + 1}`;
}

async function resolveGardenItems(
  tenantId: string,
  section: ListSection,
): Promise<GardenItem[]> {
  const items: GardenItem[] = [];
  for (const item of section.items) {
    if (item.hidden) continue;

    if (isDirectoryRef(item.ref)) {
      const path = refSlug(item.ref, "publicPath");
      if (path) {
        for (const p of await publishedInDirectory(tenantId, path)) {
          items.push({ title: p.title, meta: yearOf(p.date), blurb: p.excerpt, sub: [] });
        }
      }
      continue;
    }

    const itemSlug = refSlug(item.ref, "publicItem");
    const base = itemSlug ? await publishedBySlug(tenantId, itemSlug) : null;
    items.push({
      title: item.title ?? base?.title ?? "Untitled",
      meta: item.meta ?? (base ? yearOf(base.date) : ""),
      blurb: item.blurb ?? base?.excerpt ?? "",
      sub: item.sub ?? [],
    });
  }
  return items;
}

/**
 * Resolve the Field Notes garden into `window.CATS`. Each section becomes a
 * category (leaf); its items become veins (directories expand to their posts).
 * Null when the `blog` SitePage has no sections.
 */
export async function fetchGardenData(
  tenantId: string,
  opts?: ResolveOptions,
): Promise<GardenData | null> {
  const loaded = await loadPage(tenantId, "blog", opts);
  if (!loaded || loaded.config.sections.length === 0) return null;

  const cats: GardenData = {};
  let i = 0;
  for (const section of loaded.config.sections) {
    const key = slugifyKey(section.label, i++);
    cats[key] = {
      label: section.label,
      title: section.label,
      intro: section.intro ?? "",
      kind: section.growth ?? "shoot",
      items: await resolveGardenItems(tenantId, section),
    };
  }
  return cats;
}

/**
 * Resolve a prose page's editable body (About). Each section → a narrative
 * block: `label` is the kicker, `heading` the h2, items' `blurb`s the
 * paragraphs, `aside` the margin pull-quote. Hero/intro/CTAs stay in the
 * component. Null when the page has no sections (component keeps its default).
 */
export async function fetchProseData(
  tenantId: string,
  slug: string,
  opts?: ResolveOptions,
): Promise<ProseData | null> {
  const loaded = await loadPage(tenantId, slug, opts);
  if (!loaded || loaded.config.sections.length === 0) return null;

  return {
    sections: loaded.config.sections.map((section) => ({
      kicker: section.label,
      heading: section.heading ?? "",
      paragraphs: section.items
        .filter((item) => !item.hidden)
        .map((item) => item.blurb ?? "")
        .filter((p) => p.trim().length > 0),
      aside: section.aside,
    })),
  };
}
