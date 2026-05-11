/**
 * Embed Layout — nested inside the root layout, loaded inside the browser
 * extension iframe.
 *
 * IMPORTANT: This is a *nested* layout in Next.js App Router. It must NOT
 * render <html>/<body> — those belong to the root layout. We just return
 * children wrapped in a marker div so CSS (in globals.css, via :has()) can
 * hide the root navbar and reset padding for embed pages.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Digital Garden",
  robots: { index: false, follow: false },
};

/**
 * Inline embed bridge — runs synchronously during HTML parsing, BEFORE any React
 * code executes. Three responsibilities:
 *
 *   1. Auth bridge: reads ?_t= (or sessionStorage on later loads) and wraps
 *      window.fetch to inject `X-Embed-Session` header on all /api/* calls.
 *      This is the fallback for cross-site iframe contexts (e.g. Vivaldi strict
 *      tracking) where the cookie set by proxy.ts is blocked.
 *
 *   2. Link interceptor: intercepts anchor clicks in capture phase. External
 *      links (or any link that would navigate the iframe away from this content)
 *      are converted to `postMessage({type:"open-external", url})` so the
 *      overlay can pop them in a new top-level tab. The iframe must NEVER
 *      navigate away from its designated content URL.
 *
 *   3. Navigation guard: a beforeunload listener that catches any programmatic
 *      navigation attempts (form submissions, window.location assignments, etc.)
 *      and routes them to the overlay instead of letting the iframe blank out.
 */
const EMBED_BRIDGE_SCRIPT = `
(function () {
  // ── 1. Auth bridge ───────────────────────────────────────────────────────
  try {
    var t = new URL(window.location.href).searchParams.get('_t');
    if (t) {
      try { sessionStorage.setItem('embedSessionToken', t); } catch (_) {}
    } else {
      try { t = sessionStorage.getItem('embedSessionToken'); } catch (_) {}
    }
    if (t) {
      var orig = window.fetch;
      window.fetch = function (input, init) {
        try {
          var u = typeof input === 'string'
            ? input
            : (input && input.url) || String(input);
          var isApi =
            u.indexOf('/api/') === 0 ||
            u.indexOf(window.location.origin + '/api/') === 0;
          if (isApi) {
            init = init || {};
            var h = new Headers(init.headers || {});
            if (!h.has('X-Embed-Session')) h.set('X-Embed-Session', t);
            init.headers = h;
          }
        } catch (_) {}
        return orig.call(this, input, init);
      };
    }
  } catch (_) {}

  // ── 2. Link interceptor ──────────────────────────────────────────────────
  // Capture phase so we run before any React onClick handlers. Anchor clicks
  // that would navigate the iframe (any href except in-page hashes) are
  // forwarded to the overlay as open-external messages. Wiki-links and other
  // in-app navigation use a separate postMessage protocol (navigate), so they
  // are unaffected because they don't render real href attributes.
  document.addEventListener('click', function (e) {
    try {
      if (e.defaultPrevented) return;
      // Honor explicit modifier keys & non-primary buttons (browser default).
      if (e.button !== undefined && e.button !== 0) return;
      var anchor = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!anchor) return;
      var href = anchor.getAttribute('href');
      if (!href) return;
      // Skip same-page hash links and protocol-only links.
      if (href.charAt(0) === '#') return;
      if (href.indexOf('javascript:') === 0) return;
      if (href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0) {
        // Let the browser handle these; they don't navigate the iframe anyway.
        return;
      }
      var url;
      try { url = new URL(href, window.location.href); } catch (_) { return; }
      // Block navigation, forward to overlay.
      e.preventDefault();
      e.stopPropagation();
      try {
        window.parent.postMessage({ type: 'open-external', url: url.href }, '*');
      } catch (_) {}
    } catch (_) {}
  }, true);

  // ── 3. Navigation guard ──────────────────────────────────────────────────
  // Last-ditch defense: if some code path manages to trigger a top-level
  // navigation away from /embed/, notify the overlay so it can recover by
  // re-loading the original content URL.
  window.addEventListener('beforeunload', function () {
    try {
      window.parent.postMessage({ type: 'embed-unloading' }, '*');
    } catch (_) {}
  });
})();
`;

export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      id="embed-root"
      className="embed-layout-page"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--surface-primary, #0d0d0d)",
        overflow: "hidden",
        zIndex: 100,
      }}
    >
      {/*
        Inline embed bridge runs synchronously during HTML parse — before any
        React effect or fetch. Wraps window.fetch for auth header injection and
        intercepts anchor clicks to forward external links to the parent overlay.
        Must stay inline (no Script component) so it executes before hydration.
      */}
      <script dangerouslySetInnerHTML={{ __html: EMBED_BRIDGE_SCRIPT }} />
      {children}
    </div>
  );
}
