/**
 * Document Text Extraction
 *
 * Extracts searchable text from various document formats
 * Supports: .txt, .md, .json, .pdf (via pdf2json), .docx (via mammoth)
 * Optional: Images (via Tesseract.js OCR)
 *
 * Future: .xlsx, .pptx can be added with libraries like xlsx, etc.
 */

import mammoth from 'mammoth';
import type { StorageProvider } from '@/lib/infrastructure/storage';

/**
 * Document Text Extractor
 * Extracts plain text from various document formats for search indexing
 */
export class DocumentExtractor {
  constructor(
    private storageProvider: StorageProvider,
    private enableOCR: boolean = false
  ) {}

  /**
   * Extract text from document file
   *
   * @param storageKey - Storage key of the document
   * @param mimeType - MIME type of the document
   * @returns Extracted plain text (up to 100KB for search indexing)
   */
  async extractText(storageKey: string, mimeType: string): Promise<string> {
    try {
      // Route to appropriate extractor based on MIME type
      if (this.isPlainText(mimeType)) {
        return await this.extractPlainText(storageKey);
      }

      if (this.isMarkdown(mimeType)) {
        return await this.extractMarkdown(storageKey);
      }

      if (this.isJSON(mimeType)) {
        return await this.extractJSON(storageKey);
      }

      if (this.isPDF(mimeType)) {
        return await this.extractPDFText(storageKey);
      }

      if (this.isDocx(mimeType)) {
        return await this.extractDocx(storageKey);
      }

      // Optional: Extract text from images using OCR
      if (this.enableOCR && this.isImage(mimeType)) {
        return await this.extractImageText(storageKey);
      }

      // Unsupported document type - return empty string
      // Future: Add support for .xlsx, .pptx, etc.
      return '';
    } catch (error) {
      console.error('Text extraction failed:', error);
      // Don't throw - return empty string if extraction fails
      return '';
    }
  }

  /**
   * Extract text from plain text files
   */
  private async extractPlainText(storageKey: string): Promise<string> {
    const stream = await this.storageProvider.getFileStream(storageKey);
    const buffer = await this.streamToBuffer(stream);
    const text = buffer.toString('utf-8');

    // Truncate to 100KB for search indexing
    return this.truncateText(text, 100_000);
  }

