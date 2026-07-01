/**
 * /guides — placeholder Guides hub.
 *
 * Task-oriented walkthroughs (vs. /docs reference material). Coming soon.
 */

import type { Metadata } from "next";
import {
  PlatformShell,
  MarketingPageHeader,
  PlaceholderGrid,
} from "@/components/home/platform-chrome";

export const metadata: Metadata = {
  title: "Guides",
  description:
    "Step-by-step walkthroughs for getting the most out of NoteTrellis — from your first note to your first published garden.",
};

export default function Page() {
  return (
    <PlatformShell>
      <MarketingPageHeader
        eyebrow="Learn"
        title="Guides"
        lede="Hands-on walkthroughs that take you from zero to a thriving garden, one task at a time. These are in the works."
      />
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <PlaceholderGrid
          items={[
            { title: "Plant your first note", body: "Capture an idea, format it, and save — the five-minute tour of the editor." },
            { title: "Build a web of links", body: "Use [[wiki-links]] and backlinks to turn loose notes into a connected network." },
            { title: "Set up daily notes", body: "Make a frictionless home for daily thinking with periodic notes and summaries." },
            { title: "Turn notes into flashcards", body: "Generate cards from a note and let spaced repetition do the remembering." },
            { title: "Publish to your domain", body: "Connect a custom domain and ship a note as a polished public page." },
            { title: "Bring your own AI keys", body: "Wire up your provider keys and start chatting over your own notes." },
          ]}
        />
      </section>
    </PlatformShell>
  );
}
