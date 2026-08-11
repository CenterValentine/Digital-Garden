/**
 * FeaturesPage — the full feature catalog at /features.
 *
 * The "what" of NoteTrellis: every feature category, each tagged with the
 * lifecycle stage (Capture · Connect · Cultivate · Share) it serves. Its
 * companion, NotesSystemPage (/notes-system), is the "why" — the philosophy
 * and the lifecycle loop those stages come from.
 *
 * Pure server component (no `"use client"`) with inline SVG on the shared
 * PlatformShell — the marketing surface ships zero JS.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { PlatformShell, MarketingPageHeader } from "@/components/home/platform-chrome";

// ----------------------------------------------------------------------------
// Feature catalog — every category, every feature.
// ----------------------------------------------------------------------------

interface Feature {
  name: string;
  desc: string;
}

interface Category {
  id: string;
  stage: string;
  title: string;
  lede: string;
  icon: ReactNode;
  features: Feature[];
}

const CATEGORIES: Category[] = [
  {
    id: "capture",
    stage: "Capture",
    title: "Get ideas in, frictionlessly",
    lede: "The fastest path from a fleeting thought to a durable note. If capture has friction, the idea is already gone.",
    icon: <IconPencil />,
    features: [
      { name: "IDE-style editor", desc: "A rich TipTap editor with a panel-based workspace — built for writing, not just typing." },
      { name: "Slash commands", desc: "Type / to drop in headings, callouts, blocks, diagrams, and more without leaving the keyboard." },
      { name: "Daily & periodic notes", desc: "One keystroke opens today's note — a frictionless home for whatever's on your mind." },
      { name: "Browser extension", desc: "Clip pages, links, and highlights into your garden — and co-browse the web with AI, right from the page." },
      { name: "External links + previews", desc: "Paste any URL and get a rich Open Graph card with title, image, and description." },
      { name: "File uploads", desc: "Drop in images, PDFs, and documents — stored in your own cloud, attached to your notes." },
      { name: "Voice to text", desc: "Speak a thought and have it transcribed into the note — capture at the speed of talking." },
    ],
  },
  {
    id: "connect",
    stage: "Connect",
    title: "The connective tissue",
    lede: "Ideas matter in relation to each other. Links turn a folder of files into a network that thinks with you.",
    icon: <IconLink />,
    features: [
      { name: "Wiki-links", desc: "Type [[ to link any note, with live autocomplete. The core gesture of a real garden." },
      { name: "Backlinks", desc: "Every note shows what links to it — discover context you didn't know you'd built." },
      { name: "Outline panel", desc: "A live table of contents from your headings, for navigating long notes at a glance." },
      { name: "Person mentions", desc: "Mention people to weave notes and the humans they're about into one graph." },
      { name: "Inline timestamps", desc: "Clickable inline dates and times — anchor a thought to a moment." },
    ],
  },
  {
    id: "structure",
    stage: "Connect",
    title: "Organize without rigidity",
    lede: "Structure should serve the ideas, not cage them. Shape your space, then reshape it whenever the work changes.",
    icon: <IconTree />,
    features: [
      { name: "Hierarchy & drag-to-reorder", desc: "A universal content tree — folders, notes, files — rearranged by dragging." },
      { name: "Folder views", desc: "View any folder as a list, a grid, or a Kanban board, whichever fits the work." },
      { name: "Tags", desc: "Colored, inline tag pills that cut across the hierarchy to group ideas by theme." },
      { name: "Mixed content types", desc: "Notes, files, code, HTML, and external links all live as first-class nodes." },
      { name: "Custom icons & colors", desc: "Give important nodes a visual identity so your tree reads at a glance." },
      { name: "Trash & restore", desc: "Soft-delete keeps a safety net — nothing's truly gone until you say so." },
    ],
  },
  {
    id: "compose",
    stage: "Cultivate",
    title: "Express ideas richly",
    lede: "An idea half-expressed is half-understood. Reach for the right block — prose, diagram, table, or panel.",
    icon: <IconBlocks />,
    features: [
      { name: "Callouts", desc: "Obsidian-style note, tip, warning, danger, info, and success blocks." },
      { name: "Layout blocks", desc: "Accordions, tabs, columns, card panels, and section headers to structure a page." },
      { name: "Diagrams", desc: "Embed and edit Excalidraw sketches, Mermaid diagrams, and diagrams.net flowcharts inline." },
      { name: "Code blocks", desc: "Syntax-highlighted code, kept right alongside the prose that explains it." },
      { name: "Resizable images", desc: "Drag to resize, wrap, and lay out images with float and width presets." },
      { name: "Templates & snippets", desc: "Save selections as reusable templates or snippets and drop them in anywhere." },
    ],
  },
  {
    id: "recall",
    stage: "Cultivate",
    title: "Make knowledge stick",
    lede: "Notes you never revisit aren't knowledge — they're storage. The system brings ideas back at the right moment.",
    icon: <IconCards />,
    features: [
      { name: "Spaced-repetition flashcards", desc: "FSRS-scheduled review turns notes into durable memory, surfacing cards just before you'd forget." },
      { name: "Anki import", desc: "Bring decades of decks with you — import .apkg files and keep your history." },
      { name: "Cloze deletions", desc: "Hide parts of a sentence to test recall in context, not in isolation." },
      { name: "Audio cards", desc: "Pronunciation and listening cards for language and anything spoken." },
      { name: "Speed reader", desc: "RSVP reading streams words one at a time to push through long material fast." },
      { name: "Full-text search", desc: "Find any note instantly, with filters to narrow by type, tag, and more." },
    ],
  },
  {
    id: "collaborate",
    stage: "Cultivate",
    title: "Think together",
    lede: "Some ideas only grow in conversation. Edit the same note, at the same time, from anywhere.",
    icon: <IconUsers />,
    features: [
      { name: "Real-time collaboration", desc: "Conflict-free co-editing powered by CRDTs — everyone stays in sync." },
      { name: "Live presence", desc: "See collaborators' cursors and selections move as they work." },
      { name: "Multi-pane workspace", desc: "Open several notes side by side and work across them at once." },
      { name: "Conflict-safe saves", desc: "Edits reconcile cleanly even across flaky connections — no lost work." },
    ],
  },
  {
    id: "ai",
    stage: "Cultivate",
    title: "An assistant that knows your garden",
    lede: "AI that works on your notes — drafting, summarizing, quizzing, illustrating — on your terms, with your keys.",
    icon: <IconSparkles />,
    features: [
      { name: "AI chat (bring your own key)", desc: "Chat over your notes using your own provider keys — your data, your models." },
      { name: "Multi-model routing", desc: "Route features to the best model, with automatic fallback chains when one is down." },
      { name: "Context-aware", desc: "Pull the current note or selection into chat so answers fit what you're working on." },
      { name: "AI tools", desc: "Generate flashcards, get folder-organization help, and surface follow-up questions." },
      { name: "Read-aloud (TTS)", desc: "Have any note or selection read to you in a natural voice." },
      { name: "Image generation", desc: "Create and drop AI images directly into your notes." },
    ],
  },
  {
    id: "people-time",
    stage: "Connect",
    title: "Knowledge in context",
    lede: "Ideas live in a world of people and dates. Keep that context attached to the notes it belongs to.",
    icon: <IconCalendar />,
    features: [
      { name: "People & contacts", desc: "Lightweight CRM — profiles for the people your notes are about." },
      { name: "Workplaces", desc: "Organize people and notes by the organizations they belong to." },
      { name: "Calendar", desc: "Events and quick-add scheduling, woven into your knowledge space." },
      { name: "Periodic notes", desc: "Daily and weekly notes with activity summaries that track what changed." },
    ],
  },
  {
    id: "share",
    stage: "Share",
    title: "Grow ideas in public",
    lede: "A digital garden is meant to be seen. Publish polished pages to your own corner of the web.",
    icon: <IconGlobe />,
    features: [
      { name: "Publishing system", desc: "Turn any note into a published page — write once, ship it live." },
      { name: "Bring your own domain", desc: "Connect a custom domain, claim a free subdomain, or use a permanent fallback URL." },
      { name: "Publishing blocks", desc: "Hero, pricing, stats, testimonials, and more — composed building blocks for real pages." },
      { name: "Theme-aware rendering", desc: "Published pages render correctly in both light and dark — no invisible text." },
      { name: "Multiple sites", desc: "Run several independent sites from one account, each with its own domain and content." },
    ],
  },
  {
    id: "data",
    stage: "Share",
    title: "Own your data",
    lede: "A second brain you can't take with you isn't yours. Your notes, your storage, your keys — always portable.",
    icon: <IconDownload />,
    features: [
      { name: "Bring your own storage", desc: "Store files in your own Cloudflare R2, AWS S3, or Vercel Blob — not ours." },
      { name: "Lossless export", desc: "Export to Markdown, HTML, or lossless JSON, with wiki-links and callouts preserved." },
      { name: "Metadata sidecars", desc: "Exports carry tags, link targets, and structure so nothing semantic is dropped." },
      { name: "Bring your own AI keys", desc: "Use your own provider accounts — no rented intelligence, no lock-in." },
    ],
  },
  {
    id: "craft",
    stage: "Cultivate",
    title: "Crafted to live in",
    lede: "You spend hours here. The surface itself should feel calm, fast, and yours.",
    icon: <IconLayers />,
    features: [
      { name: "Liquid Glass design", desc: "A layered glass design system with depth, blur, and intent — quiet, not loud." },
      { name: "Light & dark", desc: "A considered dark mode with no flash of the wrong theme on load." },
      { name: "Resizable panels", desc: "A three-panel layout you can size to the shape of your work." },
      { name: "Keyboard & context menus", desc: "Right-click actions and shortcuts everywhere, so your hands stay on the keys." },
    ],
  },
];

// ----------------------------------------------------------------------------
// Page
// ----------------------------------------------------------------------------

export function FeaturesPage() {
  return (
    <PlatformShell>
      <MarketingPageHeader
        eyebrow="Features"
        title="Everything in the garden"
        lede="The complete catalog, grouped by what each part of the system is for. Every category ties back to a stage in the notes system."
      />

      <section className="max-w-3xl mx-auto px-6 -mt-6 mb-4">
        <Link
          href="/notes-system"
          className="text-sm text-emerald-400/80 hover:text-emerald-300 transition-colors"
        >
          ← New here? Start with the notes system
        </Link>
      </section>

      {/* ---- Full feature catalog ---- */}
      <section id="features" className="max-w-6xl mx-auto px-6 pb-24 scroll-mt-24">
        <div className="space-y-16">
          {CATEGORIES.map((cat) => (
            <CategoryBlock key={cat.id} category={cat} />
          ))}
        </div>
      </section>

      {/* ---- Closing CTA ---- */}
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-10 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            Start tending your ideas.
          </h2>
          <p className="text-white/60 mb-8 max-w-md mx-auto">
            Plant your first note today. Your garden grows with you — and goes
            wherever you do.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/sign-up"
              className="px-5 py-3 rounded-lg bg-emerald-500 text-black font-medium hover:bg-emerald-400 transition-colors"
            >
              Start your garden
            </Link>
            <Link
              href="/notes-system"
              className="px-5 py-3 rounded-lg border border-white/15 text-white/80 hover:border-white/30 hover:text-white transition-colors"
            >
              The notes system
            </Link>
          </div>
        </div>
      </section>
    </PlatformShell>
  );
}

