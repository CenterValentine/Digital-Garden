/**
 * API Type Definitions
 * 
 * TypeScript types for API request/response bodies and internal processing.
 */

import type { Prisma } from "@/lib/generated/prisma";
import type { JSONContent } from "@tiptap/core";

// ============================================================
// CONTENT RESPONSE TYPES
// ============================================================

export interface ContentListItem {
  id: string;
  ownerId: string;
  title: string;
  slug: string;
  parentId: string | null;
  categoryId: string | null;
  displayOrder: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  customIcon: string | null;
  iconColor: string | null;
  contentType: "folder" | "note" | "file" | "html" | "template" | "code";
  
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
    width?: number | null;
    height?: number | null;
  };
  html?: {
    isTemplate: boolean;
  };
  code?: {
    language: string;
  };
  childCount?: number;
}

export interface ContentDetailResponse {
  id: string;
  ownerId: string;
  title: string;
  slug: string;
  parentId: string | null;
  categoryId: string | null;
  displayOrder: number;
  isPublished: boolean;
  customIcon: string | null;
  iconColor: string | null;
  contentType: "folder" | "note" | "file" | "html" | "template" | "code";
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  
  // Full payload data (one of these will be present)
  note?: {
    tiptapJson: JSONContent;
    searchText: string;
    metadata: Record<string, unknown>;
  };
  file?: {
    fileName: string;
    fileExtension: string | null;
    mimeType: string;
    fileSize: string;
    checksum: string;
    storageProvider: "r2" | "s3" | "vercel";
    storageKey: string;
    storageUrl: string | null;
    storageMetadata: Record<string, unknown>;
    uploadStatus: "uploading" | "ready" | "failed";
    uploadedAt: Date | null;
    uploadError: string | null;
    thumbnailUrl: string | null;
    width: number | null;
    height: number | null;
    duration: number | null;
  };
  html?: {
    html: string;
    isTemplate: boolean;
    templateSchema: Record<string, unknown> | null;
    templateMetadata: Record<string, unknown>;
    renderMode: string;
    templateEngine: string | null;
  };
  code?: {
    code: string;
    language: string;
    metadata: Record<string, unknown>;
  };
}

// ============================================================
// REQUEST BODY TYPES
// ============================================================

export interface CreateContentRequest {
  title: string;
  parentId?: string | null;
  categoryId?: string | null;
  customIcon?: string | null;
  iconColor?: string | null;
  
  // Content type (exactly one should be specified)
  isFolder?: boolean;
  tiptapJson?: JSONContent;
  markdown?: string;
  html?: string;
  isTemplate?: boolean;
  templateSchema?: Record<string, unknown>;
  templateMetadata?: Record<string, unknown>;
  code?: string;
  language?: string;
}

export interface UpdateContentRequest {
  title?: string;
  parentId?: string | null;
  categoryId?: string | null;
  isPublished?: boolean;
  customIcon?: string | null;
  iconColor?: string | null;
  displayOrder?: number;
  
  // Payload updates
  tiptapJson?: JSONContent;
  markdown?: string;
  html?: string;
  code?: string;
  language?: string;
}

export interface MoveContentRequest {
  contentId: string;
  targetParentId?: string | null;
  newDisplayOrder?: number;
}

export interface InitiateUploadRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksum?: string;
  parentId?: string | null;
  title?: string;
  customIcon?: string | null;
  iconColor?: string | null;
}

export interface FinalizeUploadRequest {
  contentId: string;
  uploadSuccess?: boolean;
  uploadError?: string;
  fileMetadata?: {
    width?: number;
    height?: number;
    duration?: number;
  };
}

export interface CreateStorageConfigRequest {
  provider: "r2" | "s3" | "vercel";
  displayName?: string;
  config: R2Config | S3Config | VercelConfig;
  isDefault?: boolean;
}

export interface UpdateStorageConfigRequest {
  displayName?: string;
  config?: R2Config | S3Config | VercelConfig;
  isDefault?: boolean;
  isActive?: boolean;
}

// ============================================================
// STORAGE PROVIDER CONFIG TYPES
// ============================================================

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export interface S3Config {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export interface VercelConfig {
  token: string;
}

export type StorageConfig = R2Config | S3Config | VercelConfig;

// ============================================================
// PRISMA WHERE CLAUSE TYPES
// ============================================================

export type ContentWhereInput = Prisma.ContentNodeWhereInput & {
  OR?: Array<{
    title?: { contains: string; mode: "insensitive" };
    notePayload?: { searchText?: { contains: string; mode: "insensitive" } };
    htmlPayload?: { searchText?: { contains: string; mode: "insensitive" } };
    codePayload?: { searchText?: { contains: string; mode: "insensitive" } };
  }>;
};

// ============================================================
// PAYLOAD DATA TYPES (for creation)
// ============================================================

export type CreatePayloadData = 
  | { notePayload: { create: Prisma.NotePayloadCreateWithoutContentInput } }
  | { filePayload: { create: Prisma.FilePayloadCreateWithoutContentInput } }
  | { htmlPayload: { create: Prisma.HtmlPayloadCreateWithoutContentInput } }
  | { codePayload: { create: Prisma.CodePayloadCreateWithoutContentInput } }
  | Record<string, never>; // Empty object for folders

