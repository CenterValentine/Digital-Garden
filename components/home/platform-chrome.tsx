/**
 * Shared marketing chrome for the NoteTrellis platform surfaces.
 *
 * The platform landing (`PlatformHome`) and the features page
 * (`FeaturesPage`) must present an identical header and footer so navigation
 * feels like one cohesive marketing site. Extracting them here keeps the two
 * pages in lockstep — change the nav once, both surfaces update.
 *
 * These are server components (no `"use client"`) using inline SVG, so the
 * marketing surface ships zero JS for its chrome.
 */

import Link from "next/link";
import type { ReactNode } from "react";

/** Brand logo — the digital-garden tree mark. */
export function PlatformNavIcon() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/digital-garden-tree.svg"
      alt="NoteTrellis logo"
      width={56}
      height={56}
      style={{ width: "100%", height: "100%" }}
    />
  );
}

/**
 * Shared sticky-feeling top nav.
 *
 * Section links resolve against the landing page (`/`) so they work from any
 * marketing surface — e.g. clicking "Notes System" from /features jumps back
 * to the landing's `#notes-system` anchor. The features page gets its own
 * dedicated link.
 */
export function PlatformHeader() {
  return (
    <header className="relative border-b border-white/5">
      <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        {/* Brand mark */}
        <Link href="/" className="flex items-center gap-4 group">
          <div className="w-14 h-14 flex-shrink-0">
            <PlatformNavIcon />
          </div>
          <div>
            <div className="text-[17px] font-semibold tracking-tight text-white leading-tight">
              NoteTrellis
            </div>
            <div className="text-[12px] text-white/40 leading-tight">
              Digital Knowledge Garden
            </div>
          </div>
        </Link>

        {/* Nav links + auth */}
        <div className="flex items-center gap-8">
          <nav className="hidden md:flex items-center gap-7 text-sm text-white/55">
            <Link href="/notes-system" className="hover:text-white/90 transition-colors">
              Notes System
            </Link>
            <Link href="/features" className="hover:text-white/90 transition-colors">
              Features
            </Link>
            <Link href="/#about" className="hover:text-white/90 transition-colors">
              About
            </Link>
          </nav>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/sign-in"
              className="text-white/55 hover:text-white/90 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="px-4 py-2 rounded-md bg-emerald-500 text-black hover:bg-emerald-400 transition-colors font-medium"
            >
              Get started
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

/** Shared site footer. */
export function PlatformFooter() {
  return (
    <footer className="relative border-t border-white/5 mt-16">
      <div className="max-w-6xl mx-auto px-6 py-14">
        {/* Footer columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 flex-shrink-0 opacity-80">
                <PlatformNavIcon />
              </div>
              <span className="text-sm font-semibold text-white/80">NoteTrellis</span>
            </div>
            <p className="text-xs text-white/35 leading-relaxed max-w-[180px]">
              A digital garden platform for growing your ideas in public.
            </p>
          </div>

          {/* Product */}
          <FooterColumn
            heading="Product"
            links={[
              { label: "Features", href: "/features" },
              { label: "Notes System", href: "/notes-system" },
              { label: "Publishing", href: "/sign-up" },
              { label: "Pricing", href: "/#pricing" },
              { label: "Changelog", href: "/#changelog" },
            ]}
          />

          {/* Learn */}
          <FooterColumn
            heading="Learn"
            links={[
              { label: "How it works", href: "/notes-system" },
              { label: "Documentation", href: "/docs" },
              { label: "Guides", href: "/guides" },
              { label: "About", href: "/#about" },
            ]}
          />

          {/* Help */}
          <FooterColumn
            heading="Help"
            links={[
              { label: "Help Center", href: "/help" },
              { label: "Community", href: "/community" },
              { label: "Status", href: "/status" },
              { label: "Contact", href: "/contact" },
            ]}
          />
        </div>

        {/* Footer bottom bar */}
        <div className="border-t border-white/5 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-white/25">
          <span>© {new Date().getFullYear()} NoteTrellis. All rights reserved.</span>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-white/50 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-white/50 transition-colors">
              Terms of Service
            </Link>
            <Link href="/sign-in" className="hover:text-white/50 transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  heading,
  links,
}: {
  heading: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-4">
        {heading}
      </p>
      <ul className="space-y-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-white/35 hover:text-white/70 transition-colors"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Marketing page shell + primitives.
//
// The full dark, full-bleed canvas (sentinel + dot grid + emerald glow +
// header + footer) shared by the lighter marketing/legal/support pages
// (docs, guides, help, community, status, contact, privacy, terms). Wrapping
// here means those pages stay one thin file each, and a background tweak
// lands everywhere at once.
//
// The two flagship pages (PlatformHome, FeaturesPage) still inline their own
// canvas — they predate this shell and carry bespoke hero layout. They can
// adopt PlatformShell later; kept as-is for now to avoid churning tested code.
// ----------------------------------------------------------------------------

/** Full-bleed dark marketing canvas with shared header + footer. */
export function PlatformShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden">
      {/* Sentinel — CSS :has() selector suppresses the root NavBar for this page only */}
      <div className="platform-home-page" aria-hidden="true" style={{ display: "none" }} />

      {/* Background: subtle dot grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      {/* Background: soft emerald radial glow anchored to top-center */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 0%, rgba(16, 185, 129, 0.11) 0%, transparent 72%)",
        }}
      />

      <PlatformHeader />
      {/* Plain wrapper, not <main> — the root layout already provides the
          single <main> landmark; a second one is an a11y violation. */}
      <div className="relative">{children}</div>
      <PlatformFooter />
    </div>
  );
}

