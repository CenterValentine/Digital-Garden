/**
 * AWS S3 Storage Provider
 *
 * Standard AWS S3 implementation
 * Note: Has egress fees unlike R2
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
 * S3 Provider Configuration
 */
interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  region: string;
}

/**
 * AWS S3 Storage Provider Implementation
 */
export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucketName: string;
  private region: string;

  constructor(config: S3Config) {
    this.bucketName = config.bucketName;
    this.region = config.region;

    // Initialize S3 client with AWS endpoint
    this.client = new S3Client({
      region: config.region,
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
        etag: response.ETag?.replace(/"/g, ''),
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
   * Get public URL (if bucket has public access configured)
   * Returns null by default - use generateDownloadUrl instead
   */
  getPublicUrl(key: string): string | null {
    // S3 files are private by default
    // If you configure public access, uncomment:
    // return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
    return null;
  }

  /**
   * Delete file from S3
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

    // Return a presigned download URL (1 year expiration for thumbnails)
    return await this.generateDownloadUrl(key, 31536000);
  }
}

/**
 * Create S3 provider from environment variables
 */
export function createS3ProviderFromEnv(): S3StorageProvider {
  const config: S3Config = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    bucketName: process.env.AWS_S3_BUCKET_NAME!,
    region: process.env.AWS_S3_REGION || 'us-east-1',
  };

  if (!config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
    throw new Error('Missing S3 configuration in environment variables');
  }

  return new S3StorageProvider(config);
}
