/**
 * PlatformHome — marketing landing for the platform itself.
 *
 * Rendered by app/page.tsx when the request host matches PLATFORM_DOMAIN
 * (e.g. notetrellis.com). No tenant context is required — this surface is
 * the platform's own marketing/sign-up entry point, not someone's published
 * site. Bundle-isolated from PersonalHome / DefaultTenantIndex so visitors
 * to the platform domain don't download any tenant-data fetching code.
 *
 * Future surface for: feature pitch, screenshots, pricing tiers, customer
 * logos. V1 keeps it minimal — hero + sign-up CTA + a glance at the value
 * prop. Adding sections here doesn't touch any other home route.
 */

import Link from "next/link";

export function PlatformHome() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="border-b border-white/5">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="text-base font-semibold tracking-tight">
            NoteTrellis
          </Link>
          <nav className="flex items-center gap-6 text-sm text-white/60">
            <Link
              href="/sign-in"
              className="hover:text-white/90 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="px-3 py-1.5 rounded-md bg-white text-black hover:bg-white/90 transition-colors"
            >
              Create account
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-24">
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
              href="/sign-up"
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
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-6 mb-24">
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

        <section className="border-t border-white/5 pt-16">
          <h2 className="text-2xl font-semibold mb-3">
            How sites work
          </h2>
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
                <code className="font-mono text-white/90">
                  yourname.notetrellis.com
                </code>{" "}
                — a free subdomain we provision instantly.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-emerald-400 mt-0.5">→</span>
              <span>
                <code className="font-mono text-white/90">
                  notetrellis.com/u/yourname
                </code>{" "}
                — a permanent fallback URL that works even before DNS is
                configured.
              </span>
            </li>
          </ul>
        </section>
      </main>

      <footer className="border-t border-white/5 mt-12">
        <div className="max-w-5xl mx-auto px-6 py-8 flex items-center justify-between text-xs text-white/30">
          <span>NoteTrellis</span>
          <Link
            href="/sign-in"
            className="hover:text-white/60 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </footer>
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
