/**
 * Messaging domain — DTOs and errors.
 *
 * DM content lives in DmThread/DmMessage tables, deliberately outside the
 * ActivityEvent log: messages are content, the log is signal. Sending a
 * message emits a "dm.message" event only when the recipient isn't actively
 * viewing the thread.
 */

export interface ThreadUserDTO {
  id: string;
  username: string;
}

export interface ThreadDTO {
  id: string;
  otherUser: ThreadUserDTO;
  createdAt: string;
}

export interface ThreadListItemDTO {
  id: string;
  otherUser: ThreadUserDTO;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
}

export interface DmMessageDTO {
  id: string;
  threadId: string;
  senderId: string | null;
  senderUsername: string | null;
  /** Empty string when the message was deleted (placeholder rendering). */
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface ThreadMessagesResult {
  messages: DmMessageDTO[];
  /** Cursor for fetching the next (older) history page; null when exhausted. */
  nextCursor: string | null;
}

export class ThreadNotFoundError extends Error {
  constructor() {
    super("Thread not found");
    this.name = "ThreadNotFoundError";
  }
}

export class MessageNotFoundError extends Error {
  constructor() {
    super("Message not found");
    this.name = "MessageNotFoundError";
  }
}

export class InvalidMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMessageError";
  }
}

/**
 * Single opaque 403 for both "not connected" and "blocked" so messaging
 * failures never reveal block state.
 */
export class MessagingForbiddenError extends Error {
  constructor() {
    super("You can't message this user");
    this.name = "MessagingForbiddenError";
  }
}
