/**
 * Chat Contexts module — barrel export. Server-only.
 */

export type {
  ChatContextView,
  CreateChatContextInput,
  UpdateChatContextPatch,
} from "./types";

export { CHAT_CONTEXT_NAME_MAX, CHAT_CONTEXT_BODY_MAX } from "./types";

export {
  ChatContextNotFoundError,
  ChatContextValidationError,
  createChatContext,
  getChatContextBody,
  listChatContexts,
  softDeleteChatContext,
  updateChatContext,
} from "./service";
