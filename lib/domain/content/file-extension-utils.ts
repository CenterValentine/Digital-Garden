/**
 * File Extension Utilities
 *
 * Handles extension display logic for orthodox (files with extensions) vs
 * unorthodox (native content types) content.
 */

/**
 * Map of common MIME types to file extensions
 */
const MIME_TO_EXTENSION: Record<string, string> = {
  // Documents
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',

  // Text
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/csv': '.csv',
  'text/html': '.html',
  'text/css': '.css',
  'text/javascript': '.js',

  // Data
  'application/json': '.json',
  'application/xml': '.xml',
  'text/xml': '.xml',

  // Images
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',

  // Video
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/x-msvideo': '.avi',
  'video/webm': '.webm',
  'video/mpeg': '.mpeg',

  // Audio
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/webm': '.weba',
  'audio/aac': '.aac',

  // Archives
  'application/zip': '.zip',
  'application/x-rar-compressed': '.rar',
  'application/x-7z-compressed': '.7z',
  'application/gzip': '.gz',
  'application/x-tar': '.tar',
};

/**
 * Get file extension from mimeType
 */
export function getExtensionFromMimeType(mimeType: string): string | null {
  const extension = MIME_TO_EXTENSION[mimeType.toLowerCase()];
  if (extension) return extension;

  // Fallback: try to extract from mimeType
  const parts = mimeType.split('/');
  if (parts.length === 2) {
    const subtype = parts[1];

    // Handle video/* and audio/* with common formats
    if (parts[0] === 'video' || parts[0] === 'audio') {
      // Remove any parameters (e.g., "mp4; codecs=...")
      const format = subtype.split(';')[0].trim();
      return '.' + format;
    }

    // Handle application/x-* pattern
    if (subtype.includes('-')) {
      return '.' + subtype.replace('x-', '');
    }
  }

  return null;
}

/**
 * Check if content is orthodox (has file extension)
 * Orthodox = file content type with mimeType
 * Unorthodox = folder, note, external, html, template, code
 */
export function isOrthodoxContent(content: {
  contentType: string;
  file?: { mimeType?: string } | null;
}): boolean {
  // File content type with mimeType = orthodox
  if (content.contentType === 'file' && content.file?.mimeType) {
    return true;
  }

  // All other content types = unorthodox
  return false;
}

/**
 * Check if content is a note (should display as .md)
 */
export function isNoteContent(content: { contentType: string }): boolean {
  return content.contentType === 'note';
}

/**
 * Get display extension for content
 * Returns extension string (e.g., ".pdf") or null if no extension should be shown
 */
export function getDisplayExtension(content: {
  contentType: string;
  file?: { mimeType?: string } | null;
}): string | null {
  // Notes display as .md
  if (isNoteContent(content)) {
    return '.md';
  }

  // Orthodox files show their extension
  if (isOrthodoxContent(content) && content.file?.mimeType) {
    return getExtensionFromMimeType(content.file.mimeType);
  }

  // Unorthodox content types show no extension
  return null;
}

/**
 * Split filename into base name and extension for display
 * Does NOT modify the stored filename - only for display purposes
 */
export function splitFilenameForDisplay(
  filename: string,
  extension: string | null
): { basename: string; extension: string | null } {
  // If no extension to display, return full filename
  if (!extension) {
    return { basename: filename, extension: null };
  }

  // If filename already ends with the extension, remove it from basename
  // This prevents displaying "file.mp4" + ".mp4" as "file.mp4.mp4"
  if (filename.toLowerCase().endsWith(extension.toLowerCase())) {
    const basename = filename.slice(0, -extension.length);
    return { basename, extension };
  }

  // If filename doesn't have extension, show full filename + extension
  return { basename: filename, extension };
}

/**
 * Check if content type supports custom icons
 * Only notes (.md), docs (.docx), sheets (.xlsx), and JSON (.json)
 */
export function supportsCustomIcon(content: {
  contentType: string;
  file?: { mimeType?: string } | null;
}): boolean {
  // Notes always support custom icons
  if (content.contentType === 'note') {
    return true;
  }

  // Specific file types support custom icons
  if (content.contentType === 'file' && content.file?.mimeType) {
    const mimeType = content.file.mimeType.toLowerCase();
    return (
      mimeType === 'application/json' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  }

  return false;
}
