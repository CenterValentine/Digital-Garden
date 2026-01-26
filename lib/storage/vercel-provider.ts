/**
 * Vercel Blob Storage Provider
 *
 * Uses Vercel's native blob storage API
 * Simpler API but more expensive egress fees
 */

import { put, head, del, copy } from '@vercel/blob';
import type {
  StorageProvider,
  PresignedUrl,
  FileVerification,
} from './types';

/**
 * Vercel Blob Provider Configuration
 */
interface VercelBlobConfig {
  token: string;
}

/**
 * Vercel Blob Storage Provider Implementation
 */
export class VercelBlobProvider implements StorageProvider {
  private token: string;

  constructor(config: VercelBlobConfig) {
    this.token = config.token;
  }

  /**
   * Generate presigned URL for client-side upload
   *
   * Note: Vercel Blob uses a different approach - we generate a unique upload URL
   */
  async generateUploadUrl(
    key: string,
    mimeType: string,
    expiresIn: number = 3600
  ): Promise<PresignedUrl> {
    // Vercel Blob doesn't use traditional presigned URLs
    // Instead, we return instructions for the client to use the Vercel Blob client library
    // For now, we'll use a POST approach where the client uploads via our API

    // Generate a unique upload token (you could store this in Redis for verification)
    const uploadToken = Buffer.from(JSON.stringify({
      key,
      mimeType,
      expiresAt: Date.now() + (expiresIn * 1000),
    })).toString('base64url');

    return {
      url: `/api/content/content/upload/vercel-proxy?token=${uploadToken}`,
      method: 'POST',
      headers: {
        'Content-Type': mimeType,
      },
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  /**
   * Generate presigned URL for download
   *
   * Vercel Blob URLs are already accessible, just return the blob URL
   */
  async generateDownloadUrl(
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    // Vercel Blob URLs are permanent, but we could add expiration via API proxy
    // For now, return the direct blob URL
    const blob = await head(key, { token: this.token });
    return blob.url;
  }

  /**
   * Verify file exists and get metadata
   */
  async verifyFileExists(key: string): Promise<FileVerification> {
    try {
      const blob = await head(key, { token: this.token });

      return {
        exists: true,
        size: blob.size,
        mimeType: blob.contentType,
        // Vercel Blob doesn't provide ETags in the same way
      };
    } catch (error: any) {
      if (error.message?.includes('not found') || error.status === 404) {
        return { exists: false };
      }
      throw error;
    }
  }

  /**
   * Get public URL for a file
   * Vercel Blob URLs are public by default
   */
  getPublicUrl(key: string): string | null {
    // Vercel Blob URLs are in format: https://[hash].public.blob.vercel-storage.com/[key]
    // We need to fetch the blob to get the actual URL
    // Return null here and use generateDownloadUrl instead
    return null;
  }

  /**
   * Delete file from Vercel Blob
   */
  async deleteFile(key: string): Promise<void> {
    await del(key, { token: this.token });
  }

  /**
   * Copy file to new location
   */
  async copyFile(sourceKey: string, destKey: string): Promise<void> {
    await copy(sourceKey, destKey, { token: this.token, access: 'public' });
  }

  /**
   * Get file as readable stream
   *
   * Vercel Blob requires fetching the URL first, then streaming
   */
  async getFileStream(key: string): Promise<ReadableStream> {
    const blob = await head(key, { token: this.token });
    const response = await fetch(blob.url);

    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${key}`);
    }

    if (!response.body) {
      throw new Error(`No body in response for file: ${key}`);
    }

    return response.body;
  }

  /**
   * Upload file directly from server (for thumbnails, processed files)
   * Implements StorageProvider interface
   */
  async uploadFile(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    const blob = await put(key, buffer, {
      token: this.token,
      contentType: mimeType,
      access: 'public',
    });

    return blob.url;
  }
}

/**
 * Create Vercel Blob provider from environment variables
 */
export function createVercelBlobProviderFromEnv(): VercelBlobProvider {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (!token) {
    throw new Error('Missing BLOB_READ_WRITE_TOKEN in environment variables');
  }

  return new VercelBlobProvider({ token });
}
