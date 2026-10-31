/**
 * The résumé ("Growth Rings") page — its canonical default, the mapping to and
 * from a SitePage config, and the validator that keeps that config in the
 * résumé's shape. Pure and client-safe: the page, the resolver, the composer
 * and scripts/seed-resume-page.ts all share it.
 *
 * Config shape (a `resume` SitePage):
 *   sections[0..3]  one per era, eras[0] = the innermost ring (most recent);
 *                   `label` is the ring label, `items` the era's entries
 *   items           { year, title, meta, blurb, tags } — title and blurb are
 *                   emphasis strings (*accent*, **bold**)
 *   page            optional page copy; any field left out keeps the default
 *
 * The era COUNT is fixed (the ring's bands are geometry in ResumePage); every
 * word the eras show is data.
 */
import { z } from "zod/v4";
import { parseEmphasis } from "@/components/common/Emphasis";
import type { SitePageConfig, SitePageConfigInput } from "./schema";
import type { ResumeCopy, ResumeData } from "./resolved";

export const RESUME_ERA_COUNT = 4;
/** A ring label sits inside its band at 7.5px mono; longer labels overrun the ring. */
export const RING_LABEL_MAX = 10;
export const RESUME_TAGS_MAX = 8;
export const RESUME_TAG_LENGTH_MAX = 32;
export const RESUME_CTAS_MAX = 3;

export const DEFAULT_RESUME_DATA: ResumeData = {
  eras: [
    {
      label: "2021–NOW",
      entries: [
        {
          year: "2021–now",
          title: "Execution Engineer — *Independent*",
          meta: "Technology · Operations · AI Systems",
          blurb:
            "Building a personal technology & operations practice across AI workflows, digital-garden architecture, resume systems, and career systems. **Durable knowledge, automation, and human judgment** — compounding over time.",
          tags: ["AI Workflows", "Digital Garden", "System Design", "Career Ops"],
        },
      ],
    },
    {
      label: "2023–25",
      entries: [
        {
          year: "2023–25",
          title: "Revenue Operations — *Doxy.me*",
          meta: "RevOps · Stripe · HubSpot · Segment · Snowflake",
          blurb:
            "Owned revenue-operations systems across billing, lifecycle messaging, usage-based revenue, analytics, and customer-data integrity. Helped mature RevOps governance across Stripe, HubSpot, Intercom, Segment, Tray.io, Snowflake, and Sigma — documenting sources, locking down access, and stabilizing trusted reporting. **Lifted dunning recovery ~65% → 73%, supporting $1.37M recovered; dropped operational cost $300k/yr.**",
          tags: ["RevOps", "HubSpot", "Stripe", "Segment", "Data Integrity", "Dunning"],
        },
      ],
    },
    {
      label: "2020–23",
      entries: [
        {
          year: "2020–23",
          title: "CS Operations — *Doxy.me*",
          meta: "Customer Operations · Intercom · CRM Hygiene",
          blurb:
            "Scaled customer operations through hypergrowth to 1M+ providers — Intercom, automation, routing, help-center systems, CRM hygiene, and lifecycle communications. **Supported 3M+ automated conversations and 6M+ outbound messages; CSAT 74% → 85%.** Operationalized >$100k/month usage billing.",
          tags: ["CS Ops", "Intercom", "CRM Hygiene", "Workflow Automation"],
        },
      ],
    },
    {
      label: "PRE-2020",
      entries: [
        {
          year: "pre-2020",
          title: "Ecommerce & Operations — *independent*",
          meta: "Early Operations · CX · Process",
          blurb:
            "Built early operational judgment through ecommerce, customer communication, and automation. **Practical instincts for CX, tooling, and systemized execution.** The heartwood: narrow but load-bearing.",
          tags: ["Ecommerce", "Customer Ops", "Process", "Zendesk"],
        },
      ],
    },
  ],
  copy: {
    kicker: "ROOT · RÉSUMÉ · four growth rings",
    heading: "The Growth *Rings.*",
    subtitle: "Over a decade of growing and building.",
    hint: "hover a ring to illuminate",
    footnote: "each ring is a chapter",
    ctas: [
      { label: "Download résumé →", href: "#", primary: true, ariaLabel: "Download résumé PDF" },
      { label: "See the work", href: "/results" },
      { label: "See the garden", href: "/" },
    ],
  },
};

