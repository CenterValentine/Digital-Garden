/**
 * Storage Module Exports
 *
 * Central export point for all storage-related functionality
 */

// Types
export type {
  StorageProvider,
  PresignedUrl,
  FileVerification,
  StorageConfig,
  ProviderFactoryResult,
} from './types';

// Providers
export { R2StorageProvider, createR2ProviderFromEnv } from './r2-provider';
export { S3StorageProvider, createS3ProviderFromEnv } from './s3-provider';
export { VercelBlobProvider, createVercelBlobProviderFromEnv } from './vercel-provider';

// Factory
export {
  createStorageProvider,
  createStorageProviderFromEnv,
  getDefaultStorageProvider,
  getUserStorageProvider,
} from './factory';
