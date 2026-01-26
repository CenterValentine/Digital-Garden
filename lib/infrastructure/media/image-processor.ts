/**
 * Image Processing with Sharp
 *
 * Extracts dimensions, generates thumbnails
 * Supports: JPEG, PNG, WebP, GIF, SVG, AVIF
 */

import sharp from 'sharp';
import type { StorageProvider } from '@/lib/infrastructure/storage';
import type { ImageMetadata, ProcessingOptions, ProcessingResult } from './types';

/**
 * Image Processor
 * Handles dimension extraction and thumbnail generation
 */
export class ImageProcessor {
  constructor(private storageProvider: StorageProvider) {}

  /**
   * Process an uploaded image
   *
   * @param storageKey - Storage key of the uploaded image
   * @param options - Processing options
   * @returns Image metadata with thumbnail URLs
   */
  async processImage(
    storageKey: string,
    options: ProcessingOptions = {}
  ): Promise<ProcessingResult> {
    const {
      generateThumbnails = true,
      thumbnailSizes = [150, 300],
      thumbnailQuality = 85,
    } = options;

    try {
      // Download image from storage
      const stream = await this.storageProvider.getFileStream(storageKey);
      const buffer = await this.streamToBuffer(stream);

      // Load with Sharp
      const image = sharp(buffer);
      const metadata = await image.metadata();

      if (!metadata.width || !metadata.height) {
        throw new Error('Could not extract image dimensions');
      }

      // Generate thumbnails if requested
      const thumbnails: { small: string; large: string } = {
        small: '',
        large: '',
      };
      const thumbnailKeys: string[] = [];

      if (generateThumbnails) {
        for (let i = 0; i < thumbnailSizes.length; i++) {
          const size = thumbnailSizes[i];
          const thumbnailKey = this.getThumbnailKey(storageKey, size);

          // Generate thumbnail
          const thumbnailBuffer = await image
            .clone()
            .resize(size, size, {
              fit: 'cover',
              position: 'center',
            })
            .jpeg({ quality: thumbnailQuality })
            .toBuffer();

          // Upload thumbnail to storage
          await this.uploadThumbnail(thumbnailKey, thumbnailBuffer);
          thumbnailKeys.push(thumbnailKey);

          // Generate download URL
          const thumbnailUrl = await this.storageProvider.generateDownloadUrl(
            thumbnailKey,
            86400 // 24 hours
          );

          if (size === 150) {
            thumbnails.small = thumbnailUrl;
          } else if (size === 300) {
            thumbnails.large = thumbnailUrl;
          }
        }
      }

      const imageMetadata: ImageMetadata = {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format || 'unknown',
        size: buffer.length,
        thumbnails,
      };

      return {
        metadata: imageMetadata,
        thumbnailKeys,
      };
    } catch (error) {
      console.error('Image processing failed:', error);
      throw new Error(`Failed to process image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert ReadableStream to Buffer
   */
  private async streamToBuffer(stream: ReadableStream): Promise<Buffer> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    return Buffer.concat(chunks);
  }

  /**
   * Generate thumbnail storage key
   */
  private getThumbnailKey(originalKey: string, size: number): string {
    const lastDot = originalKey.lastIndexOf('.');
    const baseName = originalKey.substring(0, lastDot);
    const extension = originalKey.substring(lastDot);

    return `${baseName}-thumb-${size}${extension}`;
  }

  /**
   * Upload thumbnail to storage
   * Uses direct upload since thumbnails are small and generated server-side
   */
  private async uploadThumbnail(key: string, buffer: Buffer): Promise<string> {
    return await this.storageProvider.uploadFile(key, buffer, 'image/jpeg');
  }
}

/**
 * Helper: Create image processor from default storage provider
 */
export async function createImageProcessor(): Promise<ImageProcessor> {
  const { getDefaultStorageProvider } = await import('@/lib/infrastructure/storage');
  const storageProvider = getDefaultStorageProvider();
  return new ImageProcessor(storageProvider);
}