/** ResumeData → the `resume` SitePage config the composer and JSON hatch edit. */
export function resumeToConfig(data: ResumeData): SitePageConfigInput {
  return {
    sections: data.eras.map((era) => ({
      label: era.label,
      sort: "manual",
      items: era.entries.map((e) => ({
        year: e.year,
        title: e.title,
        meta: e.meta,
        blurb: e.blurb,
        tags: e.tags.slice(),
      })),
    })),
    page: { ...data.copy, ctas: data.copy.ctas.map((c) => ({ ...c })) },
  };
}

/**
 * A validated `resume` config → what ResumePage renders. Hidden entries drop
 * out; page copy fields left out keep the design default.
 */
export function resumeFromConfig(config: SitePageConfig): ResumeData {
  const d = DEFAULT_RESUME_DATA.copy;
  const p = config.page;
  const copy: ResumeCopy = {
    kicker: p?.kicker ?? d.kicker,
    heading: p?.heading ?? d.heading,
    subtitle: p?.subtitle ?? d.subtitle,
    hint: p?.hint ?? d.hint,
    footnote: p?.footnote ?? d.footnote,
    ctas: p?.ctas ?? d.ctas,
  };
  return {
    eras: config.sections.map((s) => ({
      label: s.label,
      entries: s.items
        .filter((it) => !it.hidden)
        .map((it) => ({
          year: it.year ?? "",
          title: it.title ?? "",
          meta: it.meta ?? "",
          blurb: it.blurb ?? "",
          tags: it.tags ?? [],
        })),
    })),
    copy,
  };
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface ResumeIssue {
  path: (string | number)[];
  message: string;
}

/** Generic list fields a résumé never renders — rejected rather than silently dropped. */
const UNUSED_SECTION_FIELDS = ["intro", "heading", "aside", "growth"] as const;
const UNUSED_ITEM_FIELDS = [
  "ref",
  "subtitle",
  "type",
  "date",
  "statusLabel",
  "facts",
  "sub",
  "timelineNote",
] as const;
const ENTRY_TEXT_FIELDS = ["year", "title", "meta", "blurb"] as const;
const COPY_TEXT_FIELDS = ["kicker", "heading", "subtitle", "hint", "footnote"] as const;
/** In-app path, same-page anchor, web URL, or mail link. */
const CTA_HREF = /^(\/(?!\/)|#|https?:\/\/\S|mailto:\S)/;

// ── Shape description for AI (and human) editors ────────────────────────────
// The STRUCTURE as a strict Zod schema, published as JSON Schema (composer
// JSON editor + GET /api/site-pages/resume) and exercised by
// `pnpm resume:page:check`, so the schema an editor reads is one the gate runs.
// validateResumeConfig stays the authority: it adds what JSON Schema can't say
// (no stray spaces, balanced *, case-insensitive unique tags, a visible entry
// per era, one primary button).

const resumeEntryShape = z
  .object({
    year: z.string().min(1).describe('The year column, e.g. "2021–now" or "2023–25".'),
    title: z
      .string()
      .min(1)
      .describe('Emphasis string, conventionally "Role — *Organisation*"; *…* renders in the accent italic.'),
    meta: z.string().min(1).describe('One mono line of domains or tools, e.g. "RevOps · Stripe · HubSpot".'),
    blurb: z
      .string()
      .min(1)
      .describe("Emphasis string: what was owned, then the headline result wrapped in **…** (renders bold)."),
    tags: z
      .array(z.string().min(1).max(RESUME_TAG_LENGTH_MAX))
      .min(1)
      .max(RESUME_TAGS_MAX)
      .describe(`1–${RESUME_TAGS_MAX} skill chips, unique (ignoring case).`),
    hidden: z.boolean().optional().describe("true keeps the entry in the JSON but off the page."),
    status: z.enum(["active", "done"]).optional().describe("Written by the API on save; ignored by the résumé."),
  })
  .strict();

const resumeEraShape = z
  .object({
    label: z
      .string()
      .min(1)
      .max(RING_LABEL_MAX)
      .describe(`The ring label, ≤${RING_LABEL_MAX} characters, e.g. "2021–NOW" or "PRE-2020".`),
    sort: z.enum(["date-desc", "date-asc", "manual"]).optional().describe("Ignored: entries render in the order listed."),
    items: z
      .array(resumeEntryShape)
      .min(1)
      .describe("The era's entries, in display order; at least one must be visible (not hidden)."),
  })
  .strict();

const resumeCtaShape = z
  .object({
    label: z.string().min(1),
    href: z.string().regex(CTA_HREF).describe('"/path" (in-app), "#", an http(s) URL, or "mailto:".'),
    primary: z.boolean().optional().describe("At most one button is primary (the filled one)."),
    ariaLabel: z.string().optional(),
  })
  .strict();

/** The résumé config's structure. Exported for the gate; editors read its JSON Schema. */
export const resumeConfigShape = z
  .object({
    sections: z
      .array(resumeEraShape)
      .length(RESUME_ERA_COUNT)
      .describe(
        `Exactly ${RESUME_ERA_COUNT} eras, one per growth ring: index 0 is the INNERMOST ring (the most recent chapter), the last is the outermost (the earliest).`,
      ),
    page: z
      .object({
        kicker: z.string().min(1).optional().describe('The small caps line over the heading, e.g. "ROOT · RÉSUMÉ · four growth rings".'),
        heading: z.string().min(1).optional().describe('Emphasis string, e.g. "The Growth *Rings.*".'),
        subtitle: z.string().min(1).optional(),
        hint: z.string().min(1).optional().describe("The small line under the rings."),
        footnote: z.string().min(1).optional().describe("The line under the last entry."),
        ctas: z.array(resumeCtaShape).max(RESUME_CTAS_MAX).optional().describe(`Up to ${RESUME_CTAS_MAX} buttons, in order.`),
      })
      .strict()
      .optional()
      .describe("Page copy. Any field left out keeps the design's default text."),
  })
  .strict()
  .describe("The config of the davidvalentine.org résumé (SitePage slug \"resume\", kind \"resume\").");

/** JSON Schema (draft 2020-12) for the résumé config — the machine-readable shape. */
export function resumeConfigJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(resumeConfigShape) as Record<string, unknown>;
}

/** The same shape in prose, with the rules JSON Schema can't express. */
export const RESUME_SHAPE_GUIDE = [
  "RÉSUMÉ CONFIG — how to edit it",
  "",
  `The page is four growth rings. The JSON's "sections" are the ${RESUME_ERA_COUNT} eras, always exactly ${RESUME_ERA_COUNT}: sections[0] is the INNERMOST ring (the most recent chapter), sections[${RESUME_ERA_COUNT - 1}] the outermost (the earliest). Reorder eras to move chapters between rings; never add or remove one.`,
  "",
  "Each era:",
  `  label  the ring label, ${RING_LABEL_MAX} characters or fewer ("2021–NOW", "PRE-2020")`,
  "  items  the era's entries, in display order; at least one must be visible",
  "",
  "Each entry (all required unless marked):",
  '  year    "2021–now"',
  '  title   "Role — *Organisation*"     *…* = accent italic',
  '  meta    "RevOps · Stripe · HubSpot"',
  '  blurb   "What was owned. **The headline result.** More."   **…** = bold',
  `  tags    1–${RESUME_TAGS_MAX} unique skill chips, each ${RESUME_TAG_LENGTH_MAX} characters or fewer`,
  "  hidden  (optional) true keeps the entry in the JSON but off the page",
  "  Several entries may share an era (e.g. two roles at one employer).",
  "",
  'Optional "page" block — leave any field out to keep the design default:',
  "  kicker, heading (*accent* allowed), subtitle, hint, footnote,",
  `  ctas: up to ${RESUME_CTAS_MAX} buttons { label, href, primary?, ariaLabel? }, at most one primary;`,
  '        href is "/path", "#", an http(s) URL or "mailto:".',
  "",
  "Refused on save (the API answers with a sentence naming the field):",
  "  - a different number of eras, an empty or over-long ring label, an era with no visible entry",
  "  - a missing or blank field, or leading/trailing spaces in any text",
  "  - an unmatched * (use *accent* or **bold** in pairs)",
  "  - duplicate tags (ignoring case)",
  `  - fields a résumé doesn't use: entry ${UNUSED_ITEM_FIELDS.map((f) => `"${f}"`).join(", ")}; era ${UNUSED_SECTION_FIELDS.map((f) => `"${f}"`).join(", ")}`,
  "",
  "The name, role and back link at the top left are part of the site, not this JSON.",
].join("\n");

/** Leading/trailing whitespace or an empty value — both break the page's even rhythm. */
function textProblem(value: string | undefined, what: string): string | null {
  if (value === undefined || value.trim() === "") return `${what} is required`;
  if (value !== value.trim()) return `${what} has leading or trailing spaces`;
  return null;
}

/** Every `*` must open or close a *accent* / **bold** span — the renderer's own grammar. */
function unbalancedEmphasis(value: string): boolean {
  return parseEmphasis(value).some((part) => part.tier === "plain" && part.text.includes("*"));
}

/**
 * Check a parsed `resume` config against the résumé's shape. Returns every
 * problem (empty = valid) so an editor can show them all at once. Runs on the
 * API write, in the composer's JSON editor, in the seed's --verify, and in the
 * resolver (an invalid stored config renders the design default instead).
 */
export function validateResumeConfig(config: Pick<SitePageConfig, "sections" | "page">): ResumeIssue[] {
  const issues: ResumeIssue[] = [];
  const add = (path: (string | number)[], message: string) => issues.push({ path, message });

  if (config.sections.length !== RESUME_ERA_COUNT) {
    add(
      ["sections"],
      `A résumé has exactly ${RESUME_ERA_COUNT} eras (one per growth ring, innermost first) — found ${config.sections.length}.`,
    );
  }

  config.sections.forEach((section, i) => {
    const era = `Era ${i + 1}${section.label ? ` (${section.label})` : ""}`;
    const labelProblem = textProblem(section.label, `${era}: the ring label`);
    if (labelProblem) add(["sections", i, "label"], labelProblem);
    else if (section.label.length > RING_LABEL_MAX)
      add(["sections", i, "label"], `${era}: the ring label must be ${RING_LABEL_MAX} characters or fewer to fit its ring.`);

    for (const field of UNUSED_SECTION_FIELDS) {
      if (section[field] !== undefined) add(["sections", i, field], `${era}: "${field}" isn't used on a résumé — remove it.`);
    }

    if (!section.items.some((it) => !it.hidden)) {
      add(["sections", i, "items"], `${era} has no visible entries — every ring needs at least one.`);
    }

    section.items.forEach((item, j) => {
      const at = ["sections", i, "items", j];
      const entry = `${era}, entry ${j + 1}`;
      for (const field of UNUSED_ITEM_FIELDS) {
        if (item[field] !== undefined) add([...at, field], `${entry}: "${field}" isn't used on a résumé — remove it.`);
      }
      for (const field of ENTRY_TEXT_FIELDS) {
        const problem = textProblem(item[field], `${entry}: ${field}`);
        if (problem) add([...at, field], problem);
      }
      for (const field of ["title", "blurb"] as const) {
        const v = item[field];
        if (v && unbalancedEmphasis(v))
          add([...at, field], `${entry}: ${field} has an unmatched * — use *accent* or **bold** in pairs.`);
      }

      const tags = item.tags;
      if (!tags || tags.length === 0) {
        add([...at, "tags"], `${entry}: at least one tag is required.`);
      } else {
        if (tags.length > RESUME_TAGS_MAX) add([...at, "tags"], `${entry}: at most ${RESUME_TAGS_MAX} tags.`);
        const seen = new Set<string>();
        tags.forEach((tag, k) => {
          const problem = textProblem(tag, `${entry}: tag ${k + 1}`);
          if (problem) add([...at, "tags", k], problem);
          else if (tag.length > RESUME_TAG_LENGTH_MAX)
            add([...at, "tags", k], `${entry}: tag "${tag}" is longer than ${RESUME_TAG_LENGTH_MAX} characters.`);
          const key = tag.trim().toLowerCase();
          if (seen.has(key)) add([...at, "tags", k], `${entry}: tag "${tag}" appears twice.`);
          seen.add(key);
        });
      }
    });
  });

  const page = config.page;
  if (page) {
    for (const field of COPY_TEXT_FIELDS) {
      if (page[field] === undefined) continue; // left out → the design default
      const problem = textProblem(page[field], `page.${field}`);
      if (problem) add(["page", field], problem);
    }
    if (page.heading && unbalancedEmphasis(page.heading))
      add(["page", "heading"], "page.heading has an unmatched * — use *accent* or **bold** in pairs.");

    if (page.ctas) {
      if (page.ctas.length > RESUME_CTAS_MAX) add(["page", "ctas"], `At most ${RESUME_CTAS_MAX} buttons.`);
      if (page.ctas.filter((c) => c.primary).length > 1)
        add(["page", "ctas"], "Only one button can be primary.");
      page.ctas.forEach((cta, k) => {
        const labelProblem = textProblem(cta.label, `Button ${k + 1}: label`);
        if (labelProblem) add(["page", "ctas", k, "label"], labelProblem);
        if (!CTA_HREF.test(cta.href))
          add(["page", "ctas", k, "href"], `Button ${k + 1}: href must be a /path, #, an http(s) URL, or mailto: — got "${cta.href}".`);
      });
    }
  }

  return issues;
}
