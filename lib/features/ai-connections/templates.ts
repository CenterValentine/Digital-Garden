/**
 * Built-in connection templates.
 *
 * Each template is a starting point for the user when adding a new
 * connection from the settings UI. The user picks a template, the form
 * pre-fills baseURL / adapterKind / starter model list / locked fields,
 * and the user only has to paste their API key (and optionally edit the
 * model list for gateways/customs).
 *
 * Customs use no template — the form starts blank and the user fills
 * every field. The `lookupTemplate` helper returns `null` for unknown ids.
 */

import type { ConnectionKind } from "@/lib/database/generated/prisma";
import type {
  AdapterKind,
  ConnectionModel,
} from "./types";

export interface ConnectionTemplate {
  /** Stable id used as Connection.presetId. */
  id: string;
  /** Display label in the template picker. */
  name: string;
  /** Connection kind this template produces. */
  kind: Extract<ConnectionKind, "direct" | "gateway">;
  /** AI SDK adapter to use. */
  adapterKind: AdapterKind;
  /** Default base URL. Null for built-in directs that use the SDK's own default. */
  defaultBaseURL: string | null;
  /** Whether the baseURL is editable in the form (false for built-in directs). */
  baseURLLocked: boolean;
  /** Starter model list — user can edit. */
  defaultModels: ConnectionModel[];
  /** Inline help text for the API key field. */
  apiKeyHint: string;
  /** Documentation URL for getting an API key. */
  apiKeyDocsURL: string;
  /**
   * When true, this template's upstream exposes a list-available-models
   * API (OpenAI's `GET /v1/models` shape, or a provider-native variant).
   * The connection form surfaces a "Fetch from API" button that calls
   * `/api/ai/connections/[id]/fetch-models` to pre-validate model IDs
   * against the live upstream list, avoiding typos.
   *
   * Custom / self-hosted endpoints leave this `false` (or omit it) —
   * they get manual entry only.
   */
  supportsModelFetch?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Direct providers
// ────────────────────────────────────────────────────────────────────────────

const ANTHROPIC: ConnectionTemplate = {
  id: "anthropic",
  name: "Anthropic",
  kind: "direct",
  adapterKind: "anthropic",
  defaultBaseURL: null,
  baseURLLocked: true,
  defaultModels: [
    { id: "claude-sonnet-4", name: "Claude Sonnet 4", contextWindow: 200_000, capabilities: ["text", "vision", "tools", "streaming"] },
    { id: "claude-sonnet-3-5", name: "Claude 3.5 Sonnet", contextWindow: 200_000, capabilities: ["text", "vision", "tools", "streaming"] },
    { id: "claude-opus-4", name: "Claude Opus 4", contextWindow: 200_000, capabilities: ["text", "vision", "tools", "streaming"] },
    { id: "claude-haiku-3-5", name: "Claude 3.5 Haiku", contextWindow: 200_000, capabilities: ["text", "tools", "streaming"] },
  ],
  apiKeyHint: "Starts with `sk-ant-` — get one from console.anthropic.com",
  apiKeyDocsURL: "https://console.anthropic.com/settings/keys",
  supportsModelFetch: true,
};

const OPENAI: ConnectionTemplate = {
  id: "openai",
  name: "OpenAI",
  kind: "direct",
  adapterKind: "openai",
  defaultBaseURL: null,
  baseURLLocked: true,
  defaultModels: [
    { id: "gpt-4o", name: "GPT-4o", contextWindow: 128_000, capabilities: ["text", "vision", "tools", "streaming"] },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", contextWindow: 128_000, capabilities: ["text", "vision", "tools", "streaming"] },
    { id: "gpt-4", name: "GPT-4", contextWindow: 8_192, capabilities: ["text", "tools", "streaming"] },
  ],
  apiKeyHint: "Starts with `sk-` — get one from platform.openai.com",
  apiKeyDocsURL: "https://platform.openai.com/api-keys",
  supportsModelFetch: true,
};

const GOOGLE: ConnectionTemplate = {
  id: "google",
  name: "Google (Gemini)",
  kind: "direct",
  adapterKind: "google",
  defaultBaseURL: null,
  baseURLLocked: true,
  defaultModels: [
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", contextWindow: 2_000_000, capabilities: ["text", "vision", "tools", "streaming"] },
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", contextWindow: 1_000_000, capabilities: ["text", "vision", "tools", "streaming"] },
  ],
  apiKeyHint: "Get one from aistudio.google.com",
  apiKeyDocsURL: "https://aistudio.google.com/app/apikey",
  supportsModelFetch: true,
};

const XAI: ConnectionTemplate = {
  id: "xai",
  name: "xAI (Grok)",
  kind: "direct",
  adapterKind: "xai",
  defaultBaseURL: null,
  baseURLLocked: true,
  defaultModels: [
    { id: "grok-3", name: "Grok 3", contextWindow: 128_000, capabilities: ["text", "tools", "streaming"] },
    { id: "grok-3-mini", name: "Grok 3 Mini", contextWindow: 128_000, capabilities: ["text", "streaming"] },
  ],
  apiKeyHint: "Get one from console.x.ai",
  apiKeyDocsURL: "https://console.x.ai",
  supportsModelFetch: true,
};

const MISTRAL: ConnectionTemplate = {
  id: "mistral",
  name: "Mistral",
  kind: "direct",
  adapterKind: "mistral",
  defaultBaseURL: null,
  baseURLLocked: true,
  defaultModels: [
    { id: "mistral-large-latest", name: "Mistral Large", contextWindow: 128_000, capabilities: ["text", "tools", "streaming"] },
    { id: "codestral-latest", name: "Codestral", contextWindow: 32_000, capabilities: ["text", "tools", "streaming"] },
  ],
  apiKeyHint: "Get one from console.mistral.ai",
  apiKeyDocsURL: "https://console.mistral.ai/api-keys/",
  supportsModelFetch: true,
};

const GROQ: ConnectionTemplate = {
  id: "groq",
  name: "Groq",
  kind: "direct",
  adapterKind: "groq",
  defaultBaseURL: null,
  baseURLLocked: true,
  defaultModels: [
    { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", contextWindow: 32_768, capabilities: ["text", "streaming"] },
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", contextWindow: 128_000, capabilities: ["text", "tools", "streaming"] },
  ],
  apiKeyHint: "Get one from console.groq.com",
  apiKeyDocsURL: "https://console.groq.com/keys",
  supportsModelFetch: true,
};

// ────────────────────────────────────────────────────────────────────────────
// Gateways (multi-model brokers)
// ────────────────────────────────────────────────────────────────────────────

const VERCEL_GATEWAY: ConnectionTemplate = {
  id: "vercel-gateway",
  name: "Vercel AI Gateway",
  kind: "gateway",
  adapterKind: "vercel-gateway",
  defaultBaseURL: null,
  baseURLLocked: true,
  // Gateway can route to many providers; starter list is the most-used. Users
  // edit freely. S3.5b will auto-fetch the live list from the Gateway API.
  defaultModels: [
    // Big 3 — flagship chat models.
    { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4 (via Gateway)", contextWindow: 200_000, capabilities: ["text", "vision", "tools", "streaming"] },
    { id: "anthropic/claude-opus-4", name: "Claude Opus 4 (via Gateway)", contextWindow: 200_000, capabilities: ["text", "vision", "tools", "streaming"] },
    { id: "anthropic/claude-haiku-3-5", name: "Claude Haiku 3.5 (via Gateway)", contextWindow: 200_000, capabilities: ["text", "tools", "streaming"] },
    { id: "openai/gpt-4o", name: "GPT-4o (via Gateway)", contextWindow: 128_000, capabilities: ["text", "vision", "tools", "streaming"] },
    { id: "openai/gpt-4o-mini", name: "GPT-4o Mini (via Gateway)", contextWindow: 128_000, capabilities: ["text", "vision", "tools", "streaming"] },
    { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro (via Gateway)", contextWindow: 2_000_000, capabilities: ["text", "vision", "tools", "streaming"] },
    { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash (via Gateway)", contextWindow: 1_000_000, capabilities: ["text", "vision", "tools", "streaming"] },
    // Reasoning models. OpenAI o-series auto-emits reasoning through
    // the Gateway. Anthropic + Google reasoning trigger via the
    // request's providerOptions (keyed off the canonical chat-side
    // catalog) so they work transparently here too.
    { id: "openai/o3-mini", name: "o3-mini (via Gateway)", contextWindow: 200_000, capabilities: ["text", "tools", "streaming"] },
    { id: "openai/o1-mini", name: "o1-mini (via Gateway)", contextWindow: 128_000, capabilities: ["text", "tools", "streaming"] },
    // Popular non-big-three providers (xAI / Mistral / Groq) — included
    // because users commonly want to keep one Gateway Connection cover
    // their entire model menu rather than juggle per-provider keys.
    { id: "xai/grok-3", name: "Grok 3 (via Gateway)", contextWindow: 131_072, capabilities: ["text", "tools", "streaming"] },
    { id: "xai/grok-3-mini", name: "Grok 3 Mini (via Gateway)", contextWindow: 131_072, capabilities: ["text", "tools", "streaming"] },
    { id: "mistral/mistral-large-latest", name: "Mistral Large (via Gateway)", contextWindow: 128_000, capabilities: ["text", "tools", "streaming"] },
    { id: "groq/llama-3.3-70b-versatile", name: "Llama 3.3 70B (via Groq, via Gateway)", contextWindow: 131_072, capabilities: ["text", "tools", "streaming"] },
  ],
  apiKeyHint: "Get one from vercel.com — Settings → AI",
  apiKeyDocsURL: "https://vercel.com/docs/ai/gateway",
  supportsModelFetch: true,
};

const FIREWORKS: ConnectionTemplate = {
  id: "fireworks",
  name: "Fireworks",
  kind: "gateway",
  adapterKind: "openai-compat",
  defaultBaseURL: "https://api.fireworks.ai/inference/v1",
  baseURLLocked: false, // user can override (e.g. self-hosted Fireworks)
  defaultModels: [
    { id: "accounts/fireworks/models/llama-v3p1-70b-instruct", name: "Llama 3.1 70B Instruct", contextWindow: 131_072, capabilities: ["text", "tools", "streaming"] },
    { id: "accounts/fireworks/models/mixtral-8x22b-instruct", name: "Mixtral 8x22B Instruct", contextWindow: 65_536, capabilities: ["text", "streaming"] },
  ],
  apiKeyHint: "Get one from fireworks.ai/api-keys",
  apiKeyDocsURL: "https://fireworks.ai/api-keys",
  supportsModelFetch: true,
};

const TOGETHER: ConnectionTemplate = {
  id: "together",
  name: "Together AI",
  kind: "gateway",
  adapterKind: "openai-compat",
  defaultBaseURL: "https://api.together.xyz/v1",
  baseURLLocked: false,
  defaultModels: [
    { id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", name: "Llama 3.3 70B Turbo", contextWindow: 131_072, capabilities: ["text", "tools", "streaming"] },
    { id: "Qwen/Qwen2.5-72B-Instruct-Turbo", name: "Qwen 2.5 72B Turbo", contextWindow: 32_768, capabilities: ["text", "streaming"] },
  ],
  apiKeyHint: "Get one from api.together.ai",
  apiKeyDocsURL: "https://api.together.ai/settings/api-keys",
  supportsModelFetch: true,
};

const OPENROUTER: ConnectionTemplate = {
  id: "openrouter",
  name: "OpenRouter",
  kind: "gateway",
  adapterKind: "openai-compat",
  defaultBaseURL: "https://openrouter.ai/api/v1",
  baseURLLocked: false,
  defaultModels: [
    // Big 3
    { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4 (via OpenRouter)", contextWindow: 200_000, capabilities: ["text", "vision", "tools", "streaming"] },
    { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet (via OpenRouter)", contextWindow: 200_000, capabilities: ["text", "vision", "tools", "streaming"] },
    { id: "openai/gpt-4o", name: "GPT-4o (via OpenRouter)", contextWindow: 128_000, capabilities: ["text", "vision", "tools", "streaming"] },
    { id: "openai/gpt-4o-mini", name: "GPT-4o Mini (via OpenRouter)", contextWindow: 128_000, capabilities: ["text", "vision", "tools", "streaming"] },
    { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro (via OpenRouter)", contextWindow: 2_000_000, capabilities: ["text", "vision", "tools", "streaming"] },
    // Reasoning
    { id: "openai/o3-mini", name: "o3-mini (via OpenRouter)", contextWindow: 200_000, capabilities: ["text", "tools", "streaming"] },
    // Popular non-big-three
    { id: "x-ai/grok-3", name: "Grok 3 (via OpenRouter)", contextWindow: 131_072, capabilities: ["text", "tools", "streaming"] },
    { id: "mistralai/mistral-large", name: "Mistral Large (via OpenRouter)", contextWindow: 128_000, capabilities: ["text", "tools", "streaming"] },
    { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B (via OpenRouter)", contextWindow: 131_072, capabilities: ["text", "tools", "streaming"] },
  ],
  apiKeyHint: "Get one from openrouter.ai/keys",
  apiKeyDocsURL: "https://openrouter.ai/keys",
  supportsModelFetch: true,
};

// ────────────────────────────────────────────────────────────────────────────
// Registry
// ────────────────────────────────────────────────────────────────────────────

export const CONNECTION_TEMPLATES: ConnectionTemplate[] = [
  ANTHROPIC,
  OPENAI,
  GOOGLE,
  XAI,
  MISTRAL,
  GROQ,
  VERCEL_GATEWAY,
  FIREWORKS,
  TOGETHER,
  OPENROUTER,
];

export const TEMPLATE_BY_ID: Record<string, ConnectionTemplate> = Object.fromEntries(
  CONNECTION_TEMPLATES.map((t) => [t.id, t]),
);

/** Lookup a template by presetId. Returns null for unknown ids (customs). */
export function lookupTemplate(presetId: string | null): ConnectionTemplate | null {
  if (!presetId) return null;
  return TEMPLATE_BY_ID[presetId] ?? null;
}

/** All direct-kind templates (for the picker's big-3 chip strip + overflow). */
export const DIRECT_TEMPLATES: ConnectionTemplate[] = CONNECTION_TEMPLATES.filter(
  (t) => t.kind === "direct",
);

/** All gateway-kind templates. */
export const GATEWAY_TEMPLATES: ConnectionTemplate[] = CONNECTION_TEMPLATES.filter(
  (t) => t.kind === "gateway",
);
