/**
 * Display helpers for Works (client-safe): the access badge (the top rung of
 * the access ladder a Work has), author lines and type labels.
 */

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

export const RETRACTION_LABELS: Record<string, string> = {
  retracted: "Retracted",
  withdrawn: "Withdrawn",
  concern: "Expression of concern",
  corrected: "Corrected",
};
