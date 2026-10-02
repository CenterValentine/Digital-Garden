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

  // E-books (opened by the reader extension)
  'application/epub+zip',
  'application/x-mobipocket-ebook',
  'application/vnd.amazon.ebook',
  'application/x-fictionbook+xml',
  'application/vnd.comicbook+zip',

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
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(mimeType);
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
  if (!isFileTypeSupported(effectiveMimeType(file))) {
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
const MIME_TO_EXTENSION: Record<string, string> = {
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
    'application/epub+zip': 'epub',
    'application/x-mobipocket-ebook': 'mobi',
    'application/vnd.amazon.ebook': 'azw3',
    'application/x-fictionbook+xml': 'fb2',
    'application/vnd.comicbook+zip': 'cbz',

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

function mimeToExtension(mimeType: string): string | null {
  return MIME_TO_EXTENSION[mimeType] || null;
}

/**
 * Extension → MIME, derived from the map above (first MIME wins where two
 * share an extension: md → text/markdown, jpg → image/jpeg) plus the
 * spellings that map has no row for.
 */
const EXTENSION_TO_MIME: Record<string, string> = {
  ...Object.entries(MIME_TO_EXTENSION).reduce<Record<string, string>>((acc, [mime, ext]) => {
    if (!(ext in acc)) acc[ext] = mime;
    return acc;
  }, {}),
  markdown: 'text/markdown',
  jpeg: 'image/jpeg',
};

/**
 * The MIME type to judge and store a file by.
 *
 * Browsers derive `File.type` from the OS, and the OS often has no MIME
 * registered for an extension it does not own — `.md` on many setups, and
 * almost always `.mobi`, `.azw3`, `.fb2`, `.cbz`. The type then arrives as
 * an empty string (or the generic `application/octet-stream`), and a
 * MIME-only check rejects a file the server stores perfectly well:
 * dragging a `.md` onto the file tree failed with `File type ".md" is not
 * supported`. Trust a specific MIME when the browser gives one; otherwise
 * infer it from the extension. Client-safe, so the upload route uses the
 * same answer — an inferred `.md` is stored as `text/markdown` and gets its
 * search text extracted instead of landing as an opaque blob.
 */
export function effectiveMimeType(file: { name: string; type: string }): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  return EXTENSION_TO_MIME[ext] ?? file.type;
}
