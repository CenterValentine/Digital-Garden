// Navigation query functions for dynamic branch-based navigation
// Handles both full navigation tree and filtered views via ViewGrant

import { prisma } from "./prisma";
import type { UserRole } from "@/lib/auth/types";

export interface NavigationCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  displayOrder: number;
  branchPreset: string | null;
  isPublished: boolean;
  documents: NavigationDocument[];
  preset: string;
  hasOverflow: boolean;
  visibleCount: number;
}

export interface NavigationDocument {
  id: string;
  title: string;
  slug: string;
  docType: string;
  displayOrder: number;
  children: NavigationDocument[];
  preset?: string;
  hasOverflow?: boolean;
  visibleCount?: number;
}

export interface NavigationTree {
  categories: NavigationCategory[];
  standaloneDocuments: NavigationDocument[];
}

interface NavQueryOptions {
  userId: string;
  userRole: UserRole;
  viewKey?: string; // Optional query string filter
  includeUnpublished?: boolean; // For admin views
}

/**
 * Calculate branch preset from child count with overflow handling
 */
export function calculatePresetFromChildCount(
  count: number,
  override?: string | null
): { preset: string; hasOverflow: boolean; visibleCount: number } {
  if (override) {
    return { preset: override, hasOverflow: false, visibleCount: count };
  }

  if (count <= 1) {
    return { preset: "straight", hasOverflow: false, visibleCount: count };
  }
  if (count === 2) {
    return { preset: "binary", hasOverflow: false, visibleCount: 2 };
  }
  if (count === 3) {
    return { preset: "trident", hasOverflow: false, visibleCount: 3 };
  }
  if (count <= 5) {
    return { preset: "tridentDeep", hasOverflow: false, visibleCount: count };
  }
  if (count <= 11) {
    return { preset: "fan", hasOverflow: false, visibleCount: count };
  }

  // 12+ children: show 11 + overflow node
  return { preset: "fan", hasOverflow: true, visibleCount: 11 };
}

/**
 * Get full navigation tree (all accessible categories and documents)
 */
export async function getNavigationTree(
  options: NavQueryOptions
): Promise<NavigationTree> {
  const { userId, includeUnpublished } = options;

  const publishedFilter = includeUnpublished ? {} : { isPublished: true };

  // Get all categories for this user, ordered by displayOrder (with id as tiebreaker)
  // Handle anonymous users (guests) by not filtering by ownerId
  const categoryWhere: any = {
    ...publishedFilter,
  };
  
  // Only filter by ownerId if user is authenticated (not anonymous)
  if (userId !== "anonymous") {
    categoryWhere.ownerId = userId;
  }
  
  const categories = await prisma.category.findMany({
    where: categoryWhere,
    orderBy: [
      { displayOrder: "asc" },
      { id: "asc" }, // Tiebreaker for deterministic ordering when displayOrder conflicts
    ],
    include: {
      documents: {
        where: publishedFilter,
        orderBy: [
          { displayOrder: "asc" },
          { id: "asc" }, // Tiebreaker for displayOrder conflicts
        ],
        include: {
          children: {
            where: publishedFilter,
            orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
          },
        },
      },
    },
  });

  // Transform to navigation format with preset calculations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navCategories: NavigationCategory[] = categories.map(
    (category: any) => {
      const childCount = category.documents.length;
      const presetData = calculatePresetFromChildCount(
        childCount,
        category.branchPreset
      );

      return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        displayOrder: category.displayOrder,
        branchPreset: category.branchPreset,
        isPublished: category.isPublished,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        documents: category.documents.map((doc: any) => ({
          id: doc.id,
          title: doc.title,
          slug: doc.slug,
          docType: doc.docType,
          displayOrder: doc.displayOrder,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          children: doc.children.map((child: any) => ({
            id: child.id,
            title: child.title,
            slug: child.slug,
            docType: child.docType,
            displayOrder: child.displayOrder,
            children: [],
          })),
        })),
        ...presetData,
      };
    }
  );

  return {
    categories: navCategories,
    standaloneDocuments: [],
  };
}

/**
 * Get filtered navigation tree based on ViewGrant entries
 * Only shows categories/documents explicitly granted for the viewKey
 */
