/**
 * Per-type faces (client-safe).
 *
 * A face is the set of type-specific fields a Work's card, details view and
 * reader show (RESEARCH-READER-PLAN.md §2.2.1). The common fields (title,
 * authors, year, venue, abstract…) live on `Work`; `Work.face` holds the rest,
 * validated here per type. Domain packs add faces by registering a schema —
 * never a new screen.
 *
 * Validation is lenient by design: an unknown field is dropped and a malformed
 * one is dropped, never the whole Work. Sources send partial and odd data; the
 * face only promises that what it keeps has the declared shape.
 */

import { z } from "zod/v4";
import type { WorkType } from "./types";

const text = z.string().trim().min(1).max(2000);
const shortText = z.string().trim().min(1).max(300);
const isoDate = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/);

/** Journal / conference articles, chapters, theses, reports. */
const scholarlyFace = z.object({
  volume: shortText,
  issue: shortText,
  pages: shortText,
  publisher: shortText,
  issn: z.array(shortText).max(10),
  published: isoDate,
  fields: z.array(shortText).max(20),
  /** "journal-article", "proceedings-article" … as the source names it. */
  genre: shortText,
});

/** Preprints: which server, which version, and the journal version if any. */
const preprintFace = scholarlyFace.extend({
  server: shortText,
  version: shortText,
  /** DOI of the published version, when the server knows it. */
  publishedAs: shortText,
});

/** OpenReview peer reviews: the paper they review and their verdict. */
const reviewFace = z.object({
  forum: shortText,
  rating: shortText,
  confidence: shortText,
  decision: shortText,
});

/** ClinicalTrials.gov records. */
const trialFace = z.object({
  phase: shortText,
  status: shortText,
  conditions: z.array(shortText).max(50),
  interventions: z.array(shortText).max(50),
  enrollment: z.number().int().nonnegative(),
  sponsor: shortText,
  started: isoDate,
  completed: isoDate,
  hasResults: z.boolean(),
});

/** Court opinions (Law pack; V1.0 stub resolves these to link nodes). */
const caseFace = z.object({
  court: shortText,
  decided: isoDate,
  docket: shortText,
  /** Every reporter citation for the case, display form ("410 U.S. 113"). */
  citations: z.array(shortText).max(20),
  judges: z.array(shortText).max(20),
});

/**
 * Statutes and regulations: a unit inside a hierarchical corpus
 * (RESEARCH-READER-PLAN.md §9.3) — the path names its place in the tree.
 */
const statuteFace = z.object({
  jurisdiction: shortText,
  /** Root-to-unit labels: ["Title 12", "Chapter X", "Part 1026", "§ 1026.19"]. */
  path: z.array(shortText).max(12),
  heading: text,
  /** Point-in-time the text was read at. */
  asOf: isoDate,
});

const datasetFace = z.object({
  repository: shortText,
  version: shortText,
  formats: z.array(shortText).max(20),
  sizeBytes: z.number().nonnegative(),
});

const patentFace = z.object({
  kind: shortText,
  assignees: z.array(shortText).max(20),
  filed: isoDate,
  granted: isoDate,
  classifications: z.array(shortText).max(50),
  family: z.array(shortText).max(200),
});

const archivalFace = z.object({
  repository: shortText,
  collection: shortText,
  /** IIIF manifest — the image-first face (V1.2). */
  iiifManifest: z.url(),
  rights: shortText,
});

type FaceSchema = z.ZodObject<z.ZodRawShape>;

const FACES: Record<string, FaceSchema> = {
  article: scholarlyFace,
  chapter: scholarlyFace,
  thesis: scholarlyFace,
  report: scholarlyFace,
  book: scholarlyFace,
  preprint: preprintFace,
  review: reviewFace,
  trial: trialFace,
  case: caseFace,
  statute: statuteFace,
  regulation: statuteFace,
  dataset: datasetFace,
  patent: patentFace,
  archival: archivalFace,
};

/** Register a face for a pack-defined type. Later registrations win. */
export function registerFace(type: string, schema: FaceSchema): void {
  FACES[type] = schema;
}

export function hasFace(type: WorkType): boolean {
  return type in FACES;
}

/**
 * Keep only the fields `type`'s face declares, each validated on its own, so
 * one bad field never costs the rest. Types without a face keep nothing.
 */
export function cleanFace(type: WorkType, raw: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const schema = FACES[type];
  if (!schema || !raw) return {};
  const out: Record<string, unknown> = {};
  for (const [key, fieldSchema] of Object.entries(schema.shape)) {
    const value = raw[key];
    if (value === undefined || value === null || value === "") continue;
    const parsed = (fieldSchema as z.ZodType).safeParse(value);
    if (parsed.success) out[key] = parsed.data;
  }
  return out;
}
