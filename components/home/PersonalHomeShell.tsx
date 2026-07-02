"use client";

/**
 * PersonalHomeShell — the davidvalentine.org garden, client-side.
 *
 * Architecture: this is a thin *host* for the self-contained vanilla-JS garden
 * prototype, not a reimplementation. The static `.stage` scaffold is rendered
 * verbatim via dangerouslySetInnerHTML (see [components/home/m44-markup.ts]);
 * the generative engines and orchestration glue (intro sunrise, rotating
 * carousel, scroll-driven day↔night, passing showers, the monarch) load from
 * /public/garden and own that DOM after mount. React only diffs the `__html`
 * prop, so it never fights the nodes the engines append into #col/#nav/#rail.
 *
 * The leaf/DNA overlay engines (garden-leaf.js, garden-dna.js, …) were not part
 * of the design package, so m44-leaf-connect.js is not loaded. The hawthorn CTA
 * is handled by a direct location.href='/resume' in m44-home.js doWhitewash(),
 * matching the yarrow→/about and willow→/results pattern.
 */

import { useEffect } from "react";
import type { CatsCategory } from "@/lib/personal/staticGardenData";
import { M44_MARKUP } from "./m44-markup";
// Imported (not <link>-injected or JS-injected) so Next ships it render-blocking
// at first paint and route-scoped. Critical: the scaffold includes the
// full-screen #leafView/#dnaView/#resumeView overlays (transform:scale(.03);
// opacity:0) and the critter (scale .095). If these styles arrive late the
// elements render unstyled at full size for a frame, then transition away —
// the "shrinking, fading frame" + giant-butterfly flash on load.
import "./m44-home.css";

interface GardenWindow {
  __m44Booted?: boolean;
  CATS?: Record<string, CatsCategory>;
}

// Engines first, then the glue. async=false + onload-chaining guarantees order.
// Version query forces cache-bust when static files are updated.
const GARDEN_SCRIPTS = [
  "/garden/garden-plants.js?v=3",
  "/garden/garden-carousel.js",
  "/garden/m44-home.js?v=4",
];

export function PersonalHomeShell({
  cats,
}: {
  cats: Record<string, CatsCategory>;
}) {
  useEffect(() => {
    const w = window as Window & GardenWindow;
    // Boot exactly once per page load — survives React StrictMode's double-invoke
    // and any client re-render without stacking rAF loops or re-running the intro.
    if (w.__m44Booted) return;
    w.__m44Booted = true;
    w.CATS = cats;

    const loadNext = (i: number) => {
      if (i >= GARDEN_SCRIPTS.length) return;
      const s = document.createElement("script");
      s.src = GARDEN_SCRIPTS[i];
      s.async = false;
      s.dataset.m44 = "1";
      const advance = () => loadNext(i + 1);
      s.onload = advance;
      s.onerror = advance; // degrade past a missing engine rather than stalling
      document.body.appendChild(s);
    };
    loadNext(0);
  }, [cats]);

  return (
    <div
      className="personal-home public-route"
      // Verbatim static garden scaffold; the vanilla engines own this DOM
      // post-mount (see file header). React only diffs the constant __html prop.
      dangerouslySetInnerHTML={{ __html: M44_MARKUP }}
    />
  );
}
