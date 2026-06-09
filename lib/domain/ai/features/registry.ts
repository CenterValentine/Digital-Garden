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
    id: "follow-ups",
    label: "Suggested Follow-ups",
    description:
      "Generates 2–3 follow-up prompt suggestions after each assistant reply. Cheap fast models work well here.",
    requiredCapabilities: ["text"],
    preferredCapabilities: ["low-cost"],
    defaultSuggestion: {
      presetId: "anthropic",
      modelId: "claude-haiku-3-5",
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
      modelId: "claude-haiku-3-5",
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
      modelId: "claude-haiku-3-5",
    },
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
