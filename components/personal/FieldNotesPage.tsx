"use client";

/**
 * FieldNotesPage — the /blog "Field Notes" surface, de-bundled from the former
 * self-contained public/field-notes.html export into real source.
 *
 * Architecture mirrors PersonalHomeShell: the static scaffold is rendered via
 * dangerouslySetInnerHTML (FIELD_NOTES_MARKUP), styles come from field-notes.css,
 * and the generative garden + leaf engine load from /blog-engine/*.js in strict
 * order (async=false + onload chaining) and own that DOM after mount. The final
 * inline boot script adds `html.fn-standalone` and calls M44LeafConnect.init()
 * to open straight into the dandelion → Field Notes leaf view.
 *
 * The four leaf-engine files (garden-leaf, -shapes, -special, m44-leaf-connect)
 * were the ones missing from the design package; they were recovered from the
 * export's resource manifest during the de-bundle.
 */

import { useEffect } from "react";
import { PersonalHeader } from "./PersonalHeader";
import { FIELD_NOTES_MARKUP } from "./field-notes-markup";
import "./field-notes.css";

// Order is load-bearing: carousel stub + theme → garden-plants → garden/day-night
// orchestration → leaf shapes/special/engine → data → leaf bridge → standalone boot.
// Version query cache-busts the static engine files when they change.
const FN_V = "3";
const FN_SCRIPTS = [
  "/blog-engine/fn-inline-a.js",
  "/blog-engine/garden-plants.js",
  "/blog-engine/fn-inline-b.js",
  "/blog-engine/garden-leaf-shapes.js",
  "/blog-engine/garden-leaf-special.js",
  "/blog-engine/garden-leaf.js",
  "/blog-engine/garden-data.js",
  "/blog-engine/m44-leaf-connect.js",
  "/blog-engine/fn-inline-g.js",
].map((src) => `${src}?v=${FN_V}`);

interface FieldNotesWindow {
  __fnBooted?: boolean;
}

export function FieldNotesPage() {
  useEffect(() => {
    const w = window as Window & FieldNotesWindow;
    // Boot exactly once per load — survives StrictMode's double-invoke.
    if (w.__fnBooted) return;
    w.__fnBooted = true;

    const loadNext = (i: number) => {
      if (i >= FN_SCRIPTS.length) return;
      const s = document.createElement("script");
      s.src = FN_SCRIPTS[i];
      s.async = false;
      const advance = () => loadNext(i + 1);
      s.onload = advance;
      s.onerror = advance; // degrade past a failed script rather than stalling
      document.body.appendChild(s);
    };
    loadNext(0);
  }, []);

  return (
    <div className="personal-home public-route fn-page">
      <PersonalHeader crumb="notes" />
      <div
        className="fn-scaffold"
        // Verbatim de-bundled garden scaffold; the /blog-engine scripts own this
        // DOM post-mount (see file header). React only diffs the constant __html.
        dangerouslySetInnerHTML={{ __html: FIELD_NOTES_MARKUP }}
      />
    </div>
  );
}
