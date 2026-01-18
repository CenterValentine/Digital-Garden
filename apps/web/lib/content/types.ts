/**
 * Content Types & Type System
 *
 * Type definitions for the ContentNode v2.0 architecture.
 * ContentType is DERIVED from payload presence, not stored.
 */

import type { Prisma } from "@/lib/generated/prisma";

// ============================================================
// CONTENT TYPES (Derived from payload presence)
// ============================================================

export type ContentType =
  | "folder" // No payload
  | "note" // NotePayload exists
  | "file" // FilePayload exists
  | "html" // HtmlPayload exists
  | "template" // HtmlPayload with isTemplate=true
  | "code"; // CodePayload exists

export type PayloadType = Exclude<ContentType, "folder" | "template">;

// ============================================================
// TREE NODE TYPE (for react-arborist)
// ============================================================

/**
 * TreeNode interface for file tree rendering
 * Matches the structure returned by GET /api/notes/content/tree
 */
export interface TreeNode {
  id: string;
  title: string;
  slug: string;
  parentId: string | null;
  displayOrder: number;
  customIcon: string | null;
  iconColor: string | null;
  isPublished: boolean;
  contentType: ContentType;
  children: TreeNode[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;

  // Optional payload summaries
  note?: {
    wordCount?: number;
    characterCount?: number;
    readingTime?: number;
  };
  file?: {
    fileName: string;
    mimeType: string;
    fileSize: string;
    uploadStatus: "uploading" | "ready" | "failed";
    thumbnailUrl?: string | null;
  };
  html?: {
    isTemplate: boolean;
  };
  code?: {
    language: string;
  };
}

// ============================================================
// PRISMA INCLUDE HELPERS
// ============================================================

/**
 * Standard include for fetching content with payloads
 */
export const CONTENT_WITH_PAYLOADS = {
  notePayload: true,
  filePayload: true,
  htmlPayload: true,
  codePayload: true,
} as const;

/**
 * Standard include for file tree queries (metadata only)
 */
export const CONTENT_TREE_SELECT = {
  id: true,
  title: true,
  slug: true,
  parentId: true,
  displayOrder: true,
  customIcon: true,
  iconColor: true,
  isPublished: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,

  // Payload metadata (not full content)
  notePayload: {
    select: {
      metadata: true,
    },
  },
  filePayload: {
    select: {
      fileName: true,
      mimeType: true,
      fileSize: true,
      uploadStatus: true,
      thumbnailUrl: true,
    },
  },
  htmlPayload: {
    select: {
      isTemplate: true,
    },
  },
  codePayload: {
    select: {
      language: true,
    },
  },

  children: true, // For recursive queries
} as const;

// ============================================================
// TYPE GUARDS
// ============================================================

export type ContentNodeWithPayloads = Prisma.ContentNodeGetPayload<{
  include: typeof CONTENT_WITH_PAYLOADS;
}>;

/**
 * Type guard: Check if content is a folder (no payload)
 */
export function isFolder(content: ContentNodeWithPayloads): boolean {
  return (
    !content.notePayload &&
    !content.filePayload &&
    !content.htmlPayload &&
    !content.codePayload
  );
}

/**
 * Type guard: Check if content is a note
 */
export function isNote(
  content: ContentNodeWithPayloads
): content is ContentNodeWithPayloads & {
  notePayload: NonNullable<ContentNodeWithPayloads["notePayload"]>;
} {
  return content.notePayload !== null;
}

/**
 * Type guard: Check if content is a file
 */
export function isFile(
  content: ContentNodeWithPayloads
): content is ContentNodeWithPayloads & {
  filePayload: NonNullable<ContentNodeWithPayloads["filePayload"]>;
} {
  return content.filePayload !== null;
}

/**
 * Type guard: Check if content is HTML
 */
export function isHtml(
  content: ContentNodeWithPayloads
): content is ContentNodeWithPayloads & {
  htmlPayload: NonNullable<ContentNodeWithPayloads["htmlPayload"]>;
} {
  return content.htmlPayload !== null && !content.htmlPayload.isTemplate;
}

/**
 * Type guard: Check if content is a template
 */
export function isTemplate(
  content: ContentNodeWithPayloads
): content is ContentNodeWithPayloads & {
  htmlPayload: NonNullable<ContentNodeWithPayloads["htmlPayload"]>;
} {
  return (
    content.htmlPayload !== null && content.htmlPayload.isTemplate === true
  );
}

/**
 * Type guard: Check if content is code
 */
export function isCode(
  content: ContentNodeWithPayloads
): content is ContentNodeWithPayloads & {
  codePayload: NonNullable<ContentNodeWithPayloads["codePayload"]>;
} {
  return content.codePayload !== null;
}

// ============================================================
// TYPE DERIVATION
// ============================================================

/**
 * Derive ContentType from payload presence
 *
 * INVARIANT: Exactly one payload should exist for non-folders
 *
 * @param content - ContentNode with payloads included
 * @returns ContentType
 */
export function deriveContentType(
  content: ContentNodeWithPayloads
): ContentType {
  if (content.notePayload) return "note";
  if (content.filePayload) return "file";
  if (content.htmlPayload) {
    return content.htmlPayload.isTemplate ? "template" : "html";
  }
  if (content.codePayload) return "code";
  return "folder";
}

/**
 * Validate payload presence (ensures exactly one or none)
 *
 * @throws Error if multiple payloads exist
 */
export function validatePayloads(content: ContentNodeWithPayloads): void {
  const payloadCount = [
    content.notePayload,
    content.filePayload,
    content.htmlPayload,
    content.codePayload,
  ].filter(Boolean).length;

  if (payloadCount > 1) {
    throw new Error(
      `ContentNode ${content.id} has ${payloadCount} payloads (expected 0 or 1)`
    );
  }
}

// ============================================================
// UPLOAD STATUS
// ============================================================

export const UploadStatus = {
  UPLOADING: "uploading" as const,
  READY: "ready" as const,
  FAILED: "failed" as const,
};

export type UploadStatusType = (typeof UploadStatus)[keyof typeof UploadStatus];

/**
 * Check if file is ready for viewing
 */
export function isFileReady(content: ContentNodeWithPayloads): boolean {
  if (!isFile(content)) return false;
  return content.filePayload.uploadStatus === UploadStatus.READY;
}

/**
 * Check if file upload failed
 */
export function isFileFailed(content: ContentNodeWithPayloads): boolean {
  if (!isFile(content)) return false;
  return content.filePayload.uploadStatus === UploadStatus.FAILED;
}

// ============================================================
// DISPLAY HELPERS
// ============================================================

/**
 * Get human-readable content type label
 */
export function getContentTypeLabel(type: ContentType): string {
  const labels: Record<ContentType, string> = {
    folder: "Folder",
    note: "Note",
    file: "File",
    html: "HTML",
    template: "Template",
    code: "Code",
  };
  return labels[type];
}

/**
 * Get content type icon name (Lucide)
 */
export function getContentTypeIcon(type: ContentType): string {
  const icons: Record<ContentType, string> = {
    folder: "Folder",
    note: "FileText",
    file: "File",
    html: "FileCode",
    template: "FileCode2",
    code: "Code",
  };
  return icons[type];
}
