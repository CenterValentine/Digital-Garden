/**
 * Slug Generation & Validation
 * 
 * Generates unique, URL-safe slugs for ContentNodes.
 * Ensures uniqueness at database level.
 */

import { prisma } from "@/lib/database/client";

// ============================================================
// SLUG GENERATION
// ============================================================

/**
 * Generate URL-safe slug from title
 * 
 * @param title - Content title
 * @returns URL-safe slug
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    // Replace spaces and underscores with hyphens
    .replace(/[\s_]+/g, "-")
    // Remove non-alphanumeric characters (keep hyphens)
    .replace(/[^a-z0-9-]/g, "")
    // Remove consecutive hyphens
    .replace(/-+/g, "-")
    // Remove leading/trailing hyphens
    .replace(/^-|-$/g, "")
    // Limit length
    .slice(0, 200);
}

/**
 * Generate unique slug (with numeric suffix if needed)
 * 
 * @param title - Content title
 * @param ownerId - Owner user ID
 * @param excludeId - Optional ID to exclude from uniqueness check (for updates)
 * @returns Unique slug
 */
export async function generateUniqueSlug(
  title: string,
  ownerId: string,
  excludeId?: string
): Promise<string> {
  const baseSlug = generateSlug(title);
  
  // Check if base slug is available
  const existing = await prisma.contentNode.findFirst({
    where: {
      slug: baseSlug,
      ownerId,
      id: excludeId ? { not: excludeId } : undefined,
    },
  });
  
  if (!existing) {
    return baseSlug;
  }
  
  // Find next available numeric suffix
  let suffix = 2;
  let candidateSlug = `${baseSlug}-${suffix}`;
  
  while (true) {
    const exists = await prisma.contentNode.findFirst({
      where: {
        slug: candidateSlug,
        ownerId,
        id: excludeId ? { not: excludeId } : undefined,
      },
    });
    
    if (!exists) {
      return candidateSlug;
    }
    
    suffix++;
    candidateSlug = `${baseSlug}-${suffix}`;
    
    // Safety limit
    if (suffix > 1000) {
      throw new Error("Could not generate unique slug (too many collisions)");
    }
  }
}

// ============================================================
// SLUG VALIDATION
// ============================================================

/**
 * Validate slug format
 * 
 * @param slug - Slug to validate
 * @returns true if valid
 */
export function isValidSlug(slug: string): boolean {
  if (!slug || slug.length === 0) return false;
  if (slug.length > 255) return false;
  
  // Must be lowercase alphanumeric with hyphens
  // Cannot start or end with hyphen
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  
  return slugRegex.test(slug);
}

/**
 * Sanitize user-provided slug
 * 
 * @param slug - User input
 * @returns Sanitized slug
 */
export function sanitizeSlug(slug: string): string {
  return generateSlug(slug);
}

// ============================================================
// PATH GENERATION (for materialized paths)
// ============================================================

/**
 * Generate full path for content node (breadcrumb)
 * 
 * @param contentId - Content ID
 * @returns Full path (e.g., "projects/web/digital-garden")
 */
export async function generateContentPath(contentId: string): Promise<string> {
  const segments: string[] = [];
  
  let currentId: string | null = contentId;

  // Walk up the tree to root
  while (currentId) {
    const node: { slug: string; parentId: string | null } | null = await prisma.contentNode.findUnique({
      where: { id: currentId },
      select: {
        slug: true,
        parentId: true,
      },
    });
    
    if (!node) break;
    
    segments.unshift(node.slug);
    currentId = node.parentId;
    
    // Safety limit (prevent infinite loops)
    if (segments.length > 100) {
      throw new Error("Content tree depth exceeds limit (100 levels)");
    }
  }
  
  return segments.join("/");
}

/**
 * Get path segments for content node
 * 
 * @param contentId - Content ID
 * @returns Array of path segments
 */
export async function generatePathSegments(contentId: string): Promise<string[]> {
  const path = await generateContentPath(contentId);
  return path.split("/");
}

/**
 * Calculate tree depth for content node
 * 
 * @param contentId - Content ID
 * @returns Depth (0 for root)
 */
export async function calculateDepth(contentId: string): Promise<number> {
  const segments = await generatePathSegments(contentId);
  return segments.length - 1; // Root is depth 0
}

// ============================================================
// SLUG MIGRATION UTILITIES
// ============================================================

/**
 * Update materialized path after move/rename
 * 
 * @param contentId - Content ID
 */
export async function updateMaterializedPath(contentId: string): Promise<void> {
  const path = await generateContentPath(contentId);
  const segments = path.split("/");
  const depth = segments.length - 1;
  
  await prisma.contentPath.upsert({
    where: { contentId },
    update: {
      path,
      pathSegments: segments,
      depth,
    },
    create: {
      contentId,
      path,
      pathSegments: segments,
      depth,
    },
  });
}

/**
 * Rebuild all materialized paths (maintenance)
 */
export async function rebuildAllPaths(): Promise<void> {
  const allContent = await prisma.contentNode.findMany({
    select: { id: true },
  });
  
  for (const content of allContent) {
    await updateMaterializedPath(content.id);
  }
}