function CategoryBlock({ category }: { category: Category }) {
  return (
    <div>
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-shrink-0 w-11 h-11 rounded-lg border border-emerald-500/20 bg-emerald-500/10 flex items-center justify-center text-emerald-400">
          {category.icon}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-emerald-400/70 mb-1">
            {category.stage}
          </p>
          <h3 className="text-xl font-semibold leading-tight">{category.title}</h3>
          <p className="text-sm text-white/50 mt-1.5 max-w-2xl leading-relaxed">
            {category.lede}
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {category.features.map((f) => (
          <div
            key={f.name}
            className="rounded-xl border border-white/8 bg-white/[0.03] p-4 hover:border-white/15 transition-colors"
          >
            <h4 className="text-sm font-semibold mb-1.5">{f.name}</h4>
            <p className="text-[13px] text-white/50 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Inline category glyphs — simple stroke icons, currentColor, server-safe.
// ----------------------------------------------------------------------------

function svgProps() {
  return {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

function IconPencil() {
  return (
    <svg {...svgProps()} aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg {...svgProps()} aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
    </svg>
  );
}

function IconTree() {
  return (
    <svg {...svgProps()} aria-hidden="true">
      <path d="M6 4h12" />
      <path d="M6 4v6a2 2 0 0 0 2 2h8" />
      <path d="M14 12h2a2 2 0 0 1 2 2v6" />
      <circle cx="6" cy="20" r="1.6" />
      <circle cx="18" cy="20" r="1.6" />
    </svg>
  );
}

function IconBlocks() {
  return (
    <svg {...svgProps()} aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="11" width="8" height="10" rx="1.5" />
      <rect x="3" y="14" width="8" height="7" rx="1.5" />
    </svg>
  );
}

function IconCards() {
  return (
    <svg {...svgProps()} aria-hidden="true">
      <rect x="3" y="6" width="14" height="14" rx="2" />
      <path d="M7 3h11a2 2 0 0 1 2 2v11" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg {...svgProps()} aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6" />
      <path d="M16.5 14.6A5.5 5.5 0 0 1 20.5 20" />
    </svg>
  );
}

function IconSparkles() {
  return (
    <svg {...svgProps()} aria-hidden="true">
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z" />
      <path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8Z" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg {...svgProps()} aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="M8 2.5v4M16 2.5v4" />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg {...svgProps()} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18Z" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg {...svgProps()} aria-hidden="true">
      <path d="M12 3v12" />
      <path d="M7 11l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg {...svgProps()} aria-hidden="true">
      <path d="M12 3l9 5-9 5-9-5 9-5Z" />
      <path d="M3 13l9 5 9-5" />
    </svg>
  );
}
