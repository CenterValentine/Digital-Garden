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

// ── Prose (About narrative) ──────────────────────────────────────────────────
// The editable body sections of a prose page. Hero / intro / CTAs stay code.

export interface ProseSection {
  kicker: string; // emphasis string — the `sec-kicker`
  heading: string; // emphasis string — the h2, e.g. "Structure in *motion.*"
  paragraphs: string[]; // emphasis strings, each a <p>
  aside?: string; // margin pull-quote; newlines render as <br>
}

/** What AboutPage renders for its editable body (hero/intro/CTAs stay code). */
export interface ProseData {
  sections: ProseSection[];
}

// ── Résumé (growth rings) ────────────────────────────────────────────────────
// Exactly RESUME_ERA_COUNT eras — the ring's bands are fixed geometry; what each
// era SAYS is data. eras[0] is the innermost ring (the most recent chapter).

export interface ResumeEntry {
  year: string; // the entry's year column, e.g. "2021–now"
  title: string; // emphasis string — "Role — *Org*"
  meta: string; // the mono line under the title
  blurb: string; // emphasis string — **bold** renders as <b>
  tags: string[];
}

export interface ResumeEra {
  label: string; // the ring label, e.g. "2021–NOW"
  entries: ResumeEntry[];
}

export interface ResumeCta {
  label: string;
  href: string; // "/path" → in-app link; "#", http(s), mailto → plain <a>
  primary?: boolean;
  ariaLabel?: string;
}

/** The résumé's page-level copy (the site identity in the left head stays code). */
export interface ResumeCopy {
  kicker: string;
  heading: string; // emphasis string — "The Growth *Rings.*"
  subtitle: string;
  hint: string;
  footnote: string;
  ctas: ResumeCta[];
}

export interface ResumeData {
  eras: ResumeEra[];
  copy: ResumeCopy;
}
