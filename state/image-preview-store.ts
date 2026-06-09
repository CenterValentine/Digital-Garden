/**
 * Image preview (lightbox) store.
 *
 * A single global MediaLightbox is driven by this store so any clickable
 * image (chat attachment chips, chat message images) can open a preview
 * without each surface mounting its own lightbox. Images only — other
 * content types are not previewed here.
 */

import { create } from "zustand";
import type { LightboxItem } from "@/components/content/viewer/MediaLightbox";

interface ImagePreviewState {
  items: LightboxItem[];
  index: number;
  isOpen: boolean;
  open: (items: LightboxItem[], index?: number) => void;
  setIndex: (index: number) => void;
  close: () => void;
}

export const useImagePreviewStore = create<ImagePreviewState>((set) => ({
  items: [],
  index: 0,
  isOpen: false,
  open: (items, index = 0) => set({ items, index, isOpen: true }),
  setIndex: (index) => set({ index }),
  close: () => set({ isOpen: false, items: [], index: 0 }),
}));
