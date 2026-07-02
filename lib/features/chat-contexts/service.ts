/**
 * Chat Contexts service — server-only CRUD for user custom-instruction
 * presets. All reads/writes are ownership-gated; soft-delete preserves
 * referential graceful-degradation for in-flight conversation links
 * (Conversation.activeContextId FK is ON DELETE SET NULL, but we soft-
 * delete so the row lingers and audit/history stays intact).
 */

import { prisma } from "@/lib/database/client";
import {
  CHAT_CONTEXT_BODY_MAX,
  CHAT_CONTEXT_NAME_MAX,
  type ChatContextView,
  type CreateChatContextInput,
  type UpdateChatContextPatch,
} from "./types";

export class ChatContextNotFoundError extends Error {
  constructor(id: string) {
    super(`Chat context not found: ${id}`);
    this.name = "ChatContextNotFoundError";
  }
}

export class ChatContextValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatContextValidationError";
  }
}

type ChatContextRow = {
  id: string;
  name: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
};

function toView(row: ChatContextRow): ChatContextView {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const SELECT = {
  id: true,
  name: true,
  body: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Validate + normalize name/body. Throws ChatContextValidationError. */
function normalize(input: { name?: string; body?: string }): {
  name?: string;
  body?: string;
} {
  const out: { name?: string; body?: string } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length === 0)
      throw new ChatContextValidationError("Context name is required.");
    if (name.length > CHAT_CONTEXT_NAME_MAX)
      throw new ChatContextValidationError(
        `Name must be ${CHAT_CONTEXT_NAME_MAX} characters or fewer.`,
      );
    out.name = name;
  }
  if (input.body !== undefined) {
    const body = input.body.trim();
    if (body.length === 0)
      throw new ChatContextValidationError("Context instructions are required.");
    if (body.length > CHAT_CONTEXT_BODY_MAX)
      throw new ChatContextValidationError(
        `Instructions must be ${CHAT_CONTEXT_BODY_MAX} characters or fewer.`,
      );
    out.body = body;
  }
  return out;
}

export async function listChatContexts(
  userId: string,
): Promise<ChatContextView[]> {
  const rows = await prisma.chatContext.findMany({
    where: { ownerId: userId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: SELECT,
  });
  return rows.map(toView);
}

export async function createChatContext(
  userId: string,
  input: CreateChatContextInput,
): Promise<ChatContextView> {
  const { name, body } = normalize(input);
  if (name === undefined || body === undefined)
    throw new ChatContextValidationError("Name and instructions are required.");
  const row = await prisma.chatContext.create({
    data: { ownerId: userId, name, body },
    select: SELECT,
  });
  return toView(row);
}

export async function updateChatContext(
  userId: string,
  id: string,
  patch: UpdateChatContextPatch,
): Promise<ChatContextView> {
  const data = normalize(patch);
  if (data.name === undefined && data.body === undefined)
    throw new ChatContextValidationError("Nothing to update.");

  // Ownership gate via updateMany count, then re-read (same pattern as
  // conversations service).
  const { count } = await prisma.chatContext.updateMany({
    where: { id, ownerId: userId, deletedAt: null },
    data,
  });
  if (count === 0) throw new ChatContextNotFoundError(id);

  const row = await prisma.chatContext.findUniqueOrThrow({
    where: { id },
    select: SELECT,
  });
  return toView(row);
}

export async function softDeleteChatContext(
  userId: string,
  id: string,
): Promise<void> {
  const { count } = await prisma.chatContext.updateMany({
    where: { id, ownerId: userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (count === 0) throw new ChatContextNotFoundError(id);
}

/**
 * Resolve a context's body for prompt injection. Ownership-gated; returns
 * null when the id is missing/foreign/deleted so the caller can degrade to
 * the base system prompt without erroring the chat stream.
 */
export async function getChatContextBody(
  userId: string,
  id: string,
): Promise<{ name: string; body: string } | null> {
  const row = await prisma.chatContext.findFirst({
    where: { id, ownerId: userId, deletedAt: null },
    select: { name: true, body: true },
  });
  return row ?? null;
}
