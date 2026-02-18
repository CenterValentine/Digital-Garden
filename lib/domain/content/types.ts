/**
 * Content Types & Type System
 *
 * Type definitions for the ContentNode v2.0 architecture with explicit discriminants.
 * ContentType is STORED in the database as an enum field (no longer derived).
 */

import type { Prisma } from "@/lib/database/generated/prisma";

// ============================================================
// CONTENT TYPES (Explicit discriminant enum)
// ============================================================

export type ContentType =
  | "folder" // FolderPayload (view mode, sorting)
  | "note" // NotePayload exists
  | "file" // FilePayload exists
  | "html" // HtmlPayload exists
  | "template" // HtmlPayload with isTemplate=true
  | "code" // CodePayload exists
  // Phase 2: New content types
  | "external" // ExternalPayload exists
  | "chat" // ChatPayload exists
  | "visualization" // VisualizationPayload exists
  | "data" // DataPayload exists
  | "hope" // HopePayload exists
  | "workflow"; // WorkflowPayload exists

export type PayloadType = Exclude<ContentType, "folder" | "template">;

// ============================================================
// TREE NODE TYPE (for react-arborist)
// ============================================================

/**
 * TreeNode interface for file tree rendering
 * Matches the structure returned by GET /api/content/content/tree
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
  folder?: {
    viewMode: string;
    sortMode: string | null;
    includeReferencedContent: boolean;
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
  external?: {
    url: string;
    subtype: string;
  };
  visualization?: {
    engine: string;
  };
}

// ============================================================
// PRISMA INCLUDE HELPERS
// ============================================================

/**
 * Standard include for fetching content with payloads
 */
