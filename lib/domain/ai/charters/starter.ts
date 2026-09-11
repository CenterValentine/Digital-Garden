/**
 * Charter starter template (D5, owner request 2026-09-10).
 *
 * Promoting a note or folder to a charter used to leave you on a blank page —
 * worse, for a folder with no `NotePayload` row it CREATED the blank page (the
 * mark route's upsert `create` branch), and then reported success as
 * readiness. A charter is a written commissioning document; the marker alone
 * commissions nothing.
 *
 * This builds a starter body whose every convention is one the parser really
 * reads, so the template teaches the actual format rather than a plausible
 * imitation of it (`validate-charter-parser.ts` asserts that by round-tripping
 * this document through `parseCharter`):
 *
 *   - Everything before the first `##` heading is the STANDING RULES section
 *     (parse.ts: content preceding the shallowest top-level heading). It rides
 *     into EVERY sitting, so it is where invariants belong.
 *   - Each `##` heading opens a PHASE. Progressive disclosure loads one phase's
 *     detail at a time, so phases are the unit of work, not decoration.
 *   - `Done when:` in a phase is its stop condition (system-prompt.ts) — the
 *     line that stops a run both short of the goal and past it.
 *   - An "output … with the title …" line naming a location is a real routing
 *     directive (output-directives.ts), which is why the example carries a
 *     `[PLACEHOLDER]`: the literal text before it becomes the matched prefix.
 *
 * Two conventions are deliberately DESCRIBED rather than demonstrated:
 *   - `model:` — live only as a section's FIRST non-empty line. A commented
 *     example would arm itself the moment someone deleted the paragraph above
 *     it, silently rerouting the phase.
 *   - `[[wiki-links]]` — a literal example would ship a dead reference (the
 *     parser collects them from plain text too), so the prose says what to do
 *     without writing brackets the parser would then try to resolve.
 *
 * The `## Context` section is not filler. STAGE2-CHARTER-RECIPE.md records the
 * failure it prevents: a rubric that scored "against my profile" with no
 * profile in the charter stalled the first production run outright ("I'd
 * rather not fabricate Fit % values", 2026-09-04). A charter must contain what
 * its phases refer to.
 *
 * Pure (TipTap JSON in, TipTap JSON out) — no Prisma, no React — so both the
 * server route and the parser gate can use it.
 */

import type { JSONContent } from "@tiptap/core";

/** The heading level that delimits phases in the generated document. */
export const CHARTER_STARTER_PHASE_LEVEL = 2;

/** Phase headings the starter ships with, in order. */
export const CHARTER_STARTER_PHASE_TITLES = [
  "Context",
  "Phase 1 — [name the first phase]",
  "Phase 2 — [name the second phase]",
] as const;

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function heading(text: string): JSONContent {
  return {
    type: "heading",
    attrs: { level: CHARTER_STARTER_PHASE_LEVEL },
    content: [{ type: "text", text }],
  };
}

function bullets(items: string[]): JSONContent {
  return {
    type: "bulletList",
    content: items.map((text) => ({
      type: "listItem",
      content: [paragraph(text)],
    })),
  };
}

/**
 * Build the starter body for a newly-marked charter.
 *
 * `title` is the charter's own name (the file title), used only to make the
 * opening line concrete — the charter's name is always the file name, so the
 * body never restates it as a heading.
 */
export function buildCharterStarterDoc(title: string): JSONContent {
  const name = title.trim() || "this charter";
  return {
    type: "doc",
    content: [
      // ── Standing rules: everything before the first `##` heading ──
      paragraph(
        `[What "${name}" commissions: the outcome it exists to produce, in a sentence or two. ` +
          "Everything above the first heading is this charter's standing rules — it rides into every sitting, " +
          "so put the invariants here and the work in the phases below.]",
      ),
      bullets([
        "[An invariant that always applies — e.g. never score an item without the evidence for it; say what is missing and stop.]",
        '[Where results go, if anywhere. This is real syntax: Output each result with the title "Result — [ITEM]" under this content.]',
        "[Link supporting notes by their titles in double square brackets — each becomes a reference the run can open on demand, instead of context you have to paste.]",
      ]),

      // ── Phases: one per `##` heading ──
      heading(CHARTER_STARTER_PHASE_TITLES[0]),
      paragraph(
        "[Everything the phases below refer to must live HERE. A rubric that scores \"against my profile\" needs the profile in this section — " +
          "a charter is the commissioning document, and one pointing at context it does not contain stalls the run rather than guessing.]",
      ),

      heading(CHARTER_STARTER_PHASE_TITLES[1]),
      paragraph("[What to do in this phase, and how to judge the result.]"),
      paragraph(
        "Done when: [the condition that ends this phase — the line that stops the run both short of the goal and past it].",
      ),

      heading(CHARTER_STARTER_PHASE_TITLES[2]),
      paragraph("[What to do once phase 1 is done.]"),
      paragraph("Done when: [the condition that ends this phase]."),

      paragraph(
        "[Delete any phase you don't need, add as many as you do — each ## heading is one phase, " +
          "and only the current phase's detail is loaded at a time. You can also set a model for a " +
          "section by making `model: <name>` its very first line.]",
      ),
    ],
  };
}

/**
 * How many of a parsed charter's phases are still the starter's unfilled
 * placeholder headings ("Phase 1 — [name the first phase]"). Real sections
 * pasted BELOW an untouched scaffold parse as real + placeholder phases
 * together, and a run would start with the placeholder (prod 2026-09-11:
 * 23 written sections under two template headings). Reported at mark and
 * in the attached-charter context; never auto-deleted — the text is the
 * user's to remove.
 */
export function countStarterPlaceholderPhases(parsed: {
  phases: Array<{ title: string }>;
}): number {
  const placeholders = new Set(
    CHARTER_STARTER_PHASE_TITLES.filter((t) => t.includes("[name the")).map((t) =>
      t.trim().toLowerCase(),
    ),
  );
  return parsed.phases.filter((p) => placeholders.has(p.title.trim().toLowerCase()))
    .length;
}
