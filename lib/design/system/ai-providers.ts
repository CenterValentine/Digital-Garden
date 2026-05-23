/**
 * AI Provider Theme Definitions
 *
 * Each chat-capable provider gets a theme that drives:
 *   • Surface background (gradient sits on top of Glass-0)
 *   • Accent / brand color (chips, message tints, tab tints)
 *   • Assistant message bubble shape + density
 *   • Code-block chrome (header style, language pill, action set)
 *   • Markdown extension allow-list (display-time gating, not parse-time)
 *   • Streaming indicator style
 *   • Typography stack (font family for chat content)
 *
 * Mixed-provider state: when a conversation has assistant messages from
 * more than one provider, the surface theme uses a gradient that blends
 * the contributors' brand colors. Per-message theming continues to use
 * each message's own provider stamp regardless of the surface theme.
 *
 * Out-of-scope here:
 *   • Reasoning surface (Session 6 owns ReasoningRouter)
 *   • Attachment chrome (Session 5)
 *   • Markdown PARSING — we always parse the union; this file gates the
 *     visual treatment, not the AST.
 */

import type { AIProviderId } from "@/lib/domain/ai/types";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type ProviderBubbleShape = "minimal" | "no-bubble" | "rounded-soft";
export type ProviderCodeChrome = "tight" | "structured" | "soft";
export type ProviderStreamingIndicator = "cursor" | "smooth" | "shimmer" | "dots";

export interface ProviderTheme {
  id: AIProviderId | "generic";
  /** Display name (matches PROVIDER_CATALOG). */
  name: string;
  /** Whether this provider gets a "hot chip" in the make/model picker. */
  isBigThree: boolean;

  // ─── color ───
  /** Hex accent color used for chips, tab tints, message tints. */
  brandColor: string;
  /** CSS color for the message bubble tint (low alpha derivative of brandColor). */
  bubbleTint: string;
  /**
   * Full surface background CSS — sits on top of Glass-0. The string
   * is consumed directly as `background:` and may be a gradient.
   */
  surfaceBackground: string;
  /** Single-color stop (rgba) used when composing the mixed-provider gradient. */
  gradientStop: string;

  // ─── bubble ───
  bubble: {
    shape: ProviderBubbleShape;
    /** Assistant message bubble tailwind classes (background, border, text). */
    assistantClassName: string;
    /** Column width hint in Tailwind classes (e.g. "max-w-[95%]"). */
    columnClassName: string;
    paddingClassName: string;
    /** Heading + body text tone applied within markdown content. */
    proseClassName: string;
  };

  // ─── code block ───
  codeBlock: {
    chrome: ProviderCodeChrome;
    /** Outer wrapper className (rounded variant, border, shadow). */
    wrapperClassName: string;
    headerClassName: string;
    /** Show language label/pill in header. */
    showLanguagePill: boolean;
    /** Show copy button in header. */
    showCopyButton: boolean;
  };

  // ─── markdown extensions (display-time gating only) ───
  markdownExtensions: {
    math: boolean;
    mermaid: boolean;
    callouts: boolean;
  };

  // ─── streaming ───
  streamingIndicator: ProviderStreamingIndicator;

