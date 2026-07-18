"use client";

/**
 * WorkResultsPage — "Results" (design-reference/work-results.html).
 *
 * Two tabs: Record (an expandable ledger of projects / writing / roles) and
 * Timeline (an alternating chronicle). Tab choice persists to localStorage and
 * the URL hash, restored on mount. Rows expand a drawer in place.
 *
 * Data-driven (composer S2): renders the `data` prop — resolved from the
 * `results` SitePage config by lib/domain/page-layout/resolve.ts
 * (fetchWorkData). When no config exists the page falls back to
 * DEFAULT_WORK_DATA, the design's canonical placeholder copy, and renders
 * pixel-identically to the pre-wiring version. `name`/`title` are emphasis
 * strings ("Digital *Garden*") rendered by <Emphasis>: plain → serif,
 * *italic* → accent, **bold** → third tier.
 */

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { PersonalHeader } from "./PersonalHeader";
import type { WorkData, ResolvedRecordEntry } from "@/lib/domain/page-layout/resolved";
import "./personal-pages.css";

/**
 * Parse an emphasis string into JSX. `**bold**` → third font tier (<strong>),
 * `*italic*` → accent font (<em>), everything else → primary serif. Kept tiny
 * and dependency-free; the same grammar the composer's tier buttons emit.
 */
