/**
 * Feature Registry — Session 3.6.
 *
 * Every AI-consuming feature in the app declares itself here with its
 * required capabilities, a default suggestion (fallback when no user
 * route is configured), and human-readable metadata. The settings UI
 * reads from this registry to render the Feature Routing page; the
 * router uses it to filter connection+model pairs to compatible ones.
 *
 * Adding a feature: append an entry below. Future sessions (image-gen,
 * flashcard-mcp, agents, extensions) register here without touching
 * the router or the fallback wrapper.
 */

export type CapabilityFlag =
  | "text"          // basic text generation (universal)
  | "streaming"     // token-by-token streaming
  | "tools"         // function/tool calling
  | "vision"        // image input
  | "image"         // image output
  | "speech"        // speech output (text-to-speech)
  | "audio-input"   // audio understanding (model can hear non-speech sound)
  | "transcription" // speech-to-text (returns words of speech)
  | "reasoning"     // extended thinking surface
  | "low-cost"      // prefer cheap/fast models (soft preference)
  | "embedding";    // embedding generation (future)

export interface FeatureSpec {
  /** Stable id used as AIFeatureRoute.featureId. */
  id: string;
  /** Display label in the Feature Routing settings page. */
  label: string;
  /** Description shown beneath the label. */
  description: string;
  /** Capabilities a connection+model pair must satisfy to serve this feature. */
  requiredCapabilities: CapabilityFlag[];
  /** Capabilities that improve the feature but aren't required. */
  preferredCapabilities?: CapabilityFlag[];
  /**
   * Default suggestion when the user hasn't configured a route. The
   * router resolves this against the user's connections (matching by
   * preset id + model id) — if no match, the feature is unavailable
   * for that user until they configure it explicitly.
   */
  defaultSuggestion?: {
    presetId: string;
    modelId: string;
  };
  /**
   * Optional deep-link to the surface-owned settings page for this feature.
   * Feature Routing owns MODEL choice; behavior/defaults (e.g. Studio
   * artifact defaults) live with the owning extension — this link bridges
   * the two so neither page duplicates the other's concern.
   */
  settingsHref?: {
    label: string;
    href: string;
  };
  /**
   * Minimum context window (tokens) a model must advertise to serve this
   * feature (AI 3.4 — used by the `role-archivist` corpus role). Enforced in
   * the router alongside `requiredCapabilities`. Omitted = no floor.
   */
  minContextWindow?: number;
}

