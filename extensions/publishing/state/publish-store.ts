"use client";

import { create } from "zustand";
import type { PublishState, ValidationStatus } from "@/lib/database/generated/prisma";

export interface PublishItemSummary {
  id: string;
  contentNodeId: string;
  pathId: string;
  slug: string;
  payloadType: string;
  publicTitle: string | null;
  state: PublishState;
  validationStatus: ValidationStatus;
  validationIssues: unknown[];
  firstPublishedAt: string | null;
  lastPublishedAt: string | null;
  scheduledFor: string | null;
  workingRevisionId: string | null;
  publishedRevisionId: string | null;
  hasPendingChanges: boolean;
  path: { id: string; slug: string; title: string } | null;
}

export interface ContentTypeEntry {
  value: string;
  label: string;
  removable: boolean;
}

const DEFAULT_CONTENT_TYPES: ContentTypeEntry[] = [
  { value: "blog_post", label: "Blog Post", removable: false },
  { value: "page", label: "Page", removable: true },
  { value: "bookmark", label: "Bookmark", removable: true },
  { value: "project", label: "Project", removable: true },
  { value: "note", label: "Note", removable: true },
];

const TYPES_STORAGE_KEY = "publishing:contentTypes";

function loadContentTypes(): ContentTypeEntry[] {
  if (typeof window === "undefined") return DEFAULT_CONTENT_TYPES;
  try {
    const stored = localStorage.getItem(TYPES_STORAGE_KEY);
    if (!stored) return DEFAULT_CONTENT_TYPES;
    const parsed = JSON.parse(stored) as ContentTypeEntry[];
    // Ensure Blog Post (non-removable) is always present
    const hasBlogPost = parsed.some((t) => t.value === "blog_post");
    if (!hasBlogPost) {
      return [DEFAULT_CONTENT_TYPES[0], ...parsed];
    }
    return parsed;
  } catch {
    return DEFAULT_CONTENT_TYPES;
  }
}

function saveContentTypes(types: ContentTypeEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TYPES_STORAGE_KEY, JSON.stringify(types));
  } catch {
    // ignore
  }
}

function labelToValue(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

interface PublishState_ {
  // Currently active PublicItem being viewed/edited in the publish sidebar
  activePublicItemId: string | null;
  setActivePublicItemId: (id: string | null) => void;

  // Items linked to the currently selected ContentNode
  linkedItems: PublishItemSummary[];
  setLinkedItems: (items: PublishItemSummary[]) => void;

  // Loading states
  isLoadingLinkedItems: boolean;
  setIsLoadingLinkedItems: (v: boolean) => void;

  // Pre-publish dialog
  prePublishDialogOpen: boolean;
  openPrePublishDialog: (publicItemId: string) => void;
  closePrePublishDialog: () => void;
  pendingPublishItemId: string | null;

  // User-managed content types
  contentTypes: ContentTypeEntry[];
  addContentType: (label: string) => ContentTypeEntry | null;
  removeContentType: (value: string) => void;
}

export const usePublishStore = create<PublishState_>((set, get) => ({
  activePublicItemId: null,
  setActivePublicItemId: (id) => set({ activePublicItemId: id }),

  linkedItems: [],
  setLinkedItems: (items) => set({ linkedItems: items }),

  isLoadingLinkedItems: false,
  setIsLoadingLinkedItems: (v) => set({ isLoadingLinkedItems: v }),

  prePublishDialogOpen: false,
  pendingPublishItemId: null,
  openPrePublishDialog: (id) =>
    set({ prePublishDialogOpen: true, pendingPublishItemId: id }),
  closePrePublishDialog: () =>
    set({ prePublishDialogOpen: false, pendingPublishItemId: null }),

  contentTypes: loadContentTypes(),

  addContentType: (label) => {
    const trimmed = label.trim();
    if (!trimmed) return null;
    const value = labelToValue(trimmed);
    if (!value) return null;
    const existing = get().contentTypes;
    if (existing.some((t) => t.value === value)) return existing.find((t) => t.value === value) ?? null;
    const entry: ContentTypeEntry = { value, label: trimmed, removable: true };
    const next = [...existing, entry];
    saveContentTypes(next);
    set({ contentTypes: next });
    return entry;
  },

  removeContentType: (value) => {
    const existing = get().contentTypes;
    const type = existing.find((t) => t.value === value);
    if (!type || !type.removable) return;
    const next = existing.filter((t) => t.value !== value);
    saveContentTypes(next);
    set({ contentTypes: next });
  },
}));
