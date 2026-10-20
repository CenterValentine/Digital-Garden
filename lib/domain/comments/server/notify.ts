/**
 * Who hears about a comment, and how.
 *
 *   comment.new       → the note's other collaborators (owner + grantees)
 *   comment.reply     → the thread's other participants
 *   comment.mention   → the @mentioned collaborators (and not the above twice)
 *   comment.resolved  → the thread's author
 *
 * Through the one notification pipeline (`publishEvent`): the actor is never
 * notified of their own action, per-kind preferences apply, and the reply /
 * new / resolved kinds collapse per thread. A notification failure never
 * fails the comment — it is logged and the comment stands.
 */

import "server-only";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { publishEvent } from "@/lib/domain/notifications/service";
import type { CommentThreadDto } from "../types";

export interface Collaborator {
  id: string;
  username: string;
}

/** The note's owner plus every user holding a live ViewGrant on it. */
export async function listCollaborators(contentId: string): Promise<Collaborator[]> {
  const node = await prisma.contentNode.findFirst({
    where: { id: contentId, deletedAt: null },
    select: { owner: { select: { id: true, username: true } } },
  });
  if (!node) return [];
  const grants = await prisma.viewGrant.findMany({
    where: { contentId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { user: { select: { id: true, username: true } } },
  });
  const seen = new Set<string>([node.owner.id]);
  const out: Collaborator[] = [node.owner];
  for (const grant of grants) {
    if (seen.has(grant.user.id)) continue;
    seen.add(grant.user.id);
    out.push(grant.user);
  }
  return out;
}

/** Comment authors + the thread's creator — everyone who took part. */
function participantIds(thread: CommentThreadDto): Set<string> {
  const ids = new Set<string>([thread.createdBy.id]);
  for (const comment of thread.comments) ids.add(comment.author.id);
  return ids;
}

function preview(body: string): string {
  const clean = body.replace(/\s+/g, " ").trim();
  return clean.length > 140 ? `${clean.slice(0, 139)}…` : clean;
}

async function contentTitle(contentId: string): Promise<string> {
  const node = await prisma.contentNode.findUnique({ where: { id: contentId }, select: { title: true } });
  return node?.title ?? "a note";
}

interface NotifyBase {
  actor: Collaborator;
  thread: CommentThreadDto;
  /** The comment that triggered this (new / reply / mention preview). */
  body: string;
  /** Collaborator ids the comment @mentioned (already validated). */
  mentions?: string[];
}

async function publish(kind: string, base: NotifyBase, recipientIds: Iterable<string>) {
  const recipients = Array.from(new Set(recipientIds))
    .filter((id) => id !== base.actor.id)
    .map((userId) => ({ userId, collapseKey: `comment:${base.thread.id}` }));
  if (recipients.length === 0) return;
  await publishEvent(prisma, {
    kind,
    actorType: "user",
    actorUserId: base.actor.id,
    actorLabel: base.actor.username,
    subjectType: "commentThread",
    subjectId: base.thread.id,
    payload: {
      threadId: base.thread.id,
      contentId: base.thread.contentId,
      contentTitle: await contentTitle(base.thread.contentId),
      actorUsername: base.actor.username,
      preview: preview(base.body),
    },
    recipients,
  });
}

async function safely(label: string, work: () => Promise<void>) {
  try {
    await work();
  } catch (error) {
    logger.warn({ layer: "content", event: "comments:notify_failed", summary: `${label} notification failed`, error });
  }
}

/** A thread was started: collaborators hear `comment.new`, mentioned ones `comment.mention`. */
export function notifyThreadCreated(base: NotifyBase): Promise<void> {
  return safely("comment.new", async () => {
    const mentioned = new Set(base.mentions ?? []);
    const collaborators = (await listCollaborators(base.thread.contentId)).map((c) => c.id);
    if (mentioned.size > 0) await publish("comment.mention", base, mentioned);
    await publish("comment.new", base, collaborators.filter((id) => !mentioned.has(id)));
  });
}

/** A reply landed: participants hear `comment.reply`, mentioned ones `comment.mention`. */
export function notifyReply(base: NotifyBase): Promise<void> {
  return safely("comment.reply", async () => {
    const mentioned = new Set(base.mentions ?? []);
    const participants = participantIds(base.thread);
    if (mentioned.size > 0) await publish("comment.mention", base, mentioned);
    await publish("comment.reply", base, Array.from(participants).filter((id) => !mentioned.has(id)));
  });
}

/** A thread was resolved: its author hears `comment.resolved`. */
export function notifyResolved(base: NotifyBase): Promise<void> {
  return safely("comment.resolved", async () => {
    await publish("comment.resolved", base, [base.thread.createdBy.id]);
  });
}
