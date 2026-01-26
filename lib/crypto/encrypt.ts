/**
 * Encryption Utility
 *
 * AES-256-GCM encryption for sensitive data (storage credentials)
 * Uses Node.js crypto module with authenticated encryption
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

/**
 * Get encryption key from environment
 * Throws if key is missing or invalid
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.STORAGE_ENCRYPTION_KEY;

  if (!keyHex) {
    throw new Error('STORAGE_ENCRYPTION_KEY environment variable is not set');
  }

  const key = Buffer.from(keyHex, 'hex');

  if (key.length !== KEY_LENGTH) {
    throw new Error(`Encryption key must be ${KEY_LENGTH} bytes (64 hex characters), got ${key.length} bytes`);
  }

  return key;
}

/**
 * Encrypt data using AES-256-GCM
 *
 * @param data - Object to encrypt (will be JSON stringified)
 * @returns Encrypted string in format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encrypt(data: object): string {
  const key = getEncryptionKey();

  // Generate random IV
  const iv = crypto.randomBytes(IV_LENGTH);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // Encrypt the JSON-stringified data
  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  // Return in format: iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt data encrypted with encrypt()
 *
 * @param encrypted - Encrypted string from encrypt()
 * @returns Decrypted object
 * @throws Error if decryption fails (wrong key, tampered data)
 */
export function decrypt(encrypted: string): object {
  const key = getEncryptionKey();

  // Split the encrypted string
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;

  // Convert from hex
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  // Decrypt
  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    // Parse JSON
    return JSON.parse(decrypted.toString('utf8'));
  } catch (error) {
    throw new Error('Decryption failed: data may be corrupted or key may be wrong');
  }
}

/**
 * Generate a new encryption key (for initial setup)
 * Run this once and save to .env.local
 *
 * @returns 32-byte key as hex string
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Mask sensitive string for display (show first 4 chars + ***)
 *
 * @param value - Sensitive string to mask
 * @param visible - Number of visible characters (default: 4)
 * @returns Masked string like "AKIA***"
 */
export function maskSensitiveValue(value: string, visible: number = 4): string {
  if (value.length <= visible) {
    return '***';
  }
  return `${value.substring(0, visible)}***${value.substring(value.length - 3)}`;
}
