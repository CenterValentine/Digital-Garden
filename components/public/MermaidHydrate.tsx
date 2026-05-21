"use client";

/**
 * Client-side mermaid hydration for the publisher surface.
 *
 * TipTapContent emits `<pre class="mermaid">{source}</pre>` for every
 * mermaid block (sources fetched server-side via VisualizationPayload).
 * On the visitor's browser, this component runs `mermaid.initialize()`
 * and `mermaid.run()` to replace each <pre> with the rendered diagram.
 *
 * Why client-side: rendering Mermaid SVG requires a DOM and the
 * library's runtime. The publisher pre-fetches the source so the
 * source is in the HTML; only the SVG generation is deferred to the
 * client. View-only — no editor controls, no source editing.
 *
 * Mount once per public page (e.g., in the public layout). Safe to
 * mount even when no mermaid blocks are present — mermaid.run()
 * is a no-op then.
 */

import { useEffect } from "react";

export function MermaidHydrate() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        if (cancelled) return;
        mermaid.initialize({
          startOnLoad: false,
          theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
          securityLevel: "strict",
        });
        // Run against every <pre class="mermaid"> on the page.
        await mermaid.run({
          querySelector: "pre.mermaid",
          suppressErrors: true,
        });
      } catch (err) {
        // Mermaid runtime errors shouldn't blank the page — log and move on.
        // The unrendered <pre> stays in the DOM showing the source code,
        // which is at least somewhat readable for the visitor.
        // eslint-disable-next-line no-console
        console.warn("[MermaidHydrate] render failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
