/**
 * ProviderIcon — branded marks for AI providers, sourced from
 * `@lobehub/icons` (MIT-licensed, well-maintained AI logo library
 * covering ~60 providers).
 *
 * Provider id → icon resolution:
 *   1. Direct table lookup for known DG canonical IDs (anthropic,
 *      openai, google, xai, mistral, groq).
 *   2. Lookup of dynamic provider IDs that the picker mines from
 *      Connection model namespaces (perplexity, deepseek, qwen,
 *      cohere, replicate, huggingface, together, fireworks,
 *      openrouter, vercel, meta).
 *   3. Final fallback: a colored circle with the first letter of the
 *      provider id. Keeps unfamiliar / brand-new namespaces visually
 *      distinct without requiring a logo bundle update.
 *
 * The lobe icons render with `currentColor`, so a parent `color` prop
 * or CSS `color` style cascades into the SVG fill naturally.
 */

"use client";

import type { CSSProperties } from "react";
// Root-import + named destructure. `sideEffects: false` in the package's
// package.json lets the bundler tree-shake unused icons even from this
// flat import. We could use per-icon sub-paths, but a handful of folders
// (Qwen, HuggingFace, etc.) ship without the right TS resolver
// metadata — the root path resolves all of them uniformly.
import {
  Anthropic,
  Claude,
  OpenAI,
  Google,
  Gemini,
  XAI,
  Mistral,
  Groq,
  Perplexity,
  DeepSeek,
  Qwen,
  Cohere,
  HuggingFace,
  Together,
  Fireworks,
  OpenRouter,
  Vercel,
  Meta,
  Replicate,
} from "@lobehub/icons";

type LobeIcon = React.ComponentType<{
  size?: string | number;
  style?: CSSProperties;
}>;

/**
 * Map our internal provider IDs (lowercased) to the lobe-icons Mono
 * component for that provider. Keys are normalized — IDs from the
 * picker pass through `.toLowerCase()` before lookup.
 *
 * `claude` aliases to Anthropic's brand mark since assistant rendering
 * sometimes stamps "claude" instead of "anthropic". OpenRouter prefixes
 * like `x-ai` get normalized to `xai` upstream.
 */
const LOBE_ICONS: Record<string, LobeIcon> = {
  anthropic: Anthropic,
  claude: Claude,
  openai: OpenAI,
  google: Google,
  gemini: Gemini,
  xai: XAI,
  "x-ai": XAI,
  mistral: Mistral,
  mistralai: Mistral,
  groq: Groq,
  perplexity: Perplexity,
  deepseek: DeepSeek,
  qwen: Qwen,
  cohere: Cohere,
  huggingface: HuggingFace,
  "hugging-face": HuggingFace,
  together: Together,
  fireworks: Fireworks,
  openrouter: OpenRouter,
  vercel: Vercel,
  "vercel-gateway": Vercel,
  meta: Meta,
  "meta-llama": Meta,
  replicate: Replicate,
};

interface ProviderIconProps {
  providerId: string | null | undefined;
  className?: string;
  /** Optional override; defaults to `currentColor` (inherits from parent). */
  color?: string;
}

export function ProviderIcon({
  providerId,
  className = "h-4 w-4",
  color = "currentColor",
}: ProviderIconProps) {
  const key = (providerId ?? "").toLowerCase();
  const Icon = LOBE_ICONS[key];

  if (Icon) {
    // Lobe icons use `currentColor` for the fill; we set CSS color so
    // the SVG inherits without per-icon overrides.
    return (
      <span
        className={`inline-flex items-center justify-center ${className}`}
        style={{ color }}
        aria-hidden="true"
      >
        <Icon size="1em" />
      </span>
    );
  }

  // Fallback — colored circle with the first letter of the id. Hashes
  // the id into a deterministic hue so each unknown provider stays the
  // same color across renders without needing a curated theme.
  return (
    <FirstLetterMark
      providerId={providerId ?? ""}
      className={className}
      colorOverride={color !== "currentColor" ? color : undefined}
    />
  );
}

function FirstLetterMark({
  providerId,
  className,
  colorOverride,
}: {
  providerId: string;
  className: string;
  colorOverride?: string;
}) {
  const letter = (providerId.match(/[a-zA-Z]/)?.[0] ?? "?").toUpperCase();
  // Simple djb2-style hash → hue 0-360. Stable, no crypto required.
  let hash = 0;
  for (let i = 0; i < providerId.length; i++) {
    hash = (hash * 33 + providerId.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  const bg = colorOverride ?? `hsl(${hue}, 55%, 45%)`;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full text-white font-semibold ${className}`}
      style={{ background: bg, fontSize: "0.65em", lineHeight: 1 }}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}
