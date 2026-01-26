/**
 * Video Processing with FFmpeg
 *
 * Extracts duration, dimensions, codec info
 * Generates first-frame thumbnail
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { StorageProvider } from '@/lib/storage';
import type { VideoMetadata, ProcessingOptions, ProcessingResult } from './types';

// Lazy load FFmpeg to avoid bundling issues with Next.js
let ffmpeg: any = null;
let ffmpegInstaller: any = null;

async function ensureFFmpeg() {
  if (!ffmpeg) {
    ffmpeg = (await import('fluent-ffmpeg')).default;
    ffmpegInstaller = (await import('@ffmpeg-installer/ffmpeg')).default;
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  }
  return ffmpeg;
}

/**
 * Video Processor
 * Handles video metadata extraction and thumbnail generation
 */
export class VideoProcessor {
  constructor(private storageProvider: StorageProvider) {}

  /**
   * Process an uploaded video
   *
   * @param storageKey - Storage key of the uploaded video
   * @param options - Processing options
   * @returns Video metadata with thumbnail URL
   */
  async processVideo(
    storageKey: string,
    options: ProcessingOptions = {}
  ): Promise<ProcessingResult> {
    const { generateThumbnails = true } = options;

    // Create temp directory for processing
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-'));
    const tempVideoPath = path.join(tempDir, 'video.mp4');
    const tempThumbnailPath = path.join(tempDir, 'thumbnail.jpg');

    try {
      // Download video from storage to temp file
      const stream = await this.storageProvider.getFileStream(storageKey);
      await this.streamToFile(stream, tempVideoPath);

      // Extract metadata using FFprobe
      const metadata = await this.extractVideoMetadata(tempVideoPath);

      let thumbnailUrl = '';
      const thumbnailKeys: string[] = [];

      // Generate thumbnail if requested
      if (generateThumbnails) {
        await this.generateVideoThumbnail(tempVideoPath, tempThumbnailPath);

        // Upload thumbnail to storage
        const thumbnailKey = this.getThumbnailKey(storageKey);
        const thumbnailBuffer = await fs.readFile(tempThumbnailPath);
        thumbnailUrl = await this.uploadThumbnail(thumbnailKey, thumbnailBuffer);

        thumbnailKeys.push(thumbnailKey);
      }

      const videoMetadata: VideoMetadata = {
        width: metadata.width,
        height: metadata.height,
        duration: metadata.duration,
        format: metadata.format,
        codec: metadata.codec,
        size: metadata.size,
        thumbnail: thumbnailUrl,
      };

      return {
        metadata: videoMetadata,
        thumbnailKeys,
      };
    } finally {
      // Cleanup temp files
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Extract video metadata using FFprobe
   */
  private async extractVideoMetadata(videoPath: string): Promise<{
    width: number;
    height: number;
    duration: number;
    format: string;
    codec: string;
    size: number;
  }> {
    const ffmpegInstance = await ensureFFmpeg();

    return new Promise((resolve, reject) => {
      ffmpegInstance.ffprobe(videoPath, (err: any, metadata: any) => {
        if (err) {
          reject(new Error(`FFprobe failed: ${err.message}`));
          return;
        }

        const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
        if (!videoStream) {
          reject(new Error('No video stream found'));
          return;
        }

        const stats = require('fs').statSync(videoPath);

        resolve({
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          duration: metadata.format.duration || 0,
          format: metadata.format.format_name || 'unknown',
          codec: videoStream.codec_name || 'unknown',
          size: stats.size,
        });
      });
    });
  }

  /**
   * Generate thumbnail from first frame of video
   */
  private async generateVideoThumbnail(
    videoPath: string,
    outputPath: string
  ): Promise<void> {
    const ffmpegInstance = await ensureFFmpeg();

    return new Promise((resolve, reject) => {
      ffmpegInstance(videoPath)
        .screenshots({
          timestamps: ['00:00:01'], // 1 second into video
          filename: path.basename(outputPath),
          folder: path.dirname(outputPath),
          size: '300x?', // Width 300, height auto
        })
        .on('end', () => resolve())
        .on('error', (err: any) => reject(new Error(`Thumbnail generation failed: ${err.message}`)));
    });
  }

  /**
   * Convert ReadableStream to file
   */
  private async streamToFile(stream: ReadableStream, filePath: string): Promise<void> {
    const reader = stream.getReader();
    const writer = await fs.open(filePath, 'w');

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
    } finally {
      await writer.close();
    }
  }

  /**
   * Generate thumbnail storage key
   */
  private getThumbnailKey(originalKey: string): string {
    const lastDot = originalKey.lastIndexOf('.');
    const baseName = originalKey.substring(0, lastDot);
    return `${baseName}-thumb.jpg`;
  }

  /**
   * Upload thumbnail to storage
   */
  private async uploadThumbnail(key: string, buffer: Buffer): Promise<string> {
    return await this.storageProvider.uploadFile(key, buffer, 'image/jpeg');
  }
}

/**
 * Helper: Create video processor from default storage provider
 */
export async function createVideoProcessor(): Promise<VideoProcessor> {
  const { getDefaultStorageProvider } = await import('@/lib/storage');
  const storageProvider = getDefaultStorageProvider();
  return new VideoProcessor(storageProvider);
}
