/**
 * /community — placeholder Community page.
 *
 * Forum / chat channels are not live yet. Coming soon.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  PlatformShell,
  MarketingPageHeader,
  PlaceholderGrid,
} from "@/components/home/platform-chrome";

export const metadata: Metadata = {
  title: "Community",
  description:
    "Connect with other gardeners — share workflows, templates, and published gardens. Coming soon.",
};

export default function Page() {
  return (
    <PlatformShell>
      <MarketingPageHeader
        eyebrow="Connect"
        title="Community"
        lede="Gardens grow better together. We're building places to swap workflows, templates, and published gardens — here's what's coming."
      />
      <section className="max-w-6xl mx-auto px-6 pb-12">
        <PlaceholderGrid
          items={[
            { title: "Discussion forum", body: "Ask questions, share setups, and trade ideas with other gardeners." },
            { title: "Chat", body: "A real-time space to talk through workflows and get quick help." },
            { title: "Showcase", body: "Browse published gardens for inspiration — and show off your own." },
          ]}
        />
      </section>
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="rounded-xl border border-white/8 bg-white/[0.03] p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold mb-1">Want to be first in?</h2>
            <p className="text-sm text-white/50">
              Reach out and we&apos;ll let you know the moment the community opens.
            </p>
          </div>
          <Link
            href="/contact"
            className="flex-shrink-0 px-4 py-2.5 rounded-lg border border-white/15 text-white/80 text-sm font-medium hover:border-white/30 hover:text-white transition-colors"
          >
            Get in touch
          </Link>
        </div>
      </section>
    </PlatformShell>
  );
}
