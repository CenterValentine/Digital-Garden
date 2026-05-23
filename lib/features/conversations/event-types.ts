/**
 * Conversation event types — Session 4b.
 *
 * Client-safe: NO server-only imports, NO Prisma value imports. The
 * association source is a string-literal union (not the Prisma enum) so
 * this module can be imported by the client cache store and the SSE
 * client without bundling Prisma.
 *
 * These events are the cross-surface sync contract: server mutations
 * publish them; the SSE route streams them per-user; the cache store
 * reacts. Every event carries enough identifying info for a consumer to
 * decide whether it cares (by conversationId / contentNodeId) and, where
 * cheap, enough payload to update in place without a refetch.
 */

export type ConversationAssociationSourceLiteral =
  | "snapshot"
  | "manual"
  | "auto";

export type ConversationEvent =
  | {
      type: "conversation.created";
      conversationId: string;
      /** Content nodes the new conversation was snapshot-associated with. */
      contentNodeIds: string[];
      at: string;
    }
  | {
      type: "conversation.updated";
      conversationId: string;
      title: string | null;
      at: string;
    }
  | {
      type: "conversation.deleted";
      conversationId: string;
      at: string;
    }
  | {
      type: "message.appended";
      conversationId: string;
      /** Stamp of the appended message — lets tabs update last-used styling. */
      providerId: string | null;
      modelId: string | null;
      at: string;
    }
  | {
      type: "association.changed";
      conversationId: string;
      contentNodeId: string;
      op: "added" | "removed";
      /** Resulting source after the change; null on removal. */
      source: ConversationAssociationSourceLiteral | null;
      at: string;
    };

export type ConversationEventType = ConversationEvent["type"];

/** SSE event name used on the wire (all conversation events share one). */
export const CONVERSATION_SSE_EVENT = "conversation" as const;
