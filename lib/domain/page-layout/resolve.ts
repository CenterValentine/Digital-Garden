/**
 * SitePage resolver — turns a stored SitePage `config` (+ bound published
 * content) into the serializable view-models the client pages render.
 *
 * Composition, not new queries: bound sections/items lean on the existing
 * tenancy resolvers (resolvePublicPath). Manual items are authored entirely in
 * the config; bound items (ref/bind) pull baseline facts from published content
 * and let the config overlay presentation on top.
 *
 * Every function is tenant-scoped and returns `null` when the page has no
 * config yet, so callers can fall back to their design-time default without a
 * branch in the view.
 */

import { prisma } from "@/lib/database/client";
import { resolvePublicPath } from "@/lib/domain/tenancy";
import {
  sitePageConfig,
  type RecordListSection,
  type RecordItem,
  type GardenItem as GardenItemConfig,
} from "./schema";
import type {
  WorkData,
  FieldNotesData,
  GardenData,
  GardenItem,
  ResolvedRecordEntry,
  ResolvedRecordSection,
  ResolvedTimelineEntry,
  ResolvedDirectoryEntry,
} from "./resolved";

/** Parse + validate a stored config blob; unknown/invalid → empty. */
function parseConfig(raw: unknown) {
  const parsed = sitePageConfig.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { sections: [] };
}

/**
 * Resolve options shared by all fetchers.
 *
 * `draft: true` reads pending composer edits (`draftConfig ?? config`) instead
 * of the published config. Callers are responsible for authorization — only
 * the tenant owner may see drafts (the page route checks the session before
 * passing `draft`). Published traffic never reads draftConfig.
 */
export interface ResolveOptions {
  draft?: boolean;
}

async function loadPage(tenantId: string, slug: string, opts?: ResolveOptions) {
  const page = await prisma.sitePage.findUnique({
    where: { tenantId_slug: { tenantId, slug } },
  });
  if (!page) return null;
  const raw = opts?.draft ? (page.draftConfig ?? page.config) : page.config;
  return { page, config: parseConfig(raw) };
}

/** Year label from an ISO/`YYYY` date string. */
function yearOf(date: string | null | undefined): string {
  if (!date) return "";
  return String(new Date(date).getFullYear());
}

/** Baseline record entry from a published item (before config overrides). */
function baselineFromPublished(item: {
  slug: string;
  publicTitle: string | null;
  firstPublishedAt: Date | null;
  path: { slug: string };
  blogPostPayload: { excerpt: string | null } | null;
}): ResolvedRecordEntry {
  const iso = item.firstPublishedAt?.toISOString();
  return {
    name: item.publicTitle ?? item.slug,
    type: "",
    year: yearOf(iso),
    status: "done",
    statusLabel: "",
    blurb: item.blogPostPayload?.excerpt ?? "",
    date: iso,
    href: `/${item.path.slug}/${item.slug}`,
  };
}

/** Apply a config item's overrides onto a (possibly published) baseline. */
function applyOverrides(base: ResolvedRecordEntry, item: RecordItem): ResolvedRecordEntry {
  return {
    ...base,
    name: item.title ?? base.name,
    type: item.type ?? base.type,
    year: item.year ?? base.year,
    status: item.status,
    statusLabel: item.statusLabel ?? base.statusLabel,
    blurb: item.blurb ?? base.blurb,
    // zod/v4 infers tuple elements as optional; the runtime values are pairs.
    facts: (item.facts as [string, string][] | undefined) ?? base.facts,
    date: item.date ?? base.date,
    timelineNote: item.timelineNote ?? base.timelineNote,
  };
}

/** Fetch a single published item baseline by slug (for `ref: publicItem:<slug>`). */
async function baselineByRefSlug(
  tenantId: string,
  slug: string,
): Promise<ResolvedRecordEntry | null> {
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
  return item ? baselineFromPublished(item) : null;
}

function refSlug(ref: string | undefined, kind: "publicItem" | "publicPath"): string | null {
  if (!ref) return null;
  const prefix = `${kind}:`;
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : null;
}

/** Resolve one recordList section: manual items + ref items + bound directory. */
async function resolveRecordSection(
  tenantId: string,
  section: RecordListSection,
): Promise<ResolvedRecordEntry[]> {
  const entries: ResolvedRecordEntry[] = [];

  // 1. Explicit items (manual, or ref → published baseline + overrides).
  for (const item of section.items) {
    if (item.hidden) continue;
    const slug = refSlug(item.ref, "publicItem");
    const base = slug ? await baselineByRefSlug(tenantId, slug) : null;
    const seed: ResolvedRecordEntry = base ?? {
      name: item.title ?? "Untitled",
      type: "",
      year: "",
      status: "done",
      statusLabel: "",
      blurb: "",
    };
    entries.push(applyOverrides(seed, item));
  }

  // 2. Whole bound directory → append each published item as a baseline row.
  const boundPath = refSlug(section.bind, "publicPath");
  if (boundPath) {
    const segments = boundPath.split("/").filter(Boolean);
    const resolved = await resolvePublicPath(tenantId, segments);
    if (resolved) {
      for (const pub of resolved.items) {
        entries.push(
          baselineFromPublished({
            slug: pub.slug,
            publicTitle: pub.publicTitle,
            firstPublishedAt: pub.firstPublishedAt,
            path: { slug: pub.path.slug },
            blogPostPayload: pub.blogPostPayload,
          }),
        );
      }
    }
  }

  // 3. Sort.
  if (section.sort !== "manual") {
    const dir = section.sort === "date-asc" ? 1 : -1;
    entries.sort((a, b) => dir * ((a.date ?? "").localeCompare(b.date ?? "")));
  }

  return entries;
}

