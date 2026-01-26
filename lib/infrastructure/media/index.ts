/**
 * Media Processing Coordinator
 *
 * Routes files to appropriate processor based on MIME type
 * Supports: Images, Videos, PDFs, Documents
 */

import type { StorageProvider } from '@/lib/infrastructure/storage';
import { ImageProcessor } from './image-processor';
import { PDFProcessor } from './pdf-processor';
import type { ProcessingOptions, ProcessingResult } from './types';

/**
 * Media Processor
 * Coordinates processing across different media types
 */
export class MediaProcessor {
  private imageProcessor: ImageProcessor;
  private videoProcessor: any = null;
  private pdfProcessor: PDFProcessor;

  constructor(private storageProvider: StorageProvider) {
    this.imageProcessor = new ImageProcessor(storageProvider);
    this.pdfProcessor = new PDFProcessor(storageProvider);
    // Video processor loaded lazily to avoid FFmpeg bundling issues
  }

  /**
   * Process uploaded media file
   *
   * @param storageKey - Storage key of the uploaded file
   * @param mimeType - MIME type of the file
   * @param options - Processing options
   * @returns Processing result with metadata and thumbnail URLs
   */
  async processMedia(
    storageKey: string,
    mimeType: string,
    options: ProcessingOptions = {}
  ): Promise<ProcessingResult | null> {
    // Determine processor based on MIME type
    if (this.isImage(mimeType)) {
      return await this.imageProcessor.processImage(storageKey, options);
    }

    if (this.isVideo(mimeType)) {
      // Lazy load video processor to avoid FFmpeg bundling issues with Next.js
      if (!this.videoProcessor) {
        const { VideoProcessor } = await import('./video-processor');
        this.videoProcessor = new VideoProcessor(this.storageProvider);
      }
      return await this.videoProcessor.processVideo(storageKey, options);
    }

    if (this.isPDF(mimeType)) {
      return await this.pdfProcessor.processPDF(storageKey, options);
    }

    // Documents and other files: no processing needed
    // They'll be stored as-is and FilePayload will just have storage metadata
    return null;
  }

  /**
   * Check if MIME type is an image
   */
  private isImage(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  /**
   * Check if MIME type is a video
   */
  private isVideo(mimeType: string): boolean {
    return mimeType.startsWith('video/');
  }

  /**
   * Check if MIME type is a PDF
   */
  private isPDF(mimeType: string): boolean {
    return mimeType === 'application/pdf';
  }

  /**
   * Get supported media types
   */
  static getSupportedTypes(): {
    images: string[];
    videos: string[];
    documents: string[];
  } {
    return {
      images: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml',
        'image/avif',
      ],
      videos: [
        'video/mp4',
        'video/webm',
        'video/quicktime',
        'video/x-msvideo', // AVI
        'video/x-matroska', // MKV
      ],
      documents: [
        'application/pdf',
        'application/msword', // .doc
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
        'application/vnd.ms-excel', // .xls
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'text/plain',
        'text/markdown',
        'application/json',
      ],
    };
  }
}

/**
 * Helper: Create media processor from default storage provider
 */
export async function createMediaProcessor(): Promise<MediaProcessor> {
  const { getDefaultStorageProvider } = await import('@/lib/infrastructure/storage');
  const storageProvider = getDefaultStorageProvider();
  return new MediaProcessor(storageProvider);
}

// Re-export types
export type {
  ImageMetadata,
  VideoMetadata,
  PDFMetadata,
  ProcessingOptions,
  ProcessingResult,
} from './types';

// Re-export individual processors for direct use if needed
export { ImageProcessor } from './image-processor';
// VideoProcessor exported via lazy loading to avoid FFmpeg bundling issues
export { PDFProcessor } from './pdf-processor';
