/**
 * NotesSystemPage — the philosophy page at /notes-system.
 *
 * The "why" behind NoteTrellis: a notes system is a way of *tending* ideas
 * over time, not a pile of documents. Opens with the thesis, then walks the
 * lifecycle loop ideas move through:
 *
 *   Capture → Connect → Cultivate → Share
 *
 * Its companion, FeaturesPage (/features), is the "what" — the full catalog of
 * features, each tagged with the lifecycle stage it serves.
 *
 * Pure server component on the shared PlatformShell — zero JS.
 */

import Link from "next/link";
import { PlatformShell } from "@/components/home/platform-chrome";

interface Stage {
  verb: string;
  gloss: string;
}

const LIFECYCLE: Stage[] = [
  { verb: "Capture", gloss: "Get the thought down before it evaporates." },
  { verb: "Connect", gloss: "Link it into the web of what you already know." },
  { verb: "Cultivate", gloss: "Return, review, and refine — so ideas mature and resurface when you need them." },
  { verb: "Share", gloss: "Share your harvest." },
];

export function NotesSystemPage() {
  return (
    <PlatformShell>
      {/* ---- Hero: the thesis ---- */}
      <section className="max-w-3xl mx-auto px-6 pt-24 pb-16">
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-400/80 mb-5">
          The Notes System
        </p>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
          A note isn&apos;t a document.{" "}
          <span className="text-emerald-400">It&apos;s a living thing.</span>
        </h1>
        <p className="text-xl text-white/60 max-w-2xl leading-relaxed">
          Most note apps are filing cabinets — you put things in and they sit
          there. NoteTrellis is a way of <em className="text-white/80 not-italic font-medium">tending</em>{" "}
          ideas: capturing them fast, linking them into what you already know,
          returning to let them mature, and sharing the best ones with the world.
          Every feature serves that one philosophy.
        </p>
      </section>

      {/* ---- The lifecycle loop ---- */}
      <section id="notes-system" className="max-w-6xl mx-auto px-6 pb-20 scroll-mt-24">
        <div className="border-t border-white/5 pt-14">
          <h2 className="text-2xl font-semibold mb-3">How ideas move through the garden</h2>
          <p className="text-white/50 max-w-2xl mb-10">
            Knowledge isn&apos;t captured once and finished. It cycles. Every
            feature in NoteTrellis lives somewhere on this loop.
          </p>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {LIFECYCLE.map((stage, i) => (
              <li
                key={stage.verb}
                className="rounded-xl border border-white/8 bg-white/[0.03] p-5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono text-emerald-400/70">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-emerald-400/40">→</span>
                </div>
                <h3 className="text-base font-semibold mb-1.5">{stage.verb}</h3>
                <p className="text-sm text-white/50 leading-relaxed">{stage.gloss}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---- Bridge to the features catalog ---- */}
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-10 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            See the philosophy become features.
          </h2>
          <p className="text-white/60 mb-8 max-w-md mx-auto">
            Every capability in NoteTrellis maps back to a stage in this loop.
            Explore the full catalog to see how.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/features"
              className="px-5 py-3 rounded-lg bg-emerald-500 text-black font-medium hover:bg-emerald-400 transition-colors"
            >
              Explore all features →
            </Link>
            <Link
              href="/sign-up"
              className="px-5 py-3 rounded-lg border border-white/15 text-white/80 hover:border-white/30 hover:text-white transition-colors"
            >
              Start your garden
            </Link>
          </div>
        </div>
      </section>
    </PlatformShell>
  );
}
