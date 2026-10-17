/**
 * Comment threads — the server side of the discussion beside a note.
 *
 * Every call resolves the caller's access to the note through the one
 * collaboration ladder (`resolveContentAccess`: owner / edit / view via
 * ViewGrant). View-level access can read, reply, start a thread and resolve;
 * editing or deleting a comment is the author's; deleting a whole thread is
 * the thread author's or the note owner's. A note the caller cannot view is
 * a 404, never a 403 — existence is not revealed.
 *
 * Replies and resolves touch `CommentThread.updatedAt` explicitly so a
 * `since` poll sees them (an insert on Comment would not bump the thread).
 */

import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { Prisma } from "@/lib/database/generated/prisma";
import { resolveContentAccess, type ContentAccessResult } from "@/lib/domain/collaboration/access";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/infrastructure/rate-limiting";
import { COMMENT_THREAD_ID_RE } from "@/lib/domain/content/comments";
import {
  COMMENT_ANCHOR_CONTEXT_MAX,
  COMMENT_ANCHOR_QUOTE_MAX,
  COMMENT_BODY_MAX,
  COMMENT_MENTIONS_MAX,
  type CommentAnchor,
  type CommentDto,
  type CommentThreadDto,
} from "../types";

export class CommentsError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CommentsError";
  }
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const bodySchema = z.string().trim().min(1, "Write something first").max(COMMENT_BODY_MAX);
const mentionsSchema = z.array(z.string().uuid()).max(COMMENT_MENTIONS_MAX).default([]);

export const anchorSchema = z.object({
  quote: z.string().max(COMMENT_ANCHOR_QUOTE_MAX),
  before: z.string().max(COMMENT_ANCHOR_CONTEXT_MAX).optional(),
  after: z.string().max(COMMENT_ANCHOR_CONTEXT_MAX).optional(),
});

export const createThreadSchema = z.object({
  id: z.string().regex(COMMENT_THREAD_ID_RE, "Thread id must be a UUID"),
  body: bodySchema,
  anchor: anchorSchema.nullish(),
  mentions: mentionsSchema,
});

export const replySchema = z.object({ body: bodySchema, mentions: mentionsSchema });
export const resolveSchema = z.object({ resolved: z.boolean() });
export const editCommentSchema = z.object({ body: bodySchema });
export const listQuerySchema = z.object({ since: z.string().datetime({ offset: true }).optional() });

// ── Rows → DTOs ──────────────────────────────────────────────────────────────

const authorSelect = { id: true, username: true } as const;

const threadInclude = {
  createdBy: { select: authorSelect },
  comments: { orderBy: { createdAt: "asc" }, include: { author: { select: authorSelect } } },
} satisfies Prisma.CommentThreadInclude;

type ThreadRow = Prisma.CommentThreadGetPayload<{ include: typeof threadInclude }>;
type CommentRow = ThreadRow["comments"][number];

