/**
 * Content Utilities (v2.0)
 *
 * Core utilities for ContentNode architecture:
 * - Type derivation and validation
 * - Search text extraction
 * - Slug generation
 * - File checksums
 * - Markdown conversion
 *
 * Milestone 1.3: Foundation utilities
 */

// Type system
export * from "./types";
export type {
  ContentType,
  PayloadType,
  ContentNodeWithPayloads,
} from "./types";

// Search text extraction
export {
  extractSearchTextFromTipTap,
  extractSearchTextFromHtml,
  extractSearchTextFromCode,
  extractSearchText,
  truncateSearchText,
  highlightSearchText,
} from "./search-text";

// Slug generation
export {
  generateSlug,
  generateUniqueSlug,
  isValidSlug,
  sanitizeSlug,
  generateContentPath,
  generatePathSegments,
  calculateDepth,
  updateMaterializedPath,
  rebuildAllPaths,
} from "./slug";

// File checksums
export {
  calculateChecksumFromBuffer,
  calculateChecksumFromStream,
  calculateChecksumFromFile,
  verifyChecksum,
  verifyStreamChecksum,
  findDuplicateFile,
  isDuplicateUpload,
  verifyFileIntegrity,
  batchIntegrityCheck,
} from "./checksum";
export type { IntegrityCheckResult } from "./checksum";

// Tag sync
export { syncContentTags } from "./tag-sync";

// Markdown conversion
export {
  markdownToTiptap,
  tiptapToMarkdown,
  importMarkdownFile,
  exportAsMarkdown,
  validateMarkdown,
} from "./markdown";

// Constants
export { CONTENT_WITH_PAYLOADS, CONTENT_TREE_SELECT } from "./types";
export { UploadStatus } from "./types";

// API Types
export type {
  ContentListItem,
  ContentDetailResponse,
  CreateContentRequest,
  UpdateContentRequest,
  MoveContentRequest,
  InitiateUploadRequest,
  FinalizeUploadRequest,
  CreateStorageConfigRequest,
  UpdateStorageConfigRequest,
  R2Config,
  S3Config,
  VercelConfig,
  StorageConfig,
  ContentWhereInput,
  CreatePayloadData,
} from "./api-types";
