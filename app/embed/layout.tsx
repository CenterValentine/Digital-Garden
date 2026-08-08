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
import { headers } from "next/headers";

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

  // ── 4. Inline image auth ──────────────────────────────────────────────────
  // Native <img> loads bypass the fetch() wrapper in section 1 and cannot carry
  // the /embed-scoped session cookie in a cross-site iframe, so authenticated
  // inline note images (src = /api/.../download) would 401 and render broken.
  // Append the embed session token as ?_t= to every same-origin /api/* image so
  // the download route can authenticate them (it accepts _t as a fallback).
  // Only runs when we actually hold a token; external/CDN images are untouched.
  if (t) {
    var authToken = t;
    var needsToken = function (src) {
      if (!src) return false;
      var u;
      try { u = new URL(src, window.location.href); } catch (_) { return false; }
      if (u.origin !== window.location.origin) return false; // leave external images alone
      if (u.pathname.indexOf('/api/') !== 0) return false;   // only our authed API surface
      if (u.searchParams.has('_t')) return false;            // already tokenized — avoid loop
      return true;
    };
    var authImage = function (img) {
      try {
        var raw = img.getAttribute('src');
        if (!needsToken(raw)) return;
        var u = new URL(raw, window.location.href);
        u.searchParams.set('_t', authToken);
        img.setAttribute('src', u.pathname + u.search); // keep relative/same-origin form
      } catch (_) {}
    };
    var sweep = function (root) {
      if (!root || !root.querySelectorAll) return;
      var imgs = root.querySelectorAll('img[src]');
      for (var i = 0; i < imgs.length; i++) authImage(imgs[i]);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { sweep(document); });
    } else {
      sweep(document);
    }
    // ProseMirror's image NodeView sets img.src on mount and swaps it after
    // upload, so watch for both added <img> nodes and later src changes.
    try {
      var mo = new MutationObserver(function (records) {
        for (var r = 0; r < records.length; r++) {
          var rec = records[r];
          if (rec.type === 'attributes' && rec.target && rec.target.tagName === 'IMG') {
            authImage(rec.target);
          } else if (rec.type === 'childList') {
            for (var n = 0; n < rec.addedNodes.length; n++) {
              var node = rec.addedNodes[n];
              if (!node || node.nodeType !== 1) continue;
              if (node.tagName === 'IMG') authImage(node);
              else sweep(node);
            }
          }
        }
      });
      mo.observe(document.documentElement, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['src'],
      });
    } catch (_) {}
  }
})();
`;

export default async function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Per-request nonce from the proxy. See app/layout.tsx for context on
  // why we apply this now while CSP enforcement (M-2) is still pending.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <div
      id="embed-root"
      // `dark` forces the embedded content to render in dark mode to match the
      // extension overlay's always-dark glass chrome. Every `.dark` rule in
      // globals.css is a plain class selector, so this re-scopes the dark token
      // set to this subtree without fighting the global ThemeProvider (which
      // only toggles `.dark` on <html>). Necessary because a storage-partitioned
      // cross-site iframe can't read the app's saved theme preference and would
      // otherwise fall back to light — rendering dark text on a dark surface.
      className="embed-layout-page dark"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        // `--surface-primary` is not a token this app defines, so this always
        // fell through to the hard-coded dark value — light-theme surfaces
        // then composited their translucent backgrounds over near-black and
        // came out muddy/low-contrast. `--background` is the real themed
        // token and follows the resolved theme.
        background: "var(--background, #0d0d0d)",
        // Tells the UA to render its own chrome (scrollbars, form controls,
        // caret) dark, matching the forced `dark` class above. Without it the
        // iframe's scrollbars render light against the dark surface.
        colorScheme: "dark",
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
      {/* suppressHydrationWarning: CSP nonce-hiding empties the attribute
          before hydration compares it (see app/layout.tsx theme script). */}
      <script
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: EMBED_BRIDGE_SCRIPT }}
      />
      {children}
    </div>
  );
}
