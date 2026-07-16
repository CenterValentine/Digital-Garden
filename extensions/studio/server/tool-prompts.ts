/**
 * Studio tool prompt composition — deterministic assembly (plan → "Meta-
 * prompting" decision of record): tool template + slotted folder metadata +
 * user directives. Cheap, cacheable, debuggable; the optional LLM pre-pass
 * that drafts the prompt is a v2 upgrade behind a setting.
 *
 * The composed prompt is SENT AS THE USER MESSAGE in the folder conversation,
 * which makes it viewable and editable by power users for free. Source
 * grounding itself rides the system prompt (Phase 3 chat injection) — these
 * prompts only direct what to make of it.
 *
 * SERVER-ONLY (Prisma via metadata helpers).
 */

import { prisma } from "@/lib/database/client";
import { getGuidanceText } from "./metadata";

interface ToolPromptTemplate {
  /** Suggested artifact title; `{folder}` is replaced with the folder title. */
  title: string;
  /** The task body. */
  task: string;
  /** Overrides the default createNote delivery instruction (flashcards). */
  delivery?: string;
}

const REPORT_VARIANTS: Record<string, ToolPromptTemplate> = {
  "study-guide": {
    title: "{folder} — Study guide",
    task: "Write a study guide that a motivated learner could revise from without opening the sources: key concepts with crisp explanations, how the ideas connect, worked examples where the sources contain them, and a short self-check question list at the end.",
  },
  briefing: {
    title: "{folder} — Briefing",
    task: "Write an executive briefing: what this material is, the 3-6 points that matter most, current open questions or tensions in the material, and recommended next steps if any are implied. Dense, no filler.",
  },
  faq: {
    title: "{folder} — FAQ",
    task: "Write an FAQ: the 8-15 questions a newcomer to this material would actually ask, each with a direct answer drawn from the sources. Order from fundamental to advanced.",
  },
  timeline: {
    title: "{folder} — Timeline",
    task: "Write a timeline of the events, developments, or steps described in the sources, in chronological order with dates where available. Note where the sources disagree or leave gaps.",
  },
};

const MAP_FRAMES: Record<string, ToolPromptTemplate> = {
  concept: {
    title: "{folder} — Concept map",
    task: "Build a concept map of the material as a Mermaid diagram (graph TD): the major concepts as nodes and labeled edges for how they relate. Keep it readable — 12-25 nodes.",
  },
  explanation: {
    title: "{folder} — Explanation map",
    task: "Build an explanation map as a Mermaid diagram (graph TD): the central claim or phenomenon at the root, branching into the mechanisms and evidence that explain it.",
  },
  argument: {
    title: "{folder} — Argument map",
    task: "Build an argument map as a Mermaid diagram (graph TD): the main thesis, supporting premises, objections, and rebuttals found in the sources, with edges labeled supports/opposes.",
  },
  process: {
    title: "{folder} — Process map",
    task: "Build a process map as a Mermaid flowchart (graph LR): the stages/steps described in the sources with decision points and branches.",
  },
};

