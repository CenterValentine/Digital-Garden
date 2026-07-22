"use client";

/**
 * AboutPage — "The Narrative" direction (design-reference/about-c.html).
 *
 * Client component: all content is static JSX with no server dependencies, so
 * "use client" costs nothing and prevents blank pages on Link navigation (the
 * RSC dynamic-import chain from the route handler can silently produce an empty
 * tree during CSR; client components bypass that serialization step entirely).
 */

import { Fragment } from "react";
import Link from "next/link";
import { PersonalHeader } from "./PersonalHeader";
import { Emphasis } from "@/components/common/Emphasis";
import type { ProseData } from "@/lib/domain/page-layout/resolved";
import { DEFAULT_ABOUT_DATA } from "@/lib/domain/page-layout/about-default";
import "./personal-pages.css";

/** Render a pull-quote string, turning newlines into <br>. */
function AsideLines({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </>
  );
}

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

export function AboutPage({ data }: { data?: ProseData }) {
  const sections = (data ?? DEFAULT_ABOUT_DATA).sections;
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

        {sections.map((s, i) => (
          <Fragment key={i}>
            <VineDivider marginTop={i === 0 ? 52 : undefined} />
            <div className="sec">
              <div className="sec-content">
                <span className="sec-kicker">
                  <Emphasis text={s.kicker} />
                </span>
                <h2>
                  <Emphasis text={s.heading} />
                </h2>
                {s.paragraphs.map((p, j) => (
                  <p key={j}>
                    <Emphasis text={p} />
                  </p>
                ))}
              </div>
              {s.aside && (
                <aside className="sec-note" aria-hidden="true">
                  <span className="note-text">
                    <AsideLines text={s.aside} />
                  </span>
                </aside>
              )}
            </div>
          </Fragment>
        ))}

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
