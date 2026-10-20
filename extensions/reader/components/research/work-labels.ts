/**
 * Display helpers for Works (client-safe): the access badge (the top rung of
 * the access ladder a Work has), author lines and type labels.
 */

import type { CSSProperties } from "react";
import type { Work, WorkCopy } from "@/lib/domain/research/types";

export interface AccessBadge {
  label: string;
  title: string;
  tone: "good" | "ok" | "muted";
}

export function bestCopy(work: Work): WorkCopy | null {
  return work.copies.find((copy) => copy.storable) ?? work.copies[0] ?? null;
}

/** RESEARCH-READER-PLAN.md §2.2.4 — the badge is the best rung available. */
export function accessBadge(work: Work): AccessBadge {
  const copy = bestCopy(work);
  if (copy?.storable) {
    return { label: "Read here", title: `Open access (${copy.license ?? "open licence"}) — saved with its PDF`, tone: "good" };
  }
  if (copy) {
    return {
      label: copy.version === "submitted" ? "Preprint copy" : copy.version === "accepted" ? "Author's copy" : "Open copy",
      title: `A free copy at ${copy.host}; read on demand (its licence doesn't allow keeping a copy)`,
      tone: "ok",
    };
  }
  if (work.abstract) return { label: "Abstract", title: "No free copy found — abstract only; your library may have it", tone: "muted" };
  return { label: "Link", title: "Opens at the source", tone: "muted" };
}

export function authorLine(work: Pick<Work, "authors">, max = 3): string {
  const names = work.authors.map((author) => author.name);
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} et al.`;
}

const TYPE_LABELS: Record<string, string> = {
  article: "Article",
  preprint: "Preprint",
  review: "Peer review",
  book: "Book",
  chapter: "Chapter",
  thesis: "Thesis",
  report: "Report",
  dataset: "Dataset",
  trial: "Clinical trial",
  case: "Case",
  statute: "Statute",
  regulation: "Regulation",
  patent: "Patent",
  archival: "Archival item",
  webpage: "Web page",
  other: "Work",
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

/**
 * A card's accent, by Work type, from the design system's intent palette
 * (`--intent-*` in globals.css; one value per theme pair). Retraction
 * overrides to danger at the call site.
 */
export type WorkTone = "primary" | "secondary" | "accent" | "danger" | "neutral";

const TYPE_TONES: Record<string, WorkTone> = {
  article: "primary",
  preprint: "neutral",
  review: "accent",
  book: "secondary",
  chapter: "secondary",
  thesis: "secondary",
  report: "accent",
  dataset: "accent",
  trial: "primary",
  case: "accent",
  statute: "accent",
  regulation: "accent",
  patent: "accent",
  archival: "secondary",
  webpage: "neutral",
  other: "neutral",
};

export function typeTone(type: string): WorkTone {
  return TYPE_TONES[type] ?? "neutral";
}

/** Inline style for the tone: `--work-tone` drives the rail, chip and ring. */
export function toneStyle(tone: WorkTone): CSSProperties {
  return { "--work-tone": `var(--intent-${tone})` } as CSSProperties;
}

export const RETRACTION_LABELS: Record<string, string> = {
  retracted: "Retracted",
  withdrawn: "Withdrawn",
  concern: "Expression of concern",
  corrected: "Corrected",
};