const SINGLE_TOOL_TEMPLATES: Record<string, ToolPromptTemplate> = {
  glossary: {
    title: "{folder} — Glossary",
    task: "Write a glossary of the key terms in the sources: each term bolded, followed by a 1-3 sentence definition grounded in how THIS material uses it (not a generic dictionary definition). Alphabetical. Where a term comes from one specific source, link that source title in wiki-link form, e.g. [[Source Title]].",
  },
  compare: {
    title: "{folder} — Comparison",
    task: "Identify the sources or concepts in this folder that invite comparison and write a comparison: a markdown table of the meaningful dimensions, followed by prose on where they genuinely differ (not surface differences) and when to reach for which.",
  },
  prerequisites: {
    title: "{folder} — Prerequisites",
    task: "Analyze what this material assumes the reader already knows: list the prerequisite concepts/skills, why each is assumed (point at the places that assume it), and order them from most to least fundamental.",
  },
  flashcards: {
    title: "",
    task: "Create flashcards covering the most testable material in the folder sources — definitions, distinctions, mechanisms, and applications. Prefer atomic cards (one fact each). Use your flashcard tools: check existing decks with list_decks, then propose a deck and cards through the proposal flow so the user can review before anything is saved.",
    delivery:
      "Deliver via the flashcard proposal tools (propose a deck, then cards). Do NOT create a note.",
  },

  // ── Practice shelf (Phase 7) — graded SESSIONS, not files ──────────────
  quiz: {
    title: "",
    task: "Run an interactive multiple-choice quiz on the folder sources. One question at a time: state the question, offer options A-D (one clearly correct, distractors plausible), and STOP — wait for the user's answer. When they answer, grade it, explain why in 1-2 sentences citing the source title, then ask the next question. Default to 8 questions spanning the material from fundamental to subtle; adjust if the user asks. Track the running score silently.",
    delivery:
      "This is a live session — do NOT create a note. After the final question, give the score, a breakdown of strong vs weak areas, and the 2-3 source sections worth rereading. Begin with question 1 immediately.",
  },
  "teach-back": {
    title: "",
    task: "Run a Feynman teach-it-back session. You play a curious student who has only skimmed the sources; the user must TEACH you the material. Open by asking them to explain the central concept in their own words. As they explain, ask the follow-up questions a sharp student would ask — especially about anything they gloss over. Note every gap, hand-wave, or error against the sources, but do NOT correct them mid-session; keep probing.",
    delivery:
      "This is a live session — do NOT create a note. After 3-5 exchanges (or when the user says they're done), drop the student persona and give honest feedback: what they explained well, what they skipped or got wrong (with what the sources actually say), and one suggestion for a stronger explanation. Start the session now.",
  },
  "oral-exam": {
    title: "",
    task: "Conduct an oral examination on the folder sources, one question at a time. If you have the generate_speech tool, speak each question aloud with it (keep each spoken question under 200 characters) in addition to writing it. The user may answer in text or by attaching a voice recording — treat a transcribed voice answer exactly like text. Grade each answer 0-5 with a one-sentence justification against the sources before asking the next. Ask 5 questions of increasing difficulty.",
    delivery:
      "This is a live session — do NOT create a note. After question 5, give the total score, per-question recap, and what to review. Ask question 1 now.",
  },
  "study-plan": {
    title: "{folder} — Study plan",
    task: "Build a 7-day study plan for this folder's material. First check the user's flashcard decks with list_decks (and search_decks if useful) for decks related to this material — factor due reviews into the schedule. Then design the plan: each day gets a focused reading target from the sources (specific titles), an active-recall task (self-quiz prompts, teach-back topic, or deck review), and an estimated time. Order topics prerequisite-first. Keep daily load realistic (30-45 min).",
  },
};

function templateFor(
  toolId: string,
  variantId: string | undefined
): ToolPromptTemplate | null {
  if (toolId === "report") {
    return REPORT_VARIANTS[variantId ?? "study-guide"] ?? null;
  }
  if (toolId === "mind-map") {
    return MAP_FRAMES[variantId ?? "concept"] ?? null;
  }
  return SINGLE_TOOL_TEMPLATES[toolId] ?? null;
}

/**
 * Compose the chat prompt for one tool invocation. Returns null when the
 * folder isn't the user's or the tool/variant is unknown.
 */
export async function composeToolPrompt(
  userId: string,
  folderId: string,
  toolId: string,
  variantId?: string
): Promise<{ prompt: string; suggestedTitle: string } | null> {
  const folder = await prisma.contentNode.findFirst({
    where: {
      id: folderId,
      ownerId: userId,
      contentType: "folder",
      deletedAt: null,
    },
    select: { id: true, title: true },
  });
  if (!folder) return null;

  const template = templateFor(toolId, variantId);
  if (!template) return null;

  const guidance = await getGuidanceText(folderId);
  const suggestedTitle = template.title.replace("{folder}", folder.title);

  const delivery =
    template.delivery ??
    [
      `When the artifact is ready, create it as a new note with the createNote tool: parentId "${folder.id}", title "${suggestedTitle}" (adjust the title if you have a clearly better one).`,
      toolId === "mind-map"
        ? "Put the Mermaid diagram in a fenced ```mermaid code block inside the note, preceded by a 2-3 sentence orientation paragraph."
        : "",
      `End the note with a "Sources" section listing each source you drew on as a wiki-link: [[Source Title]].`,
      "After creating the note, reply with one short paragraph on what you made and how you organized it.",
    ]
      .filter(Boolean)
      .join(" ");

  const prompt = [
    template.task,
    guidance.roleStrategy.trim()
      ? `What this folder is for (its Context doc): ${guidance.roleStrategy.trim()}`
      : "",
    guidance.directives.trim()
      ? `Standing directives for this folder — follow them: ${guidance.directives.trim()}`
      : "",
    "Work strictly from the folder sources provided in your context. If the sources are too thin for a section, say so rather than inventing content.",
    delivery,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { prompt, suggestedTitle };
}
