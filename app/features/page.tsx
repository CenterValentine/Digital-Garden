/**
 * /features — the NoteTrellis feature catalog.
 *
 * The "what": every feature category, each tagged with the lifecycle stage it
 * serves. Companion to /notes-system (the "why" — philosophy + lifecycle loop).
 * Renders the full-bleed dark marketing chrome via the shared PlatformShell.
 */

import type { Metadata } from "next";
import { FeaturesPage } from "@/components/home/FeaturesPage";

export const metadata: Metadata = {
  title: "Features",
  description:
    "The complete NoteTrellis feature catalog — capture, connect, cultivate, and share. Every capability behind the digital-garden notes system.",
  openGraph: {
    title: "Features · NoteTrellis",
    description:
      "Everything in the garden: the full catalog of NoteTrellis features, grouped by what each part of the system is for.",
  },
};

export default function Page() {
  return <FeaturesPage />;
}
