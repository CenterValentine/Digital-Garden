/**
 * PlatformHome — marketing landing for the platform itself.
 *
 * Rendered by app/page.tsx when the request host matches PLATFORM_DOMAIN
 * (e.g. notetrellis.com). No tenant context is required — this surface is
 * the platform's own marketing/sign-up entry point, not someone's published
 * site. Bundle-isolated from PersonalHome / DefaultTenantIndex so visitors
 * to the platform domain don't download any tenant-data fetching code.
 */

import Link from "next/link";
import { PlatformHeader, PlatformFooter } from "@/components/home/platform-chrome";

export function PlatformHome() {
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
      <div className="relative max-w-3xl mx-auto px-6 py-24">
        <section className="mb-24">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
            A trellis for your{" "}
            <span className="text-emerald-400">growing notes</span>.
          </h1>
          <p className="text-xl text-white/60 mb-10 max-w-2xl">
            Publish a digital garden the way you write it — interlinked notes,
            living essays, slow ideas. Bring your own domain, keep your
            editing experience.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/invite"
              className="px-5 py-3 rounded-lg bg-emerald-500 text-black font-medium hover:bg-emerald-400 transition-colors"
            >
              Start your garden
            </Link>
            <Link
              href="/sign-in"
              className="px-5 py-3 rounded-lg border border-white/15 text-white/80 hover:border-white/30 hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/features"
              className="px-2 py-3 text-sm text-white/55 hover:text-white/90 transition-colors"
            >
              See all features →
            </Link>
          </div>
        </section>

        <section id="features" className="grid md:grid-cols-3 gap-6 mb-24">
          <FeatureCard
            title="Write once, publish anywhere"
            body="Author in a powerful IDE-style editor. Publish to your own domain, a subpath, or a NoteTrellis subdomain — your choice."
          />
          <FeatureCard
            title="Wiki-links by default"
            body="Type [[ to link any note. Backlinks, callouts, embedded diagrams — the connective tissue of a real garden."
          />
          <FeatureCard
            title="Bring your domain"
            body="Point your DNS, claim your hostname in a few clicks, and we handle SSL. Custom subdomains too."
          />
        </section>

        <section id="notes-system" className="border-t border-white/5 pt-16 mb-24">
          <h2 className="text-2xl font-semibold mb-3">How sites work</h2>
          <p className="text-white/50 mb-8 max-w-2xl">
            Every NoteTrellis account starts with one site. Each site can have
            its own custom hostname, its own published items, and its own URL
            structure — independent of every other site you own.
          </p>
          <ul className="space-y-3 text-sm text-white/70">
            <li className="flex gap-3">
              <span className="text-emerald-400 mt-0.5">→</span>
              <span>
                <code className="font-mono text-white/90">yoursite.com</code>{" "}
                — connect a custom domain you already own.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-emerald-400 mt-0.5">→</span>
              <span>
                <code className="font-mono text-white/90">yourname.notetrellis.com</code>{" "}
                — a free subdomain we provision instantly.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-emerald-400 mt-0.5">→</span>
              <span>
                <code className="font-mono text-white/90">notetrellis.com/u/yourname</code>{" "}
                — a permanent fallback URL that works even before DNS is configured.
              </span>
            </li>
          </ul>
        </section>

        <section id="about" className="border-t border-white/5 pt-16">
          <h2 className="text-2xl font-semibold mb-3">About NoteTrellis</h2>
          <p className="text-white/50 max-w-2xl">
            NoteTrellis is a digital garden platform built for writers, researchers,
            and knowledge workers who think in networks, not documents. Every note
            is a node. Every link is a branch. Your garden grows with you.
          </p>
        </section>
      </div>

      <PlatformFooter />
    </div>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/3 p-5">
      <h3 className="text-base font-semibold mb-2">{title}</h3>
      <p className="text-sm text-white/55">{body}</p>
    </div>
  );
}