function Emphasis({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) parts.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    else parts.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

// Design-time fallback — the exact copy shipped before DB wiring, expressed in
// the resolved WorkData shape so the DB path is a drop-in replacement.
const DEFAULT_WORK_DATA: WorkData = {
  ledger: [
    {
      kicker: "— Projects",
      entries: [
        {
          name: "Digital *Garden*",
          type: "Tool / IDE",
          year: "2021–",
          status: "active",
          statusLabel: "Active",
          blurb:
            "An Obsidian-inspired IDE for thinking: bidirectional links, plain-text, local-first.",
          facts: [
            ["Editor core", "plain-text, keyboard-first"],
            ["Link graph", "backlinks & maps"],
            ["Plugin API", "extend everything"],
            ["Local sync", "offline by default"],
          ],
        },
        {
          name: "*Terrarium*",
          type: "Sync / CRDT",
          year: "2023",
          status: "active",
          statusLabel: "Active",
          blurb:
            "A CRDT layer that keeps a garden consistent across devices, offline-first.",
          facts: [
            ["CRDT core", "mergeable state"],
            ["Conflict UI", "resolve gently"],
            ["Transport", "p2p + relay"],
            ["Snapshots", "time travel"],
          ],
        },
        {
          name: "*Espalier*",
          type: "Framework",
          year: "2022",
          status: "done",
          statusLabel: "Stable",
          blurb:
            "A tiny layout system trained along constraints, like fruit on a trellis.",
          facts: [
            ["Grid primitives", "constraints first"],
            ["Design tokens", "one source"],
            ["Live docs", "copy-paste ready"],
          ],
        },
        {
          name: "*Almanac*",
          type: "Tool / Journal",
          year: "2020",
          status: "done",
          statusLabel: "Stable",
          blurb:
            "A seasonal journal that resurfaces old notes when they're ripe again.",
          facts: [
            ["Resurfacing", "ripe notes return"],
            ["Daily pages", "one per day"],
            ["Export", "markdown out"],
          ],
        },
        {
          name: "*Loom*",
          type: "Library",
          year: "2019",
          status: "done",
          statusLabel: "Archive",
          blurb:
            "A bidirectional-link parser that turns plain text into a navigable graph.",
          facts: [
            ["Wiki parser", "[[links]]"],
            ["Graph model", "nodes & edges"],
            ["Renderer", "static HTML out"],
          ],
        },
      ],
    },
    {
      kicker: "— Writing",
      entries: [
        {
          name: "Gardening, not *architecting*",
          type: "Essay",
          year: "2024",
          status: "done",
          statusLabel: "18 min",
          blurb:
            "Why software grown beats software planned. The blueprint trap; growth over plans; tending as practice.",
        },
        {
          name: "The *slow web*",
          type: "Essay",
          year: "2023",
          status: "done",
          statusLabel: "12 min",
          blurb:
            "In praise of pages that wait for you. Against urgency; reclaiming the pace of reading.",
        },
        {
          name: "Local-first, *human-first*",
          type: "Essay",
          year: "2023",
          status: "done",
          statusLabel: "14 min",
          blurb:
            "Owning your data is owning your thinking. Sync without servers; longevity; readable in 20 years.",
        },
        {
          name: "Tools for *noticing*",
          type: "Essay",
          year: "2023",
          status: "done",
          statusLabel: "9 min",
          blurb:
            "Thinking tools are really attention tools. Attention first; notes as lenses; friction as feature.",
        },
        {
          name: "Against the *feed*",
          type: "Essay",
          year: "2022",
          status: "done",
          statusLabel: "7 min",
          blurb:
            "Reclaiming the pace of reading. The infinite scroll; curated diets; setting your own speed.",
        },
      ],
    },
    {
      kicker: "— Résumé",
      entries: [
        {
          name: "Staff Engineer — *independent*",
          type: "Engineering",
          year: "2021–",
          status: "active",
          statusLabel: "Now",
          blurb:
            "Building Digital Garden full-time. Garden architecture from scratch, Terrarium sync engine, community docs and support.",
        },
        {
          name: "Senior Engineer — *Foliate*",
          type: "Engineering",
          year: "2018–21",
          status: "done",
          statusLabel: "Past",
          blurb:
            "Led the editor & sync teams. 5 engineers, zero data loss rollout, grew 3 seniors.",
        },
        {
          name: "Product Designer — *Meadow*",
          type: "Design",
          year: "2015–18",
          status: "done",
          statusLabel: "Past",
          blurb:
            "Design systems and rapid prototyping. 100+ components, weekly research sessions.",
        },
        {
          name: "Engineer — *Sprout Labs*",
          type: "Engineering",
          year: "2014–15",
          status: "done",
          statusLabel: "Past",
          blurb: "First role; shipped the mobile app. iOS + Android, v1.0, 0 → 50k users.",
        },
      ],
    },
  ],
  timeline: [
    { side: "right", isNow: true, type: "Now · 2024→", title: "Building the *digital garden.*", meta: "davidvalentine.org · ongoing", body: "The site itself as a living record, growing in public.", note: "the growing tip" },
    { side: "left", type: "Project · 2023", title: "*Terrarium*", meta: "CRDT sync layer", body: "Keeps a garden consistent across devices, offline-first." },
    { side: "right", type: "Role · 2021–now", title: "Staff Engineer — *independent*", meta: "Building Digital Garden full-time", body: "Garden architecture from scratch, sync engine, community." },
    { side: "left", type: "Project · 2022", title: "*Espalier*", meta: "Layout framework", body: "A tiny layout system trained along constraints." },
    { side: "right", type: "Role · 2018–21", title: "Senior Engineer — *Foliate*", meta: "Editor & sync team lead", body: "5 engineers, zero data loss rollout, grew 3 seniors." },
    { side: "left", type: "Project · 2020", title: "*Almanac*", meta: "Seasonal journal", body: "Resurfaces old notes when they're ripe again." },
    { side: "right", type: "Role · 2015–18", title: "Product Designer — *Meadow*", meta: "Design systems · prototyping", body: "100+ components, weekly research sessions." },
    { side: "left", type: "Project · 2019", title: "*Loom*", meta: "Bidirectional-link parser", body: "Turns plain text into a navigable graph." },
    { side: "right", type: "Role · 2014–15", title: "Engineer — *Sprout Labs*", meta: "First role · mobile app", body: "iOS + Android, v1.0, 0 → 50k users.", note: "the root" },
  ],
};

function LedgerRow({ entry }: { entry: ResolvedRecordEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`ledger-row${open ? " open" : ""}`}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((o) => !o);
        }
      }}
    >
      <span className="lr-cell name">
        <Emphasis text={entry.name} />
      </span>
      <span className="lr-cell">{entry.type}</span>
      <span className="lr-cell">{entry.year}</span>
      <span className="lr-cell">
        <span className={`lr-status ${entry.status}`}>{entry.statusLabel}</span>
      </span>
      <div className="lr-drawer">
        <p className="ld-blurb">{entry.blurb}</p>
        {entry.facts && (
          <div className="ld-inner">
            {entry.facts.map(([k, v]) => (
              <div className="ld-item" key={k}>
                <span className="ld-k">{k}</span>
                <span className="ld-v">{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type Tab = "record" | "timeline";

// Tab choice lives in the URL hash (+ localStorage fallback) and is read via
// useSyncExternalStore — SSR-safe and compiler-clean (no effect-driven setState).
// `activate` uses replaceState (no scroll jump), which doesn't emit a hashchange
// event, so we notify subscribers manually.
const tabListeners = new Set<() => void>();

function subscribeTab(onChange: () => void) {
  tabListeners.add(onChange);
  window.addEventListener("hashchange", onChange);
  return () => {
    tabListeners.delete(onChange);
    window.removeEventListener("hashchange", onChange);
  };
}

function readTab(): Tab {
  const fromHash = (location.hash || "").replace("#", "");
  if (fromHash === "record" || fromHash === "timeline") return fromHash;
  try {
    const stored = localStorage.getItem("dv-results-tab");
    if (stored === "record" || stored === "timeline") return stored;
  } catch {
    /* localStorage unavailable */
  }
  return "record";
}

function activate(next: Tab) {
  try {
    localStorage.setItem("dv-results-tab", next);
  } catch {
    /* localStorage unavailable */
  }
  history.replaceState(null, "", `#${next}`);
  tabListeners.forEach((cb) => cb());
}

export function WorkResultsPage({ data }: { data?: WorkData }) {
  const tab = useSyncExternalStore(subscribeTab, readTab, () => "record");
  const { ledger, timeline } = data ?? DEFAULT_WORK_DATA;
  const entryCount = ledger.reduce((n, s) => n + s.entries.length, 0);

  return (
    <div className="personal-home public-route personal-page">
      <PersonalHeader crumb="results" />

      <div className="page">
        <div className="pg-head">
          <span className="ph-tag">davidvalentine.org / work</span>
          <div className="ph-top">
            <h1 className="ph-title">
              Results<span className="dot">.</span>
            </h1>
            <span className="ph-count">{entryCount} entries · click any row to expand</span>
          </div>

          <div className="tab-bar" role="tablist">
            <button
              type="button"
              className={`tab-btn${tab === "record" ? " on" : ""}`}
              role="tab"
              aria-selected={tab === "record"}
              onClick={() => activate("record")}
            >
              <svg className="tb-icon" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <rect x="1" y="2" width="12" height="1.2" rx=".4" fill="currentColor" />
                <rect x="1" y="5" width="12" height="1.2" rx=".4" fill="currentColor" />
                <rect x="1" y="8" width="8" height="1.2" rx=".4" fill="currentColor" />
                <rect x="1" y="11" width="10" height="1.2" rx=".4" fill="currentColor" />
              </svg>
              Record
            </button>
            <button
              type="button"
              className={`tab-btn${tab === "timeline" ? " on" : ""}`}
              role="tab"
              aria-selected={tab === "timeline"}
              onClick={() => activate("timeline")}
            >
              <svg className="tb-icon" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <circle cx="7" cy="3.5" r="1.5" fill="currentColor" />
                <line x1="7" y1="3.5" x2="3" y2="6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                <circle cx="7" cy="7" r="1.5" fill="currentColor" />
                <line x1="7" y1="7" x2="11" y2="9.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                <circle cx="7" cy="10.5" r="1.5" fill="currentColor" />
              </svg>
              Timeline
            </button>
          </div>
        </div>

        <div className={`tab-panel${tab === "record" ? " on" : ""}`} role="tabpanel">
          <div className="ledger-head">
            <span className="lh-col">Name</span>
            <span className="lh-col">Type</span>
            <span className="lh-col">Year</span>
            <span className="lh-col">Status</span>
          </div>
          {ledger.map((section) => (
            <div className="ledger-section" key={section.kicker}>
              <span className="ls-kicker">{section.kicker}</span>
              {section.entries.map((entry, i) => (
                <LedgerRow entry={entry} key={`${section.kicker}-${i}`} />
              ))}
            </div>
          ))}

          <div className="ab-ctas">
            <Link className="ab-cta pri" href="/resume">
              Full résumé →
            </Link>
            <Link className="ab-cta sec" href="/writing">
              All writing
            </Link>
            <Link className="ab-cta sec" href="/contact">
              Contact
            </Link>
          </div>
        </div>

        <div className={`tab-panel${tab === "timeline" ? " on" : ""}`} role="tabpanel">
          <div className="chronicle">
            {timeline.map((e, i) => (
              <div
                className={`ch-entry ${e.side}${e.isNow ? " is-now" : ""}`}
                key={i}
              >
                {e.side === "right" && <div className="ch-empty" />}
                {e.side === "left" && (
                  <div className="ch-content">
                    <span className="cc-type">{e.type}</span>
                    <h3>
                      <Emphasis text={e.title} />
                    </h3>
                    <span className="cc-meta">{e.meta}</span>
                    <p>{e.body}</p>
                    {e.note && <span className="ch-note">{e.note}</span>}
                  </div>
                )}
                <div className="ch-stem">
                  <div className="ch-bud" />
                </div>
                {e.side === "right" && (
                  <div className="ch-content">
                    <span className="cc-type">{e.type}</span>
                    <h3>
                      <Emphasis text={e.title} />
                    </h3>
                    <span className="cc-meta">{e.meta}</span>
                    <p>{e.body}</p>
                    {e.note && <span className="ch-note">{e.note}</span>}
                  </div>
                )}
                {e.side === "left" && <div className="ch-empty" />}
              </div>
            ))}
          </div>

          <div className="ab-ctas">
            <Link className="ab-cta pri" href="/resume">
              Full résumé →
            </Link>
            <Link className="ab-cta sec" href="/projects">
              All projects
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