export const FEATURE_REGISTRY: FeatureSpec[] = [
  {
    id: "chat",
    label: "Chat",
    description:
      "Per-conversation override via the picker takes precedence; this is the default for newly-created chats.",
    requiredCapabilities: ["text", "streaming"],
    preferredCapabilities: ["tools", "vision"],
    defaultSuggestion: {
      presetId: "anthropic",
      modelId: "claude-sonnet-4",
    },
  },
  {
    // Powers the standalone "+ AI → Image Generation" surface. The chat
    // tool `generate_image` has its own per-tool override (Settings → AI
    // → AI Tools); when the override is unset the tool falls through to
    // its AI-supplied args. The feature route below is the default the
    // standalone surface uses when the user doesn't explicitly choose a
    // provider/model.
    id: "image-generation",
    label: "Image Generation",
    description:
      "Default provider for the standalone Image Generation surface (+ AI menu). Per-tool overrides in AI Tools take precedence when the chat AI invokes `generate_image`.",
    requiredCapabilities: ["image"],
    defaultSuggestion: {
      presetId: "openai",
      modelId: "dall-e-3",
    },
  },
  {
    // Default provider for the `generate_speech` chat tool and flashcard
    // pronunciation. Like image-generation, the tool has its own per-tool
    // override (Settings → AI → AI Tools); this feature route is the default
    // when that override is unset.
    id: "text-to-speech",
    label: "Text-to-Speech",
    description:
      "Default provider for speech generation (the `generate_speech` chat tool and flashcard pronunciation). Per-tool overrides in AI Tools take precedence.",
    requiredCapabilities: ["speech"],
    defaultSuggestion: {
      presetId: "openai",
      modelId: "tts-1",
    },
  },
  {
    // Default provider for speech-to-text: transcribing uploaded audio files
    // and (optionally) editor dictation. Auto-binds to the first
    // transcription-capable connection when unset.
    id: "speech-to-text",
    label: "Speech-to-Text",
    description:
      "Default provider for transcription (transcribe an uploaded audio file into a note). Seed an OpenAI connection with a `whisper-1` or `gpt-4o-transcribe` model.",
    requiredCapabilities: ["transcription"],
    defaultSuggestion: {
      presetId: "openai",
      modelId: "whisper-1",
    },
  },
  {
    // Extraction subagent (v3.1 R5, context discipline): condenses
    // oversized tool results (web page reads) with a cheap model BEFORE
    // they enter chat context. Unrouted = graceful skip (raw truncation,
    // today's behavior).
    id: "tool-result-extraction",
    label: "Tool Result Extraction",
    description:
      "Cheap-model pass that extracts the task-relevant parts of oversized web page reads before they enter chat context. Leave unrouted to keep plain truncation.",
    requiredCapabilities: ["text"],
    preferredCapabilities: ["low-cost"],
    defaultSuggestion: {
      presetId: "anthropic",
      modelId: "claude-haiku-4-5",
    },
  },
  {
    id: "follow-ups",
    label: "Suggested Follow-ups",
    description:
      "Generates 2–3 follow-up prompt suggestions after each assistant reply. Cheap fast models work well here.",
    requiredCapabilities: ["text"],
    preferredCapabilities: ["low-cost"],
    defaultSuggestion: {
      presetId: "anthropic",
      modelId: "claude-haiku-4-5",
    },
  },
  {
    id: "chat-title-generation",
    label: "Chat Title Generation",
    description:
      "Auto-titles new conversations from the first exchange. Runs once per conversation; low-cost models preferred.",
    requiredCapabilities: ["text"],
    preferredCapabilities: ["low-cost"],
    defaultSuggestion: {
      presetId: "anthropic",
      modelId: "claude-haiku-4-5",
    },
  },
  {
    id: "folder-assistant",
    label: "Folder Assistant",
    description:
      "Places files into folders from a natural-language description (file-tree right-click → Move → Folder assistant). Returns a structured decision; capable low-cost models work well.",
    requiredCapabilities: ["text"],
    preferredCapabilities: ["low-cost"],
    defaultSuggestion: {
      presetId: "anthropic",
      modelId: "claude-haiku-4-5",
    },
  },
  {
    id: "studio-metadata",
    label: "Studio Context Generation",
    description:
      "Generates the per-note Context doc (summary, structure, role proposal) that grounds Folder Studio chat and tools. Runs per node on demand; low-cost models preferred.",
    requiredCapabilities: ["text"],
    preferredCapabilities: ["low-cost"],
    defaultSuggestion: {
      presetId: "anthropic",
      // claude-haiku-3-5 retired 2026-02-19; 4.5 is the current cheap tier.
      modelId: "claude-haiku-4-5",
    },
    settingsHref: {
      label: "Configure Studio defaults",
      href: "/settings/extensions/studio",
    },
  },
  {
    // Signals tier of the AI-context engine (FOLDER-CONTEXT-CAPSULE-PLAN →
    // D9/D10): gaps/misalignment generation for ENHANCED-mode nodes. STANDARD
    // and below share the studio-metadata route. Unconfigured → the engine
    // falls back to studio-metadata's model rather than silently skipping
    // signals (sweep B6).
    id: "ai-context-enhanced",
    label: "AI Context — Enhanced Signals",
    description:
      "Generates the Signals section (gaps, ambiguities, directive misalignment) for folders and files set to Enhanced context mode. Negative-space reasoning — a mid-tier model pays off here; standard summaries stay on the Studio Context route.",
    requiredCapabilities: ["text"],
    preferredCapabilities: ["low-cost"],
    defaultSuggestion: {
      presetId: "anthropic",
      modelId: "claude-haiku-4-5",
    },
    settingsHref: {
      label: "Configure Studio defaults",
      href: "/settings/extensions/studio",
    },
  },
  {
    id: "studio-generation",
    label: "Studio Artifact Generation",
    description:
      "Powers Folder Studio background jobs (infographics, audio scripts, slide outlines). Artifact quality tracks model capability — prefer a strong model.",
    requiredCapabilities: ["text"],
    defaultSuggestion: {
      presetId: "anthropic",
      modelId: "claude-sonnet-4",
    },
    settingsHref: {
      label: "Configure Studio defaults",
      href: "/settings/extensions/studio",
    },
  },

  // ── Playbook model roles (AI 3.4) ──────────────────────────────────────
  // Capability-contracted slots a playbook phase can request via `model: <role>`.
  // Users map each to their own ordered (connection, model) backups in the same
  // Feature Routing page (rows render automatically from this registry). The
  // `defaultSuggestion`s use catalog-present models so resolution succeeds
  // out-of-box before any mapping. NOTE: `reasoning` is `preferred`, not
  // `required` — `effectiveCapabilities` does not emit a `reasoning` flag today
  // (catalog `ModelCapability` has no reasoning member, and inference doesn't
  // derive it), so requiring it would make every model ineligible. Revisit if
  // reasoning inference lands. Pinned by `model-routing:check`.
  {
    id: "role-scout",
    label: "Playbook role · Scout",
    description:
      "Playbook phases tagged `model: scout` — fast, low-cost research/gather/search work.",
    requiredCapabilities: ["text", "tools"],
    preferredCapabilities: ["low-cost"],
    defaultSuggestion: { presetId: "anthropic", modelId: "claude-haiku-4-5" },
  },
  {
    id: "role-analyst",
    label: "Playbook role · Analyst",
    description:
      "Playbook phases tagged `model: analyst` — weighing tradeoffs, deciding, planning.",
    requiredCapabilities: ["text", "tools"],
    preferredCapabilities: ["reasoning"],
    // Suggestion ids MUST exist in the preset template's defaultModels
    // (review fix: o3-mini is not in the direct OpenAI template, so the
    // old suggestion could never match and silently fell to auto-bind).
    // model-routing:check now pins every suggestion against templates.
    defaultSuggestion: { presetId: "openai", modelId: "gpt-4o" },
  },
  {
    id: "role-writer",
    label: "Playbook role · Writer",
    description:
      "Playbook phases tagged `model: writer` — drafting and composing prose.",
    requiredCapabilities: ["text", "streaming"],
    defaultSuggestion: { presetId: "anthropic", modelId: "claude-sonnet-4" },
  },
  {
    id: "role-coder",
    label: "Playbook role · Coder",
    description:
      "Playbook phases tagged `model: coder` — implementing and scripting.",
    requiredCapabilities: ["text", "tools"],
    defaultSuggestion: { presetId: "mistral", modelId: "codestral-latest" },
  },
  {
    id: "role-reviewer",
    label: "Playbook role · Reviewer",
    description:
      "Playbook phases tagged `model: reviewer` — adversarial critique and verification.",
    requiredCapabilities: ["text"],
    preferredCapabilities: ["reasoning"],
    defaultSuggestion: { presetId: "anthropic", modelId: "claude-opus-4" },
  },
  {
    id: "role-archivist",
    label: "Playbook role · Archivist",
    description:
      "Playbook phases tagged `model: archivist` — digesting a large corpus (long context).",
    requiredCapabilities: ["text"],
    preferredCapabilities: ["low-cost"],
    minContextWindow: 200_000,
    defaultSuggestion: { presetId: "google", modelId: "gemini-2.5-pro" },
  },
];

export const FEATURE_BY_ID: Record<string, FeatureSpec> = Object.fromEntries(
  FEATURE_REGISTRY.map((f) => [f.id, f]),
);

export function lookupFeature(featureId: string): FeatureSpec | null {
  return FEATURE_BY_ID[featureId] ?? null;
}

/** Capability set ordering — for stable UI rendering. */
export const CAPABILITY_DISPLAY: CapabilityFlag[] = [
  "text",
  "streaming",
  "tools",
  "vision",
  "image",
  "speech",
  "audio-input",
  "transcription",
  "reasoning",
  "low-cost",
  "embedding",
];
