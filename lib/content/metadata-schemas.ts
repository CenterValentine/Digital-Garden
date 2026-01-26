/**
 * File Payload Metadata Schemas
 *
 * This file defines the standard shapes for the `storageMetadata` JSON field
 * in the FilePayload model. All metadata should follow these schemas to ensure
 * type safety and consistency.
 *
 * Usage:
 * ```typescript
 * import { FileMetadata, getMetadata, setMetadata } from '@/lib/content/metadata-schemas';
 *
 * // Get typed metadata
 * const metadata = getMetadata(filePayload.storageMetadata);
 * if (metadata.externalProviders?.googleDrive?.fileId) {
 *   // Use existing Google Drive file
 * }
 *
 * // Set metadata
 * const updated = setMetadata(filePayload.storageMetadata, {
 *   externalProviders: {
 *     googleDrive: { fileId: '...', lastSynced: new Date().toISOString() }
 *   }
 * });
 * ```
 */

import { deepMerge } from "@/lib/core/deep-merge";

// ============================================================
// External Provider Integrations
// ============================================================

/**
 * Google Drive integration metadata
 * Used when file is synced to Google Drive for collaborative editing
 */
export interface GoogleDriveMetadata {
  /** Google Drive file ID */
  fileId: string;
  /** When the file was last uploaded/synced to Drive */
  lastSynced: string; // ISO 8601 date
  /** Google Drive web view URL */
  webViewUrl?: string;
  /** Google Drive edit URL */
  editUrl?: string;
  /** MIME type used in Google Drive (may differ from original) */
  googleMimeType?: string;
}

/**
 * OnlyOffice integration metadata
 * Used for self-hosted collaborative editing
 */
export interface OnlyOfficeMetadata {
  /** OnlyOffice document session ID */
  sessionId: string;
  /** Whether document is currently locked for editing */
  locked: boolean;
  /** User ID who locked the document */
  lockedBy?: string;
  /** When the lock expires */
  lockExpiry?: string; // ISO 8601 date
  /** OnlyOffice server URL */
  serverUrl?: string;
}

/**
 * Office 365 integration metadata
 * Used for Microsoft Office online editing
 */
export interface Office365Metadata {
  /** SharePoint/OneDrive file ID */
  fileId: string;
  /** Last sync timestamp */
  lastSynced: string; // ISO 8601 date
  /** Office Online edit URL */
  editUrl?: string;
}

/**
 * External provider integrations
 * Tracks files synced to external editing services
 */
export interface ExternalProviders {
  googleDrive?: GoogleDriveMetadata;
  onlyOffice?: OnlyOfficeMetadata;
  office365?: Office365Metadata;
}

// ============================================================
// Processing & AI Metadata
// ============================================================

/**
 * OCR processing metadata
 * Used for text extraction from images and PDFs
 */
export interface OCRMetadata {
  /** Processing status */
  status: "pending" | "processing" | "completed" | "failed";
  /** OCR confidence score (0-1) */
  confidence?: number;
  /** Detected language code (ISO 639-1) */
  language?: string;
  /** OCR provider used */
  provider?: "tesseract" | "google-vision" | "aws-textract";
  /** When OCR was completed */
  completedAt?: string; // ISO 8601 date
  /** Error message if failed */
  error?: string;
}

/**
 * AI processing metadata
 * Used for AI-powered features (summarization, entity extraction, etc.)
 */
export interface AIMetadata {
  /** Document summary */
  summary?: string;
  /** Extracted entities (people, places, organizations, etc.) */
  entities?: Array<{
    type: string;
    value: string;
    confidence: number;
  }>;
  /** Detected topics/categories */
  topics?: string[];
  /** Sentiment analysis */
  sentiment?: "positive" | "negative" | "neutral";
  /** When AI processing was completed */
  processedAt?: string; // ISO 8601 date
  /** AI model used */
  model?: string;
}

/**
 * Processing metadata container
 * Tracks various processing operations on the file
 */
export interface ProcessingMetadata {
  ocr?: OCRMetadata;
  ai?: AIMetadata;
}

// ============================================================
// Document-Specific Metadata
// ============================================================

/**
 * PDF-specific metadata
 */
export interface PDFMetadata {
  /** Number of pages */
  pageCount?: number;
  /** PDF version (e.g., "1.4", "1.7", "2.0") */
  version?: string;
  /** Whether PDF has text layer (searchable) */
  isSearchable?: boolean;
  /** Whether PDF has form fields */
  hasForm?: boolean;
  /** Whether PDF has digital signature */
  hasSignature?: boolean;
  /** Whether PDF is encrypted */
  isEncrypted?: boolean;
  /** Document permissions (print, copy, edit) */
  permissions?: {
    print?: boolean;
    copy?: boolean;
    edit?: boolean;
  };
}

/**
 * Office document metadata
 */
