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
          I&apos;m an execution engineer — someone who turns strategy,
          constraints, and real-world signals into{" "}
          <b>systems that work.</b>
        </p>
        <p className="intro-body">
          My work lives between technology, operations, and human coordination:
          support systems, revenue workflows, automation, knowledge architecture,
          and the connective tissue that helps teams move with less friction.
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
              <b>system design meets human coordination</b> — where the question
              is not just what to build, but how the work itself should move.
            </p>
            <p>
              At Doxy.me, that meant helping scale customer and revenue
              operations through rapid growth: support systems, Intercom
              automation, billing workflows, lifecycle messaging, usage-based
              revenue, help-center architecture, and cross-functional process
              design.
            </p>
            <p>
              The thread through all of it is the same:{" "}
              <b>the map has to match the territory</b>, or the system
              eventually becomes fiction.
            </p>
          </div>
          <aside className="sec-note" aria-hidden="true">
            <span className="note-text">
              every system is a theory
              <br />
              until the work
              <br />
              runs through it
            </span>
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
              I garden in the desert Southwest, where alkaline soil, intense
              heat, and scarce water make{" "}
              <b>every assumption visible.</b>
            </p>
            <p>
              What started as a hobby has become a discipline in constraints:
              shade, timing, amendment, irrigation, observation, and patience.
            </p>
            <p>
              That instinct follows me back into my work. Good systems are{" "}
              <b>grown as much as they are designed.</b>
            </p>
          </div>
          <aside className="sec-note" aria-hidden="true">
            <span className="note-text">
              constraints are the design,
              <br />
              not the excuse
            </span>
          </aside>
        </div>

        <VineDivider />

        <div className="sec">
          <div className="sec-content">
            <span className="sec-kicker">Right now</span>
            <h2>
              Building the <em>garden.</em>
            </h2>
            <p>
              I&apos;m building davidvalentine.org as a{" "}
              <b>digital garden</b>: a living record of projects, notes,
              experiments, career artifacts, and things I&apos;m learning.
            </p>
            <p>
              It is part portfolio, part workshop, part memory system —
              organized less like a filing cabinet and more like a landscape:
              roots, paths, branches, seasons, and the occasional useful weed.
            </p>
            <p>
              For the professional trail, start with the{" "}
              <b>résumé</b>. For the thinking behind it, browse the{" "}
              <b>field notes</b>. To wander, enter the garden.
            </p>
          </div>
          <aside className="sec-note" aria-hidden="true">
            <span className="note-text">
              gardens grow by relation,
              <br />
              not by hierarchy
            </span>
          </aside>
        </div>

        <div className="ab-ctas">
          <Link className="ab-cta pri" href="/resume">
            View résumé →
          </Link>
          <Link className="ab-cta sec" href="/blog">
            Browse field notes
          </Link>
        </div>
      </div>

      <footer className="ab-foot">
        <Link href="/">Back to the garden</Link>
        <span className="sep">·</span>
        <Link href="/results">Results</Link>
        <span className="sep">·</span>
        <Link href="/blog">Field notes</Link>
      </footer>
    </div>
  );
}
