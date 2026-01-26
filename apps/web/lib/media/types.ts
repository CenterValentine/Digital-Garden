/**
 * Media Processing Types
 *
 * Defines interfaces for extracting metadata and generating thumbnails
 * from images, videos, PDFs, and audio files
 */

/**
 * Image metadata extracted from uploaded images
 */
export interface ImageMetadata {
  width: number;
  height: number;
  format: string; // 'jpeg', 'png', 'webp', etc.
  size: number; // File size in bytes
  thumbnails: {
    small: string; // 150x150 thumbnail URL
    large: string; // 300x300 thumbnail URL
  };
}

/**
 * Video metadata extracted from uploaded videos
 */
export interface VideoMetadata {
  width: number;
  height: number;
  duration: number; // Duration in seconds
  format: string; // 'mp4', 'webm', etc.
  codec: string; // 'h264', 'vp9', etc.
  size: number;
  thumbnail: string; // First frame thumbnail URL
}

/**
 * PDF metadata extracted from uploaded PDFs
 */
export interface PDFMetadata {
  pageCount: number;
  size: number;
  thumbnail: string; // First page thumbnail URL
  author?: string;
  title?: string;
  createdDate?: string;
}

/**
 * Audio metadata extracted from uploaded audio files
 */
export interface AudioMetadata {
  duration: number; // Duration in seconds
  format: string; // 'mp3', 'wav', etc.
  bitrate: number;
  size: number;
  waveformUrl?: string; // Optional waveform visualization
}

/**
 * Generic file metadata (fallback for unsupported types)
 */
export interface GenericFileMetadata {
  size: number;
  mimeType: string;
}

/**
 * Union type of all possible metadata results
 */
export type MediaMetadata =
  | ImageMetadata
  | VideoMetadata
  | PDFMetadata
  | AudioMetadata
  | GenericFileMetadata;

/**
 * Processing options for media files
 */
export interface ProcessingOptions {
  /** Generate thumbnails? */
  generateThumbnails?: boolean;

  /** Thumbnail sizes (default: [150, 300]) */
  thumbnailSizes?: number[];

  /** Quality for JPEG thumbnails (0-100) */
  thumbnailQuality?: number;

  /** Extract detailed metadata? */
  extractMetadata?: boolean;
}

/**
 * Processing result with metadata and storage keys
 */
export interface ProcessingResult {
  metadata: MediaMetadata;
  thumbnailKeys: string[]; // Storage keys for uploaded thumbnails
}
