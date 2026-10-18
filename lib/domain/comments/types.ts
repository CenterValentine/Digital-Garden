/**
 * Comment threads — client-safe DTOs (no Prisma). The anchor is the `comment`
 * mark in the document (lib/domain/content/comments.ts); these rows are the
 * discussion beside it. Plan: COMMENTS-ANNOTATIONS-PLAN.md §3.
 */

export interface CommentAuthorDto {
  id: string;
  username: string;
}

/** Captured when a thread is created: shown when its mark is gone. */
export interface CommentAnchor {
  quote: string;
  before?: string;
  after?: string;
}

export interface CommentDto {
  id: string;
  threadId: string;
  author: CommentAuthorDto;
  /** Empty when `deletedAt` is set (the row stays as a placeholder). */
  body: string;
  mentions: string[];
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface CommentThreadDto {
  id: string;
  contentId: string;
  createdBy: CommentAuthorDto;
  /** Null for a thread on the note as a whole (no mark). */
  anchor: CommentAnchor | null;
  resolvedAt: string | null;
  resolvedById: string | null;
  createdAt: string;
  updatedAt: string;
  comments: CommentDto[];
}

export const COMMENT_BODY_MAX = 10_000;
export const COMMENT_ANCHOR_QUOTE_MAX = 500;
export const COMMENT_ANCHOR_CONTEXT_MAX = 120;
export const COMMENT_MENTIONS_MAX = 20;

export interface CreateThreadInput {
  /** Client-minted UUID — the mark is applied before the row exists. */
  id: string;
  body: string;
  anchor?: CommentAnchor | null;
  mentions?: string[];
}
