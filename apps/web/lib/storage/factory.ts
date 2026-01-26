/**
 * Storage Provider Factory
 *
 * Creates storage provider instances based on configuration
 * Handles encryption/decryption of credentials
 */

import { R2StorageProvider, createR2ProviderFromEnv } from './r2-provider';
import { S3StorageProvider, createS3ProviderFromEnv } from './s3-provider';
import { VercelBlobProvider, createVercelBlobProviderFromEnv } from './vercel-provider';
import { decrypt } from '@/lib/crypto/encrypt';
import type { StorageProvider, StorageConfig } from './types';

/**
 * Create storage provider from database config
 *
 * @param config - Storage configuration from database (with encrypted credentials)
 * @returns Initialized storage provider
 */
export function createStorageProvider(config: StorageConfig): StorageProvider {
  // Decrypt credentials
  const credentials = decrypt(config.credentials as any) as Record<string, string>;

  switch (config.provider) {
    case 'r2':
      return new R2StorageProvider({
        accountId: credentials.accountId || '',
        accessKeyId: credentials.accessKeyId || '',
        secretAccessKey: credentials.secretAccessKey || '',
        bucketName: config.config.bucket || '',
        endpoint: config.config.endpoint || '',
      });

    case 's3':
      return new S3StorageProvider({
        accessKeyId: credentials.accessKeyId || '',
        secretAccessKey: credentials.secretAccessKey || '',
        bucketName: config.config.bucket || '',
        region: config.config.region || 'us-east-1',
      });

    case 'vercel':
      return new VercelBlobProvider({
        token: credentials.token || '',
      });

    default:
      throw new Error(`Unsupported storage provider: ${config.provider}`);
  }
}

/**
 * Create storage provider from environment variables
 * Used for default/fallback configuration
 *
 * @param provider - Provider type ('r2', 's3', 'vercel')
 * @returns Initialized storage provider
 */
export function createStorageProviderFromEnv(
  provider: 'r2' | 's3' | 'vercel' = 'r2'
): StorageProvider {
  switch (provider) {
    case 'r2':
      return createR2ProviderFromEnv();

    case 's3':
      return createS3ProviderFromEnv();

    case 'vercel':
      return createVercelBlobProviderFromEnv();

    default:
      throw new Error(`Unsupported storage provider: ${provider}`);
  }
}

/**
 * Get default storage provider from environment
 * Falls back to R2 if not specified
 */
export function getDefaultStorageProvider(): StorageProvider {
  const defaultProvider = (process.env.DEFAULT_STORAGE_PROVIDER || 'r2') as 'r2' | 's3' | 'vercel';
  return createStorageProviderFromEnv(defaultProvider);
}

/**
 * Get storage provider for a specific user
 * Checks database for user's configuration, falls back to env default
 *
 * @param userId - User ID to get storage provider for
 * @param providerType - Optional specific provider to use (overrides default)
 * @returns Storage provider instance
 */
export async function getUserStorageProvider(
  userId: string,
  providerType?: 'r2' | 's3' | 'vercel'
): Promise<StorageProvider> {
  // Import prisma here to avoid circular dependencies
  const { prisma } = await import('@/lib/db/prisma');

  // If specific provider requested, look for that config first
  if (providerType) {
    const specificConfig = await prisma.storageProviderConfig.findFirst({
      where: {
        userId,
        provider: providerType,
        isActive: true,
      },
      orderBy: {
        isDefault: 'desc', // Prefer default config of this provider
      },
    });

    if (specificConfig) {
      return createProviderFromDbConfig(specificConfig);
    }

    // No user config for this provider, use env default
    return createStorageProviderFromEnv(providerType);
  }

  // Find user's default storage provider config
  const config = await prisma.storageProviderConfig.findFirst({
    where: {
      userId,
      isDefault: true,
      isActive: true,
    },
  });

  if (!config) {
    // No user config, use environment default
    return getDefaultStorageProvider();
  }

  // Use user's default config
  return createProviderFromDbConfig(config);
}

/**
 * Create storage provider from database config
 * Helper for getUserStorageProvider - works with actual DB schema (no separate credentials field)
 */
function createProviderFromDbConfig(dbConfig: any): StorageProvider {
  const configData = dbConfig.config as any;

  switch (dbConfig.provider) {
    case 'r2':
      return new R2StorageProvider({
        accountId: configData.accountId || '',
        accessKeyId: configData.accessKeyId || '',
        secretAccessKey: configData.secretAccessKey || '',
        bucketName: configData.bucket || '',
        endpoint: configData.endpoint || '',
      });

    case 's3':
      return new S3StorageProvider({
        accessKeyId: configData.accessKeyId || '',
        secretAccessKey: configData.secretAccessKey || '',
        bucketName: configData.bucket || '',
        region: configData.region || 'us-east-1',
      });

    case 'vercel':
      return new VercelBlobProvider({
        token: configData.token || '',
      });

    default:
      throw new Error(`Unsupported storage provider: ${dbConfig.provider}`);
  }
}
