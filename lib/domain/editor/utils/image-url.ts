/**
 * Image URL Detection Utility
 *
 * Detects whether a pasted URL points to an image based on file extension.
 * Sprint 37: Images in TipTap
 */

const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".avif",
  ".bmp",
  ".ico",
];

/**
 * Check if a URL points to an image based on its pathname extension.
 */
export function isImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    return IMAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return false;
  }
}
