"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import "./personal-pages.css";

// ── CV data ────────────────────────────────────────────────────────────
interface CvEntry {
  yr: string;
  title: string;
  titleEm: string;
  meta: string;
  blurbPre?: string;
  blurbBold?: string;
  blurbPost?: string;
  tags: string[];
}

const DATA: CvEntry[] = [
  {
    yr: "2021–now",
    title: "Execution Engineer — ",
    titleEm: "Independent",
    meta: "Technology · Operations · AI Systems",
    blurbPre:
      "Building a personal technology & operations practice across AI workflows, digital-garden architecture, resume systems, and career systems. ",
    blurbBold: "Durable knowledge, automation, and human judgment",
    blurbPost: " — compounding over time.",
    tags: ["AI Workflows", "Digital Garden", "System Design", "Career Ops"],
  },
  {
    yr: "2023–25",
    title: "Revenue Operations — ",
    titleEm: "Doxy.me",
    meta: "RevOps · Stripe · HubSpot · Tray.io",
    blurbPre:
      "Owned revenue-operations systems across billing, lifecycle messaging, usage-based revenue, and analytics. ",
    blurbBold: "Lifted dunning recovery ~65% → 73%, supporting $1.37M recovered",
    blurbPost: "; operationalized >$100k/month usage billing.",
    tags: ["RevOps", "Stripe", "Usage billing", "Dunning"],
  },
  {
    yr: "2020–23",
    title: "CS Operations — ",
    titleEm: "Doxy.me",
    meta: "Customer Operations · Intercom · Scale",
    blurbPre:
      "Scaled customer operations through hypergrowth to 1M+ providers — Intercom, automation, routing, and help-center systems. ",
    blurbBold: "3M+ automated conversations; CSAT 74% → 85%",
    blurbPost: " at massive volume.",
    tags: ["CS Ops", "Intercom", "Automation", "CSAT"],
  },
  {
    yr: "pre-2020",
    title: "Ecommerce & Operations — ",
    titleEm: "independent",
    meta: "Early Operations · CX · Process",
    blurbPre:
      "Built early operational judgment through ecommerce, customer communication, and automation. ",
    blurbBold: "Practical instincts for CX, tooling, and systemized execution.",
    blurbPost: " The heartwood: narrow but load-bearing.",
    tags: ["Ecommerce", "Customer Ops", "Process", "Zendesk"],
  },
];

// Era labels: index 0 = innermost zone (most recent, 2021–now).
// The ring inverts the real-tree metaphor: current work at center,
// earliest era at the outermost ring (roots grow outward over time).
const ERA_LABELS = ["2021–NOW", "2023–25", "2020–23", "PRE-2020"];

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

interface LabelData {
  x: string;
  y: string;
  label: string;
}

const LABEL_DATA: LabelData[] = Array.from({ length: 4 }, (_, e) => {
  const rmid = (BOUNDS[e] + BOUNDS[e + 1]) / 2;
  const [lx, ly] = ringCenter(rmid);
  return {
    x: lx.toFixed(1),
    y: (ly - rmid + 5).toFixed(1),
    label: ERA_LABELS[e],
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
export function ResumePage() {
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
            <span className="rv-cvh-label">
              ROOT · RÉSUMÉ · four growth rings
            </span>
            <h2 className="rv-cvh-title">
              The Growth <em>Rings.</em>
            </h2>
            <p className="rv-cvh-sub">Over a decade of growing and building.</p>
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
                  {LABEL_DATA.map((lbl, e) => (
                    <text
                      key={`lbl${e}`}
                      className={`rv-elabel${active === e ? " rv-is-active" : ""}`}
                      data-idx={e}
                      x={lbl.x}
                      y={lbl.y}
                      textAnchor="middle"
                      fontFamily="monospace"
                      fontSize="7.5"
                      fill="var(--text-soft)"
                      opacity="0.85"
                      pointerEvents="none"
                    >
                      {lbl.label}
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
              <span className="rv-hint">hover a ring to illuminate</span>
            </div>
          </aside>

          {/* Right: scrollable CV entries */}
          <main className="rv-right">
            <div className="rv-cv-body">
              {DATA.map((entry, i) => (
                <div
                  key={i}
                  className={`rv-cv-entry${active === i ? " rv-is-active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(-1)}
                >
                  <span className="rv-cve-yr">{entry.yr}</span>
                  <div className="rv-cve-right">
                    <h3>
                      {entry.title}
                      <em>{entry.titleEm}</em>
                    </h3>
                    <span className="rv-cve-meta">{entry.meta}</span>
                    <p className="rv-cve-blurb">
                      {entry.blurbPre}
                      {entry.blurbBold && <b>{entry.blurbBold}</b>}
                      {entry.blurbPost}
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
              ))}

              <div className="rv-cv-foot">each ring is a chapter</div>
              <div className="rv-ctas">
                <a
                  className="cta pri"
                  href="#"
                  aria-label="Download résumé PDF"
                >
                  Download résumé →
                </a>
                <Link className="cta sec" href="/results">
                  See the work
                </Link>
                <Link className="cta sec" href="/">
                  See the garden
                </Link>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
