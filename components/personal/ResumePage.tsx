"use client";

import { Fragment, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { parseEmphasis } from "@/components/common/Emphasis";
import { DEFAULT_RESUME_DATA } from "@/lib/domain/page-layout/resume";
import type { ResumeCta, ResumeData } from "@/lib/domain/page-layout/resolved";
import "./personal-pages.css";

// Content (eras, entries, page copy) is data — a "resume" SitePage, falling
// back to DEFAULT_RESUME_DATA (lib/domain/page-layout/resume.ts). Era index 0
// is the innermost zone (the most recent chapter): the ring inverts the
// real-tree metaphor — current work at the centre, the earliest era outermost.
// The FOUR bands below are fixed geometry; only what they say is data.

/**
 * The résumé's emphasis markup: *accent* → <em>, **bold** → <b>, plain text as
 * bare text nodes. Not the shared <Emphasis> — that emits <strong>/<span>, and
 * this page's CSS styles `.rv-cve-blurb b`.
 */
function Rich({ text }: { text: string }) {
  return (
    <>
      {parseEmphasis(text).map((part, i) =>
        part.tier === "accent" ? (
          <em key={i}>{part.text}</em>
        ) : part.tier === "bold" ? (
          <b key={i}>{part.text}</b>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

/** In-app paths route client-side; "#", web and mail links stay plain anchors. */
function Cta({ cta }: { cta: ResumeCta }) {
  const className = `cta ${cta.primary ? "pri" : "sec"}`;
  if (cta.href.startsWith("/") && !cta.href.startsWith("//")) {
    return (
      <Link className={className} href={cta.href} aria-label={cta.ariaLabel}>
        {cta.label}
      </Link>
    );
  }
  return (
    <a className={className} href={cta.href} aria-label={cta.ariaLabel}>
      {cta.label}
    </a>
  );
}

// ── Ring geometry (module-level constants, evaluated once at import) ───
// Ported from resume-b-standalone.html. Pure math — React Compiler safe.
const CX = 150,
  CY = 150,
  RMAX = 130,
  RDRIFT_X = 18,
  RDRIFT_Y = -13;
const BOUNDS = [8, 46, 80, 108, 130]; // 5 values → 4 era bands

function ringCenter(r: number): [number, number] {
  const k = r / RMAX;
  return [CX + RDRIFT_X * k, CY + RDRIFT_Y * k];
}

function distort(t: number): number {
  return (
    0.5 * Math.sin(t + 0.7) +
    0.26 * Math.sin(2 * t + 2.3) +
    0.15 * Math.sin(3 * t + 4.1) +
    0.085 * Math.sin(5 * t + 1.2) +
    0.05 * Math.sin(7 * t + 5.6) +
    0.03 * Math.sin(11 * t + 3.4)
  );
}

function loopPath(r: number): string {
  const n = 80;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const [c0, c1] = ringCenter(r);
    const rr = r * (1 + 0.055 * distort(t));
    pts.push([c0 + rr * Math.cos(t), c1 + rr * Math.sin(t)]);
  }
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i],
      a = pts[(i + 1) % n],
      b = pts[(i + 2) % n],
      pp = pts[(i - 1 + n) % n];
    const c1x = p[0] + (a[0] - pp[0]) / 6,
      c1y = p[1] + (a[1] - pp[1]) / 6;
    const c2x = a[0] - (b[0] - p[0]) / 6,
      c2y = a[1] - (b[1] - p[1]) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${a[0].toFixed(1)} ${a[1].toFixed(1)}`;
  }
  return d + "Z";
}

function annulus(ro: number, ri: number): string {
  return loopPath(ro) + " " + loopPath(ri);
}

function eraOf(r: number): number {
  for (let e = 0; e < 4; e++) if (r <= BOUNDS[e + 1]) return e;
  return 3;
}

// Zone fill paths — annular bands between era boundaries
const ZONE_PATHS = Array.from({ length: 4 }, (_, e) =>
  annulus(BOUNDS[e + 1], BOUNDS[e]),
);

// Era boundary ring outlines
const BOUND_PATHS = BOUNDS.slice(1).map((b) => loopPath(b));

interface LineData {
  path: string;
  era: number;
  opacity: string;
  sw: string;
}

// Radial fill lines with organic variable density
const LINE_DATA: LineData[] = (() => {
  const lines: LineData[] = [];
  let r = 12;
  while (r < RMAX - 1) {
    lines.push({
      path: loopPath(r),
      era: eraOf(r),
      opacity: (0.18 + 0.13 * Math.abs(Math.sin(r * 0.9 + 1.1))).toFixed(3),
      sw: (0.4 + 0.22 * Math.abs(Math.sin(r * 1.3))).toFixed(2),
    });
    r += Math.max(
      1.5,
      3.4 - 2.0 * (r / RMAX) + 1.1 * Math.abs(Math.sin(r * 0.5)),
    );
  }
  return lines;
})();

const PITH_PATH = loopPath(5.5);
const [PITH_CX, PITH_CY] = ringCenter(6);

interface LabelPosition {
  x: string;
  y: string;
}

// Where each era's ring label sits; the label text comes from data.
const LABEL_POSITIONS: LabelPosition[] = Array.from({ length: 4 }, (_, e) => {
  const rmid = (BOUNDS[e] + BOUNDS[e + 1]) / 2;
  const [lx, ly] = ringCenter(rmid);
  return {
    x: lx.toFixed(1),
    y: (ly - rmid + 5).toFixed(1),
  };
});

// Single radial grain line for wood texture
const GRAIN_D = (() => {
  const ang = -0.62,
    n = 10;
  let d = "";
  for (let i = 0; i <= n; i++) {
    const cr = 10 + (RMAX - 12) * (i / n);
    const [c0, c1] = ringCenter(cr);
    const jx = ang + 0.05 * Math.sin(i * 1.7);
    d +=
      (i ? "L" : "M") +
      (c0 + cr * Math.cos(jx)).toFixed(1) +
      " " +
      (c1 + cr * Math.sin(jx)).toFixed(1) +
      " ";
  }
  return d;
})();

// ── Component ──────────────────────────────────────────────────────────
export function ResumePage({ data }: { data?: ResumeData }) {
  const { eras, copy } = data ?? DEFAULT_RESUME_DATA;
  const [active, setActive] = useState(-1);
  const ringContainerRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);

  // Size the ring SVG to fill the available left-panel height
  useEffect(() => {
    const resize = () => {
      if (!ringContainerRef.current || !sizerRef.current) return;
      const h = ringContainerRef.current.getBoundingClientRect().height;
      const size = Math.max(0, h - 16);
      if (size > 0) {
        sizerRef.current.style.width = `${size}px`;
        sizerRef.current.style.height = `${size}px`;
      }
    };
    resize();
    const obs = new ResizeObserver(resize);
    const el = ringContainerRef.current;
    if (el) obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="personal-home personal-page resume-b-page">
      <div className="rv-layout">
        {/* ── Shared header ── */}
        <header className="rv-site-head">
          <div className="rv-head-left">
            <h1 className="rv-l-name">
              David Valentine<span className="dot">.</span>
            </h1>
            <span className="rv-l-role">
              Execution Engineer · Technology &amp; Operations
            </span>
            <Link className="rv-l-back" href="/">
              ← Back to garden
            </Link>
            <span className="rv-l-tag">davidvalentine.org / résumé</span>
          </div>
          <div className="rv-cv-head">
            <span className="rv-cvh-label">{copy.kicker}</span>
            <h2 className="rv-cvh-title">
              <Rich text={copy.heading} />
            </h2>
            <p className="rv-cvh-sub">{copy.subtitle}</p>
          </div>
        </header>

        {/* ── Body ── */}
        <div className="rv-layout-body">
          {/* Left: organic ring visualization */}
          <aside className="rv-left">
            <div className="rv-left-ring" ref={ringContainerRef}>
              <div className="rv-ring-sizer" ref={sizerRef}>
                <svg
                  viewBox="0 0 300 300"
                  overflow="visible"
                  className={active >= 0 ? "rv-has-active" : ""}
                  aria-hidden="true"
                >
                  {/* Zone fills — outermost era (3) first; inner zones paint over */}
                  {[3, 2, 1, 0].map((e) => (
                    <path
                      key={`z${e}`}
                      className={`rv-zfill${active === e ? " rv-is-active" : ""}`}
                      data-idx={e}
                      fillRule="evenodd"
                      d={ZONE_PATHS[e]}
                      pointerEvents="none"
                    />
                  ))}

                  {/* Radial ring lines with variable density + opacity */}
                  {LINE_DATA.map((ln, i) => (
                    <path
                      key={`l${i}`}
                      className={`rv-line${active === ln.era ? " rv-is-active" : ""}`}
                      data-idx={ln.era}
                      d={ln.path}
                      fill="none"
                      stroke="var(--accent-warm)"
                      strokeWidth={ln.sw}
                      opacity={ln.opacity}
                      pointerEvents="none"
                    />
                  ))}

                  {/* Era boundary outlines */}
                  {BOUND_PATHS.map((d, e) => (
                    <path
                      key={`b${e}`}
                      className={`rv-bound${active === e ? " rv-is-active" : ""}`}
                      data-idx={e}
                      d={d}
                      fill="none"
                      stroke="var(--accent-warm)"
                      strokeWidth="1.1"
                      opacity="0.42"
                      pointerEvents="none"
                    />
                  ))}

                  {/* Grain line for wood texture */}
                  <path
                    d={GRAIN_D}
                    fill="none"
                    stroke="var(--accent-warm)"
                    strokeWidth="0.7"
                    opacity="0.2"
                    pointerEvents="none"
                  />

                  {/* Pith */}
                  <path
                    d={PITH_PATH}
                    fill="var(--accent-warm)"
                    opacity="0.5"
                    pointerEvents="none"
                  />
                  <circle
                    cx={PITH_CX.toFixed(1)}
                    cy={PITH_CY.toFixed(1)}
                    r="2.3"
                    fill="var(--accent-warm)"
                    pointerEvents="none"
                  />

                  {/* Era labels — paint-order knockout halo applied via CSS .rv-elabel */}
                  {LABEL_POSITIONS.map((pos, e) => (
                    <text
                      key={`lbl${e}`}
                      className={`rv-elabel${active === e ? " rv-is-active" : ""}`}
                      data-idx={e}
                      x={pos.x}
                      y={pos.y}
                      textAnchor="middle"
                      fontFamily="monospace"
                      fontSize="7.5"
                      fill="var(--text-soft)"
                      opacity="0.85"
                      pointerEvents="none"
                    >
                      {eras[e]?.label}
                    </text>
                  ))}

                  {/* Hit targets — transparent, on top, own all pointer events */}
                  {[3, 2, 1, 0].map((e) => (
                    <path
                      key={`h${e}`}
                      className="rv-hit"
                      fillRule="evenodd"
                      fill="transparent"
                      d={ZONE_PATHS[e]}
                      onMouseEnter={() => setActive(e)}
                      onMouseLeave={() => setActive(-1)}
                    />
                  ))}
                </svg>
              </div>
            </div>
            <div className="rv-left-foot">
              <span className="rv-hint">{copy.hint}</span>
            </div>
          </aside>

          {/* Right: scrollable CV entries */}
          <main className="rv-right">
            <div className="rv-cv-body">
              {/* Entries in era order; an entry lights its era's ring, and a
                  ring lights every entry in its era. */}
              {eras.map((era, e) =>
                era.entries.map((entry, j) => (
                  <div
                    key={`${e}-${j}`}
                    className={`rv-cv-entry${active === e ? " rv-is-active" : ""}`}
                    onMouseEnter={() => setActive(e)}
                    onMouseLeave={() => setActive(-1)}
                  >
                    <span className="rv-cve-yr">{entry.year}</span>
                    <div className="rv-cve-right">
                      <h3>
                        <Rich text={entry.title} />
                      </h3>
                      <span className="rv-cve-meta">{entry.meta}</span>
                      <p className="rv-cve-blurb">
                        <Rich text={entry.blurb} />
                      </p>
                      <div className="rv-cve-tags">
                        {entry.tags.map((t) => (
                          <span key={t} className="rv-cve-tag">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )),
              )}

              <div className="rv-cv-foot">{copy.footnote}</div>
              <div className="rv-ctas">
                {copy.ctas.map((cta, k) => (
                  <Cta key={k} cta={cta} />
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