export interface OfficeDocumentMetadata {
  /** Number of pages (Word) or sheets (Excel) or slides (PowerPoint) */
  pageCount?: number;
  sheetCount?: number;
  slideCount?: number;
  /** Word count (Word documents) */
  wordCount?: number;
  /** Original author from document metadata */
  author?: string;
  /** Original creation date from document metadata */
  createdDate?: string; // ISO 8601 date
  /** Last modified date from document metadata */
  lastModifiedDate?: string; // ISO 8601 date
  /** Document language */
  language?: string;
  /** Whether document has comments */
  hasComments?: boolean;
  /** Whether document has macros (security flag) */
  hasMacros?: boolean;
  /** Whether document is password protected */
  isPasswordProtected?: boolean;
}

/**
 * Image metadata
 */
export interface ImageMetadata {
  /** EXIF data from camera */
  exif?: {
    camera?: string;
    lens?: string;
    focalLength?: number;
    aperture?: number;
    iso?: number;
    shutterSpeed?: string;
    dateTaken?: string; // ISO 8601 date
    gps?: {
      latitude: number;
      longitude: number;
      altitude?: number;
    };
  };
  /** Color profile */
  colorProfile?: "sRGB" | "Adobe RGB" | "ProPhoto RGB" | "Display P3";
  /** Whether image has transparency */
  hasAlpha?: boolean;
  /** Detected faces (for ML features) */
  faces?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    confidence?: number;
  }>;
}

/**
 * Video metadata
 */
export interface VideoMetadata {
  /** Frames per second */
  fps?: number;
  /** Video codec */
  codec?: string;
  /** Resolution label */
  resolution?: "480p" | "720p" | "1080p" | "1440p" | "2160p" | "4K" | "8K";
  /** Aspect ratio */
  aspectRatio?: "16:9" | "4:3" | "21:9" | "1:1";
  /** Bitrate in kbps */
  bitrate?: number;
  /** Audio codec */
  audioCodec?: string;
  /** Subtitle tracks */
  subtitles?: Array<{
    language: string;
    label?: string;
  }>;
  /** Chapter markers */
  chapters?: Array<{
    title: string;
    startTime: number; // seconds
  }>;
}

/**
 * Audio metadata
 */
export interface AudioMetadata {
  /** Audio bitrate in kbps */
  bitrate?: number;
  /** Sample rate in Hz */
  sampleRate?: number;
  /** Number of channels */
  channels?: 1 | 2 | 6 | 8; // mono, stereo, 5.1, 7.1
  /** Codec */
  codec?: string;
  /** Music metadata */
  music?: {
    artist?: string;
    album?: string;
    track?: number;
    year?: number;
    genre?: string;
  };
}

// ============================================================
// Root Metadata Schema
// ============================================================

/**
 * Complete file metadata schema
 * This is the shape of the `storageMetadata` JSON field in FilePayload
 */
export interface FileMetadata {
  /** External provider integrations (Google Drive, OnlyOffice, etc.) */
  externalProviders?: ExternalProviders;

  /** Processing metadata (OCR, AI, etc.) */
  processing?: ProcessingMetadata;

  /** Document-specific metadata */
  document?: {
    pdf?: PDFMetadata;
    office?: OfficeDocumentMetadata;
  };

  /** Media-specific metadata */
  media?: {
    image?: ImageMetadata;
    video?: VideoMetadata;
    audio?: AudioMetadata;
  };

  /** Custom application-specific metadata */
  custom?: Record<string, unknown>;
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Parse and validate metadata from JSON
 * Returns typed metadata object with defaults
 */
export function getMetadata(json: unknown): FileMetadata {
  if (!json || typeof json !== "object") {
    return {};
  }
  return json as FileMetadata;
}

/**
 * Merge new metadata with existing metadata
 * Deep merges objects, preserving existing data
 */
export function setMetadata(
  existing: unknown,
  updates: Partial<FileMetadata>
): FileMetadata {
  const current = getMetadata(existing);
  return deepMerge(current, updates);
}

/**
 * Check if file has Google Drive integration
 */
export function hasGoogleDriveIntegration(
  metadata: unknown
): metadata is FileMetadata & {
  externalProviders: { googleDrive: GoogleDriveMetadata };
} {
  const meta = getMetadata(metadata);
  return !!meta.externalProviders?.googleDrive?.fileId;
}

/**
 * Get Google Drive file ID if exists
 */
export function getGoogleDriveFileId(metadata: unknown): string | null {
  const meta = getMetadata(metadata);
  return meta.externalProviders?.googleDrive?.fileId || null;
}

/**
 * Set Google Drive integration metadata
 */
export function setGoogleDriveMetadata(
  existing: unknown,
  driveData: GoogleDriveMetadata
): FileMetadata {
  return setMetadata(existing, {
    externalProviders: {
      googleDrive: driveData,
    },
  });
}