/** Consistent page intro: eyebrow + title + lede. */
export function MarketingPageHeader({
  eyebrow,
  title,
  lede,
}: {
  eyebrow?: string;
  title: string;
  lede: string;
}) {
  return (
    <section className="max-w-3xl mx-auto px-6 pt-24 pb-12">
      {eyebrow ? (
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-400/80 mb-5">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-5">{title}</h1>
      <p className="text-lg text-white/60 max-w-2xl leading-relaxed">{lede}</p>
    </section>
  );
}

/** A small "Soon" pill for not-yet-built placeholder content. */
export function SoonBadge() {
  return (
    <span className="flex-shrink-0 text-[10px] font-medium uppercase tracking-wider text-emerald-400/80 border border-emerald-500/20 bg-emerald-500/10 rounded px-1.5 py-0.5">
      Soon
    </span>
  );
}

export interface PlaceholderItem {
  title: string;
  body: string;
  /** Show the "Soon" pill. Defaults to true. */
  soon?: boolean;
}

/** A responsive grid of placeholder cards, each optionally flagged "Soon". */
export function PlaceholderGrid({
  items,
  columns = 3,
}: {
  items: PlaceholderItem[];
  columns?: 2 | 3;
}) {
  const colClass = columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <div className={`grid gap-3 ${colClass}`}>
      {items.map((item) => (
        <div
          key={item.title}
          className="rounded-xl border border-white/8 bg-white/[0.03] p-5 hover:border-white/15 transition-colors"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-base font-semibold leading-tight">{item.title}</h3>
            {(item.soon ?? true) ? <SoonBadge /> : null}
          </div>
          <p className="text-sm text-white/50 leading-relaxed">{item.body}</p>
        </div>
      ))}
    </div>
  );
}

export interface LegalSection {
  heading: string;
  body: string;
}

/** Shared scaffold for placeholder legal documents (privacy, terms). */
export function LegalDocument({
  title,
  effectiveDate,
  sections,
}: {
  title: string;
  effectiveDate: string;
  sections: LegalSection[];
}) {
  return (
    <section className="max-w-3xl mx-auto px-6 pt-24 pb-24">
      <p className="text-sm font-medium uppercase tracking-widest text-emerald-400/80 mb-5">
        Legal
      </p>
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">{title}</h1>
      <p className="text-sm text-white/40 mb-8">Last updated {effectiveDate}</p>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-200/80 mb-10">
        Placeholder draft — not a binding legal document. Final terms will be
        published before launch.
      </div>

      <div className="space-y-8">
        {sections.map((s) => (
          <div key={s.heading}>
            <h2 className="text-lg font-semibold mb-2">{s.heading}</h2>
            <p className="text-[15px] text-white/55 leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