export async function getFilteredNavigationTree(
  options: NavQueryOptions
): Promise<NavigationTree> {
  const { userId, userRole, viewKey, includeUnpublished } = options;

  if (!viewKey) {
    // Fallback to full tree if no viewKey provided
    return getNavigationTree(options);
  }

  const publishedFilter = includeUnpublished ? {} : { isPublished: true };

  // Step 1: Get all grants matching this viewKey for this user/role
  // For anonymous users (userId === "anonymous"), only query by role
  const grantWhere: any = {
    viewKey,
  };
  
  if (userId === "anonymous") {
    // Anonymous users: only query by role (guest)
    grantWhere.role = userRole;
  } else {
    // Authenticated users: query by userId OR role
    grantWhere.OR = [
      { userId }, // Grants specifically for this user
      { role: userRole }, // Grants for user's role
    ];
  }
  
  const grants = await prisma.viewGrant.findMany({
    where: grantWhere,
    include: {
      category: {
        include: {
          documents: {
            where: publishedFilter,
            orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
          },
        },
      },
      document: true,
    },
  });

  // Step 2: Separate category grants from document grants
  const grantedCategoryIds = new Set<string>();
  const grantedDocumentIds = new Set<string>();

  interface CategoryWithDocs {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    displayOrder: number;
    branchPreset: string | null;
    isPublished: boolean;
    documents: Array<{
      id: string;
      title: string;
      slug: string;
      docType: string;
      displayOrder: number;
      categoryId: string | null;
    }>;
  }

  const categories: CategoryWithDocs[] = [];
  const standaloneDocuments: Array<{
    id: string;
    title: string;
    slug: string;
    docType: string;
    displayOrder: number;
    categoryId: string | null;
  }> = [];

  for (const grant of grants) {
    if (grant.categoryId && grant.category) {
      // Category grant: include category + all its documents
      if (!grantedCategoryIds.has(grant.categoryId)) {
        grantedCategoryIds.add(grant.categoryId);
        categories.push(grant.category);
      }
    } else if (grant.documentId && grant.document) {
      // Document grant: include just this document (if not already in a granted category)
      if (!grantedDocumentIds.has(grant.documentId)) {
        // Check if this document's category is already granted
        const docCategoryGranted = grant.document.categoryId
          ? grantedCategoryIds.has(grant.document.categoryId)
          : false;

        if (!docCategoryGranted) {
          // Document is standalone (not part of a granted category)
          grantedDocumentIds.add(grant.documentId);
          standaloneDocuments.push(grant.document);
        }
      }
    }
  }

  // Step 3: Navigation Category Building
  const navCategories: NavigationCategory[] = categories.map((category) => {
    const childCount = category.documents.length;
    const presetData = calculatePresetFromChildCount(
      childCount,
      category.branchPreset
    );

    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      displayOrder: category.displayOrder,
      branchPreset: category.branchPreset,
      isPublished: category.isPublished,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      documents: category.documents.map((doc: any) => ({
        id: doc.id,
        title: doc.title,
        slug: doc.slug,
        docType: doc.docType,
        displayOrder: doc.displayOrder,
        children: [],
      })),
      ...presetData,
    };
  });

  // Sort by displayOrder
  navCategories.sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) {
      return a.displayOrder - b.displayOrder;
    }
    // Tiebreaker
    return a.id.localeCompare(b.id);
  });

  // Handle standalone documents (documents granted without their category)
  const navStandaloneDocuments: NavigationDocument[] = [];
  if (standaloneDocuments.length > 0) {
    // Group standalone documents by their original category (if any)
    const categoryGroups = new Map<string, NavigationDocument[]>();

    for (const doc of standaloneDocuments) {
      const categoryKey = doc.categoryId || "standalone";
      if (!categoryGroups.has(categoryKey)) {
        categoryGroups.set(categoryKey, []);
      }
      categoryGroups.get(categoryKey)!.push({
        id: doc.id,
        title: doc.title,
        slug: doc.slug,
        docType: doc.docType,
        displayOrder: doc.displayOrder,
        children: [],
      });
    }

    // If all standalone docs are from same category, create a pseudo-category
    // Otherwise, add them as individual items
    if (categoryGroups.size === 1) {
      const docs = Array.from(categoryGroups.values())[0];
      docs.sort((a, b) => {
        if (a.displayOrder !== b.displayOrder) {
          return a.displayOrder - b.displayOrder;
        }
        return a.id.localeCompare(b.id);
      });
      navStandaloneDocuments.push(...docs);
    } else {
      // Multiple categories - add all as standalone
      const allDocs = Array.from(categoryGroups.values()).flat();
      allDocs.sort((a, b) => {
        if (a.displayOrder !== b.displayOrder) {
          return a.displayOrder - b.displayOrder;
        }
        return a.id.localeCompare(b.id);
      });
      navStandaloneDocuments.push(...allDocs);
    }
  }

  return {
    categories: navCategories,
    standaloneDocuments: navStandaloneDocuments,
  };
}

/**
 * Main entry point - returns filtered or full navigation tree based on viewKey
 */
export async function getNavigationData(
  options: NavQueryOptions
): Promise<NavigationTree> {
  if (options.viewKey) {
    return getFilteredNavigationTree(options);
  }
  return getNavigationTree(options);
}