export const CONTENT_WITH_PAYLOADS = {
  // Phase 1 payloads
  notePayload: true,
  filePayload: true,
  htmlPayload: true,
  codePayload: true,

  // Phase 2 payloads
  folderPayload: true,
  externalPayload: true,
  chatPayload: true,
  visualizationPayload: true,
  dataPayload: true,
  hopePayload: true,
  workflowPayload: true,
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
 * Type guard: Check if content is a folder
 */
export function isFolder(content: ContentNodeWithPayloads): boolean {
  return content.contentType === "folder";
}

/**
 * Type guard: Check if content is a note
 */
export function isNote(
  content: ContentNodeWithPayloads
): content is ContentNodeWithPayloads & {
  notePayload: NonNullable<ContentNodeWithPayloads["notePayload"]>;
} {
  return content.contentType === "note";
}

/**
 * Type guard: Check if content is a file
 */
export function isFile(
  content: ContentNodeWithPayloads
): content is ContentNodeWithPayloads & {
  filePayload: NonNullable<ContentNodeWithPayloads["filePayload"]>;
} {
  return content.contentType === "file";
}

/**
 * Type guard: Check if content is HTML
 */
export function isHtml(
  content: ContentNodeWithPayloads
): content is ContentNodeWithPayloads & {
  htmlPayload: NonNullable<ContentNodeWithPayloads["htmlPayload"]>;
} {
  return content.contentType === "html";
}

/**
 * Type guard: Check if content is a template
 */
export function isTemplate(
  content: ContentNodeWithPayloads
): content is ContentNodeWithPayloads & {
  htmlPayload: NonNullable<ContentNodeWithPayloads["htmlPayload"]>;
} {
  return content.contentType === "template";
}

/**
 * Type guard: Check if content is code
 */
export function isCode(
  content: ContentNodeWithPayloads
): content is ContentNodeWithPayloads & {
  codePayload: NonNullable<ContentNodeWithPayloads["codePayload"]>;
} {
  return content.contentType === "code";
}

// ============================================================
// DISCRIMINATED UNION TYPES
// ============================================================

/**
 * Type-safe discriminated unions for ContentNode variants
 * The contentType field acts as the discriminant
 */

export type FolderNode = ContentNodeWithPayloads & {
  contentType: "folder";
  folderPayload: NonNullable<ContentNodeWithPayloads["folderPayload"]>;
  notePayload: null;
  filePayload: null;
  htmlPayload: null;
  codePayload: null;
  externalPayload: null;
  chatPayload: null;
  visualizationPayload: null;
  dataPayload: null;
  hopePayload: null;
  workflowPayload: null;
};

export type NoteNode = ContentNodeWithPayloads & {
  contentType: "note";
  notePayload: NonNullable<ContentNodeWithPayloads["notePayload"]>;
  filePayload: null;
  htmlPayload: null;
  codePayload: null;
  folderPayload: null;
  externalPayload: null;
  chatPayload: null;
  visualizationPayload: null;
  dataPayload: null;
  hopePayload: null;
  workflowPayload: null;
};

export type FileNode = ContentNodeWithPayloads & {
  contentType: "file";
  notePayload: null;
  filePayload: NonNullable<ContentNodeWithPayloads["filePayload"]>;
  htmlPayload: null;
  codePayload: null;
  folderPayload: null;
  externalPayload: null;
  chatPayload: null;
  visualizationPayload: null;
  dataPayload: null;
  hopePayload: null;
  workflowPayload: null;
};

export type HtmlNode = ContentNodeWithPayloads & {
  contentType: "html";
  notePayload: null;
  filePayload: null;
  htmlPayload: NonNullable<ContentNodeWithPayloads["htmlPayload"]>;
  codePayload: null;
  folderPayload: null;
  externalPayload: null;
  chatPayload: null;
  visualizationPayload: null;
  dataPayload: null;
  hopePayload: null;
  workflowPayload: null;
};

export type TemplateNode = ContentNodeWithPayloads & {
  contentType: "template";
  notePayload: null;
  filePayload: null;
  htmlPayload: NonNullable<ContentNodeWithPayloads["htmlPayload"]>;
  codePayload: null;
  folderPayload: null;
  externalPayload: null;
  chatPayload: null;
  visualizationPayload: null;
  dataPayload: null;
  hopePayload: null;
  workflowPayload: null;
};

export type CodeNode = ContentNodeWithPayloads & {
  contentType: "code";
  notePayload: null;
  filePayload: null;
  htmlPayload: null;
  codePayload: NonNullable<ContentNodeWithPayloads["codePayload"]>;
  folderPayload: null;
  externalPayload: null;
  chatPayload: null;
  visualizationPayload: null;
  dataPayload: null;
  hopePayload: null;
  workflowPayload: null;
};

// Phase 2 discriminated union types

export type ExternalNode = ContentNodeWithPayloads & {
  contentType: "external";
  notePayload: null;
  filePayload: null;
  htmlPayload: null;
  codePayload: null;
  folderPayload: null;
  externalPayload: NonNullable<ContentNodeWithPayloads["externalPayload"]>;
  chatPayload: null;
  visualizationPayload: null;
  dataPayload: null;
  hopePayload: null;
  workflowPayload: null;
};

export type ChatNode = ContentNodeWithPayloads & {
  contentType: "chat";
  notePayload: null;
  filePayload: null;
  htmlPayload: null;
  codePayload: null;
  folderPayload: null;
  externalPayload: null;
  chatPayload: NonNullable<ContentNodeWithPayloads["chatPayload"]>;
  visualizationPayload: null;
  dataPayload: null;
  hopePayload: null;
  workflowPayload: null;
};

export type VisualizationNode = ContentNodeWithPayloads & {
  contentType: "visualization";
  notePayload: null;
  filePayload: null;
  htmlPayload: null;
  codePayload: null;
  folderPayload: null;
  externalPayload: null;
  chatPayload: null;
  visualizationPayload: NonNullable<ContentNodeWithPayloads["visualizationPayload"]>;
  dataPayload: null;
  hopePayload: null;
  workflowPayload: null;
};

export type DataNode = ContentNodeWithPayloads & {
  contentType: "data";
  notePayload: null;
  filePayload: null;
  htmlPayload: null;
  codePayload: null;
  folderPayload: null;
  externalPayload: null;
  chatPayload: null;
  visualizationPayload: null;
  dataPayload: NonNullable<ContentNodeWithPayloads["dataPayload"]>;
  hopePayload: null;
  workflowPayload: null;
};

export type HopeNode = ContentNodeWithPayloads & {
  contentType: "hope";
  notePayload: null;
  filePayload: null;
  htmlPayload: null;
  codePayload: null;
  folderPayload: null;
  externalPayload: null;
  chatPayload: null;
  visualizationPayload: null;
  dataPayload: null;
  hopePayload: NonNullable<ContentNodeWithPayloads["hopePayload"]>;
  workflowPayload: null;
};

export type WorkflowNode = ContentNodeWithPayloads & {
  contentType: "workflow";
  notePayload: null;
  filePayload: null;
  htmlPayload: null;
  codePayload: null;
  folderPayload: null;
  externalPayload: null;
  chatPayload: null;
  visualizationPayload: null;
  dataPayload: null;
  hopePayload: null;
  workflowPayload: NonNullable<ContentNodeWithPayloads["workflowPayload"]>;
};

/**
 * Union of all typed content nodes
 * TypeScript can narrow this based on contentType checks
 */
export type TypedContentNode =
  | FolderNode
  | NoteNode
  | FileNode
  | HtmlNode
  | TemplateNode
  | CodeNode
  | ExternalNode
  | ChatNode
  | VisualizationNode
  | DataNode
  | HopeNode
  | WorkflowNode;

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
    // Phase 2
    external: "External Link",
    chat: "Chat",
    visualization: "Visualization",
    data: "Data Table",
    hope: "Hope/Goal",
    workflow: "Workflow",
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
    // Phase 2
    external: "ExternalLink",
    chat: "MessageSquare",
    visualization: "Activity",
    data: "Table",
    hope: "Target",
    workflow: "Workflow",
  };
  return icons[type];
}