/** "— Projects" → "Project" for timeline row types. */
function singularKicker(kicker: string): string {
  const clean = kicker.replace(/^[—\-\s]+/, "").trim();
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
 * Resolve the Work/Results page. Returns null when there's no `work` SitePage
 * (or it has no recordList sections) so the view keeps its design-time default.
 */
export async function fetchWorkData(
  tenantId: string,
  opts?: ResolveOptions,
): Promise<WorkData | null> {
  // Slug matches the route segment (/results) so the admin page slug == URL.
  const loaded = await loadPage(tenantId, "results", opts);
  if (!loaded) return null;

  const recordSections = loaded.config.sections.filter(
    (s): s is RecordListSection => s.type === "recordList",
  );
  if (recordSections.length === 0) return null;

  const ledger: ResolvedRecordSection[] = [];
  for (const section of recordSections) {
    ledger.push({
      kicker: section.label,
      entries: await resolveRecordSection(tenantId, section),
    });
  }

  return { ledger, timeline: deriveTimeline(ledger) };
}

/**
 * Resolve the Field Notes page — the first `directoryIndex` section, each entry
 * bound to a published directory (title/subtitle overridden, count resolved).
 */
export async function fetchFieldNotesData(
  tenantId: string,
  opts?: ResolveOptions,
): Promise<FieldNotesData | null> {
  // Slug matches the route segment (/blog).
  const loaded = await loadPage(tenantId, "blog", opts);
  if (!loaded) return null;

  const section = loaded.config.sections.find((s) => s.type === "directoryIndex");
  if (!section || section.type !== "directoryIndex") return null;

  const entries: ResolvedDirectoryEntry[] = [];
  for (const entry of section.entries) {
    const boundPath = refSlug(entry.bind, "publicPath");
    if (!boundPath) continue;
    const segments = boundPath.split("/").filter(Boolean);
    const resolved = await resolvePublicPath(tenantId, segments);
    entries.push({
      href: `/${segments.join("/")}`,
      title: entry.title,
      subtitle: entry.subtitle,
      // NOTE: resolvePublicPath caps items at 50; accurate for typical sections.
      count: resolved?.items.length ?? 0,
    });
  }

  return { entries };
}

/** Map a config garden item (manual or ref) onto a resolved GardenItem. */
async function resolveGardenItem(
  tenantId: string,
  item: GardenItemConfig,
): Promise<GardenItem> {
  const slug = refSlug(item.ref, "publicItem");
  const base = slug ? await baselineByRefSlug(tenantId, slug) : null;
  return {
    title: item.title ?? base?.name ?? "Untitled",
    meta: item.meta ?? base?.year ?? "",
    blurb: item.blurb ?? base?.blurb ?? "",
    sub: item.sub ?? [],
  };
}

/**
 * Resolve the Field Notes garden into the `window.CATS` object the leaf/DNA
 * engine reads. Each category = a leaf; bound directories contribute their
 * published posts as items (DNA `sub` authored per item). Returns null when
 * there's no `blog` SitePage config so FieldNotesPage keeps its static default.
 */
export async function fetchGardenData(
  tenantId: string,
  opts?: ResolveOptions,
): Promise<GardenData | null> {
  const loaded = await loadPage(tenantId, "blog", opts);
  if (!loaded) return null;

  const section = loaded.config.sections.find((s) => s.type === "gardenCategories");
  if (!section || section.type !== "gardenCategories") return null;

  const cats: GardenData = {};
  for (const cat of section.categories) {
    const items: GardenItem[] = [];

    // Manual / ref items first (they may carry authored DNA).
    for (const item of cat.items) {
      if (item.hidden) continue;
      items.push(await resolveGardenItem(tenantId, item));
    }

    // Bound directory → append its published posts (no DNA unless overridden).
    const boundPath = refSlug(cat.bind, "publicPath");
    if (boundPath) {
      const resolved = await resolvePublicPath(tenantId, boundPath.split("/").filter(Boolean));
      if (resolved) {
        for (const pub of resolved.items) {
          items.push({
            title: pub.publicTitle ?? pub.slug,
            meta: yearOf(pub.firstPublishedAt?.toISOString()),
            blurb: pub.blogPostPayload?.excerpt ?? "",
            sub: [],
          });
        }
      }
    }

    cats[cat.key] = {
      label: cat.label,
      title: cat.title,
      intro: cat.intro ?? "",
      kind: cat.kind,
      items,
    };
  }

  return cats;
}
