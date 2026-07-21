/**
 * Shared client-side defaults for the Site Pages composer (v1.1 unified model).
 * A page is a list of sections; a section is a list of items; an item is a
 * single page, a directory, or manual. Page `kind` decides rendering, not the
 * section shape — so there's one section factory, not three.
 */

import type { SitePageConfig, ListSection } from "@/lib/domain/page-layout/schema";

export type PageKind = "record" | "index" | "prose" | "garden";

export const KINDS: PageKind[] = ["record", "index", "prose", "garden"];

export const KIND_LABELS: Record<PageKind, string> = {
  record: "Record ledger",
  index: "Simple list",
  prose: "Prose",
  garden: "Garden",
};

/** Short helper text shown under the kind selector. */
export const KIND_HELP: Record<PageKind, string> = {
  record: "A ledger of rows (projects, writing, roles) with an expandable drawer.",
  index: "A plain list of pages and directories.",
  prose: "Freeform — sections render as simple blocks.",
  garden: "The Field Notes garden — sections become leaves, items become veins.",
};

export function emptySection(): ListSection {
  return { label: "— New section", sort: "date-desc", items: [] };
}

/** Starter config shown when creating a page of the given kind. */
export function starterConfig(kind: PageKind): SitePageConfig {
  switch (kind) {
    case "record":
      return {
        sections: [
          {
            label: "— Projects",
            sort: "date-desc",
            items: [
              {
                title: "Digital *Garden*",
                type: "Tool / IDE",
                year: "2021–",
                date: "2021-01-01",
                status: "active",
                statusLabel: "Active",
                blurb: "Short description.",
              },
            ],
          },
        ],
      };
    case "garden":
      return {
        sections: [
          { label: "Writing", intro: "Essays and notes.", sort: "date-desc", items: [] },
        ],
      };
    case "index":
      return {
        sections: [{ label: "", sort: "date-desc", items: [] }],
      };
    case "prose":
      return { sections: [] };
  }
}

/** Route segment for a slug — the API maps "" ⇄ "home". */
export function slugToSegment(slug: string): string {
  return slug.trim() === "" ? "home" : slug.trim();
}

/**
 * The personal-site routes that actually render a composed page today, and the
 * page kind each expects. Used to tell the author whether a slug is wired.
 * (Generic per-tenant routing is future work.)
 */
const PERSONAL_ROUTES: Record<string, { kind: PageKind; label: string }> = {
  results: { kind: "record", label: "Results / Work" },
  blog: { kind: "garden", label: "Field Notes" },
};

export type RouteStatus = "wired" | "wrong-kind" | "home" | "unwired";

/** What URL a (slug, kind) drives on the personal site, and whether it renders. */
export function routeInfo(
  slug: string,
  kind: PageKind,
): { url: string; status: RouteStatus; note: string } {
  const s = slug.trim();
  if (s === "") {
    return {
      url: "/",
      status: "home",
      note: "Home renders the garden — a record/list page here won't show. Give it a slug like “results”.",
    };
  }
  const known = PERSONAL_ROUTES[s];
  if (known) {
    if (known.kind !== kind) {
      return { url: `/${s}`, status: "wrong-kind", note: `/${s} (${known.label}) expects a “${known.kind}” page — this is “${kind}”.` };
    }
    return { url: `/${s}`, status: "wired", note: `Renders at davidvalentine.org/${s}` };
  }
  return {
    url: `/${s}`,
    status: "unwired",
    note: `No /${s} route on your site yet — this won't render until that page exists.`,
  };
}
