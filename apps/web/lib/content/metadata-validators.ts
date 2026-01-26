/**
 * Metadata Schema Validators
 *
 * Runtime validation for FilePayload metadata using Zod.
 * Provides type-safe parsing and validation of JSON metadata.
 *
 * Usage:
 * ```typescript
 * import { validateMetadata, GoogleDriveMetadataSchema } from '@/lib/content/metadata-validators';
 *
 * // Validate metadata from database
 * const result = validateMetadata(filePayload.storageMetadata);
 * if (result.success) {
 *   console.log(result.data); // Typed FileMetadata
 * }
 *
 * // Validate specific schema
 * const driveData = GoogleDriveMetadataSchema.parse({
 *   fileId: 'abc123',
 *   lastSynced: new Date().toISOString(),
 * });
 * ```
 */

import { z } from "zod";

// ============================================================
// External Provider Schemas
// ============================================================

export const GoogleDriveMetadataSchema = z.object({
  fileId: z.string().min(1),
  lastSynced: z.string().datetime(),
  webViewUrl: z.string().url().optional(),
  editUrl: z.string().url().optional(),
  googleMimeType: z.string().optional(),
});

export const OnlyOfficeMetadataSchema = z.object({
  sessionId: z.string().min(1),
  locked: z.boolean(),
  lockedBy: z.string().optional(),
  lockExpiry: z.string().datetime().optional(),
  serverUrl: z.string().url().optional(),
});

export const Office365MetadataSchema = z.object({
  fileId: z.string().min(1),
  lastSynced: z.string().datetime(),
  editUrl: z.string().url().optional(),
});

export const ExternalProvidersSchema = z.object({
  googleDrive: GoogleDriveMetadataSchema.optional(),
  onlyOffice: OnlyOfficeMetadataSchema.optional(),
  office365: Office365MetadataSchema.optional(),
});

// ============================================================
// Processing Schemas
// ============================================================

export const OCRMetadataSchema = z.object({
  status: z.enum(["pending", "processing", "completed", "failed"]),
  confidence: z.number().min(0).max(1).optional(),
  language: z.string().length(2).optional(), // ISO 639-1
  provider: z.enum(["tesseract", "google-vision", "aws-textract"]).optional(),
  completedAt: z.string().datetime().optional(),
  error: z.string().optional(),
});

export const AIMetadataSchema = z.object({
  summary: z.string().optional(),
  entities: z
    .array(
      z.object({
        type: z.string(),
        value: z.string(),
        confidence: z.number().min(0).max(1),
      })
    )
    .optional(),
  topics: z.array(z.string()).optional(),
  sentiment: z.enum(["positive", "negative", "neutral"]).optional(),
  processedAt: z.string().datetime().optional(),
  model: z.string().optional(),
});

export const ProcessingMetadataSchema = z.object({
  ocr: OCRMetadataSchema.optional(),
  ai: AIMetadataSchema.optional(),
});

// ============================================================
// Document Schemas
// ============================================================

export const PDFMetadataSchema = z.object({
  pageCount: z.number().int().positive().optional(),
  version: z.string().optional(),
  isSearchable: z.boolean().optional(),
  hasForm: z.boolean().optional(),
  hasSignature: z.boolean().optional(),
  isEncrypted: z.boolean().optional(),
  permissions: z
    .object({
      print: z.boolean().optional(),
      copy: z.boolean().optional(),
      edit: z.boolean().optional(),
    })
    .optional(),
});

export const OfficeDocumentMetadataSchema = z.object({
  pageCount: z.number().int().positive().optional(),
  sheetCount: z.number().int().positive().optional(),
  slideCount: z.number().int().positive().optional(),
  wordCount: z.number().int().nonnegative().optional(),
  author: z.string().optional(),
  createdDate: z.string().datetime().optional(),
  lastModifiedDate: z.string().datetime().optional(),
  language: z.string().optional(),
  hasComments: z.boolean().optional(),
  hasMacros: z.boolean().optional(),
  isPasswordProtected: z.boolean().optional(),
});

export const DocumentMetadataSchema = z.object({
  pdf: PDFMetadataSchema.optional(),
  office: OfficeDocumentMetadataSchema.optional(),
});

// ============================================================
// Media Schemas
// ============================================================

