/**
 * Server-side notification kind registry.
 *
 * Every ActivityEvent carries a string `kind` whose JSON payload must parse
 * against the schema registered here. Kinds are strings (not a Prisma enum)
 * so extensions and future features can add kinds without a migration —
 * but publishEvent() rejects kinds missing from this registry, keeping the
 * event log's payloads trustworthy.
 *
 * `collapsible` kinds coalesce per (recipient, collapseKey): a burst of DM
 * messages produces one unread notification pointing at the newest event.
 */

import { z } from "zod";

export const connectionInvitePayloadSchema = z.object({
  inviteId: z.string().uuid(),
  inviterUsername: z.string().min(1).max(50),
  message: z.string().max(280).optional(),
});

export const connectionAcceptedPayloadSchema = z.object({
  connectionId: z.string().uuid(),
  accepterUsername: z.string().min(1).max(50),
});

export const dmMessagePayloadSchema = z.object({
  threadId: z.string().uuid(),
  messageId: z.string().uuid(),
  senderUsername: z.string().min(1).max(50),
  preview: z.string().max(140),
});

export const aiNotifyPayloadSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(1000),
  conversationId: z.string().uuid().optional(),
});

export const systemAnnouncementPayloadSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().max(1000),
  href: z.string().max(500).optional(),
});

// Workflows extension — a run suspended at a human-in-the-loop gate. The
// gateToken is what POST /api/workflows/runs/[runId]/resume expects.
export const workflowGatePayloadSchema = z.object({
  runId: z.string().min(1),
  gateToken: z.string().min(1),
  workflowName: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  body: z.string().max(1000).optional(),
});

// Workflows extension — a run reached a terminal status.
export const workflowFinishedPayloadSchema = z.object({
  runId: z.string().min(1),
  status: z.enum(["succeeded", "failed", "canceled"]),
  workflowName: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
});

// Workflows extension — a user-authored notify node fired mid-run.
export const workflowNotifyPayloadSchema = z.object({
  runId: z.string().min(1),
  title: z.string().min(1).max(200),
  body: z.string().max(1000).optional(),
  workflowName: z.string().max(200).optional(),
});

// Studio extension — a generation run reached a terminal status.
export const studioRunPayloadSchema = z.object({
  runId: z.string().uuid(),
  status: z.enum(["done", "failed"]),
  toolLabel: z.string().min(1).max(100),
  folderName: z.string().min(1).max(255),
  outputNodeId: z.string().uuid().optional(),
  outputTitle: z.string().max(255).optional(),
  error: z.string().max(500).optional(),
});

export interface NotificationKindDefinition {
  payloadSchema: z.ZodTypeAny;
  collapsible: boolean;
}

export const NOTIFICATION_KINDS = {
  "connection.invite": {
    payloadSchema: connectionInvitePayloadSchema,
    collapsible: false,
  },
  "connection.accepted": {
    payloadSchema: connectionAcceptedPayloadSchema,
    collapsible: false,
  },
  "dm.message": {
    payloadSchema: dmMessagePayloadSchema,
    collapsible: true,
  },
  "ai.notify": {
    payloadSchema: aiNotifyPayloadSchema,
    collapsible: false,
  },
  "system.announcement": {
    payloadSchema: systemAnnouncementPayloadSchema,
    collapsible: false,
  },
  "workflow.gate": {
    payloadSchema: workflowGatePayloadSchema,
    collapsible: false,
  },
  "workflow.finished": {
    payloadSchema: workflowFinishedPayloadSchema,
    collapsible: false,
  },
  "workflow.notify": {
    payloadSchema: workflowNotifyPayloadSchema,
    collapsible: false,
  },
  "studio.run": {
    payloadSchema: studioRunPayloadSchema,
    collapsible: false,
  },
} as const satisfies Record<string, NotificationKindDefinition>;

export type NotificationKind = keyof typeof NOTIFICATION_KINDS;

export function isKnownNotificationKind(
  kind: string,
): kind is NotificationKind {
  return kind in NOTIFICATION_KINDS;
}
