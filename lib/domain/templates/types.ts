/**
 * Content Template domain types
 *
 * Epoch 11 Sprint 45: Content Templates + Snippets
 */

export interface ContentTemplateWithCategory {
  id: string;
  title: string;
  tiptapJson: unknown;
  categoryId: string;
  categoryName: string;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateInput {
  title: string;
  tiptapJson: unknown;
  categoryId: string;
  searchText?: string;
}

export interface PageTemplateWithCategory {
  id: string;
  title: string;
  tiptapJson: unknown;
  categoryId: string;
  categoryName: string;
  userId: string | null;
  isSystem: boolean;
  defaultTitle: string | null;
  customIcon: string | null;
  iconColor: string | null;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePageTemplateInput {
  title: string;
  tiptapJson: unknown;
  categoryId: string;
  defaultTitle?: string;
  searchText?: string;
}

export interface ReusableCategoryWithCount {
  id: string;
  name: string;
  slug: string;
  scope: string;
  parentId: string | null;
  displayOrder: number;
  isSystem: boolean;
  itemCount: number;
  createdAt: string;
}
