/**
 * gardenConfig.ts — the Publishing → Garden mapping layer.
 *
 * The multi-tenant publishing system (`PublicPath` / `PublicItem`) is generic:
 * it knows nothing about the garden's visual vocabulary — plant species,
 * chapter types, editorial intros, or the CATS data structure the client
 * engines consume. This config supplies exactly that delta — everything the
 * garden needs but the database does not store.
 *
 * Owner-only by virtue of source-code access (no schema, no admin UI). Edits
 * ship via redeploy. See [lib/personal/buildCats.ts] for how this merges with
 * live DB content.
 */

import type { CatsKind } from "./staticGardenData";

export interface GardenPathConfig {
  /** DB `PublicPath.slug` to match against. */
  slug: string;
  /** Key consumed by garden-carousel.js + m44-leaf-connect.js (CATS key). */
  catsKey: string;
  /** Short nav / plant-caption label. */
  label: string;
  /** shoot = above-ground chapters; root = below-ground. */
  kind: CatsKind;
  /** Editorial intro shown atop the leaf-view overlay. Always config-owned. */
  intro: string;
  /** Which carousel plant this chapter maps to. */
  plantKey: string;
  /** null = leaf view only; string = navigate to this route on activation. */
  route: string | null;
}

export const GARDEN_PATH_CONFIGS: GardenPathConfig[] = [
  {
    slug: "projects",
    catsKey: "projects",
    label: "Projects",
    kind: "shoot",
    plantKey: "hawthorn",
    route: null,
    intro: "Tools I’ve grown — mostly for thinking, mostly local-first.",
  },
  {
    slug: "writing",
    catsKey: "writing",
    label: "Writing",
    kind: "shoot",
    plantKey: "willow",
    route: null,
    intro: "Long essays on slow software and the craft of thinking.",
  },
  {
    slug: "garden",
    catsKey: "garden",
    label: "Garden",
    kind: "shoot",
    plantKey: "maple",
    route: null,
    intro: "Evergreen notes, tended over time.",
  },
  {
    slug: "notes",
    catsKey: "notes",
    label: "Notes",
    kind: "shoot",
    plantKey: "dandelion",
    route: null,
    intro: "Short things learned — the day-to-day cuttings.",
  },
  {
    slug: "about",
    catsKey: "about",
    label: "About",
    kind: "root",
    plantKey: "yarrow",
    route: "/about",
    intro: "The soil underneath — who’s tending this garden, and how.",
  },
  {
    slug: "results",
    catsKey: "results",
    label: "Results",
    kind: "shoot",
    plantKey: "oak",
    route: "/results",
    intro: "Projects, writing, and a decade of roles.",
  },
  {
    slug: "resume",
    catsKey: "resume",
    label: "Résumé",
    kind: "root",
    plantKey: "hawthorn-root",
    route: null,
    intro: "Ten years of building, in reverse order.",
  },
  {
    slug: "now",
    catsKey: "now",
    label: "Now",
    kind: "root",
    plantKey: "pine",
    route: null,
    intro: "What I’m tending this season — updated when things change.",
  },
  {
    slug: "contact",
    catsKey: "contact",
    label: "Contact",
    kind: "root",
    plantKey: "roots",
    route: null,
    intro: "Slow channels preferred. I reply when it’s ripe.",
  },
];
