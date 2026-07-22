/**
 * The canonical About narrative — the single source of truth for both the
 * AboutPage fallback (when no SitePage config exists) and the seed script that
 * mirrors it into an editable "about" SitePage. Server-safe (plain data).
 *
 * `heading` uses *accent* emphasis; paragraphs use **bold**; `aside` newlines
 * render as <br>.
 */
import type { ProseData } from "./resolved";

export const DEFAULT_ABOUT_DATA: ProseData = {
  sections: [
    {
      kicker: "The work",
      heading: "Structure in *motion.*",
      paragraphs: [
        "I'm drawn to the space where **system design meets human coordination** — where the question is not just what to build, but how the work itself should move.",
        "At Doxy.me, that meant helping scale customer and revenue operations through rapid growth: support systems, Intercom automation, billing workflows, lifecycle messaging, usage-based revenue, help-center architecture, and cross-functional process design.",
        "The thread through all of it is the same: **the map has to match the territory**, or the system eventually becomes fiction.",
      ],
      aside: "every system is a theory\nuntil the work\nruns through it",
    },
    {
      kicker: "Outside work",
      heading: "Actual *dirt.*",
      paragraphs: [
        "I garden in the desert Southwest, where alkaline soil, intense heat, and scarce water make **every assumption visible.**",
        "What started as a hobby has become a discipline in constraints: shade, timing, amendment, irrigation, observation, and patience.",
        "That instinct follows me back into my work. Good systems are **grown as much as they are designed.**",
      ],
      aside: "constraints are the design,\nnot the excuse",
    },
    {
      kicker: "Right now",
      heading: "Building the *garden.*",
      paragraphs: [
        "I'm building davidvalentine.org as a **digital garden**: a living record of projects, notes, experiments, career artifacts, and things I'm learning.",
        "It is part portfolio, part workshop, part memory system — organized less like a filing cabinet and more like a landscape: roots, paths, branches, seasons, and the occasional useful weed.",
        "For the professional trail, start with the **résumé**. For the thinking behind it, browse the **field notes**. To wander, enter the garden.",
      ],
      aside: "gardens grow by relation,\nnot by hierarchy",
    },
  ],
};
