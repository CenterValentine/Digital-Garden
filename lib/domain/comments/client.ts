/**
 * Browser client for /api/content/comments/*. Throws an Error carrying the
 * server's message so callers can toast it as is.
 */

import type { CommentAuthorDto, CommentThreadDto, CreateThreadInput } from "./types";

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await response.json().catch(() => null)) as Envelope<T> | null;
  if (!response.ok || !json?.success || json.data === undefined) {
    throw new Error(json?.error?.message ?? `Request failed (${response.status})`);
  }
  return json.data;
}

const base = "/api/content/comments";

export const commentsApi = {
  list: (contentId: string, since?: string) =>
    call<{ threads: CommentThreadDto[] }>(
      `${base}/${encodeURIComponent(contentId)}${since ? `?since=${encodeURIComponent(since)}` : ""}`,
    ).then((d) => d.threads),

  create: (contentId: string, input: CreateThreadInput) =>
    call<{ thread: CommentThreadDto }>(`${base}/${encodeURIComponent(contentId)}`, {
      method: "POST",
      body: JSON.stringify(input),
    }).then((d) => d.thread),

  reply: (threadId: string, body: string, mentions: string[] = []) =>
    call<{ thread: CommentThreadDto }>(`${base}/threads/${encodeURIComponent(threadId)}`, {
      method: "POST",
      body: JSON.stringify({ body, mentions }),
    }).then((d) => d.thread),

  setResolved: (threadId: string, resolved: boolean) =>
    call<{ thread: CommentThreadDto }>(`${base}/threads/${encodeURIComponent(threadId)}`, {
      method: "PATCH",
      body: JSON.stringify({ resolved }),
    }).then((d) => d.thread),

  deleteThread: (threadId: string) =>
    call<{ deleted: true }>(`${base}/threads/${encodeURIComponent(threadId)}`, { method: "DELETE" }).then(() => undefined),

  editComment: (commentId: string, body: string) =>
    call<{ thread: CommentThreadDto }>(`${base}/items/${encodeURIComponent(commentId)}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    }).then((d) => d.thread),

  deleteComment: (commentId: string) =>
    call<{ thread: CommentThreadDto | null; threadDeleted: boolean }>(`${base}/items/${encodeURIComponent(commentId)}`, {
      method: "DELETE",
    }),

  /** Who can be @mentioned on this note: the owner plus every live grantee. */
  collaborators: (contentId: string) =>
    call<{ collaborators: CommentAuthorDto[] }>(`${base}/${encodeURIComponent(contentId)}/collaborators`).then(
      (d) => d.collaborators,
    ),
};
