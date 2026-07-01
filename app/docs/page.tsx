/**
 * /docs — placeholder Documentation hub.
 *
 * Linked from the marketing footer. Real docs are pending; this renders an
 * intentional "coming soon" catalog so the footer has no dead links.
 */

import type { Metadata } from "next";
import {
  PlatformShell,
  MarketingPageHeader,
  PlaceholderGrid,
} from "@/components/home/platform-chrome";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Learn how to grow your digital garden with NoteTrellis — guides for the editor, linking, recall, and publishing.",
};

export default function Page() {
  return (
    <PlatformShell>
      <MarketingPageHeader
        eyebrow="Learn"
        title="Documentation"
        lede="Everything you need to grow a digital garden — from your first note to a published site. We're writing these now; here's what's on the way."
      />
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <PlaceholderGrid
          items={[
            { title: "Getting started", body: "Create your first note, find your way around the workspace, and plant the seed of your garden." },
            { title: "The editor", body: "Slash commands, callouts, blocks, diagrams, and everything you can compose on a page." },
            { title: "Linking & backlinks", body: "Wiki-links, the backlinks panel, and the outline — the connective tissue of your notes." },
            { title: "Organizing your garden", body: "Folders, tags, content types, and folder views for shaping your space without rigidity." },
            { title: "Flashcards & recall", body: "Spaced repetition, cloze deletions, and Anki import for making knowledge stick." },
            { title: "Publishing", body: "Turn notes into pages, connect a custom domain, and grow ideas in public." },
            { title: "AI & automation", body: "Chat over your notes with your own keys, generate flashcards, and read notes aloud." },
            { title: "Import & export", body: "Bring data in and take it out — Markdown, HTML, and lossless JSON. Your data stays yours." },
          ]}
        />
      </section>
    </PlatformShell>
  );
}
