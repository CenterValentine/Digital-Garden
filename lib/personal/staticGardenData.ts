/**
 * staticGardenData.ts — designed placeholder content for the davidvalentine.org
 * garden, transcribed verbatim from the design package's `garden-data.js`.
 *
 * `buildCats()` falls back to this whenever a `PublicPath` has no published
 * items yet, so the garden looks fully intentional from day one rather than
 * half-empty while content is being seeded. See [lib/personal/buildCats.ts].
 *
 * Category -> leaf (each item = a vein). Item -> DNA (each `sub` = a rung).
 */

export type CatsKind = "shoot" | "root";

/** One key/value rung in a leaf's expanded DNA view. */
export interface CatsSub {
  title: string;
  note: string;
}

/** A single published-thing inside a garden category. */
export interface CatsItem {
  title: string;
  /** Formatted "type · year" string, e.g. "IDE · 2021–now". */
  meta: string;
  blurb: string;
  sub: CatsSub[];
}

/** A garden category (maps 1:1 to a CATS key). */
export interface CatsCategory {
  label: string;
  title: string;
  kind: CatsKind;
  intro: string;
  items: CatsItem[];
  /** Editorial intro is always config-owned; route/plantKey added by buildCats. */
  plantKey?: string;
  route?: string | null;
}

/** Helper mirroring garden-data.js's `S(...)` — pairs of (title, note). */
function S(...pairs: string[]): CatsSub[] {
  const out: CatsSub[] = [];
  for (let i = 0; i < pairs.length; i += 2) {
    out.push({ title: pairs[i], note: pairs[i + 1] });
  }
  return out;
}

