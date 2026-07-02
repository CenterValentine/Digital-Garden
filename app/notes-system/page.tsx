/**
 * /notes-system — the NoteTrellis philosophy page.
 *
 * The "why" behind the product: a notes system is a way of tending ideas, not
 * a pile of documents. Companion to /features (the "what" — the full catalog).
 */

import type { Metadata } from "next";
import { NotesSystemPage } from "@/components/home/NotesSystemPage";

export const metadata: Metadata = {
  title: "The Notes System",
  description:
    "A note isn't a document — it's a living thing. The philosophy behind NoteTrellis: capture, connect, cultivate, and share the ideas you tend over time.",
  openGraph: {
    title: "The Notes System · NoteTrellis",
    description:
      "Most note apps are filing cabinets. NoteTrellis is a way of tending ideas — capture, connect, cultivate, share.",
  },
};

export default function Page() {
  return <NotesSystemPage />;
}
