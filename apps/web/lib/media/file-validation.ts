/**
 * File Upload Validation Utilities
 *
 * Handles file size limits, type validation, and batch validation
 * Client-safe: Does not import server-only modules
 */

/**
 * File size limits (in bytes)
 */
export const FILE_SIZE_LIMITS = {
  /** Maximum size per individual file: 100MB */
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB

  /** Maximum cumulative size for batch upload: 500MB */
  MAX_BATCH_SIZE: 500 * 1024 * 1024, // 500MB
} as const;

/**
 * Supported MIME types (centralized list to avoid importing server modules)
 */
const SUPPORTED_MIME_TYPES = [
  // Text documents
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/json',

  // Office documents
  'application/pdf',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx

  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/avif',
  'image/jpg',
  'image/bmp',
  'image/tiff',

  // Videos
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo', // AVI
  'video/x-matroska', // MKV
] as const;

/**
 * Get all supported file types
 */
export function getSupportedFileTypes(): {
  mimeTypes: string[];
  extensions: string[];
} {
  // Map MIME types to file extensions for user-friendly display
  const extensions = SUPPORTED_MIME_TYPES.map((mime) => {
    const ext = mimeToExtension(mime);
    return ext ? `.${ext}` : '';
  }).filter(Boolean);

  return {
    mimeTypes: [...SUPPORTED_MIME_TYPES],
    extensions: Array.from(new Set(extensions)),
  };
}

/**
 * Check if a file type is supported
 */
export function isFileTypeSupported(mimeType: string): boolean {
  return SUPPORTED_MIME_TYPES.includes(mimeType as any);
}

/**
 * Validate a single file
 */
export function validateFile(file: File): {
  valid: boolean;
  error?: string;
} {
  // Check file size
  if (file.size > FILE_SIZE_LIMITS.MAX_FILE_SIZE) {
    const maxSizeMB = FILE_SIZE_LIMITS.MAX_FILE_SIZE / (1024 * 1024);
    return {
      valid: false,
      error: `File "${file.name}" exceeds maximum size of ${maxSizeMB}MB`,
    };
  }

  // Check file type
  if (!isFileTypeSupported(file.type)) {
    const extension = file.name.split('.').pop() || 'unknown';
    return {
      valid: false,
      error: `File type ".${extension}" is not supported`,
    };
  }

  return { valid: true };
}

/**
 * Validate a batch of files
 */
export function validateFileBatch(files: File[]): {
  valid: boolean;
  validFiles: File[];
  invalidFiles: Array<{ file: File; error: string }>;
  totalSize: number;
} {
  let totalSize = 0;
  const validFiles: File[] = [];
  const invalidFiles: Array<{ file: File; error: string }> = [];

  for (const file of files) {
    // Validate individual file
    const validation = validateFile(file);

    if (!validation.valid) {
      invalidFiles.push({
        file,
        error: validation.error!,
      });
      continue;
    }

    // Check cumulative size
    if (totalSize + file.size > FILE_SIZE_LIMITS.MAX_BATCH_SIZE) {
      const maxBatchMB = FILE_SIZE_LIMITS.MAX_BATCH_SIZE / (1024 * 1024);
      invalidFiles.push({
        file,
        error: `Adding "${file.name}" would exceed batch limit of ${maxBatchMB}MB`,
      });
      continue;
    }

    validFiles.push(file);
    totalSize += file.size;
  }

  return {
    valid: invalidFiles.length === 0,
    validFiles,
    invalidFiles,
    totalSize,
  };
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Map MIME type to file extension
 */
function mimeToExtension(mimeType: string): string | null {
  const map: Record<string, string> = {
    // Documents
    'text/plain': 'txt',
    'text/markdown': 'md',
    'text/x-markdown': 'md',
    'application/json': 'json',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',

    // Images
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/avif': 'avif',

    // Videos
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',
    'video/x-matroska': 'mkv',
  };

  return map[mimeType] || null;
}
