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
