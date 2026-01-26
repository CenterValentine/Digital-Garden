/**
 * Storage Provider Types
 *
 * Defines the interface all storage providers must implement
 * Supports: R2, S3, Vercel Blob, Cloudinary
 */

/**
 * Presigned URL for client-side uploads
 * Different providers use different methods (PUT vs POST)
 */
export interface PresignedUrl {
  /** The URL to upload to */
  url: string;

  /** HTTP method to use (PUT for R2/S3, POST for some providers) */
  method: 'PUT' | 'POST';

  /** Headers to include in the upload request */
  headers?: Record<string, string>;

  /** Form fields for multipart POST uploads */
  fields?: Record<string, string>;

  /** When this presigned URL expires */
  expiresAt: Date;
}

/**
 * File verification result
 */
export interface FileVerification {
  /** Whether the file exists in storage */
  exists: boolean;

  /** File size in bytes */
  size?: number;

  /** ETag or checksum for verification */
  etag?: string;

  /** MIME type (if available) */
  mimeType?: string;
}

/**
 * Storage Provider Interface
 *
 * All storage providers (R2, S3, Vercel Blob) implement this interface
 */
export interface StorageProvider {
  /**
   * Generate a presigned URL for client-side upload
   *
   * @param key - Storage key (path) for the file
   * @param mimeType - MIME type of the file
   * @param expiresIn - Seconds until URL expires (default: 3600 = 1 hour)
   * @returns Presigned URL with upload instructions
   */
  generateUploadUrl(
    key: string,
    mimeType: string,
    expiresIn?: number
  ): Promise<PresignedUrl>;

  /**
   * Generate a presigned URL for file download
   *
   * @param key - Storage key (path) for the file
   * @param expiresIn - Seconds until URL expires (default: 3600 = 1 hour)
   * @returns Presigned download URL
   */
  generateDownloadUrl(key: string, expiresIn?: number): Promise<string>;

  /**
   * Verify that a file exists and get metadata
   *
   * @param key - Storage key (path) for the file
   * @returns Verification result with metadata
   */
  verifyFileExists(key: string): Promise<FileVerification>;

  /**
   * Get public URL for a file (if publicly accessible)
   * For private files, use generateDownloadUrl instead
   *
   * @param key - Storage key (path) for the file
   * @returns Public URL or null if not publicly accessible
   */
  getPublicUrl(key: string): string | null;

  /**
   * Delete a file from storage
   *
   * @param key - Storage key (path) for the file
   */
  deleteFile(key: string): Promise<void>;

  /**
   * Copy a file to a new location (for deduplication)
   *
   * @param sourceKey - Source file key
   * @param destKey - Destination file key
   */
  copyFile(sourceKey: string, destKey: string): Promise<void>;

  /**
   * Get a readable stream for the file (for media processing)
   *
   * @param key - Storage key (path) for the file
   * @returns Readable stream of file content
   */
  getFileStream(key: string): Promise<ReadableStream>;

  /**
   * Upload a file directly from server (for thumbnails, processed files)
   *
   * @param key - Storage key (path) for the file
   * @param buffer - File content as Buffer
   * @param mimeType - MIME type of the file
   * @returns Public or presigned URL to access the uploaded file
   */
  uploadFile(key: string, buffer: Buffer, mimeType: string): Promise<string>;
}

/**
 * Storage provider configuration (from database)
 */
export interface StorageConfig {
  /** Provider type */
  provider: 'r2' | 's3' | 'vercel' | 'cloudinary';

  /** Non-sensitive configuration (bucket, region, etc.) */
  config: {
    bucket?: string;
    region?: string;
    endpoint?: string;
    cdnUrl?: string;
  };

  /** Encrypted credentials (access keys, tokens) */
  credentials: {
    accessKeyId?: string;
    secretAccessKey?: string;
    token?: string;
    accountId?: string;
  };
}

/**
 * Storage provider factory result
 */
export interface ProviderFactoryResult {
  provider: StorageProvider;
  config: StorageConfig;
}
