/**
 * SitePage config schema — the curation layer for code-driven tenant pages
 * (Work / Results, Field Notes, etc.).
 *
 * A SitePage ROW carries the page's identity in columns (slug, title, kind,
 * navLabel, navOrder, visibility) so the nav and page list are queryable. This
 * `config` blob holds only the composition: the sections and their bound/manual
 * items, plus presentation overrides. Published content is never mutated for
 * display — every display fact lives here.
 *
 * Single source of truth: the admin JSON box validates against it, the resolver
 * (lib/domain/page-layout/resolve.ts) reads it, the renderers map it to the
 * design, and a future visual builder reads/writes it.
 */

import { z } from "zod/v4";

/**
 * Rich emphasis string. Drives BOTH the text and the dual/tri font effect:
 *   "Digital *Garden*"    → primary serif + accent (gold italic → <em>)
 *   "Local-first, **x**"  → primary + third font (bold tier → <strong>)
 * Authored as markdown-ish emphasis so it stays hand-editable in raw JSON and
 * serializes over the wire (client <Emphasis> parses it back to JSX).
 */
export const emphasisString = z.string().min(1);

/** How a directory-bound section orders the items it pulls in. */
const sortMode = z.enum(["date-desc", "date-asc", "manual"]);

/**
 * A reference to published content.
 *   "publicItem:<slug>"   → a single published item
 *   "publicPath:/writing" → a whole published directory (used by `bind`)
 */
export const contentRef = z
  .string()
  .regex(/^(publicItem|publicPath):/, "ref must be publicItem:<slug> or publicPath:<path>");

/**
 * A row in the Work/Results "recordList" section.
 *
 * MANUAL item: no `ref`, you supply `title` (+ whatever else).
 * BOUND item:  has `ref` → inherits title/date from the published item; every
 *              field here is an OPTIONAL override on top.
 *
 * `status` is the SEMANTIC state (drives the pill colour, `.lr-status.<status>`);
 * `statusLabel` is the free display text ("Active", "Stable", "18 min", "Now").
 * `year` is the display string ("2021–", "2018–21"); `date` is the optional
 * sortable ISO used to build the derived Timeline tab.
 */
const recordItem = z.object({
  ref: contentRef.optional(),
  title: emphasisString.optional(),
  type: z.string().optional(), // "Tool / IDE", "Sync / CRDT", "Essay"
  year: z.string().optional(), // display, ranges allowed
  date: z.string().optional(), // sortable ISO (YYYY or YYYY-MM-DD) for timeline
  status: z.enum(["active", "done"]).default("done"),
  statusLabel: z.string().optional(),
  blurb: z.string().optional(),
  facts: z.array(z.tuple([z.string(), z.string()])).optional(),
  timelineNote: z.string().optional(), // the "growing tip" / "the root" annotations
  hidden: z.boolean().optional(),
});

/**
 * "recordList" — the Work/Results section: a labeled, tabular group of rows.
 * Rows are hand-listed (`items`) and/or pulled from a bound directory (`bind`).
 * Renders as the RECORD table; the TIMELINE tab reuses these items sorted by date.
 */
const recordListSection = z.object({
  type: z.literal("recordList"),
  label: emphasisString, // the section kicker, e.g. "Projects"
  bind: contentRef.optional(),
  sort: sortMode.default("date-desc"),
  items: z.array(recordItem).default([]),
});

/**
 * "directoryIndex" — the Field Notes section: a numbered list of published
 * directories, each with an overridable title + subtitle. Article counts come
 * from the bound directory at resolve time.
 */
const directoryIndexSection = z.object({
  type: z.literal("directoryIndex"),
  entries: z
    .array(
      z.object({
        bind: contentRef, // "publicPath:/engineering"
        title: emphasisString, // overrides the directory's own title
        subtitle: z.string().optional(),
      }),
    )
    .default([]),
});

/**
 * "gardenCategories" — the Field Notes garden. Feeds the leaf/DNA engine's
 * `window.CATS`. Each category maps to a leaf; each item to a vein; each `sub`
 * pair to a DNA rung. A category may `bind` a published directory (items auto-
 * derived from its posts) and/or list `items` by hand. Because published
 * content is only 2 levels deep, the 3rd level (DNA `sub`) is authored per item.
 */
const gardenItem = z.object({
  ref: contentRef.optional(),
  title: z.string().optional(),
  meta: z.string().optional(), // "essay · 12 min", "IDE · 2021–now"
  blurb: z.string().optional(),
  sub: z
    .array(z.object({ title: z.string(), note: z.string() }))
    .optional(), // the DNA rungs
  hidden: z.boolean().optional(),
});

const gardenCategoriesSection = z.object({
  type: z.literal("gardenCategories"),
  categories: z
    .array(
      z.object({
        key: z.string().min(1), // object key in window.CATS
        label: z.string(),
        title: z.string(),
        intro: z.string().optional(),
        kind: z.string().default("shoot"),
        bind: contentRef.optional(), // publicPath → items from its posts
        items: z.array(gardenItem).default([]),
      }),
    )
    .default([]),
});

/**
 * The section union. Add a new `type` here (hero, prose, gallery…) and the
 * renderer dispatch + builder pick it up — this discriminator is what turns
 * "David's two pages" into "one engine that renders anyone's pages."
 */
const pageSection = z.discriminatedUnion("type", [
  recordListSection,
  directoryIndexSection,
  gardenCategoriesSection,
]);

export const sitePageConfig = z.object({
  sections: z.array(pageSection).default([]),
});

/**
 * Column metadata for a SitePage, validated on write. `slug` identifies the
 * page within a tenant; the rest drive nav/visibility. Shared by the API route
 * and the admin form.
 */
export const sitePageInput = z.object({
  title: z.string().min(1).max(255),
  kind: z.enum(["record", "index", "prose", "garden"]),
  navLabel: z.string().max(120).nullish(),
  navOrder: z.number().int().default(0),
  visibility: z.enum(["draft", "published"]).default("draft"),
  config: sitePageConfig,
});

export type SitePageInput = z.infer<typeof sitePageInput>;

export type SitePageConfig = z.infer<typeof sitePageConfig>;
export type PageSection = z.infer<typeof pageSection>;
export type RecordListSection = z.infer<typeof recordListSection>;
export type DirectoryIndexSection = z.infer<typeof directoryIndexSection>;
export type GardenCategoriesSection = z.infer<typeof gardenCategoriesSection>;
export type GardenItem = z.infer<typeof gardenItem>;
export type RecordItem = z.infer<typeof recordItem>;
export type ContentRef = z.infer<typeof contentRef>;
