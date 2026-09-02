"use client";

import Link from "next/link";
import { PersonalHeader } from "./PersonalHeader";
import "./personal-pages.css";

/**
 * DemoPage — /demo — the video-demo landing referenced from the GitHub README.
 *
 * Placeholder state ("the demo reel is still growing"): a video frame with a
 * play sigil, a CTA to request a custom demo via /contact, and pointers to the
 * live proof that already exists (this site itself + the repo). When a demo
 * video ships, replace the frame contents with the embedded player and keep
 * the surrounding copy — the URL is already public in the README, so this
 * route must never 404.
 */
export function DemoPage() {
  return (
    <div className="personal-home personal-page garden-construction-page">
      <PersonalHeader crumb="demo" />

      <div className="gc-body">
        <span className="gc-kicker">DAVIDVALENTINE.ORG / PRODUCT DEMO</span>

        <h1 className="gc-title">
          The demo reel is<br />
          <em>still growing.</em>
        </h1>

        {/* Video frame placeholder — swap for the real embed when it ships */}
        <div
          aria-hidden="true"
          style={{
            width: "min(640px, 100%)",
            aspectRatio: "16 / 9",
            margin: "1.75rem auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "12px",
            border: "1.5px dashed var(--text-soft)",
            opacity: 0.85,
          }}
        >
          <svg viewBox="0 0 96 96" width="72" height="72" fill="none">
            {/* Play button seed, mid-sprout */}
            <circle cx="48" cy="48" r="30" stroke="var(--accent-warm)" strokeWidth="2.5" opacity="0.55" />
            <path d="M42 36 L62 48 L42 60 Z" fill="var(--accent-warm)" opacity="0.7" />
            {/* Sprout on top */}
            <line x1="48" y1="18" x2="48" y2="8" stroke="var(--accent-warm)" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
            <path d="M48 12 Q41 5 35 9" stroke="var(--accent-warm)" strokeWidth="2" strokeLinecap="round" opacity="0.7" fill="none" />
            <path d="M48 12 Q55 5 61 9" stroke="var(--accent-warm)" strokeWidth="2" strokeLinecap="round" opacity="0.7" fill="none" />
          </svg>
        </div>

        <p className="gc-line">
          A guided video tour of the Digital Garden — the AI chat and its tool calls, charters,
          workflows, live collaboration, and publishing — is being filmed. The product ships
          faster than the film crew.
        </p>

        <p className="gc-line gc-line--soft">
          Meanwhile, the live proof: the site you&apos;re reading right now is rendered by the
          garden&apos;s own publishing pipeline, and the code is public on{" "}
          <a
            href="https://github.com/CenterValentine/Digital-Garden"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent-warm)" }}
          >
            GitHub
          </a>
          .
        </p>

        <p className="gc-line">
          Want to see something specific — for a role, a team, or just curiosity?{" "}
          <strong>I&apos;ll record a custom demo for you.</strong>
        </p>

        <Link className="gc-back-cta" href="/contact">
          Request a custom demo →
        </Link>

        <Link
          className="gc-back-cta"
          href="/"
          style={{ opacity: 0.7, marginTop: "0.5rem" }}
        >
          ← Back to the garden
        </Link>
      </div>
    </div>
  );
}
