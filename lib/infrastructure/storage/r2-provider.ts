/**
 * Cloudflare R2 Storage Provider
 *
 * Uses AWS S3 SDK (R2 is S3-compatible)
 * Features: Zero egress fees, presigned URLs, private by default
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  StorageProvider,
  PresignedUrl,
  FileVerification,
} from './types';

/**
 * R2 Provider Configuration
 */
interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
}

/**
 * Cloudflare R2 Storage Provider Implementation
 */
export class R2StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucketName: string;

  constructor(config: R2Config) {
    this.bucketName = config.bucketName;

    // Initialize S3 client with R2 endpoint
    this.client = new S3Client({
      region: 'auto', // R2 uses 'auto' for region
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  /**
   * Generate presigned URL for client-side upload
   */
  async generateUploadUrl(
    key: string,
    mimeType: string,
    expiresIn: number = 3600
  ): Promise<PresignedUrl> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: mimeType,
      // Security headers
      ServerSideEncryption: 'AES256',
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });

    return {
      url,
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
      },
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  /**
   * Generate presigned URL for download
   */
  async generateDownloadUrl(
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return await getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Verify file exists and get metadata
   */
  async verifyFileExists(key: string): Promise<FileVerification> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.client.send(command);

      return {
        exists: true,
        size: response.ContentLength,
        etag: response.ETag?.replace(/"/g, ''), // Remove quotes from ETag
        mimeType: response.ContentType,
      };
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return { exists: false };
      }
      throw error;
    }
  }

  /**
   * Get public URL (R2 files are private by default)
   * Returns null - use generateDownloadUrl instead
   */
  getPublicUrl(key: string): string | null {
    // R2 files are private by default
    // If you configure R2 custom domain with public access, implement here
    return null;
  }

  /**
   * Delete file from R2
   */
  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.client.send(command);
  }

  /**
   * Copy file to new location (for deduplication)
   */
  async copyFile(sourceKey: string, destKey: string): Promise<void> {
    const command = new CopyObjectCommand({
      Bucket: this.bucketName,
      CopySource: `${this.bucketName}/${sourceKey}`,
      Key: destKey,
    });

    await this.client.send(command);
  }

  /**
   * Get file as readable stream (for media processing)
   */
  async getFileStream(key: string): Promise<ReadableStream> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const response = await this.client.send(command);

    if (!response.Body) {
      throw new Error(`File not found: ${key}`);
    }

    // Convert Node.js readable stream to Web ReadableStream
    return response.Body.transformToWebStream();
  }

  /**
   * Upload file directly from server (for thumbnails, processed files)
   */
  async uploadFile(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      ServerSideEncryption: 'AES256',
    });

    await this.client.send(command);

    // Return a presigned download URL (7 days max for R2)
    return await this.generateDownloadUrl(key, 604800); // 7 days = 604800 seconds
  }
}

/**
 * Create R2 provider from environment variables
 * Used for testing and default configuration
 */
export function createR2ProviderFromEnv(): R2StorageProvider {
  const config: R2Config = {
    accountId: process.env.R2_ACCOUNT_ID!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    bucketName: process.env.R2_BUCKET_NAME!,
    endpoint: process.env.R2_ENDPOINT!,
  };

  // Validate required config
  if (!config.accessKeyId || !config.secretAccessKey || !config.bucketName || !config.endpoint) {
    throw new Error('Missing R2 configuration in environment variables');
  }

  return new R2StorageProvider(config);
}
