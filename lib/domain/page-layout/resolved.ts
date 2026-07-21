/**
 * Resolved view-models — the SERIALIZABLE shapes the client pages consume.
 *
 * The resolver (resolve.ts) turns a SitePage `config` (+ bound published
 * content) into these. They deliberately mirror WorkResultsPage's / the Field
 * Notes design's existing field names, except `name`/`title` are emphasis
 * STRINGS (not ReactNode) so they cross the server→client boundary; the client
 * <Emphasis> component parses "Digital *Garden*" back into JSX.
 */

/** One row in the Record ledger. */
export interface ResolvedRecordEntry {
  name: string; // emphasis string
  type: string;
  year: string;
  status: "active" | "done";
  statusLabel: string;
  blurb: string;
  facts?: [string, string][];
  /** Sortable ISO used to build the Timeline; absent = excluded from timeline. */
  date?: string;
  /** Present when the row is bound to a published item — makes the row a link. */
  href?: string;
  timelineNote?: string;
}

export interface ResolvedRecordSection {
  kicker: string; // emphasis string, e.g. "— Projects"
  entries: ResolvedRecordEntry[];
}

export interface ResolvedTimelineEntry {
  side: "left" | "right";
  isNow?: boolean;
  type: string; // e.g. "Project · 2023"
  title: string; // emphasis string
  meta: string;
  body: string;
  note?: string;
}

/** What WorkResultsPage renders. */
export interface WorkData {
  ledger: ResolvedRecordSection[];
  timeline: ResolvedTimelineEntry[];
}

/** One numbered directory row in Field Notes. */
export interface ResolvedDirectoryEntry {
  href: string;
  title: string; // emphasis string
  subtitle?: string;
  count: number;
}

export interface FieldNotesData {
  entries: ResolvedDirectoryEntry[];
}

// ── Garden (Field Notes leaf/DNA engine) ────────────────────────────────────
// Mirrors the shape the engine reads from `window.CATS`.

export interface GardenDNA {
  title: string;
  note: string;
}

export interface GardenItem {
  title: string;
  meta: string;
  blurb: string;
  sub: GardenDNA[];
}

export interface GardenCategory {
  label: string;
  title: string;
  intro: string;
  kind: string;
  items: GardenItem[];
}

/** The full `window.CATS` object, keyed by category. */
export type GardenData = Record<string, GardenCategory>;
