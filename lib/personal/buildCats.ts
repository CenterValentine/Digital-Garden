/**
 * buildCats.ts — the single apportioning boundary: DB → CATS.
 *
 * Runs server-side (in PersonalHome.tsx). Walks GARDEN_PATH_CONFIGS, joins each
 * to its matching `PublicPath` from the database, and produces the `window.CATS`
 * object that garden-carousel.js + m44-leaf-connect.js consume on the client.
 *
 * Apportioning rules:
 *  - `intro`, `kind`, `plantKey`, `route`, `label` always come from the config
 *    (the garden owns its visual vocabulary; the publishing UI never touches it).
 *  - `title` and `items[]` come from the DB when content has been published.
 *  - When a path has no published items yet, we fall back to STATIC_CATS so the
 *    garden looks fully intentional from day one.
 *
 * Per-item `meta` / `sub` rungs are NOT stored on `blogPostPayload`. The
 * `personalMeta` field below is optional and forward-compatible: if a future
 * `PersonalItemMeta` model (migration "Option A") lands, this function lights it
 * up with zero changes. Until then items fall through to the static fallback.
 */

import { GARDEN_PATH_CONFIGS } from "./gardenConfig";
import { STATIC_CATS, type CatsCategory, type CatsItem } from "./staticGardenData";

/** Shape buildCats reads from the DB query (forward-compatible w/ personalMeta). */
export interface DbPathInput {
  slug: string;
  title: string;
  items: Array<{
    publicTitle: string | null;
    blogPostPayload: { excerpt: string | null } | null;
    personalMeta?: { metaLine: string | null; subPairs: unknown } | null;
  }>;
}

function isCatsSubArray(
  value: unknown,
): value is CatsItem["sub"] {
  return (
    Array.isArray(value) &&
    value.every(
      (v) =>
        typeof v === "object" &&
        v !== null &&
        "title" in v &&
        "note" in v,
    )
  );
}

export function buildCats(
  dbPaths: DbPathInput[],
): Record<string, CatsCategory> {
  const cats: Record<string, CatsCategory> = {};

  for (const cfg of GARDEN_PATH_CONFIGS) {
    const dbPath = dbPaths.find((p) => p.slug === cfg.slug);

    const items: CatsItem[] = (dbPath?.items ?? []).map((item) => ({
      title: item.publicTitle ?? "(untitled)",
      meta: item.personalMeta?.metaLine ?? "",
      blurb: item.blogPostPayload?.excerpt ?? "",
      sub: isCatsSubArray(item.personalMeta?.subPairs)
        ? item.personalMeta!.subPairs
        : [],
    }));

    const staticFallback = STATIC_CATS[cfg.catsKey];

    cats[cfg.catsKey] = {
      label: cfg.label,
      title: dbPath?.title ?? staticFallback?.title ?? cfg.label,
      kind: cfg.kind,
      intro: cfg.intro, // always from config, never DB
      plantKey: cfg.plantKey,
      route: cfg.route,
      items: items.length > 0 ? items : (staticFallback?.items ?? []),
    };
  }

  return cats;
}
