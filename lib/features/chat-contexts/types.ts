/**
 * Chat Context domain types.
 *
 * A "chat context" is a user-authored custom-instruction preset that, when
 * active on a conversation, is appended to the assistant's system prompt to
 * shape its voice/output (ChatGPT "custom instructions" analogue).
 */

/** Context returned to API consumers (Date → ISO boundary). */
export interface ChatContextView {
  id: string;
  name: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChatContextInput {
  name: string;
  body: string;
}

export interface UpdateChatContextPatch {
  name?: string;
  body?: string;
}

/** Field caps mirrored from the Prisma schema + sane prompt budgeting. */
export const CHAT_CONTEXT_NAME_MAX = 120;
export const CHAT_CONTEXT_BODY_MAX = 8000;
