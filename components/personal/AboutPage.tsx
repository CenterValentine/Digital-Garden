"use client";

/**
 * AboutPage — "The Narrative" direction (design-reference/about-c.html).
 *
 * Client component: all content is static JSX with no server dependencies, so
 * "use client" costs nothing and prevents blank pages on Link navigation (the
 * RSC dynamic-import chain from the route handler can silently produce an empty
 * tree during CSR; client components bypass that serialization step entirely).
 */

import Link from "next/link";
import { PersonalHeader } from "./PersonalHeader";
import "./personal-pages.css";

/** Sinusoidal vine with leaf/bud nodes — drawn between sections. */
function VineDivider({ marginTop }: { marginTop?: number }) {
  return (
    <svg
      className="vine-divider"
      viewBox="0 0 420 32"
      aria-hidden="true"
      style={marginTop ? { marginTop } : undefined}
    >
      <path
        className="vl"
        d="M4 16 C 64 9 110 23 180 16 C 248 9 298 22 380 16 C 394 15 406 17 416 15"
      />
      <path className="vleaf" d="M110 16 C 106 7 113 5 118 9 C 116 14 112 16 110 16Z" />
      <path className="vleaf" d="M218 16 C 214 7 221 5 226 10 C 224 14 220 16 218 16Z" />
      <path className="vleaf" d="M330 16 C 326 8 333 6 338 11 C 336 15 332 16 330 16Z" />
      <circle className="vbud" cx="66" cy="13" r="2" />
      <circle className="vbud" cx="162" cy="18" r="1.7" />
      <circle className="vbud" cx="278" cy="14" r="1.8" />
      <circle className="vbud" cx="392" cy="15" r="1.6" />
    </svg>
  );
}

export function AboutPage() {
  return (
    <div className="personal-home public-route personal-page">
      <PersonalHeader crumb="about" />

      <header className="hero">
        <span className="hero-tag">davidvalentine.org / about</span>
        <h1 className="hero-name">
          David
          <br />
          Valentine<span className="dot">.</span>
        </h1>
        <p className="hero-sub">
          <span>Execution Engineer</span>
          <span className="sep">·</span>
          <span>Technology &amp; Operations</span>
          <span className="sep">·</span>
          <span>Desert Southwest</span>
        </p>
      </header>

      <div className="prose-wrap">
        <p className="intro-p">
          I&apos;m an execution engineer — someone who turns strategy into{" "}
          <b>working systems</b>, and working systems into results. Over the past
          decade I&apos;ve built and run operations in technology companies,
          moving between the abstract and the concrete so often it no longer
          feels like a distinction.
        </p>

        <VineDivider marginTop={52} />

        <div className="sec">
          <div className="sec-content">
            <span className="sec-kicker">The work</span>
            <h2>
              Structure in <em>motion.</em>
            </h2>
            <p>
              I&apos;m drawn to the space where{" "}
              <b>system design meets human coordination</b> — where you have to
              decide not just what to build but how the building itself should
              work. Most of my career has been spent at that intersection:
              creating the conditions for teams to move well, and staying close
              enough to the execution to know when they aren&apos;t.
            </p>
            <p>
              I&apos;ve run engineering operations, stood up product processes
              from scratch, and carried responsibility for outcomes that required
              both technical literacy and organizational will. The thread through
              all of it is the same: <b>the map has to match the territory</b>,
              or you&apos;re navigating by fiction.
            </p>
          </div>
          <aside className="sec-note" aria-hidden="true">
            <span className="note-text">
              map ≠ territory
              <br />
              is always the problem
            </span>
            <span className="note-arrow">↖ this one especially</span>
          </aside>
        </div>

        <VineDivider />

        <div className="sec">
          <div className="sec-content">
            <span className="sec-kicker">Outside work</span>
            <h2>
              Actual <em>dirt.</em>
            </h2>
            <p>
              I garden. Not metaphorically — though that too — but with soil and
              seeds and an unreasonable amount of attention to water. The project
              is a permaculture plot in the <b>desert Southwest</b>, where the
              conditions are genuinely hostile: scarce water, intense heat,
              alkaline soil, and a sun that has very strong opinions about things.
            </p>
            <p>
              Somewhere in the middle of trying to keep things alive, I stopped
              seeing it as a hobby and started seeing it as a <b>discipline</b>.
              The constraints aren&apos;t obstacles to gardening; they&apos;re
              what makes it interesting. I carry that instinct into everything
              else I do.
            </p>
          </div>
          <aside className="sec-note" aria-hidden="true">
            <span className="note-text">
              constraints are the design, not the problem
            </span>
          </aside>
        </div>

        <VineDivider />

        <div className="sec">
          <div className="sec-content">
            <span className="sec-kicker">Right now</span>
            <h2>
              Growing the <em>garden.</em>
            </h2>
            <p>
              I&apos;m building davidvalentine.org as a <b>digital garden</b> — a
              living, growing record of projects, thinking, and things I&apos;m
              learning. It&apos;s organized the way a garden is: by what grows
              near what, by root systems and branching, not by categories imposed
              from above.
            </p>
            <p>
              If you want to follow along, the <b>field notes</b> are the place to
              start. If you want to talk, the door is open.
            </p>
          </div>
          <aside className="sec-note" aria-hidden="true">
            <span className="note-text">gardens grow sideways, not up</span>
          </aside>
        </div>

        <div className="ab-ctas">
          <Link className="ab-cta pri" href="/resume">
            View résumé →
          </Link>
          <Link className="ab-cta sec" href="/notes">
            Browse field notes
          </Link>
          <Link className="ab-cta sec" href="/">
            See the garden
          </Link>
        </div>
      </div>

      <footer className="ab-foot">
        <Link href="/">Back to the garden</Link>
        <span className="sep">·</span>
        <Link href="/results">Results</Link>
        <span className="sep">·</span>
        <Link href="/contact">Contact</Link>
      </footer>
    </div>
  );
}