  /**
   * Extract text from Markdown files
   */
  private async extractMarkdown(storageKey: string): Promise<string> {
    const stream = await this.storageProvider.getFileStream(storageKey);
    const buffer = await this.streamToBuffer(stream);
    const text = buffer.toString('utf-8');

    // Strip markdown syntax for cleaner search results
    // Remove headers (#), links ([text](url)), images, code blocks, etc.
    let cleaned = text
      .replace(/^#{1,6}\s+/gm, '') // Headers
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // Images
      .replace(/```[\s\S]*?```/g, '') // Code blocks
      .replace(/`([^`]+)`/g, '$1') // Inline code
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold
      .replace(/\*([^*]+)\*/g, '$1') // Italic
      .replace(/~~([^~]+)~~/g, '$1') // Strikethrough
      .trim();

    return this.truncateText(cleaned, 100_000);
  }

  /**
   * Extract text from JSON files
   */
  private async extractJSON(storageKey: string): Promise<string> {
    const stream = await this.storageProvider.getFileStream(storageKey);
    const buffer = await this.streamToBuffer(stream);
    const text = buffer.toString('utf-8');

    try {
      // Parse JSON and extract values
      const json = JSON.parse(text);
      const values = this.extractJSONValues(json);
      return this.truncateText(values.join(' '), 100_000);
    } catch {
      // If JSON parsing fails, just return the raw text
      return this.truncateText(text, 100_000);
    }
  }

  /**
   * Extract text from PDF files
   */
  private async extractPDFText(storageKey: string): Promise<string> {
    const stream = await this.storageProvider.getFileStream(storageKey);
    const buffer = await this.streamToBuffer(stream);

    // Use pdf2json for reliable server-side PDF parsing
    const PDFParser = (await import('pdf2json')).default;

    return new Promise((resolve, reject) => {
      const pdfParser = new PDFParser();

      // Handle parsing completion
      pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
        try {
          // Extract text from all pages
          const text = pdfData.Pages?.map((page: any) =>
            page.Texts?.map((text: any) =>
              decodeURIComponent(text.R?.[0]?.T || '')
            ).join(' ')
          ).join('\n') || '';

          resolve(this.truncateText(text, 100_000));
        } catch (error) {
          reject(error);
        }
      });

      // Handle parsing errors
      pdfParser.on('pdfParser_dataError', (error: any) => {
        reject(new Error(error.parserError || 'PDF parsing failed'));
      });

      // Parse the buffer
      pdfParser.parseBuffer(buffer);
    });
  }

  /**
   * Extract text from .docx files
   */
  private async extractDocx(storageKey: string): Promise<string> {
    const stream = await this.storageProvider.getFileStream(storageKey);
    const buffer = await this.streamToBuffer(stream);

    // Extract raw text from .docx file
    const result = await mammoth.extractRawText({ buffer });

    return this.truncateText(result.value, 100_000);
  }

  /**
   * Extract text from images using OCR (Tesseract.js v5)
   *
   * DISABLED: Requires webpack configuration to copy Tesseract worker files
   * See: https://github.com/naptha/tesseract.js/issues/895
   */
  private async extractImageText(storageKey: string): Promise<string> {
    // TODO: Re-enable after configuring webpack CopyPlugin
    console.warn('[OCR] Image text extraction is disabled. Requires webpack configuration.');
    return '';

    /* Disabled OCR implementation - requires webpack config
    const stream = await this.storageProvider.getFileStream(storageKey);
    const buffer = await this.streamToBuffer(stream);

    try {
      // Dynamic import for Tesseract.js v5
      const { createWorker } = await import('tesseract.js');

      console.log('[OCR] Starting text extraction from image...');

      // Create worker (v5 syntax - simpler, no config needed)
      const worker = await createWorker('eng');

      // Recognize text from buffer
      const { data: { text } } = await worker.recognize(buffer);

      await worker.terminate();

      console.log('[OCR] Extraction complete. Text length:', text.length);

      return this.truncateText(text, 100_000);
    } catch (error) {
      console.error('[OCR] Extraction failed:', error);
      return '';
    }
    */
  }

  /**
   * Recursively extract all string values from JSON object
   */
  private extractJSONValues(obj: any, depth = 0): string[] {
    // Prevent infinite recursion
    if (depth > 10) return [];

    const values: string[] = [];

    if (typeof obj === 'string') {
      values.push(obj);
    } else if (Array.isArray(obj)) {
      for (const item of obj) {
        values.push(...this.extractJSONValues(item, depth + 1));
      }
    } else if (obj && typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        values.push(...this.extractJSONValues(obj[key], depth + 1));
      }
    }

    return values;
  }

  /**
   * Truncate text to specified byte length
   */
  private truncateText(text: string, maxBytes: number): string {
    const buffer = Buffer.from(text, 'utf-8');
    if (buffer.length <= maxBytes) {
      return text;
    }

    // Truncate at byte boundary
    return buffer.subarray(0, maxBytes).toString('utf-8');
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
   * Check if MIME type is plain text
   */
  private isPlainText(mimeType: string): boolean {
    return mimeType === 'text/plain';
  }

  /**
   * Check if MIME type is Markdown
   */
  private isMarkdown(mimeType: string): boolean {
    return mimeType === 'text/markdown' || mimeType === 'text/x-markdown';
  }

  /**
   * Check if MIME type is JSON
   */
  private isJSON(mimeType: string): boolean {
    return mimeType === 'application/json';
  }

  /**
   * Check if MIME type is PDF
   */
  private isPDF(mimeType: string): boolean {
    return mimeType === 'application/pdf';
  }

  /**
   * Check if MIME type is .docx
   */
  private isDocx(mimeType: string): boolean {
    return mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  /**
   * Check if MIME type is an image
   */
  private isImage(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  /**
   * Get list of supported document types for text extraction
   */
  static getSupportedTypes(includeImages = false): string[] {
    const baseTypes = [
      'text/plain',
      'text/markdown',
      'text/x-markdown',
      'application/json',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      // Future: Add .xlsx, .pptx support
      // 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    if (includeImages) {
      return [
        ...baseTypes,
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/gif',
        'image/bmp',
        'image/tiff',
        'image/webp',
      ];
    }

    return baseTypes;
  }
}

/**
 * Helper: Create document extractor from default storage provider
 */
export async function createDocumentExtractor(): Promise<DocumentExtractor> {
  const { getDefaultStorageProvider } = await import('@/lib/infrastructure/storage');
  const storageProvider = getDefaultStorageProvider();
  return new DocumentExtractor(storageProvider);
}