export const STATIC_CATS: Record<string, CatsCategory> = {
  projects: {
    label: "Projects",
    title: "Projects",
    kind: "shoot",
    intro:
      "Tools I’ve grown — mostly for thinking, mostly local-first. Each vein is one project.",
    items: [
      {
        title: "Digital Garden",
        meta: "IDE · 2021–now",
        blurb:
          "An Obsidian-inspired IDE for thinking: bidirectional links, plain-text, local-first.",
        sub: S(
          "Editor core", "plain-text, keyboard-first",
          "Link graph", "backlinks & maps",
          "Plugin API", "extend everything",
          "Local sync", "offline by default",
          "Themes", "day & night",
        ),
      },
      {
        title: "Terrarium",
        meta: "sync · 2023",
        blurb:
          "A CRDT layer that keeps a garden consistent across devices, offline-first.",
        sub: S(
          "CRDT core", "mergeable state",
          "Conflict UI", "resolve gently",
          "Transport", "p2p + relay",
          "Snapshots", "time travel",
        ),
      },
      {
        title: "Espalier",
        meta: "framework · 2022",
        blurb:
          "A tiny layout system trained along constraints, like fruit on a trellis.",
        sub: S(
          "Grid primitives", "constraints first",
          "Design tokens", "one source",
          "Live docs", "copy-paste ready",
        ),
      },
      {
        title: "Almanac",
        meta: "tool · 2020",
        blurb:
          "A seasonal journal that resurfaces old notes when they’re ripe again.",
        sub: S(
          "Seasonal resurfacing", "ripe notes return",
          "Daily pages", "one per day",
          "Plain export", "markdown out",
        ),
      },
      {
        title: "Loom",
        meta: "library · 2019",
        blurb:
          "A bidirectional-link parser that turns plain text into a navigable graph.",
        sub: S(
          "Wiki parser", "[[links]]",
          "Graph model", "nodes & edges",
          "HTML renderer", "static out",
        ),
      },
    ],
  },
  writing: {
    label: "Writing",
    title: "Writing",
    kind: "shoot",
    intro:
      "Long essays on slow software and the craft of thinking. Trace a vein to read.",
    items: [
      {
        title: "Gardening, not architecting",
        meta: "essay · 18 min",
        blurb: "Why software grown beats software planned.",
        sub: S(
          "The blueprint trap", "plans rot",
          "Growth over plans", "tend, don’t spec",
          "Tending as practice", "daily care",
        ),
      },
      {
        title: "The slow web",
        meta: "essay · 12 min",
        blurb: "In praise of pages that wait for you.",
        sub: S(
          "Pages that wait", "no autoplay",
          "Against urgency", "reclaim time",
          "Reading first", "words over widgets",
        ),
      },
      {
        title: "Tools for noticing",
        meta: "essay · 9 min",
        blurb: "Thinking tools are really attention tools.",
        sub: S(
          "Attention first", "what you see",
          "Notes as lenses", "reframe",
          "Friction as feature", "slow on purpose",
        ),
      },
      {
        title: "Against the feed",
        meta: "essay · 7 min",
        blurb: "Reclaiming the pace of reading.",
        sub: S(
          "The infinite scroll", "no bottom",
          "Reclaiming pace", "set the speed",
          "Curated diets", "choose inputs",
        ),
      },
      {
        title: "Local-first, human-first",
        meta: "essay · 14 min",
        blurb: "Owning your data is owning your thinking.",
        sub: S(
          "Own your data", "it’s yours",
          "Sync without servers", "peer to peer",
          "Longevity", "readable in 20 yrs",
        ),
      },
    ],
  },
  garden: {
    label: "Garden",
    title: "The Garden",
    kind: "shoot",
    intro:
      "Evergreen notes, tended over time. Some are seedlings; some have grown sturdy.",
    items: [
      {
        title: "Digital gardens",
        meta: "evergreen",
        blurb: "On tending ideas in public, in no particular order.",
        sub: S(
          "What & why", "learning in public",
          "Tending cadence", "weekly water",
          "Public learning", "show the rough",
        ),
      },
      {
        title: "Composting ideas",
        meta: "seedling",
        blurb: "Letting half-thoughts rot down into something useful.",
        sub: S(
          "Half-thoughts", "keep them",
          "Decay & reuse", "break down",
          "Surfacing", "dig them up",
        ),
      },
      {
        title: "Zettelkasten, honestly",
        meta: "budding",
        blurb: "What actually stuck after two years of slip-boxes.",
        sub: S(
          "Slip-box basics", "atomic notes",
          "What stuck", "links, mostly",
          "What didn’t", "rigid IDs",
        ),
      },
      {
        title: "Spaced repetition",
        meta: "evergreen",
        blurb: "Remembering on purpose, a little at a time.",
        sub: S(
          "Forgetting curve", "review before loss",
          "Daily reviews", "small batches",
          "Tooling", "plain cards",
        ),
      },
    ],
  },
  notes: {
    label: "Notes",
    title: "Notes",
    kind: "shoot",
    intro:
      "Short things learned — the day-to-day cuttings that don’t need an essay.",
    items: [
      {
        title: "On grafting apple trees",
        meta: "note · May ’26",
        blurb: "Rootstock, scion, and patience.",
        sub: S(
          "Rootstock", "the base",
          "Scion cuts", "clean & sharp",
          "Aftercare", "wrap & wait",
        ),
      },
      {
        title: "CRDTs in 200 lines",
        meta: "note · Apr ’26",
        blurb: "The smallest mergeable thing that works.",
        sub: S(
          "State vs ops", "two ways",
          "Merge fn", "commutative",
          "Pitfalls", "tombstones",
        ),
      },
      {
        title: "CSS subgrid, finally",
        meta: "note · Mar ’26",
        blurb: "Aligning across cards without hacks.",
        sub: S(
          "The problem", "nested align",
          "Subgrid syntax", "inherit tracks",
          "Caveats", "support",
        ),
      },
      {
        title: "Reading Alexander",
        meta: "note · Feb ’26",
        blurb: "Patterns, wholeness, and software.",
        sub: S(
          "Patterns", "reusable shapes",
          "Wholeness", "living structure",
          "Software ties", "design echoes",
        ),
      },
    ],
  },
  resume: {
    label: "Résumé",
    title: "Résumé",
    kind: "root",
    intro:
      "Ten years of building, in reverse order. The roots that hold the rest up.",
    items: [
      {
        title: "Staff Engineer — independent",
        meta: "2021–now",
        blurb: "Building Digital Garden full-time.",
        sub: S(
          "Garden architecture", "from scratch",
          "Sync engine", "Terrarium",
          "Community", "docs & support",
        ),
      },
      {
        title: "Senior Engineer — Foliate",
        meta: "2018–21",
        blurb: "Led the editor & sync teams.",
        sub: S(
          "Editor team lead", "5 engineers",
          "Sync rollout", "zero data loss",
          "Mentoring", "grew 3 seniors",
        ),
      },
      {
        title: "Product Designer — Meadow",
        meta: "2015–18",
        blurb: "Design systems and rapid prototyping.",
        sub: S(
          "Design system", "100+ components",
          "Prototyping", "code prototypes",
          "Research", "weekly tests",
        ),
      },
      {
        title: "Engineer — Sprout Labs",
        meta: "2014–15",
        blurb: "First role; shipped the mobile app.",
        sub: S(
          "Mobile app", "iOS + Android",
          "First ship", "v1.0",
          "Growth", "0→50k users",
        ),
      },
    ],
  },
  about: {
    label: "About",
    title: "About",
    kind: "root",
    intro: "The soil underneath — who’s tending this garden, and how.",
    items: [
      {
        title: "Who",
        meta: "the person",
        blurb: "Execution engineer. A decade in technology & operations.",
        sub: S(
          "Name", "David Valentine",
          "Domain", "tech & ops",
          "Location", "Desert Southwest",
        ),
      },
      {
        title: "The work",
        meta: "how I operate",
        blurb: "I turn strategy into working systems, and results.",
        sub: S(
          "System design", "meets coordination",
          "Map", "matches territory",
          "Execution", "stays close",
        ),
      },
      {
        title: "The garden",
        meta: "actual dirt",
        blurb:
          "Permaculture in the desert Southwest. Water scarce, heat intense.",
        sub: S(
          "Habitat", "desert SW",
          "Constraint", "scarce water",
          "Method", "permaculture",
        ),
      },
      {
        title: "This site",
        meta: "now",
        blurb: "A digital garden — organized by root and branch, not tag.",
        sub: S(
          "Format", "digital garden",
          "Structure", "root & branch",
          "Status", "growing",
        ),
      },
    ],
  },
  now: {
    label: "Now",
    title: "Now",
    kind: "root",
    intro:
      "What I’m tending this season — updated when things actually change.",
    items: [
      {
        title: "Garden sync engine",
        meta: "building",
        blurb: "Rewriting Terrarium’s CRDT core from scratch.",
        sub: S(
          "CRDT rewrite", "cleaner core",
          "Test harness", "property tests",
          "Beta", "soon",
        ),
      },
      {
        title: "Reading Alexander",
        meta: "reading",
        blurb: "A Pattern Language, slowly, with notes.",
        sub: S(
          "A Pattern Language", "253 patterns",
          "Notes", "margin scribbles",
          "Apply", "to software",
        ),
      },
      {
        title: "Grafting apples",
        meta: "growing",
        blurb: "Learning to splice rootstock in the yard.",
        sub: S(
          "Rootstock sourced", "dwarf stock",
          "First splices", "spring",
          "Waiting", "patience",
        ),
      },
    ],
  },
  contact: {
    label: "Contact",
    title: "Contact",
    kind: "root",
    intro: "Slow channels preferred. I read everything; I reply when it’s ripe.",
    items: [
      {
        title: "Email",
        meta: "say hello",
        blurb: "david@davidvalentine.org",
        sub: S(
          "Address", "david@…",
          "Response time", "a few days",
          "PGP", "on request",
        ),
      },
      {
        title: "GitHub",
        meta: "code",
        blurb: "@davidvalentine",
        sub: S(
          "Repos", "open source",
          "Sponsors", "keep it free",
          "Issues", "I read them",
        ),
      },
      {
        title: "Mastodon",
        meta: "social",
        blurb: "@david@garden.social",
        sub: S(
          "Handle", "@david",
          "What I post", "garden logs",
          "Replies", "usually",
        ),
      },
      {
        title: "RSS",
        meta: "subscribe",
        blurb: "the slow feed — no algorithm.",
        sub: S(
          "Full feed", "everything",
          "No tracking", "none",
          "OPML", "export ready",
        ),
      },
    ],
  },
};
