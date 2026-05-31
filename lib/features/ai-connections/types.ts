/**
 * AI Connection Domain Types
 *
 * A "Connection" is the universal unit of AI provider configuration:
 *   - direct  : built-in lab provider (Anthropic, OpenAI, Google, xAI, Mistral, Groq)
 *   - gateway : built-in multi-model broker (Vercel AI Gateway, Fireworks, Together, OpenRouter)
 *   - custom  : user-defined endpoint (any AI-SDK-compatible service)
 *
 * Built-in connections are created by the user picking a *template* in the
 * settings UI and filling in the API key. Customs use the same form blank.
 */

import type {
  AIConnection as PrismaAIConnection,
  ConnectionKind,
} from "@/lib/database/generated/prisma";

export type { ConnectionKind };

/** Model entry stored on a connection's `models` JSON. */
export interface ConnectionModel {
  /** Upstream model id sent to the provider (e.g. "claude-sonnet-4-20250514"). */
  id: string;
  /** Human display name (e.g. "Claude Sonnet 4"). */
  name: string;
  /** Optional context window for UI display. */
  contextWindow?: number;
  /**
   * Capability flags used by feature routing (S3.6) to filter compatible
   * connection+model pairs.
   *   "text"        — basic text generation (every model)
   *   "vision"      — image input
   *   "tools"       — function/tool calling
   *   "streaming"   — token-by-token streaming output
   *   "reasoning"   — extended thinking surface
   *   "image"       — image output (DALL·E, Imagen, FLUX)
   */
  capabilities?: string[];
}

/** Connection record returned to API consumers (encrypted key hidden). */
export interface ConnectionView {
  id: string;
  kind: ConnectionKind;
  presetId: string | null;
  label: string;
  baseURL: string | null;
  adapterKind: string;
  models: ConnectionModel[];
  isPinned: boolean;
  pinOrder: number | null;
  preferRouteVia: string | null;
  hasKey: boolean; // never expose the key itself
  createdAt: string;
  updatedAt: string;
}

/** Internal-only — used by resolver when constructing the SDK call. */
export interface ConnectionWithKey extends ConnectionView {
  /** Decrypted API key. Server-side only, never sent to client. */
  apiKey: string;
}

/** Input to `createConnection`. */
export interface CreateConnectionInput {
  kind: ConnectionKind;
  presetId?: string | null;
  label: string;
  baseURL?: string | null;
  apiKey: string; // plaintext; service encrypts before storing
  adapterKind: string;
  models?: ConnectionModel[];
  isPinned?: boolean;
  pinOrder?: number | null;
  preferRouteVia?: string | null;
}

/** Patch shape for `updateConnection` — every field optional. */
export interface UpdateConnectionPatch {
  label?: string;
  baseURL?: string | null;
  /** When provided, replaces the stored key (re-encrypted). */
  apiKey?: string;
  models?: ConnectionModel[];
  isPinned?: boolean;
  pinOrder?: number | null;
  preferRouteVia?: string | null;
}

/** Raw Prisma row passed to view mappers. */
export type ConnectionRow = PrismaAIConnection;

/**
 * Adapter kinds the resolver knows how to construct.
 * Extending this requires a new branch in `resolveChatModel`.
 */
export type AdapterKind =
  | "anthropic"
  | "openai"
  | "google"
  | "xai"
  | "mistral"
  | "groq"
  | "vercel-gateway"
  | "openai-compat";
