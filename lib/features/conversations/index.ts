/**
 * Conversations module — barrel export.
 *
 * Import surface for the AI conversation entity (Session 2 of the AI
 * chat revamp plan). Server-only.
 */

export type {
  AppendMessageInput,
  Conversation,
  ConversationAssociation,
  ConversationAssociationSource,
  ConversationAssociationView,
  ConversationDetail,
  ConversationMessage,
  ConversationMessageView,
  ConversationSummary,
  ChatMessageRole,
  CreateConversationInput,
  ListConversationsOptions,
  UpdateConversationPatch,
} from "./types";

export {
  ConversationNotFoundError,
  appendMessage,
  createConversation,
  ensureConversationContentNode,
  findConversationIdByArchivedContent,
  forkConversation,
  getConversation,
  hideMessagesFrom,
  listConversations,
  softDeleteConversation,
  updateConversation,
} from "./service";

export {
  CONVERSATION_AUTO_ASSOC_CAP,
  addAutoAssociation,
  addManualAssociation,
  listAssociations,
  listConversationsByContent,
  removeAssociation,
} from "./associations";
