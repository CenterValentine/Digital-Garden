/**
 * SitePage config schema — the curation layer for code-driven tenant pages
 * (Work / Results, Field Notes, etc.).
 *
 * A SitePage ROW carries the page's identity in columns (slug, title, kind,
 * navLabel, navOrder, visibility). This `config` blob holds the composition.
 *
 * v1.1 model: ONE list builder. A page is a list of **sections**; a section is
 * a list of **items**; an item is either a single published page
 * (`ref: publicItem:<slug>`), a whole **directory** (`ref: publicPath:/<path>`,
 * which expands to its published pages at render time), or a manual entry.
 * There is no section "type" — the page's `kind` decides how the same shape is
 * rendered (record ledger vs garden). Legacy configs (recordList /
 * directoryIndex / gardenCategories) are migrated forward by migrateLegacyConfig.
 */

import { z } from "zod/v4";

/**
 * Rich emphasis string. Drives BOTH the text and the dual/tri font effect:
 *   "Digital *Garden*"    → primary serif + accent (gold italic → <em>)
 *   "Local-first, **x**"  → primary + third font (bold tier → <strong>)
 */
export const emphasisString = z.string().min(1);

/** How a section orders its items (esp. the pages an expanded directory adds). */
const sortMode = z.enum(["date-desc", "date-asc", "manual"]);

/**
 * A reference to published content.
 *   "publicItem:<slug>"   → a single published page (one row)
 *   "publicPath:/writing" → a whole directory → expands to its published pages
 */
export const contentRef = z
  .string()
  .regex(/^(publicItem|publicPath):/, "ref must be publicItem:<slug> or publicPath:<path>");

/** True when a ref points at a whole directory (which expands at render). */
export function isDirectoryRef(ref: string | undefined): boolean {
  return !!ref && ref.startsWith("publicPath:");
}

/**
 * One item in a section. Three flavours, all the same shape:
 *   • manual     — no `ref`; you author `title` and whatever fields the page
 *                  kind renders.
 *   • single     — `ref: publicItem:<slug>`; title/date/blurb inherit from the
 *                  published page, and any field set here overrides it.
 *   • directory  — `ref: publicPath:/<path>`; expands into the directory's
 *                  published pages at render (its own fields are ignored except
 *                  `hidden`).
 *
 * Fields are a superset across page kinds; each renderer reads what it needs:
 *   record ledger → title, type, year, date, status, statusLabel, blurb, facts
 *   garden        → title, meta, blurb, sub (DNA rungs)
 */
const listItem = z.object({
  ref: contentRef.optional(),
  title: emphasisString.optional(),
  subtitle: z.string().optional(),
  type: z.string().optional(),
  year: z.string().optional(),
  date: z.string().optional(), // sortable ISO (YYYY or YYYY-MM-DD)
  status: z.enum(["active", "done"]).default("done"),
  statusLabel: z.string().optional(),
  blurb: z.string().optional(),
  meta: z.string().optional(), // garden: "essay · 12 min"
  facts: z.array(z.tuple([z.string(), z.string()])).optional(),
  sub: z.array(z.object({ title: z.string(), note: z.string() })).optional(), // garden DNA
  timelineNote: z.string().optional(),
  hidden: z.boolean().optional(),
});

/**
 * A section is a labeled list. On a record page it renders as a ledger group
 * (the label is the kicker); on a garden page it renders as a category (the
 * label is the category name, `intro` its lede).
 */
const listSection = z.object({
  label: z.string().default(""),
  intro: z.string().optional(),
  sort: sortMode.default("date-desc"),
  // Garden only: does this category's leaf grow up (shoot) or down (root)?
  // Drives the `gl--root` engine class. Absent → "shoot". Ignored by other kinds.
  growth: z.enum(["shoot", "root"]).optional(),
  // Prose only: the section's h2 (emphasis-aware) and its margin pull-quote.
  // `label` is the kicker; items are paragraphs (each item's `blurb`).
  heading: emphasisString.optional(),
  aside: z.string().optional(),
  items: z.array(listItem).default([]),
});

export const sitePageConfig = z.object({
  sections: z.array(listSection).default([]),
});

/**
 * Column metadata for a SitePage, validated on write. Shared by the API route
 * and the admin form. `visibility` is the page's Draft/Live state; `navLabel`
 * (null = not in menu) + `navOrder` drive site navigation.
 */
export const sitePageInput = z.object({
  title: z.string().min(1).max(255),
  kind: z.enum(["record", "index", "prose", "garden"]),
  navLabel: z.string().max(120).nullish(),
  navOrder: z.number().int().default(0),
  visibility: z.enum(["draft", "published"]).default("draft"),
  config: sitePageConfig,
});

// ── Legacy migration ────────────────────────────────────────────────────────
// Maps the pre-v1.1 discriminated-union config (recordList / directoryIndex /
// gardenCategories) onto the unified list shape so existing rows keep working.

type LegacyItem = {
  ref?: string;
  title?: string;
  subtitle?: string;
  type?: string;
  year?: string;
  date?: string;
  status?: string;
  statusLabel?: string;
  blurb?: string;
  meta?: string;
  facts?: [string, string][];
  sub?: { title: string; note: string }[];
  timelineNote?: string;
  hidden?: boolean;
};
type LegacySection = {
  type?: string;
  label?: string;
  intro?: string;
  sort?: string;
  bind?: string;
  items?: LegacyItem[];
  entries?: { bind: string; title: string; subtitle?: string }[];
  categories?: {
    label: string;
    intro?: string;
    bind?: string;
    items?: LegacyItem[];
  }[];
};

/**
 * A legacy config has sections carrying a `type` discriminator. The new schema
 * would silently strip that (and the old section-level `bind`), so callers must
 * detect legacy BEFORE parsing and migrate first.
 */
export function isLegacyConfig(raw: unknown): raw is { sections: LegacySection[] } {
  if (!raw || typeof raw !== "object") return false;
  const sections = (raw as { sections?: unknown }).sections;
  return (
    Array.isArray(sections) &&
    sections.some((s) => s && typeof s === "object" && "type" in (s as object))
  );
}

/** Convert a legacy config object to the unified shape (best-effort, lossless). */
export function migrateLegacyConfig(raw: unknown): { sections: unknown[] } {
  if (!isLegacyConfig(raw)) return { sections: [] };
  const out: unknown[] = [];
  for (const s of raw.sections) {
    if (s.type === "recordList") {
      out.push({
        label: s.label ?? "",
        sort: s.sort ?? "date-desc",
        items: [
          ...(s.items ?? []),
          ...(s.bind ? [{ ref: s.bind }] : []), // section-level bind → a directory item
        ],
      });
    } else if (s.type === "directoryIndex") {
      out.push({
        label: s.label ?? "",
        items: (s.entries ?? []).map((e) => ({
          ref: e.bind,
          title: e.title,
          subtitle: e.subtitle,
        })),
      });
    } else if (s.type === "gardenCategories") {
      // Each legacy category becomes its own section.
      for (const cat of s.categories ?? []) {
        out.push({
          label: cat.label,
          intro: cat.intro,
          items: [
            ...(cat.items ?? []),
            ...(cat.bind ? [{ ref: cat.bind }] : []),
          ],
        });
      }
    }
  }
  return { sections: out };
}

export type SitePageInput = z.infer<typeof sitePageInput>;
export type SitePageConfig = z.infer<typeof sitePageConfig>;
export type ListSection = z.infer<typeof listSection>;
export type ListItem = z.infer<typeof listItem>;
export type ContentRef = z.infer<typeof contentRef>;
