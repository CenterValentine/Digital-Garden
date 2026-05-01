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
}

export const usePublishStore = create<PublishState_>((set) => ({
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
}));
