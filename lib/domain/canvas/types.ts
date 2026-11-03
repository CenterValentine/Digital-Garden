/**
 * Canvas archive — shared types (CANVAS-ARCHIVE-PLAN.md).
 *
 * Both sources (the Canvas REST API and a Common Cartridge `.imscc` file)
 * normalize a course into ONE `CourseSnapshot`. The planner turns a snapshot
 * plus what was imported before into a plan; the server applies it. Nothing
 * downstream of the snapshot knows which source produced it.
 *
 * Client-safe: no Prisma, no server-only imports.
 */

/** Canvas module item types, normalized. */
export type CanvasItemType =
  | "page"
  | "file"
  | "assignment"
  | "discussion"
  | "quiz"
  | "external_url"
  | "external_tool"
  | "subheader";

/** What a `CanvasSyncLink.canvasType` can say. */
export type CanvasLinkType =
  | "course"
  | "module"
  | "subheader"
  | "syllabus"
  | "report"
  | Exclude<CanvasItemType, "subheader">;

export type CanvasSourceKind = "api" | "cartridge";

/** Every node an import creates is one of these. */
export type CanvasNodeKind = "folder" | "note" | "file" | "external";

export interface SnapshotItem {
  /** Stable per course: the module item id (API) or item identifier (cartridge). */
  key: string;
  type: CanvasItemType;
  title: string;
  /**
   * The Canvas version of this item's content (updated_at for the API, a
   * content hash for cartridges). Null when the source can't tell — such an
   * item is never reported as changed.
   */
  version: string | null;
  /**
   * The item's identity for link rewriting ("page:<slug>", "file:<id>",
   * "assignment:<id>" …). Two module items pointing at the same page share it.
   */
  refKey: string | null;
  /** Source-specific pointer used to fetch the content (page slug, file id, path…). */
  ref: string | null;
  /** ExternalUrl / ExternalTool target. */
  externalUrl?: string | null;
  /** Where the item lives in Canvas, for "open in Canvas". */
  htmlUrl?: string | null;
  /** Locked for the student when the snapshot was taken (prerequisites, dates). */
  locked?: boolean;
  /** Byte size when known (files): large files stay links. */
  size?: number | null;
}

export interface SnapshotModule {
  /** Canvas module id (API) or module identifier (cartridge). */
  id: string;
  title: string;
  items: SnapshotItem[];
}

export interface CourseSnapshot {
  source: CanvasSourceKind;
  courseId: string;
  /** Course name as Canvas shows it. */
  name: string;
  courseCode: string | null;
  term: string | null;
  teachers: string[];
  htmlUrl: string | null;
  /** Null when the course has no syllabus body. */
  syllabus: { version: string | null } | null;
  modules: SnapshotModule[];
  /** Content the course has outside every module (not imported; reported). */
  unmoduled?: { pages: number; files: number };
}

/** The title the course folder carries: "BIO 201 — Cell Biology (Fall 2023)". */
export function courseFolderTitle(snapshot: Pick<CourseSnapshot, "name" | "courseCode" | "term">): string {
  const name = snapshot.name.trim() || "Canvas course";
  const code = snapshot.courseCode?.trim();
  const base = code && !name.toLowerCase().includes(code.toLowerCase()) ? `${code} — ${name}` : name;
  const term = snapshot.term?.trim();
  const titled = term && !base.includes(term) ? `${base} (${term})` : base;
  return titled.slice(0, 255);
}

/** The node kind a module item becomes (CANVAS-ARCHIVE-PLAN.md §5). */
export function nodeKindForItem(type: CanvasItemType): CanvasNodeKind {
  switch (type) {
    case "file":
      return "file";
    case "external_url":
    case "external_tool":
      return "external";
    case "subheader":
      return "folder";
    case "page":
    case "assignment":
    case "discussion":
    case "quiz":
      return "note";
  }
}

/** Link types whose node titles stay true to Canvas (§7). The report is the importer's own note. */
export function isTitleLockedType(type: string): boolean {
  return type !== "report";
}

/** How the user settles one conflict (§9.4). */
export type ConflictResolution = "skip" | "sibling";

/** Files above this size stay links to Canvas instead of being downloaded (§13.2). */
export const CANVAS_FILE_SIZE_LIMIT = 200 * 1024 * 1024;

/** A cartridge larger than this is refused rather than unpacked in memory. */
export const CANVAS_CARTRIDGE_SIZE_LIMIT = 250 * 1024 * 1024;

/** The one connection row every cartridge import shares (`CanvasConnection.baseUrl`). */
export const CARTRIDGE_CONNECTION_BASE_URL = "cartridge:local";

/** Progress line streamed (NDJSON) while an import or re-import runs. */
export interface CanvasProgressEvent {
  type: "progress";
  phase: "snapshot" | "folders" | "items" | "order" | "report";
  done: number;
  total: number;
  message: string;
}

/** Final line of the stream. */
export interface CanvasImportSummary {
  type: "done";
  courseRootId: string;
  courseTitle: string;
  counts: {
    created: number;
    replaced: number;
    unchanged: number;
    conflictsSkipped: number;
    siblingsAdded: number;
    removedUpstream: number;
    dismissed: number;
    failed: number;
  };
  /** One line per item that couldn't be captured, with the reason. */
  problems: string[];
}

export interface CanvasStreamError {
  type: "error";
  message: string;
}

export type CanvasStreamEvent = CanvasProgressEvent | CanvasImportSummary | CanvasStreamError;
