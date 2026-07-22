"use client";

import Link from "next/link";
import "./personal-pages.css";

export function GardenConstructionPage() {
  return (
    <div className="personal-home personal-page garden-construction-page">
      <nav className="ab-bar">
        <Link className="ab-back" href="/">
          ← Back to the garden
        </Link>
        <span className="ab-crumb">
          davidvalentine<span style={{ color: "var(--accent-warm)" }}>.</span>org
          {" "}/ <em>garden</em>
        </span>
      </nav>

      <div className="gc-body">
        <div className="gc-sigil" aria-hidden="true">
          <svg viewBox="0 0 120 120" width="120" height="120" fill="none">
            {/* Shovel */}
            <rect x="57" y="30" width="6" height="52" rx="3" fill="var(--accent-warm)" opacity="0.7" />
            <path d="M46 30 Q60 18 74 30 Q74 48 60 50 Q46 48 46 30Z" fill="var(--accent-warm)" opacity="0.55" />
            {/* Worm */}
            <path d="M30 82 Q38 74 46 82 Q54 90 62 82" stroke="var(--text-soft)" strokeWidth="3.5" strokeLinecap="round" opacity="0.5" />
            {/* Sprout */}
            <line x1="88" y1="90" x2="88" y2="68" stroke="var(--accent-warm)" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
            <path d="M88 74 Q80 66 74 70" stroke="var(--accent-warm)" strokeWidth="2" strokeLinecap="round" opacity="0.7" fill="none" />
            <path d="M88 80 Q96 72 102 76" stroke="var(--accent-warm)" strokeWidth="2" strokeLinecap="round" opacity="0.7" fill="none" />
            {/* Soil line */}
            <path d="M20 90 Q40 86 60 90 Q80 94 100 90" stroke="var(--text-soft)" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" fill="none" />
          </svg>
        </div>

        <span className="gc-kicker">DAVIDVALENTINE.ORG / MY GARDEN</span>

        <h1 className="gc-title">
          This plot is being<br />
          <em>fertilized.</em>
        </h1>

        <p className="gc-line">
          I&apos;m documenting my permaculture and desert gardening project out back —
          the raised beds, the water-harvesting earthworks, the very opinionated composting situation.
        </p>

        <p className="gc-line gc-line--soft">
          The soil is doing its thing. Come back soon.
        </p>

        <Link className="gc-back-cta" href="/">
          ← Back to the digital garden
        </Link>
      </div>
    </div>
  );
}