function toCommentDto(row: CommentRow): CommentDto {
  return {
    id: row.id,
    threadId: row.threadId,
    author: row.author,
    body: row.deletedAt ? "" : row.body,
    mentions: Array.isArray(row.mentions) ? (row.mentions as unknown[]).filter((m): m is string => typeof m === "string") : [],
    editedAt: row.editedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toThreadDto(row: ThreadRow): CommentThreadDto {
  const anchor = row.anchor && typeof row.anchor === "object" && !Array.isArray(row.anchor) ? (row.anchor as unknown as CommentAnchor) : null;
  return {
    id: row.id,
    contentId: row.contentId,
    createdBy: row.createdBy,
    anchor: anchor && typeof anchor.quote === "string" ? anchor : null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedById: row.resolvedById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    comments: row.comments.map(toCommentDto),
  };
}

// ── Access + limits ──────────────────────────────────────────────────────────

async function viewAccess(userId: string, contentId: string): Promise<ContentAccessResult> {
  try {
    return await resolveContentAccess(prisma, { contentId, userId, require: "view" });
  } catch {
    throw new CommentsError(404, "Note not found");
  }
}

async function spendCommentBudget(userId: string): Promise<void> {
  const result = await consumeRateLimit({ key: `comments:${userId}`, ...RATE_LIMITS.COMMENTS_PER_HOUR });
  if (!result.ok) {
    throw new CommentsError(429, `Too many comments for now — try again in ${Math.ceil(result.retryAfterSeconds / 60)} min`);
  }
}

async function loadThread(threadId: string): Promise<ThreadRow> {
  const row = await prisma.commentThread.findUnique({ where: { id: threadId }, include: threadInclude });
  if (!row) throw new CommentsError(404, "Thread not found");
  return row;
}

function isUniqueViolation(error: unknown): boolean {
  // The error code, not the class: through the pg adapter the thrown object
  // is not always an `instanceof` the generated client's error class.
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

// ── Operations ───────────────────────────────────────────────────────────────

export async function listThreads(userId: string, contentId: string, since?: Date): Promise<CommentThreadDto[]> {
  await viewAccess(userId, contentId);
  const rows = await prisma.commentThread.findMany({
    where: { contentId, ...(since ? { updatedAt: { gt: since } } : {}) },
    include: threadInclude,
    orderBy: { createdAt: "asc" },
    take: 2000,
  });
  return rows.map(toThreadDto);
}

export async function createThread(
  userId: string,
  contentId: string,
  input: z.infer<typeof createThreadSchema>,
): Promise<CommentThreadDto> {
  await viewAccess(userId, contentId);
  await spendCommentBudget(userId);
  try {
    const row = await prisma.commentThread.create({
      data: {
        id: input.id.toLowerCase(),
        contentId,
        createdById: userId,
        anchor: input.anchor ? (input.anchor as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        comments: {
          create: {
            authorId: userId,
            body: input.body,
            mentions: input.mentions as unknown as Prisma.InputJsonValue,
          },
        },
      },
      include: threadInclude,
    });
    return toThreadDto(row);
  } catch (error) {
    if (isUniqueViolation(error)) throw new CommentsError(409, "That thread already exists");
    throw error;
  }
}

export async function replyToThread(
  userId: string,
  threadId: string,
  input: z.infer<typeof replySchema>,
): Promise<CommentThreadDto> {
  const thread = await loadThread(threadId);
  await viewAccess(userId, thread.contentId);
  await spendCommentBudget(userId);
  await prisma.$transaction([
    prisma.comment.create({
      data: { threadId, authorId: userId, body: input.body, mentions: input.mentions as unknown as Prisma.InputJsonValue },
    }),
    prisma.commentThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } }),
  ]);
  return toThreadDto(await loadThread(threadId));
}

export async function setThreadResolved(userId: string, threadId: string, resolved: boolean): Promise<CommentThreadDto> {
  const thread = await loadThread(threadId);
  await viewAccess(userId, thread.contentId);
  const row = await prisma.commentThread.update({
    where: { id: threadId },
    data: resolved ? { resolvedAt: new Date(), resolvedById: userId } : { resolvedAt: null, resolvedById: null },
    include: threadInclude,
  });
  return toThreadDto(row);
}

export async function deleteThread(userId: string, threadId: string): Promise<void> {
  const thread = await loadThread(threadId);
  const access = await viewAccess(userId, thread.contentId);
  if (access.accessLevel !== "owner" && thread.createdById !== userId) {
    throw new CommentsError(403, "Only the thread's author or the note's owner can delete it");
  }
  await prisma.commentThread.delete({ where: { id: threadId } });
}

async function loadComment(commentId: string) {
  const row = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { thread: { select: { id: true, contentId: true, createdById: true } } },
  });
  if (!row) throw new CommentsError(404, "Comment not found");
  return row;
}

export async function updateComment(userId: string, commentId: string, body: string): Promise<CommentThreadDto> {
  const comment = await loadComment(commentId);
  await viewAccess(userId, comment.thread.contentId);
  if (comment.authorId !== userId) throw new CommentsError(403, "Only the author can edit a comment");
  if (comment.deletedAt) throw new CommentsError(409, "That comment was deleted");
  await prisma.$transaction([
    prisma.comment.update({ where: { id: commentId }, data: { body, editedAt: new Date() } }),
    prisma.commentThread.update({ where: { id: comment.threadId }, data: { updatedAt: new Date() } }),
  ]);
  return toThreadDto(await loadThread(comment.threadId));
}

export interface DeleteCommentResult {
  /** The thread after the delete, or null when the delete emptied it. */
  thread: CommentThreadDto | null;
  threadDeleted: boolean;
}

export async function deleteComment(userId: string, commentId: string): Promise<DeleteCommentResult> {
  const comment = await loadComment(commentId);
  const access = await viewAccess(userId, comment.thread.contentId);
  if (comment.authorId !== userId && access.accessLevel !== "owner") {
    throw new CommentsError(403, "Only the author or the note's owner can delete a comment");
  }
  const live = await prisma.comment.count({ where: { threadId: comment.threadId, deletedAt: null } });
  if (live <= 1) {
    // The last live comment goes → the thread goes; the client removes the mark.
    await prisma.commentThread.delete({ where: { id: comment.threadId } });
    return { thread: null, threadDeleted: true };
  }
  await prisma.$transaction([
    prisma.comment.update({ where: { id: commentId }, data: { deletedAt: new Date(), body: "" } }),
    prisma.commentThread.update({ where: { id: comment.threadId }, data: { updatedAt: new Date() } }),
  ]);
  return { thread: toThreadDto(await loadThread(comment.threadId)), threadDeleted: false };
}
