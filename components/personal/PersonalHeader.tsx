"use client";

/**
 * PersonalHeader — the unified header for the nested personal-site routes
 * (/about, /results, /hobby, and eventually /blog once it migrates to React).
 *
 * Design: the `David Valentine.` logo lockup from the blog header, wrapped in
 * the flat `ab-bar` styling used by About/Projects. Three zones:
 *   left   — logo + "← Back to the garden" stacked beneath it
 *   center — `davidvalentine.org / <page>` crumb
 *   right  — the shared Day/Night toggle
 *
 * `crumb` is the page label shown in the breadcrumb (rendered lowercase-styled
 * via CSS letter-spacing/uppercase, so pass it in natural case). `backHref`
 * defaults to the garden home but can point elsewhere for deeper nesting.
 */

import { PersonalThemeToggle } from "./PersonalThemeToggle";
import "./personal-pages.css";

export function PersonalHeader({
  crumb,
  backHref = "/",
  backLabel = "Back to the garden",
}: {
  crumb: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="ph-bar">
      <div className="ph-left">
        {/* Plain <a> (full page load), not next/link: the garden home is a
            global vanilla-JS engine that mutates <html>/window; a client-side
            transition would carry over stale state (e.g. the fn-standalone
            class) and blank the destination. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- intentional full page load: the garden home is a global vanilla-JS engine that must reset (html class, window globals) on navigation; next/link's SPA transition blanks it. */}
        <a className="ph-logo" href="/" aria-label="David Valentine — home">
          <span className="ph-logo-name">
            David Valentine<span className="ph-dot">.</span>
          </span>
          <span className="ph-logo-sub">My Digital Garden</span>
        </a>
        <a className="ph-back" href={backHref}>
          ← {backLabel}
        </a>
      </div>

      <span className="ph-crumb">
        davidvalentine<span className="ph-dot">.</span>org / <em>{crumb}</em>
      </span>

      <PersonalThemeToggle />
    </header>
  );
}
