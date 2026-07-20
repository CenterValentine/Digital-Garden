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