export const ImageMetadataSchema = z.object({
  exif: z
    .object({
      camera: z.string().optional(),
      lens: z.string().optional(),
      focalLength: z.number().optional(),
      aperture: z.number().optional(),
      iso: z.number().optional(),
      shutterSpeed: z.string().optional(),
      dateTaken: z.string().datetime().optional(),
      gps: z
        .object({
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
          altitude: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
  colorProfile: z
    .enum(["sRGB", "Adobe RGB", "ProPhoto RGB", "Display P3"])
    .optional(),
  hasAlpha: z.boolean().optional(),
  faces: z
    .array(
      z.object({
        x: z.number(),
        y: z.number(),
        width: z.number().positive(),
        height: z.number().positive(),
        confidence: z.number().min(0).max(1).optional(),
      })
    )
    .optional(),
});

export const VideoMetadataSchema = z.object({
  fps: z.number().positive().optional(),
  codec: z.string().optional(),
  resolution: z
    .enum(["480p", "720p", "1080p", "1440p", "2160p", "4K", "8K"])
    .optional(),
  aspectRatio: z.enum(["16:9", "4:3", "21:9", "1:1"]).optional(),
  bitrate: z.number().positive().optional(),
  audioCodec: z.string().optional(),
  subtitles: z
    .array(
      z.object({
        language: z.string(),
        label: z.string().optional(),
      })
    )
    .optional(),
  chapters: z
    .array(
      z.object({
        title: z.string(),
        startTime: z.number().nonnegative(),
      })
    )
    .optional(),
});

export const AudioMetadataSchema = z.object({
  bitrate: z.number().positive().optional(),
  sampleRate: z.number().positive().optional(),
  channels: z.union([z.literal(1), z.literal(2), z.literal(6), z.literal(8)]).optional(),
  codec: z.string().optional(),
  music: z
    .object({
      artist: z.string().optional(),
      album: z.string().optional(),
      track: z.number().int().positive().optional(),
      year: z.number().int().positive().optional(),
      genre: z.string().optional(),
    })
    .optional(),
});

export const MediaMetadataSchema = z.object({
  image: ImageMetadataSchema.optional(),
  video: VideoMetadataSchema.optional(),
  audio: AudioMetadataSchema.optional(),
});

// ============================================================
// Root Metadata Schema
// ============================================================

export const FileMetadataSchema = z.object({
  externalProviders: ExternalProvidersSchema.optional(),
  processing: ProcessingMetadataSchema.optional(),
  document: DocumentMetadataSchema.optional(),
  media: MediaMetadataSchema.optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================
// Validation Functions
// ============================================================

/**
 * Validate metadata with full schema
 * Returns typed result with success/error
 */
export function validateMetadata(data: unknown) {
  return FileMetadataSchema.safeParse(data);
}

/**
 * Validate and return metadata, throwing on error
 * Use when you expect metadata to be valid
 */
export function parseMetadata(data: unknown) {
  return FileMetadataSchema.parse(data);
}

/**
 * Validate Google Drive metadata specifically
 */
export function validateGoogleDriveMetadata(data: unknown) {
  return GoogleDriveMetadataSchema.safeParse(data);
}

/**
 * Validate OCR metadata specifically
 */
export function validateOCRMetadata(data: unknown) {
  return OCRMetadataSchema.safeParse(data);
}

/**
 * Check if metadata is valid without throwing
 */
export function isValidMetadata(data: unknown): boolean {
  return FileMetadataSchema.safeParse(data).success;
}

/**
 * Get validation errors in human-readable format
 */
export function getMetadataErrors(data: unknown): string[] {
  const result = FileMetadataSchema.safeParse(data);
  if (result.success) {
    return [];
  }

  return result.error.issues.map((err) => {
    const path = err.path.join(".");
    return `${path}: ${err.message}`;
  });
}

// ============================================================
// Type Exports
// ============================================================

export type GoogleDriveMetadata = z.infer<typeof GoogleDriveMetadataSchema>;
export type OnlyOfficeMetadata = z.infer<typeof OnlyOfficeMetadataSchema>;
export type Office365Metadata = z.infer<typeof Office365MetadataSchema>;
export type ExternalProviders = z.infer<typeof ExternalProvidersSchema>;
export type OCRMetadata = z.infer<typeof OCRMetadataSchema>;
export type AIMetadata = z.infer<typeof AIMetadataSchema>;
export type ProcessingMetadata = z.infer<typeof ProcessingMetadataSchema>;
export type PDFMetadata = z.infer<typeof PDFMetadataSchema>;
export type OfficeDocumentMetadata = z.infer<typeof OfficeDocumentMetadataSchema>;
export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;
export type ImageMetadata = z.infer<typeof ImageMetadataSchema>;
export type VideoMetadata = z.infer<typeof VideoMetadataSchema>;
export type AudioMetadata = z.infer<typeof AudioMetadataSchema>;
export type MediaMetadata = z.infer<typeof MediaMetadataSchema>;
export type FileMetadata = z.infer<typeof FileMetadataSchema>;
