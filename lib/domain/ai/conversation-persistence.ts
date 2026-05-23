/**
 * Client-side conversation persistence helpers.
 *
 * Thin fetch wrappers over `/api/conversations/*` for surfaces that
 * want to write turns into the new `Conversation` entity. Session 4
 * wires these into `ChatPanel` and `ChatViewer`; Session 2 ships them
 * un-called so the integration point is documented and ready.
 *
 * Why a separate module rather than threading into `useConversationEngine`:
 * persistence is surface-specific (sidebar vs full-page, snapshot
 * association vs none, archive-aware vs not). Letting each surface
 * call these helpers from whatever lifecycle hook it owns keeps the
 * engine hook focused on AI SDK plumbing.
 */

import type { UIMessage } from "ai";
import type {
  ChatMessageRole,
  ConversationDetail,
  ConversationMessageView,
  ConversationSummary,
} from "@/lib/features/conversations/types";

interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Conversation lifecycle
// ────────────────────────────────────────────────────────────────────────────

export interface CreateConversationOpts {
  title?: string | null;
  /** Snapshot associations: the content nodes open at creation time. */
  snapshotContentNodeIds?: string[];
}

export async function createConversation(
  opts: CreateConversationOpts = {},
): Promise<ConversationDetail> {
  const res = await fetch("/api/conversations", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  return unwrap<ConversationDetail>(res, "create conversation");
}

export async function getConversation(
  conversationId: string,
): Promise<ConversationDetail> {
  const res = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}`,
    { credentials: "include" },
  );
  return unwrap<ConversationDetail>(res, "fetch conversation");
}

export interface ListConversationsOpts {
  forContentNodeIds?: string[];
  cursor?: string;
  limit?: number;
}

export async function listConversations(
  opts: ListConversationsOpts = {},
): Promise<ConversationSummary[]> {
  const params = new URLSearchParams();
  if (opts.forContentNodeIds && opts.forContentNodeIds.length > 0) {
    params.set("forContentNodeIds", opts.forContentNodeIds.join(","));
  }
  if (opts.cursor) params.set("cursor", opts.cursor);
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));

  const url = params.size > 0
    ? `/api/conversations?${params.toString()}`
    : "/api/conversations";

  const res = await fetch(url, { credentials: "include" });
  const data = await unwrap<{ items: ConversationSummary[] }>(
    res,
    "list conversations",
  );
  return data.items;
}

export async function renameConversation(
  conversationId: string,
  title: string | null,
): Promise<ConversationSummary> {
  const res = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    },
  );
  return unwrap<ConversationSummary>(res, "rename conversation");
}

export async function deleteConversation(
  conversationId: string,
): Promise<void> {
  const res = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}`,
    { method: "DELETE", credentials: "include" },
  );
  await unwrap<undefined>(res, "delete conversation");
}

// ────────────────────────────────────────────────────────────────────────────
// Per-turn persistence
// ────────────────────────────────────────────────────────────────────────────

export interface PersistTurnOptions {
  conversationId: string;
  /** Provider stamp on this specific message. */
  providerId?: string | null;
  /** Model stamp on this specific message. */
  modelId?: string | null;
  /** Optional explicit message id (defaults to db-generated UUID). */
  messageId?: string;
  /** Mirror of UIMessage parts[] — stored verbatim. */
  parts: UIMessage["parts"];
  /** Cached plaintext for full-text search; lossy by design. */
  textCache?: string;
  /** Optional metadata blob (token usage, latency, finishReason). */
  metadata?: Record<string, unknown>;
}

/** Persist a single user turn. Fire-and-forget at call site; awaitable for tests. */
export async function persistUserTurn(
  opts: PersistTurnOptions,
): Promise<ConversationMessageView> {
  return persistTurn("user", opts);
}

/** Persist a single assistant turn. Call from onFinish. */
export async function persistAssistantTurn(
  opts: PersistTurnOptions,
): Promise<ConversationMessageView> {
  return persistTurn("assistant", opts);
}

async function persistTurn(
  role: ChatMessageRole,
  opts: PersistTurnOptions,
): Promise<ConversationMessageView> {
  const res = await fetch(
    `/api/conversations/${encodeURIComponent(opts.conversationId)}/messages`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: opts.messageId,
        role,
        providerId: opts.providerId ?? null,
        modelId: opts.modelId ?? null,
        parts: opts.parts,
        textCache: opts.textCache ?? null,
        metadata: opts.metadata ?? null,
      }),
    },
  );
  return unwrap<ConversationMessageView>(res, `persist ${role} turn`);
}

// ────────────────────────────────────────────────────────────────────────────
// Internal
// ────────────────────────────────────────────────────────────────────────────

async function unwrap<T>(res: Response, label: string): Promise<T> {
  let body: ApiResult<T> | null = null;
  try {
    body = (await res.json()) as ApiResult<T>;
  } catch {
    // non-JSON response; fall through to status-based error
  }

  if (!res.ok || !body || body.success === false) {
    const detail =
      body?.details || body?.error || `${res.status} ${res.statusText}`;
    throw new Error(`${label} failed: ${detail}`);
  }

  return body.data as T;
}
