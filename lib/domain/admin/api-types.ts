/**
 * Admin Panel API Type Definitions
 *
 * Comprehensive types for all admin API routes and responses.
 */

// ============================================================
// USER MANAGEMENT TYPES
// ============================================================

export interface AdminUserListItem {
  id: string;
  username: string;
  email: string;
  role: "owner" | "admin" | "member" | "guest";
  createdAt: Date;
  updatedAt: Date;
  contentCount: number;
  storageUsage: string; // Formatted string (e.g., "1.2 GB")
  lastActivity: Date | null;
}

export interface AdminUserDetail extends AdminUserListItem {
  accounts: {
    provider: string;
    createdAt: Date;
  }[];
  sessions: {
    id: string;
    createdAt: Date;
    expiresAt: Date;
  }[];
  recentContent: {
    id: string;
    title: string;
    contentType: string;
    updatedAt: Date;
  }[];
  settings?: Record<string, unknown>; // User settings JSON
}

export interface ChangeRoleRequest {
  role: "owner" | "admin" | "member" | "guest";
  reason?: string; // Optional reason for audit log
}

export interface ChangeRoleResponse {
  userId: string;
  oldRole: string;
  newRole: string;
  changedAt: Date;
}

// ============================================================
// CONTENT OVERVIEW TYPES
// ============================================================

export interface AdminContentListItem {
  id: string;
  ownerId: string;
  ownerUsername: string;
  title: string;
  contentType: "folder" | "note" | "file" | "html" | "code";
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  fileSize?: string; // For files only
}

export interface AdminContentDetail {
  id: string;
  ownerId: string;
  ownerUsername: string;
  title: string;
  slug: string;
  contentType: string;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  parentPath: string | null;

  // Payload preview (truncated for security)
  payloadPreview?: {
    type: "note" | "file" | "html" | "code";
    preview: string; // First 500 chars or metadata
  };
}

// ============================================================
// SYSTEM STATS TYPES
// ============================================================

export interface SystemStats {
  users: {
    total: number;
    byRole: Record<string, number>;
    activeLastWeek: number;
    activeLastMonth: number;
  };
  content: {
    total: number;
    byType: Record<string, number>;
    published: number;
    deleted: number;
  };
  storage: {
    totalBytes: string;
    byProvider: Record<string, string>;
    largestFiles: {
      id: string;
      title: string;
      ownerUsername: string;
      size: string;
    }[];
  };
  activity: {
    contentCreatedToday: number;
    contentCreatedThisWeek: number;
    contentCreatedThisMonth: number;
  };
}

// ============================================================
// AUDIT LOG TYPES
// ============================================================

export interface AuditLogEntry {
  id: string;
  userId: string;
  username: string;
  action: string;
  targetUserId: string | null;
  targetUsername: string | null;
  targetContentId: string | null;
  targetContentTitle: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: Date;
}

export interface AuditLogFilters {
  userId?: string;
  action?: string;
  targetUserId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

// ============================================================
// AUDIT ACTION CONSTANTS
// ============================================================

export const AUDIT_ACTIONS = {
  // User management
  VIEW_USER_LIST: "VIEW_USER_LIST",
  VIEW_USER_DETAIL: "VIEW_USER_DETAIL",
  CHANGE_USER_ROLE: "CHANGE_USER_ROLE",
  DELETE_USER: "DELETE_USER",

  // Content viewing
  VIEW_CONTENT_LIST: "VIEW_CONTENT_LIST",
  VIEW_CONTENT_DETAIL: "VIEW_CONTENT_DETAIL",

  // System monitoring
  VIEW_SYSTEM_STATS: "VIEW_SYSTEM_STATS",
  VIEW_AUDIT_LOGS: "VIEW_AUDIT_LOGS",
  EXPORT_AUDIT_LOGS: "EXPORT_AUDIT_LOGS",
} as const;

export type AuditAction = typeof AUDIT_ACTIONS[keyof typeof AUDIT_ACTIONS];
