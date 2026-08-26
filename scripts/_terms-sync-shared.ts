/**
 * _terms-sync-shared.ts — types, scope, and note-body rendering shared by
 * `mint-terms-sync-token.ts` and `sync-session-terms.ts`.
 *
 * Deliberately free of Prisma and TipTap imports so both scripts can pull it
 * in without dragging the tsx-hostile module graph along (see the header of
 * `sync-session-terms.ts` for which imports are landmines under tsx).
 */

import { z } from "zod/v4";

/**
 * The ServiceToken scope that authorizes writing glossary notes.
 *
 * A token minted for `workflows:callback` cannot sync terms and vice versa —
 * scopes are checked by `validateServiceToken`, so the blast radius of a leaked
 * terms-sync token is "can append glossary notes", not "can drive workflows".
 */
export const GARDEN_TERMS_SYNC_SCOPE = "garden:terms-sync";

/** `dggl_` (garden glossary) + 48 hex — distinguishable from `dgwf_`/`dgext_`. */
export const TERMS_SYNC_TOKEN_PREFIX = "dggl_";

/** Slug of the folder every synced term lives under, per account. */
export const GLOSSARY_FOLDER_SLUG = "glossary";
export const GLOSSARY_FOLDER_TITLE = "Glossary";

export const TERM_KINDS = ["terminology", "decision", "pattern", "external"] as const;
export type TermKind = (typeof TERM_KINDS)[number];

/**
 * One captured term. This is the contract between the extracting model and the
 * writer script — the skill emits an array of these as JSON.
 */
export const termRecordSchema = z.object({
  /** Canonical name. Becomes the note title and the [[wiki-link]] target. */
  term: z.string().min(1).max(120),
  kind: z.enum(TERM_KINDS),
  /** One sentence a reader could quote standalone. No leading "It is…". */
  summary: z.string().min(1).max(400),
  /** Optional expanded explanation. Markdown; headings are not expected. */
  body: z.string().max(4000).optional(),
  /** Why this is worth remembering — the payoff, not a restatement. */
  whyItMatters: z.string().max(1000).optional(),
  /** Other term names; rendered as [[wiki-links]] whether or not they exist. */
  related: z.array(z.string().min(1).max(120)).max(12).default([]),
  /** Repo paths, doc links, or URLs that ground the claim. */
  sources: z.array(z.string().min(1).max(300)).max(12).default([]),
  /** What we were doing when it came up — the session-log line. */
  context: z.string().min(1).max(400),
  /** ISO date (YYYY-MM-DD) of the session that produced this. */
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type TermRecord = z.infer<typeof termRecordSchema>;

export const termsFileSchema = z.object({
  /** Free-text label for the session, used only in the sync report. */
  session: z.string().max(200).optional(),
  terms: z.array(termRecordSchema).min(1).max(60),
});

export type TermsFile = z.infer<typeof termsFileSchema>;

/**
 * Render a term as the markdown body of a brand-new note.
 *
 * The trailing "Session log" section is the append point: on later syncs the
 * writer adds bullets there rather than regenerating the note, so anything you
 * hand-edit above it survives.
 */
export function renderTermMarkdown(term: TermRecord): string {
  const lines: string[] = [];

  lines.push(`> ${term.summary}`, "");

  if (term.body?.trim()) {
    lines.push(term.body.trim(), "");
  }

  if (term.whyItMatters?.trim()) {
    lines.push("## Why it matters", "", term.whyItMatters.trim(), "");
  }

  if (term.related.length > 0) {
    lines.push("## Related", "");
    for (const rel of term.related) {
      lines.push(`- [[${rel}]]`);
    }
    lines.push("");
  }

  if (term.sources.length > 0) {
    lines.push("## Sources", "");
    for (const src of term.sources) {
      lines.push(`- ${src}`);
    }
    lines.push("");
  }

  lines.push("## Session log", "", renderSessionLogEntry(term));

  return lines.join("\n");
}

/** A single dated bullet — the unit appended to an existing term note. */
export function renderSessionLogEntry(term: TermRecord): string {
  return `- **${term.sessionDate}** — ${term.context}`;
}

/** Tag slugs applied to every synced term note, for filtering by kind. */
export function tagsForTerm(term: TermRecord): string[] {
  return ["glossary", `kind-${term.kind}`];
}