  // ─── typography ───
  typography: {
    /** Font-family CSS string for chat content. */
    fontFamily: string;
    /** Tailwind className applied at the message-content root. */
    rootClassName: string;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Theme definitions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Anthropic — Claude.
 *
 * Warm parchment palette, serif-leaning typography. Soft rounded bubbles
 * with measured padding. Compact code blocks.
 *
 * Surface uses a layered approach: a warm dark base color sits under a
 * top-to-bottom gradient overlay so the surface visibly differs from
 * the default Glass-0 even at a glance.
 */
const ANTHROPIC: ProviderTheme = {
  id: "anthropic",
  name: "Anthropic",
  isBigThree: true,
  brandColor: "#D4A574",
  bubbleTint: "rgba(212, 165, 116, 0.14)",
  surfaceBackground:
    "linear-gradient(180deg, rgba(212, 165, 116, 0.14) 0%, rgba(212, 165, 116, 0.05) 60%, rgba(28, 22, 18, 0.65) 100%), #1c1612",
  gradientStop: "rgba(212, 165, 116, 0.18)",
  bubble: {
    shape: "rounded-soft",
    assistantClassName:
      "rounded-2xl bg-[rgba(212,165,116,0.06)] border border-[rgba(212,165,116,0.18)] text-[#E5D4B0]",
    columnClassName: "max-w-[95%]",
    paddingClassName: "px-4 py-3",
    proseClassName: "leading-relaxed",
  },
  codeBlock: {
    chrome: "tight",
    wrapperClassName:
      "rounded-lg border border-[rgba(212,165,116,0.18)] bg-black/40 overflow-hidden",
    headerClassName:
      "flex items-center justify-between px-3 py-1.5 bg-[rgba(212,165,116,0.05)] border-b border-[rgba(212,165,116,0.12)] text-[10px]",
    showLanguagePill: true,
    showCopyButton: true,
  },
  markdownExtensions: {
    math: true,
    mermaid: true,
    callouts: true,
  },
  streamingIndicator: "smooth",
  typography: {
    fontFamily:
      'var(--font-claude), "Source Serif 4", ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
    rootClassName: "font-[var(--font-claude,inherit)]",
  },
};

/**
 * OpenAI — ChatGPT.
 *
 * Tight sans, no-bubble assistant text on a wider column. Structured
 * code-block header with prominent language pill.
 *
 * ChatGPT's identity on dark mode is the near-pure-black canvas with
 * just a hint of cool green in the accents. We push the base color
 * very dark and keep the gradient minimal — the visual distinction
 * vs Claude/Gemini is the absence of warmth/blue, not the presence
 * of green.
 */
const OPENAI: ProviderTheme = {
  id: "openai",
  name: "OpenAI",
  isBigThree: true,
  brandColor: "#10A37F",
  bubbleTint: "rgba(16, 163, 127, 0.10)",
  surfaceBackground:
    "linear-gradient(180deg, rgba(16, 163, 127, 0.06) 0%, rgba(16, 163, 127, 0.02) 40%, rgba(13, 13, 13, 0.85) 100%), #0d0d0d",
  gradientStop: "rgba(16, 163, 127, 0.12)",
  bubble: {
    shape: "no-bubble",
    assistantClassName:
      "rounded-none border-0 bg-transparent text-gray-100 dark:text-gray-100",
    columnClassName: "max-w-[95%]",
    paddingClassName: "px-2 py-2",
    proseClassName: "leading-[1.65]",
  },
  codeBlock: {
    chrome: "structured",
    wrapperClassName:
      "rounded-xl border border-white/10 bg-[#0d0d0d] overflow-hidden shadow-sm",
    headerClassName:
      "flex items-center justify-between px-4 py-2 bg-white/[0.04] border-b border-white/10 text-[11px]",
    showLanguagePill: true,
    showCopyButton: true,
  },
  markdownExtensions: {
    math: true,
    mermaid: false,
    callouts: false,
  },
  streamingIndicator: "cursor",
  typography: {
    fontFamily:
      'var(--font-gpt), "Söhne", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
    rootClassName: "font-[var(--font-gpt,inherit)] tracking-[-0.01em]",
  },
};

/**
 * Google — Gemini.
 *
 * Modern sans with blue accent. Softer rounded cards, slightly larger
 * padding. Soft rounded code block shell.
 *
 * Gemini's web app has the most chromatic surface of the three —
 * blue → purple diagonal gradient over a cool dark base. Pushing
 * stronger alphas here than the other two because the whole brand
 * identity is the gradient.
 */
const GOOGLE: ProviderTheme = {
  id: "google",
  name: "Google",
  isBigThree: true,
  brandColor: "#4285F4",
  bubbleTint: "rgba(66, 133, 244, 0.14)",
  surfaceBackground:
    "linear-gradient(135deg, rgba(66, 133, 244, 0.16) 0%, rgba(155, 114, 203, 0.12) 50%, rgba(14, 19, 32, 0.85) 100%), #0e1320",
  gradientStop: "rgba(66, 133, 244, 0.20)",
  bubble: {
    shape: "rounded-soft",
    assistantClassName:
      "rounded-3xl bg-[rgba(66,133,244,0.05)] border border-[rgba(66,133,244,0.16)] text-gray-100",
    columnClassName: "max-w-[95%]",
    paddingClassName: "px-4 py-3.5",
    proseClassName: "leading-[1.7]",
  },
  codeBlock: {
    chrome: "soft",
    wrapperClassName:
      "rounded-2xl border border-[rgba(66,133,244,0.16)] bg-black/30 overflow-hidden",
    headerClassName:
      "flex items-center justify-between px-3.5 py-2 bg-[rgba(66,133,244,0.04)] border-b border-[rgba(66,133,244,0.10)] text-[10px]",
    showLanguagePill: true,
    showCopyButton: true,
  },
  markdownExtensions: {
    math: true,
    mermaid: false,
    callouts: false,
  },
  streamingIndicator: "shimmer",
  typography: {
    fontFamily:
      'var(--font-gemini), "Google Sans", "Product Sans", Roboto, ui-sans-serif, system-ui, sans-serif',
    rootClassName: "font-[var(--font-gemini,inherit)]",
  },
};

/**
 * Generic fallback — used for xAI, Mistral, Groq, and any unknown
 * provider. Neutral palette matching the existing Glass-0 surface so
 * the chat doesn't fight the rest of the app design.
 */
const GENERIC: ProviderTheme = {
  id: "generic",
  name: "Generic",
  isBigThree: false,
  brandColor: "#9CA3AF", // gray-400
  bubbleTint: "rgba(156, 163, 175, 0.08)",
  surfaceBackground: "transparent",
  gradientStop: "rgba(156, 163, 175, 0.06)",
  bubble: {
    shape: "minimal",
    assistantClassName:
      "rounded-xl bg-black/[0.03] dark:bg-white/5 border border-black/10 dark:border-white/10 text-[#E5D4B0]",
    columnClassName: "max-w-[95%]",
    paddingClassName: "px-3.5 py-2.5",
    proseClassName: "leading-relaxed",
  },
  codeBlock: {
    chrome: "tight",
    wrapperClassName:
      "rounded-lg border border-black/10 dark:border-white/10 bg-black/40 overflow-hidden",
    headerClassName:
      "flex items-center justify-between px-3 py-1.5 bg-black/[0.03] dark:bg-white/5 border-b border-white/5 text-[10px]",
    showLanguagePill: true,
    showCopyButton: true,
  },
  markdownExtensions: {
    math: true,
    mermaid: true,
    callouts: true,
  },
  streamingIndicator: "dots",
  typography: {
    fontFamily: "inherit",
    rootClassName: "",
  },
};

// Provider-specific minimal themes — same shape as GENERIC with their
// own brand accent for the make-and-model picker chip color. Bubble +
// code-block chrome inherit GENERIC; only color tokens differ.
function deriveMinimalTheme(
  id: AIProviderId,
  name: string,
  brandColor: string,
): ProviderTheme {
  return {
    ...GENERIC,
    id,
    name,
    brandColor,
    bubbleTint: hexToRgba(brandColor, 0.08),
    gradientStop: hexToRgba(brandColor, 0.08),
    surfaceBackground: "transparent",
  };
}

const XAI = deriveMinimalTheme("xai", "xAI", "#FF4D4D");
const MISTRAL = deriveMinimalTheme("mistral", "Mistral", "#FF6B35");
const GROQ = deriveMinimalTheme("groq", "Groq", "#F55036");

// ────────────────────────────────────────────────────────────────────────────
// Registry + lookup
// ────────────────────────────────────────────────────────────────────────────

const THEME_BY_ID: Record<AIProviderId, ProviderTheme> = {
  anthropic: ANTHROPIC,
  openai: OPENAI,
  google: GOOGLE,
  xai: XAI,
  mistral: MISTRAL,
  groq: GROQ,
};

/** Provider IDs that get hot chips under the chat input. */
export const BIG_THREE_PROVIDER_IDS: AIProviderId[] = [
  "anthropic",
  "openai",
  "google",
];

/**
 * Get a provider theme by id, falling back to GENERIC for any unknown
 * id (defensive against future schema drift or stored user keys for
 * providers we don't actively style).
 */
export function getProviderTheme(
  providerId: AIProviderId | string | null | undefined,
): ProviderTheme {
  if (!providerId) return GENERIC;
  const known = THEME_BY_ID[providerId as AIProviderId];
  return known ?? GENERIC;
}

// ────────────────────────────────────────────────────────────────────────────
// Mixed-provider detection + composition
// ────────────────────────────────────────────────────────────────────────────

export interface MixedProviderState {
  isMixed: boolean;
  /** Distinct providers represented across assistant messages, in encounter order. */
  contributors: AIProviderId[];
}

/**
 * Walk a message array (any shape with optional providerId) and decide
 * whether the conversation has been touched by more than one provider.
 * Only assistant messages count — user/system roles don't have a
 * provider identity.
 */
export function detectMixedProvider<
  T extends { role?: string; providerId?: string | null },
>(messages: T[]): MixedProviderState {
  const seen = new Set<AIProviderId>();
  const order: AIProviderId[] = [];
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    if (!m.providerId) continue;
    const id = m.providerId as AIProviderId;
    if (!seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }
  return { isMixed: order.length > 1, contributors: order };
}

/**
 * Compose a CSS `background` value for the surface given the active
 * provider and the contributor set. Returns the active provider's
 * solid surface when there's only one contributor (or none yet);
 * otherwise blends all contributors' gradient stops.
 */
export function buildSurfaceBackground(
  activeProviderId: AIProviderId | string | null,
  contributors: AIProviderId[],
): string {
  if (contributors.length <= 1) {
    return getProviderTheme(activeProviderId).surfaceBackground;
  }

  const stops = contributors
    .map((id, i) => {
      const stop = getProviderTheme(id).gradientStop;
      const pct = Math.round((i / Math.max(1, contributors.length - 1)) * 100);
      return `${stop} ${pct}%`;
    })
    .join(", ");
  return `linear-gradient(135deg, ${stops})`;
}

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace("#", "");
  const expanded =
    cleaned.length === 3
      ? cleaned.split("").map((c) => c + c).join("")
      : cleaned;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
