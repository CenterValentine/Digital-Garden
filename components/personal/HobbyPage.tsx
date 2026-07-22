"use client";

/**
 * HobbyPage — the "/hobby" surface (the "My Garden" / permaculture project).
 *
 * Intentionally blank for now: it carries the unified PersonalHeader and a
 * minimal placeholder so the route resolves and matches the rest of the
 * personal site. Real content (the permaculture / desert-gardening writeup)
 * lands later. The "My Garden" CTA on the home garden points here.
 */

import { PersonalHeader } from "./PersonalHeader";
import "./personal-pages.css";

export function HobbyPage() {
  return (
    <div className="personal-home public-route personal-page">
      <PersonalHeader crumb="hobby" />

      <div className="hobby-blank">
        <span className="hobby-kicker">My Garden</span>
        <h1 className="hobby-title">Coming soon.</h1>
      </div>
    </div>
  );
}
