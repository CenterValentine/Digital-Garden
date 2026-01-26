/**
 * PDF Processing with PDF.js
 *
 * Extracts page count and metadata
 * Generates first-page thumbnail
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { Canvas, createCanvas } from 'canvas';
import type { StorageProvider } from '@/lib/infrastructure/storage';
import type { PDFMetadata, ProcessingOptions, ProcessingResult } from './types';

// Note: PDF.js requires a worker, but in Node.js we don't need it
// We're using the legacy build which works in Node

/**
 * PDF Processor
 * Handles PDF metadata extraction and thumbnail generation
 */
export class PDFProcessor {
  constructor(private storageProvider: StorageProvider) {}

  /**
   * Process an uploaded PDF
   *
   * @param storageKey - Storage key of the uploaded PDF
   * @param options - Processing options
   * @returns PDF metadata with thumbnail URL
   */
  async processPDF(
    storageKey: string,
    options: ProcessingOptions = {}
  ): Promise<ProcessingResult> {
    const { generateThumbnails = true } = options;

    try {
      // Download PDF from storage
      const stream = await this.storageProvider.getFileStream(storageKey);
      const buffer = await this.streamToBuffer(stream);

      // Load PDF with PDF.js
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
      });

      const pdf = await loadingTask.promise;

      // Extract metadata
      const metadata = await pdf.getMetadata();
      const pageCount = pdf.numPages;

      let thumbnailUrl = '';
      const thumbnailKeys: string[] = [];

      // Generate thumbnail from first page if requested
      if (generateThumbnails && pageCount > 0) {
        const thumbnailBuffer = await this.generatePDFThumbnail(pdf);
        const thumbnailKey = this.getThumbnailKey(storageKey);
        thumbnailUrl = await this.uploadThumbnail(thumbnailKey, thumbnailBuffer);

        thumbnailKeys.push(thumbnailKey);
      }

      const info = metadata.info as Record<string, any> | undefined;
      const pdfMetadata: PDFMetadata = {
        pageCount,
        size: buffer.length,
        thumbnail: thumbnailUrl,
        author: info?.Author || undefined,
        title: info?.Title || undefined,
        createdDate: info?.CreationDate || undefined,
      };

      return {
        metadata: pdfMetadata,
        thumbnailKeys,
      };
    } catch (error) {
      console.error('PDF processing failed:', error);
      throw new Error(`Failed to process PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate thumbnail from first page of PDF
   */
  private async generatePDFThumbnail(pdf: any): Promise<Buffer> {
    // Get first page
    const page = await pdf.getPage(1);

    // Calculate scale to fit 300px width
    const viewport = page.getViewport({ scale: 1.0 });
    const scale = 300 / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    // Create canvas
    const canvas = createCanvas(scaledViewport.width, scaledViewport.height);
    const context = canvas.getContext('2d');

    // Render PDF page to canvas
    await page.render({
      canvasContext: context,
      viewport: scaledViewport,
    }).promise;

    // Convert canvas to JPEG buffer
    return canvas.toBuffer('image/jpeg', { quality: 0.85 });
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
 * Helper: Create PDF processor from default storage provider
 */
export async function createPDFProcessor(): Promise<PDFProcessor> {
  const { getDefaultStorageProvider } = await import('@/lib/infrastructure/storage');
  const storageProvider = getDefaultStorageProvider();
  return new PDFProcessor(storageProvider);
}
