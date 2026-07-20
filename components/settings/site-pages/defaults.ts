/**
 * Shared client-side defaults for the Site Pages composer — starter configs
 * per page kind and empty-section factories for "+ Add section".
 *
 * Client-safe: imports types only from the page-layout schema (zod, no Prisma).
 */

import type {
  SitePageConfig,
  PageSection,
  RecordListSection,
  DirectoryIndexSection,
  GardenCategoriesSection,
} from "@/lib/domain/page-layout/schema";

export type PageKind = "record" | "index" | "prose" | "garden";

export const KINDS: PageKind[] = ["record", "index", "prose", "garden"];

export const KIND_LABELS: Record<PageKind, string> = {
  record: "Record ledger",
  index: "Directory index",
  prose: "Prose",
  garden: "Garden",
};

export const SECTION_TYPE_LABELS: Record<PageSection["type"], string> = {
  recordList: "record list",
  directoryIndex: "directory index",
  gardenCategories: "garden categories",
};

export function emptyRecordList(): RecordListSection {
  return { type: "recordList", label: "— New section", sort: "date-desc", items: [] };
}

export function emptyDirectoryIndex(): DirectoryIndexSection {
  return { type: "directoryIndex", entries: [] };
}

export function emptyGardenCategories(): GardenCategoriesSection {
  return { type: "gardenCategories", categories: [] };
}

/** Starter config shown when creating a page of the given kind. */
export function starterConfig(kind: PageKind): SitePageConfig {
  switch (kind) {
    case "record":
      return {
        sections: [
          {
            type: "recordList",
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
    case "index":
      return {
        sections: [
          {
            type: "directoryIndex",
            entries: [
              {
                bind: "publicPath:/blog",
                title: "Writing",
                subtitle: "Essays and notes.",
              },
            ],
          },
        ],
      };
    case "garden":
      return {
        sections: [
          {
            type: "gardenCategories",
            categories: [
              {
                key: "writing",
                label: "Writing",
                title: "Writing",
                intro: "Essays and notes.",
                kind: "shoot",
                bind: "publicPath:/blog",
                items: [],
              },
            ],
          },
        ],
      };
    case "prose":
      return { sections: [] };
  }
}

/** Route segment for a slug — the API maps "" ⇄ "home". */
export function slugToSegment(slug: string): string {
  return slug.trim() === "" ? "home" : slug.trim();
}
