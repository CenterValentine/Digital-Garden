/**
 * Notifications domain — shared DTO types.
 *
 * The ActivityEvent log is the canonical record of "what happened";
 * NotificationRecipient rows are the per-user projection (read/archive state).
 * DTOs here are the wire shapes returned by /api/notifications routes.
 */

export type ActivityActorTypeValue = "user" | "system" | "ai" | "extension";

export interface NotificationActorDTO {
  type: ActivityActorTypeValue;
  userId?: string;
  username?: string;
  label?: string;
}

export interface NotificationDTO {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  actor: NotificationActorDTO;
  subjectType: string | null;
  subjectId: string | null;
  createdAt: string;
  readAt: string | null;
  archivedAt: string | null;
}

export interface UnreadSummary {
  unreadCount: number;
  latestCreatedAt: string | null;
}

export interface NotificationListResult {
  items: NotificationDTO[];
  nextCursor: string | null;
}

export type NotificationListFilter = "all" | "unread" | "archived";
