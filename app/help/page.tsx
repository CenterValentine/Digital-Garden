/**
 * /help — placeholder Help Center.
 *
 * Topic categories + a fallback route to /contact. Coming soon.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  PlatformShell,
  MarketingPageHeader,
  PlaceholderGrid,
} from "@/components/home/platform-chrome";

export const metadata: Metadata = {
  title: "Help Center",
  description:
    "Answers to common NoteTrellis questions — accounts, the editor, publishing, and your data.",
};

export default function Page() {
  return (
    <PlatformShell>
      <MarketingPageHeader
        eyebrow="Support"
        title="Help Center"
        lede="Answers to the questions that come up most. We're still stocking the shelves — for now, reach out and we'll help directly."
      />
      <section className="max-w-6xl mx-auto px-6 pb-12">
        <PlaceholderGrid
          items={[
            { title: "Account & billing", body: "Signing in, managing your account, and questions about plans." },
            { title: "Editor & notes", body: "Writing, formatting, linking, and organizing your content." },
            { title: "Publishing & domains", body: "Going public, connecting domains, and troubleshooting your site." },
            { title: "Data & privacy", body: "Storage, export, bring-your-own-keys, and how your data is handled." },
          ]}
          columns={2}
        />
      </section>
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="rounded-xl border border-white/8 bg-white/[0.03] p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold mb-1">Still stuck?</h2>
            <p className="text-sm text-white/50">
              Can&apos;t find what you need? We&apos;re happy to help directly.
            </p>
          </div>
          <Link
            href="/contact"
            className="flex-shrink-0 px-4 py-2.5 rounded-lg bg-emerald-500 text-black text-sm font-medium hover:bg-emerald-400 transition-colors"
          >
            Contact us
          </Link>
        </div>
      </section>
    </PlatformShell>
  );
}
