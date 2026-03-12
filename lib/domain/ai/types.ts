/**
 * Core AI Type Definitions
 *
 * Foundational types for the AI integration system.
 * These types bridge DG's content model with AI SDK v6.
 */

/** Provider identifiers supported by DG */
export type AIProviderId =
  | "anthropic"
  | "openai"
  | "google"
  | "xai"
  | "mistral"
  | "groq";

/** Model identifiers — canonical DG model IDs mapped to provider strings in registry */
export type AIModelId =
  | "claude-opus-4"
  | "claude-sonnet-4"
  | "claude-sonnet-3-5"
  | "claude-haiku-3-5"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-4"
  | "gemini-2.5-pro"
  | "gemini-2.0-flash"
  | "grok-3"
  | "grok-3-mini"
  | "mistral-large"
  | "codestral"
  | "mixtral-8x7b"
  | "llama-3.3-70b";

/** Configuration passed to resolveChatModel() */
export interface ProviderConfig {
  providerId: AIProviderId;
  modelId: string;
  apiKey?: string;
}

/** Tool choice setting — controls model behavior with tools */
export type AIToolChoice = "auto" | "required" | "none";

/** Stored chat message shape (ChatPayload.messages JSON array elements) */
export interface StoredChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  parts?: unknown[];
  createdAt?: string;
  /** @deprecated Use createdAt instead */
  timestamp?: string;
  model?: string;
  tokenCount?: number;
  metadata?: Record<string, unknown>;
}

/** ChatPayload.metadata JSON shape */
export interface ChatMetadata {
  providerId?: AIProviderId;
  modelId?: string;
  totalTokens?: number;
  messageCount?: number;
  lastUpdated?: string;
  title?: string;
  savedFrom?: string;
  savedAt?: string;
  [key: string]: unknown;
}
