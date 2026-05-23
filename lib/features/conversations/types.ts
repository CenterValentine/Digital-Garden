/**
 * Conversation Domain Types
 *
 * Session 2 scope: types for create / get / list / append. Association
 * CRUD, archive-to-ContentNode, and edit/branch lineage land in later
 * sessions (S4 + S5) — placeholders are wired but not yet exposed.
 */

import type {
  Conversation,
  ConversationMessage,
  ConversationAssociation,
  ChatMessageRole,
  ConversationAssociationSource,
} from "@/lib/database/generated/prisma";

// Re-export the generated types so consumers import from one place.
export type {
  Conversation,
  ConversationMessage,
  ConversationAssociation,
  ChatMessageRole,
  ConversationAssociationSource,
};

/** Conversation returned to API consumers (without internal-only fields). */
export interface ConversationSummary {
  id: string;
  title: string | null;
  archivedToContentNodeId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Last seen activity timestamp — currently `updatedAt`; may track per-message later. */
  lastMessageAt: string;
}

/** Full conversation with messages + associations. */
export interface ConversationDetail extends ConversationSummary {
  messages: ConversationMessageView[];
  associations: ConversationAssociationView[];
}

export interface ConversationMessageView {
  id: string;
  role: ChatMessageRole;
  providerId: string | null;
  modelId: string | null;
  parts: unknown;
  textCache: string | null;
  parentId: string | null;
  isHidden: boolean;
  metadata: unknown;
  createdAt: string;
}

export interface ConversationAssociationView {
  conversationId: string;
  contentNodeId: string;
  source: ConversationAssociationSource;
  lastReferencedAt: string;
  referenceCount: number;
  createdAt: string;
  /**
   * Enriched display fields, populated by `listAssociations` (which
   * joins the content node). Absent on views returned by the write
   * paths (`addManualAssociation`/`addAutoAssociation`) — those return
   * the bare association row.
   */
  contentTitle?: string | null;
  contentType?: string | null;
  /** True when the joined content node is soft-deleted (chip renders dimmed). */
  contentDeleted?: boolean;
}

/** Input to `createConversation`. */
export interface CreateConversationInput {
  title?: string | null;
  /**
   * Initial snapshot association: content nodes open at conversation
   * creation time. Each id becomes a `source: snapshot` row. Deduplicated.
   * Invalid ids are silently dropped (not owned by user / deleted /
   * not found) — by design; the picker shouldn't break on stale state.
   */
  snapshotContentNodeIds?: string[];
  /**
   * Optional: promote an archived `chat`-type ContentNode into a live
   * Conversation. When set, the service copies the ChatPayload's
   * messages into ConversationMessage rows and links the conversation
   * back to the ContentNode via `archivedToContentNodeId`. Idempotent:
   * if a Conversation already points back at this ContentNode, that
   * existing conversation is reused (no duplicate copy).
   */
  fromContentNodeId?: string;
}

/** Input to `appendMessage`. */
export interface AppendMessageInput {
  role: ChatMessageRole;
  providerId?: string | null;
  modelId?: string | null;
  /** AI SDK v6 UIMessage parts[] shape — stored verbatim. */
  parts: unknown;
  textCache?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Optional explicit id — defaults to db-generated UUID. */
  id?: string;
  /**
   * Optional parent message id for edit/branch lineage. Session 5 wires
   * this; for now callers leave it undefined.
   */
  parentId?: string | null;
}

/** Options for listing a user's conversations. */
export interface ListConversationsOptions {
  /**
   * Restrict to conversations associated with any of these content
   * nodes (e.g. the currently-open panel set). When omitted, returns
   * all of the user's conversations.
   */
  forContentNodeIds?: string[];
  /** Cursor: conversation id to start after (sorted by updatedAt desc). */
  cursor?: string;
  /** Page size. Default 25, max 100. */
  limit?: number;
}

/** Patch shape for `updateConversation`. */
export interface UpdateConversationPatch {
  title?: string | null;
}
