/**
 * Built-in studio tools — pure data seeded into the registry at import time.
 *
 * These exercise the frozen `StudioToolDefinition` contract and let Phase 1
 * render the whole grid from the registry with zero hardcoded tiles. No
 * handlers here — execution wiring lands per-tool in Phases 4/6/7.
 *
 * Modularity note: the flashcards tile lives here for now, but the intended
 * end state (plan → "Registry-driven visual modularity") is for the flashcards
 * extension to contribute it via `registerStudioTool()`. Migrating it is a
 * Phase 4 concern; the `contributedBy` field already models that ownership.
 */

import type { StudioToolDefinition } from "./types";

export const STUDIO_BUILTIN_TOOLS: StudioToolDefinition[] = [
  // ── Create · outputs land as files in the folder ──────────────────────
  {
    id: "report",
    shelf: "create",
    label: "Report",
    description: "A written brief synthesized from the selected sources.",
    iconName: "FileText",
    execution: "chat",
    order: 10,
    variants: [
      { id: "study-guide", label: "Study guide" },
      { id: "briefing", label: "Briefing doc" },
      { id: "faq", label: "FAQ" },
      { id: "timeline", label: "Timeline" },
      // Custom reports resolve at runtime from the user's ChatContext presets
      // (Phase 4) — modeled here as an empty static list until then.
    ],
  },
  {
    id: "flashcards",
    shelf: "create",
    label: "Flashcards",
    description: "Generate a deck via the proposal flow, or open an existing one.",
    iconName: "Layers",
    execution: "chat",
    order: 20,
    contributedBy: "flashcards",
  },
  {
    id: "mind-map",
    shelf: "create",
    label: "Mind map",
    description: "A Mermaid map of the sources, framed however you're thinking.",
    iconName: "Network",
    execution: "chat",
    order: 30,
    variants: [
      { id: "concept", label: "Concept map" },
      { id: "explanation", label: "Explanation map" },
      { id: "argument", label: "Argument map" },
      { id: "process", label: "Process map" },
    ],
  },
  {
    id: "audio-overview",
    shelf: "create",
    label: "Audio overview",
    description: "A narrated walk-through of the sources.",
    iconName: "AudioLines",
    execution: "job",
    order: 40,
    variants: [
      { id: "deep-dive", label: "Deep dive" },
      { id: "brief", label: "Brief" },
      { id: "critique", label: "Critique" },
      { id: "debate", label: "Debate" },
    ],
  },
  {
    id: "infographic",
    shelf: "create",
    label: "Infographic",
    description: "A single-glance visual summary.",
    iconName: "Image",
    execution: "job",
    order: 50,
    variants: [
      { id: "html-svg", label: "HTML / SVG" },
      { id: "image", label: "Generated image" },
    ],
  },
  {
    id: "slide-deck",
    shelf: "create",
    label: "Slide deck",
    description: "A .pptx deck you can open and edit in place.",
    iconName: "Presentation",
    execution: "job",
    order: 60,
  },
  {
    id: "video-overview",
    shelf: "create",
    label: "Video overview",
    description: "Coming later.",
    iconName: "Video",
    execution: "job",
    order: 70,
    stub: true,
  },

  // ── Practice · opens a graded session, not a file ─────────────────────
  {
    id: "oral-exam",
    shelf: "practice",
    label: "Oral exam",
    description: "The tutor asks aloud; you answer by voice; it grades you.",
    iconName: "Mic",
    execution: "chat",
    order: 10,
  },
  {
    id: "teach-back",
    shelf: "practice",
    label: "Teach it back",
    description: "Explain it to an AI student that probes what you skipped.",
    iconName: "GraduationCap",
    execution: "chat",
    order: 20,
  },
  {
    id: "quiz",
    shelf: "practice",
    label: "Quiz",
    description: "Multiple-choice questions drawn from the sources, graded.",
    iconName: "ListChecks",
    execution: "chat",
    order: 30,
  },
  {
    id: "study-plan",
    shelf: "practice",
    label: "Study plan",
    description: "A schedule that weaves the sources into your due cards.",
    iconName: "CalendarClock",
    execution: "chat",
    order: 40,
  },

  // ── Analyze · insight artifacts that lean on the metadata layer ───────
  {
    id: "glossary",
    shelf: "analyze",
    label: "Glossary",
    description: "Key terms defined and wiki-linked back to their sources.",
    iconName: "BookMarked",
    execution: "chat",
    order: 10,
  },
  {
    id: "compare",
    shelf: "analyze",
    label: "Compare",
    description: "How similar notes actually differ.",
    iconName: "Columns2",
    execution: "chat",
    order: 20,
  },
  {
    id: "prerequisites",
    shelf: "analyze",
    label: "Prerequisites",
    description: "What this folder assumes you already know.",
    iconName: "ListTree",
    execution: "chat",
    order: 30,
  },
];
